// src/routes/skin.js
'use strict';

const express = require('express');
const sharp   = require('sharp');
const prisma  = require('../lib/prisma');
const { uploadFile } = require('../utils/storage');
const { authenticate } = require('../middleware/auth');
const { analyzeSkin } = require('../utils/skinAnalysis');
const { analyzeWithGemini } = require('../utils/geminiSkinAnalysis');
const { generateHeatmaps } = require('../utils/skinHeatmaps');
const { analyzeWithPerfectCorp, PerfectCorpError } = require('../utils/perfectCorpClient');
const { CONCERN_CONTENT, severityBand } = require('../utils/skinConcernContent');

const router = express.Router();

// The old heuristic engine's concern keys (skinHeatmaps.js, unchanged) don't
// match Perfect Corp's own naming — remapped here, once, rather than
// touching that file. 'shine' has no Perfect Corp SD equivalent in this
// app's 7-tab spec and is dropped (not surfaced as a tab) on the fallback
// path; a scan on the fallback path simply has no moisture/age_spot/acne
// data (see buildConcernRecord's null branch — "not assessed," never
// fabricated).
const HEURISTIC_KEY_MAP = { pores: 'pore', wrinkles: 'wrinkle', texture: 'texture', redness: 'redness' };

// A distinguishable rejection for "this specific photo failed Perfect
// Corp's own image-quality gate" (face too small / too dark / below
// minimum resolution) — thrown up through getConcernAnalysis so the route
// can 400 with a retake prompt, the same treatment Gemini's
// faceDetected:false already gets, rather than being swallowed into a
// silent fallback to the heuristic (which would hit the identical problem
// with the identical photo).
class ImageQualityRejection extends Error {}

// Builds one concern's full record from EITHER engine's raw output —
// content (label/verdict/education/tips) always comes from
// skinConcernContent.js, so the copy a user reads is identical regardless
// of which engine produced the severity number underneath it. `maskUrl` is
// already the uploaded (our own blob storage) URL by the time this runs.
function buildConcernRecord(key, { severity, maskUrl, confidence, source, rawScore, uiScore, zoneBreakdown }) {
  const content = CONCERN_CONTENT[key];
  const band = severityBand(severity);
  return {
    url: maskUrl,
    label: content.label,
    tabLabel: content.tabLabel,
    source,
    gradientLabels: content.gradientLabels,
    severity,
    severityScore: Math.round(severity * 100),
    band,
    verdict: content.verdict[band],
    education: content.education,
    tips: content.tips,
    confidence,
    // Per-zone severity for the tap-to-highlight interaction (see
    // mobile SkinConcernTabs.tsx) — only real on the 'estimated' path so
    // far (skinHeatmaps.js computes it directly from the same severity
    // map as the overlay itself). The 'perfectcorp' path doesn't have
    // this yet — Perfect Corp's SD schema doesn't publish confirmed
    // per-zone data, and no successful live response has been observed
    // to check what score_info.json's pore/wrinkle subcategories actually
    // look like. Always [] there, never a guess — the UI treats an empty
    // array as "no tappable zones for this concern," not an error.
    zoneBreakdown: zoneBreakdown || [],
    ...(rawScore != null ? { rawScore, uiScore } : {}),
  };
}

async function logApiUsage({ endpoint, success, statusCode, errorCode, durationMs, scanId, userId }) {
  try {
    await prisma.apiUsageLog.create({
      data: { provider: 'perfectcorp', endpoint, success, statusCode: statusCode ?? null, errorCode: errorCode ?? null, durationMs: durationMs ?? null, scanId: scanId ?? null, userId: userId ?? null },
    });
  } catch (err) {
    // Usage logging must never fail a real scan.
    console.error('[skin] usage log write failed:', err.message);
  }
}

// Orchestrates real-API-first, heuristic-fallback concern analysis. Tries
// Perfect Corp when configured; on ANY failure other than a genuine
// image-quality rejection (which propagates — see ImageQualityRejection),
// falls back to the free heuristic and labels the result 'estimated' with
// a specific, honest reason. Never fabricates data for a concern neither
// engine could assess (see buildConcernRecord's null passthrough below).
async function getConcernAnalysis({ photoUrl, heuristicPixels, heuristicInfo, faceBox, zoneMarkers, userId }) {
  if (process.env.PERFECTCORP_API_KEY) {
    const start = Date.now();
    try {
      const result = await analyzeWithPerfectCorp(photoUrl);
      // result is only null when the key genuinely isn't set — already
      // checked above — so a null here would be a real bug, not a normal
      // path; treated the same as any other unexpected failure below.
      if (!result) throw new PerfectCorpError('analyzeWithPerfectCorp returned null despite a configured key', 'UNKNOWN');

      const heatmaps = {};
      for (const [key, concern] of Object.entries(result.concerns)) {
        if (!concern) { heatmaps[key] = null; continue; }
        const up = await uploadFile(`skin-scans/${userId}-${Date.now()}-${key}.png`, concern.maskBuffer, 'image/png');
        if (!up?.url) { heatmaps[key] = null; continue; }
        heatmaps[key] = buildConcernRecord(key, {
          severity: concern.severity, maskUrl: up.url, confidence: { level: 'high' },
          source: 'perfectcorp', rawScore: concern.rawScore, uiScore: concern.uiScore,
        });
      }
      for (const u of result.usage) await logApiUsage({ endpoint: u.endpoint, success: true, durationMs: u.durationMs, userId });
      await logApiUsage({ endpoint: 'skin-analysis-total', success: true, durationMs: Date.now() - start, userId });
      return { heatmaps, heatmapSource: 'perfectcorp', heatmapSourceReason: null };
    } catch (err) {
      if (err instanceof PerfectCorpError && err.code === 'LOW_IMAGE_QUALITY') {
        await logApiUsage({ endpoint: 'skin-analysis', success: false, errorCode: err.code, durationMs: Date.now() - start, userId });
        // err.message is Perfect Corp's own human-readable reason (e.g.
        // "The face in the input image is turned or tilted too far.") —
        // relayed directly since it's specific and actionable, with a
        // short retake nudge appended rather than replaced with a generic
        // canned line that would say less than what the vendor already
        // told us.
        throw new ImageQualityRejection(`${err.message} Try another photo.`);
      }
      const errorCode = err instanceof PerfectCorpError ? err.code : 'UNKNOWN';
      console.error('[skin] Perfect Corp analysis failed, falling back to free heuristic:', err.message);
      await logApiUsage({ endpoint: 'skin-analysis', success: false, statusCode: err.statusCode, errorCode, durationMs: Date.now() - start, userId });
      const reason = { NETWORK_ERROR: 'network_error', TIMEOUT: 'timeout', QUOTA_EXCEEDED: 'quota_exceeded', SERVER_ERROR: 'server_error' }[errorCode] || 'server_error';
      return runHeuristicFallback({ heuristicPixels, heuristicInfo, faceBox, zoneMarkers, userId, reason });
    }
  }
  return runHeuristicFallback({ heuristicPixels, heuristicInfo, faceBox, zoneMarkers, userId, reason: 'not_configured' });
}

async function runHeuristicFallback({ heuristicPixels, heuristicInfo, faceBox, zoneMarkers, userId, reason }) {
  const { concerns } = await generateHeatmaps({ buffer: heuristicPixels, info: heuristicInfo, faceBox, zoneMarkers }).catch((err) => {
    console.error('[skin] heuristic heatmap generation failed:', err.message);
    return { concerns: {} };
  });
  const heatmaps = {};
  for (const [oldKey, mappedKey] of Object.entries(HEURISTIC_KEY_MAP)) {
    const concern = concerns[oldKey];
    if (!concern) { heatmaps[mappedKey] = null; continue; }
    const up = await uploadFile(`skin-scans/${userId}-${Date.now()}-${mappedKey}.png`, concern.png, 'image/png');
    if (!up?.url) { heatmaps[mappedKey] = null; continue; }
    heatmaps[mappedKey] = buildConcernRecord(mappedKey, {
      severity: concern.severity, maskUrl: up.url,
      confidence: { level: concern.confidence.level, zoneFraction: concern.confidence.zoneFraction, pixelCount: concern.confidence.pixelCount },
      source: 'estimated',
      zoneBreakdown: concern.zoneBreakdown,
    });
  }
  // moisture/age_spot/acne: the free heuristic has no signal for these at
  // all — explicit null ("not assessed"), never fabricated, same rule the
  // whole heatmap system has followed since it replaced point markers.
  for (const key of ['moisture', 'age_spot', 'acne']) heatmaps[key] = null;
  return { heatmaps, heatmapSource: 'estimated', heatmapSourceReason: reason };
}

// Booking-category hand-off is always the same regardless of which analysis
// path produced the result — it doesn't need AI to decide.
const BOOK_CATEGORY = 'Facials & Skin';

function serializeScan(s) {
  return {
    id: s.id,
    profileId: s.profileId,
    photoUrl: s.photoUrl,
    skinTone: s.skinTone,
    skinType: s.skinType,
    concerns: s.concerns,
    summary: s.summary || '',
    progressNote: s.progressNote ?? null,
    hydrationLevel: s.hydrationLevel || '',
    zoneNotes: s.zoneNotes || {},
    faceBox: s.faceBox || {},
    zoneMarkers: s.zoneMarkers ?? null,
    heatmaps: s.heatmaps ?? null,
    heatmapSource: s.heatmapSource ?? 'estimated',
    heatmapSourceReason: s.heatmapSourceReason ?? undefined,
    recommendations: s.recommendations,
    notes: s.notes,
    createdAt: s.createdAt,
  };
}

function toPreviousScanContext(scan) {
  if (!scan) return undefined;
  return {
    skinTone: scan.skinTone,
    skinType: scan.skinType,
    concerns: scan.concerns,
    summary: scan.summary || '',
    daysAgo: Math.max(0, Math.round((Date.now() - scan.createdAt.getTime()) / 86_400_000)),
  };
}

// 10s timeout — a hung blob-storage fetch for one reference photo used to
// have no ceiling at all, same class of unbounded-latency issue the Gemini
// call itself needed a timeout for (see geminiSkinAnalysis.js). These run
// concurrently (Promise.all in gatherProfileCandidates) and already fail
// soft (caught, that one profile just gets dropped from the request), so a
// hang here was pure wasted wall-clock time on the whole /skin/scan
// request for zero benefit.
async function fetchImageBase64(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Reference photos are refetched from blob storage at their full stored
    // size (up to 1080x1350) on EVERY future scan, then re-sent to Gemini
    // in full again — real, compounding latency + payload size for an
    // image Gemini only uses for face-structure comparison, not fine
    // texture detail (that's what Image 1, the NEW selfie, is for — see
    // the prompt in geminiSkinAnalysis.js). Downsized here, once, right
    // after fetching — smaller upload to Gemini and fewer image tokens for
    // it to process, on every reference photo, every future scan.
    const resized = await sharp(buf).resize(640, 640, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    return resized.toString('base64');
  } finally {
    clearTimeout(timeout);
  }
}

// Gathers this account's existing SkinProfiles and reference photos+context
// for the face-match step — pure data fetching, no Gemini call. Face-
// matching and skin analysis used to be two separate Gemini requests per
// scan; folded into one (see analyzeWithGemini) so a scan costs exactly one
// API call regardless of how many profiles exist on the account. Bounded to
// the 5 most recently active profiles to keep that one request's size sane
// on an account with a long tail of old profiles.
async function gatherProfileCandidates(userId) {
  const profiles = await prisma.skinProfile.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    // Up to 3 — enough for a genuine multi-scan TREND ("steadily improving
    // over your last 3 scans"), not just a single before/after delta against
    // whatever the last scan happened to say. Only the most recent photo is
    // ever sent as an image (trend history beyond that is plain text in the
    // prompt — cheap, doesn't add another image to the request).
    include: { scans: { orderBy: { createdAt: 'desc' }, take: 3 } },
  });

  const candidates = profiles
    .filter(p => p.scans.length > 0)
    .sort((a, b) => b.scans[0].createdAt.getTime() - a.scans[0].createdAt.getTime())
    .slice(0, 5);

  // Concurrent, not sequential — up to 5 full network fetches one at a time
  // was real, easy-to-avoid latency on any account with more than one
  // profile (every scan after the first always fetches at least the
  // account's own prior photo). Order doesn't matter here, only which
  // ones succeed, so Promise.all is a straight win with no behavior change.
  const fetched = await Promise.all(candidates.map(async (p) => {
    try {
      const photoBase64 = await fetchImageBase64(p.scans[0].photoUrl);
      return {
        profile: p,
        photoBase64,
        ...toPreviousScanContext(p.scans[0]),
        trend: p.scans.map(toPreviousScanContext),
      };
    } catch (err) {
      console.error(`[skin] could not fetch reference photo for profile ${p.id}:`, err.message);
      return null;
    }
  }));
  const referenceProfiles = fetched.filter(Boolean);

  return { profiles, referenceProfiles };
}

// Resolves the pixel-space crop rect to analyze. `faceRegion` (optional) is
// {x,y,width,height} as 0–1 fractions of the photo, computed client-side from
// where the on-screen alignment oval sits over the live camera preview (see
// SkinScanCamera.tsx) — there's no on-device face detector in this app, so
// the oval is a guide the user aligns to, not a verified detection. Without
// one (older clients, or the guide couldn't be mapped), falls back to a
// generous center crop, since a front-camera selfie framed normally puts the
// face roughly there anyway.
const DEFAULT_REGION = { x: 0.22, y: 0.16, width: 0.56, height: 0.6 };

// Returns both the pixel-space crop box (for sharp's .extract, used on the
// ORIGINAL image dimensions) and the clamped 0–1 fractional box (for
// persisting as SkinScan.faceBox — fractions map identically onto the
// resized stored photo, since resize preserves relative position).
function resolveCropBox(faceRegion, imgWidth, imgHeight) {
  const r = faceRegion && typeof faceRegion === 'object' ? faceRegion : DEFAULT_REGION;
  const clamp01 = (v) => Math.min(1, Math.max(0, typeof v === 'number' && Number.isFinite(v) ? v : 0));
  const x = clamp01(r.x ?? DEFAULT_REGION.x);
  const y = clamp01(r.y ?? DEFAULT_REGION.y);
  const w = clamp01(r.width ?? DEFAULT_REGION.width);
  const h = clamp01(r.height ?? DEFAULT_REGION.height);

  let left = Math.round(x * imgWidth);
  let top = Math.round(y * imgHeight);
  let width = Math.round(w * imgWidth);
  let height = Math.round(h * imgHeight);

  // Clamp so the box never runs past the image bounds — a slightly
  // off-frame client-reported region shouldn't 500 the request.
  width = Math.max(8, Math.min(width, imgWidth - left));
  height = Math.max(8, Math.min(height, imgHeight - top));
  left = Math.max(0, Math.min(left, imgWidth - width));
  top = Math.max(0, Math.min(top, imgHeight - height));

  return {
    pixelBox: { left, top, width, height },
    faceBox: {
      x: left / imgWidth, y: top / imgHeight,
      width: width / imgWidth, height: height / imgHeight,
    },
  };
}

const ZONE_MARKER_KEYS = ['forehead', 'nose', 'chin', 'cheekL', 'cheekR', 'underEyeL', 'underEyeR', 'jawline'];

// Client-computed, per-photo landmark-derived zone marker rects (see
// deriveZoneMarkers in mobile/src/utils/skinZones.ts) — 0–1 fractions of the
// photo, same space as faceBox. Only ever display geometry (never fed back
// into analysis), but still sanitized before it reaches the database: drops
// any key outside the known 8 zones and any rect missing a finite x/y/
// width/height, and clamps every value into 0–1 rather than trusting a
// client-supplied number outright.
//
// Returns null ONLY when `raw` itself wasn't a real object — the client's
// landmark pass never ran at all (old app version, web, detector
// unavailable) — and mobile's buildZoneMarkers (skinZones.ts) treats that
// null as license to fall back to the fixed-proportion ZONE_RECTS guess for
// EVERY zone, since a guess is genuinely the best information available
// with zero real geometry to work from.
//
// A real object that survives sanitization down to `{}` (every key the
// client sent failed validation, or the client's own landmark pass
// confidently placed zero zones — heavy occlusion, extreme head pose) is
// returned as `{}`, not collapsed to null. This used to also return null,
// which was indistinguishable from "never ran" and meant the WORST
// detections — the ones occlusion/pose defeated most thoroughly — got the
// blind per-zone guess for every zone instead of skipping all of them; the
// two off-face marker reports (a baseball cap, a tilted-back head) are
// exactly this path. `{}` still reads as falsy-for-"any zones present"
// wherever code checks `Object.keys(scan.zoneMarkers).length`, but is
// correctly truthy for "did the real landmark pass run at all."
function sanitizeZoneMarkers(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const clamp01 = (v) => Math.min(1, Math.max(0, typeof v === 'number' && Number.isFinite(v) ? v : NaN));
  const out = {};
  for (const key of ZONE_MARKER_KEYS) {
    const rect = raw[key];
    if (!rect || typeof rect !== 'object') continue;
    const x = clamp01(rect.x), y = clamp01(rect.y), width = clamp01(rect.width), height = clamp01(rect.height);
    if ([x, y, width, height].some(Number.isNaN)) continue;
    out[key] = { x, y, width, height };
  }
  return out;
}

router.post(
  '/scan',
  authenticate,
  async (req, res) => {
    try {
      const { photoBase64, mimeType = 'image/jpeg', faceRegion, zoneMarkers: rawZoneMarkers, notes } = req.body;
      if (!photoBase64) return res.status(400).json({ error: 'photoBase64 required' });
      if (photoBase64.length > 8_000_000) return res.status(413).json({ error: 'Image too large. Maximum 6 MB.' });
      if (notes && notes.length > 300) return res.status(400).json({ error: 'Notes must be 300 characters or fewer' });
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(500).json({ error: 'File storage is not configured. Contact support.' });
      }

      // Sanitized here, before any image decode/resize/upload/Gemini work —
      // reused again below for heatmap generation and the DB write, one
      // computation. Rejecting a genuinely too-poor photo as early as
      // possible (this needs nothing but the request body) avoids spending
      // real decode/upload/API cost on a scan that's going to get bounced
      // anyway.
      const sanitizedZoneMarkers = sanitizeZoneMarkers(rawZoneMarkers);

      // A real signal (not a guess) that this specific photo is too
      // occluded/poorly angled/dark to give a confident read on almost
      // anything: the client's own on-device landmark pass found usable
      // geometry for at most 1 of 8 zones. This is exactly the "very poor
      // photo, face barely detected" case a results screen should never
      // paper over with a heatmap that reads as complete when it
      // structurally can't be — reject here instead, with a clear retake
      // message. Checked ONLY when the client actually ran the landmark
      // pass (sanitizedZoneMarkers is a real, non-null object) — a legacy/
      // web client that never attempts it sends null regardless of photo
      // quality and must not be punished the same way; Gemini's own
      // faceDetected check further below still runs for those. <= 1 is
      // deliberately generous — this is a coarse pre-check, not the final
      // word on photo quality.
      if (sanitizedZoneMarkers && Object.keys(sanitizedZoneMarkers).length <= 1) {
        return res.status(400).json({
          error: "We couldn't get a confident read from that photo — try again with even lighting and your whole face clearly visible, nothing covering your forehead, eyes, or cheeks.",
        });
      }

      const buf = Buffer.from(photoBase64, 'base64');
      const base = sharp(buf).rotate(); // auto-orient from EXIF before anything else touches pixel coordinates
      const meta = await base.metadata();
      if (!meta.width || !meta.height) return res.status(400).json({ error: 'Could not read image' });

      // meta.width/height are the STORED pixel dimensions — sharp's
      // .metadata() reads them straight off the file, before the .rotate()
      // queued above actually runs. For EXIF orientation 5-8 (a 90°/270°
      // rotation — common on phone selfies depending how the phone was
      // held), the pipeline's REAL output ends up with width and height
      // swapped from what metadata() just reported. Confirmed directly:
      // extracting a box sized against the un-swapped dimensions against
      // that rotated pipeline throws libvips' "extract_area: bad extract
      // area" — exactly the error hit in production. expo-camera's old
      // capture path apparently never produced this orientation tag;
      // vision-camera's does, which is why this only surfaced after that
      // migration.
      const swapsDimensions = meta.orientation >= 5 && meta.orientation <= 8;
      const imgWidth = swapsDimensions ? meta.height : meta.width;
      const imgHeight = swapsDimensions ? meta.width : meta.height;

      const { pixelBox, faceBox } = resolveCropBox(faceRegion, imgWidth, imgHeight);

      // Three forks of the same decoded pipeline — a small raw-pixel crop
      // for the free heuristic, a full-size JPEG for storage/history
      // display (users pinch-zoom this), and a smaller one specifically
      // for the Gemini call — sharp's .clone() lets all three draw from
      // the one decode instead of re-parsing the buffer multiple times.
      // Independent clones, so run them concurrently rather than one after
      // another.
      //
      // The Gemini-sized copy exists because the ORIGINAL code sent the
      // exact same full 1080x1350 buffer to Gemini as gets stored for
      // on-screen zoom — real, unnecessary payload + processing time for
      // an API call, confirmed against production logs to be the dominant
      // cost in a request that measured 35.9s even AFTER geminiSkinAnalysis
      // .js's own 25s internal timeout, and 59.9s (client-canceled) on
      // another. 900x1125 is a real reduction (roughly 40% fewer pixels
      // than 1080x1350) while staying comfortably above what a vision
      // model's own internal tiling actually uses per image regardless of
      // input size — more pixels past that point cost transfer/processing
      // time without adding analysis fidelity.
      // heatmapPixels: raw RGB at the EXACT SAME resize params as storedBuf
      // (not just the same target numbers — .resize(fit:'inside') rarely
      // lands on exactly 1080x1350, see storedBuf's own history of that
      // exact mismatch breaking marker alignment) so generateHeatmaps'
      // output lines up pixel-for-pixel with photoUrl with zero client-side
      // coordinate translation, the same guarantee faceBox already gives
      // the old marker system.
      const [{ data: rawPixels, info: rawInfo }, storedBuf, geminiBuf, { data: heatmapPixels, info: heatmapInfo }] = await Promise.all([
        base.clone().extract(pixelBox).resize(40, 40, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
        base.clone().resize(1080, 1350, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(),
        base.clone().resize(900, 1125, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(),
        base.clone().resize(1080, 1350, { fit: 'inside', withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
      ]);
      const geminiB64 = geminiBuf.toString('base64');

      // Fired off here, not awaited until it's actually needed below (right
      // before the scan is saved) — the upload has zero dependency on the
      // face-match/Gemini work that follows, so there's no reason to pay
      // its network time SEQUENTIALLY on top of the several-second Gemini
      // call. Starting it now lets it run concurrently, hidden behind that
      // larger wait, instead of adding on top of it. Awaiting it later, at
      // the exact point its result is used, keeps every existing error-
      // handling behavior identical to before — only the START time moved.
      const uploadPromise = uploadFile(`skin-scans/${req.user.id}-${Date.now()}.jpg`, storedBuf, 'image/jpeg');

      // Gathers this account's other profiles' reference photos up front —
      // pure data fetching, no API call yet (see gatherProfileCandidates).
      const { profiles, referenceProfiles } = await gatherProfileCandidates(req.user.id);

      // Real vision-model analysis when GEMINI_API_KEY is configured, with
      // the free pixel-math heuristic (skinAnalysis.js) as a fallback
      // — both on any Gemini error (bad key, network, rate limit) and when
      // the key simply isn't set, so this route works either way. A face
      // Gemini can't find is the one case that should NOT silently fall
      // back to the heuristic (which has no way to know a face is even
      // present) — that's real, actionable feedback for the user to retake
      // the photo, so it becomes a 400 instead.
      //
      // ONE Gemini call handles both face-matching (which profile this is)
      // AND the skin analysis — folded together specifically because two
      // separate calls per scan was doubling how often the free tier's
      // per-minute quota got hit, and every 429 silently fell back to the
      // zero-detail heuristic (no zone notes → no zone markers on the
      // result photo, no progressNote). One call halves that exposure.
      let result;
      let analysisSource = 'heuristic';
      let profileId = null;
      let isNewProfile = false;
      try {
        const gemini = await analyzeWithGemini(geminiB64, {
          referenceProfiles: referenceProfiles.map(r => ({
            photoBase64: r.photoBase64, daysAgo: r.daysAgo, skinTone: r.skinTone, skinType: r.skinType, concerns: r.concerns, trend: r.trend,
          })),
        });
        if (gemini) {
          if (!gemini.faceDetected) {
            console.log(`[skin] Gemini rejected scan from user ${req.user.id}: no face detected`);
            return res.status(400).json({ error: 'We couldn\'t clearly see a face in that photo. Try again with good lighting, centered in the oval.' });
          }
          analysisSource = 'gemini';
          result = {
            skinTone: gemini.skinTone,
            skinType: gemini.skinType,
            concerns: gemini.concerns,
            summary: gemini.summary,
            progressNote: gemini.progressNote ?? null,
            hydrationLevel: gemini.hydrationLevel || '',
            // 8-zone breakdown — how many of these end up non-empty tracks
            // how much this particular photo actually showed, not a fixed
            // count (see geminiSkinAnalysis.js's prompt). Old scans in the
            // DB only ever have the coarser tZone/cheeks/underEye shape;
            // the mobile client falls back to rendering that shape when the
            // 8 keys below are all absent (see skinZones.ts).
            zoneNotes: {
              forehead: gemini.foreheadNote || '',
              nose: gemini.noseNote || '',
              chin: gemini.chinNote || '',
              cheekL: gemini.cheekLNote || '',
              cheekR: gemini.cheekRNote || '',
              underEyeL: gemini.underEyeLNote || '',
              underEyeR: gemini.underEyeRNote || '',
              jawline: gemini.jawlineNote || '',
            },
            recommendations: gemini.recommendations,
            bookCategory: BOOK_CATEGORY,
          };

          if (gemini.matchedProfileIndex != null && (gemini.matchConfidence === 'HIGH' || gemini.matchConfidence === 'MEDIUM')) {
            profileId = referenceProfiles[gemini.matchedProfileIndex - 1].profile.id;
          } else if (profiles.length > 0) {
            // Gemini was actually consulted and confidently found no match
            // among existing profiles — a different person just used this
            // account for the first time.
            isNewProfile = true;
          }
          // else: profiles.length === 0 (account's first-ever scan) — profileId
          // stays null, "You" gets created below. Not a "new profile" event.
        }
      } catch (err) {
        console.error('Gemini skin analysis failed, falling back to free heuristic:', err.message);
      }
      if (!result) {
        result = analyzeSkin({ buffer: rawPixels, channels: rawInfo.channels });
        // Gemini unavailable/errored — can't tell people apart right now, so
        // default to the account's original profile rather than
        // fragmenting history into a new profile on every single scan.
        if (profiles.length > 0) profileId = profiles[0].id;
      }

      const uploaded = await uploadPromise;
      if (!uploaded?.url) return res.status(500).json({ error: 'Photo upload failed. Please try again.' });

      // Perfect Corp fetches the photo itself via src_file_url rather than
      // accepting bytes directly, so this can only start once the photo is
      // actually live at a public URL — hence AFTER uploadPromise resolves,
      // not concurrent with the Gemini call above (a real, accepted latency
      // trade for correctness over cleverness here). A genuine image-quality
      // rejection from Perfect Corp gets the same treatment as Gemini's
      // faceDetected:false above — a clear 400 retake prompt, not a scan
      // saved on bad data. Every other failure mode already resolved (never
      // rejected) inside getConcernAnalysis, labeled 'estimated' with a
      // specific reason.
      let heatmaps, heatmapSource, heatmapSourceReason;
      try {
        ({ heatmaps, heatmapSource, heatmapSourceReason } = await getConcernAnalysis({
          photoUrl: uploaded.url,
          heuristicPixels: heatmapPixels,
          heuristicInfo: heatmapInfo,
          faceBox,
          zoneMarkers: sanitizedZoneMarkers,
          userId: req.user.id,
        }));
      } catch (err) {
        if (err instanceof ImageQualityRejection) {
          return res.status(400).json({ error: err.message, code: 'LOW_IMAGE_QUALITY' });
        }
        throw err;
      }

      const scan = await prisma.$transaction(async (tx) => {
        // A new profile is only ever actually created here — once a scan is
        // definitely being saved under it — never speculatively during the
        // face-match step above.
        if (!profileId) {
          const label = isNewProfile ? `Profile ${profiles.length + 1}` : 'You';
          const profile = await tx.skinProfile.create({ data: { userId: req.user.id, label } });
          profileId = profile.id;
        }

        const created = await tx.skinScan.create({
          data: {
            userId: req.user.id,
            profileId,
            photoUrl: uploaded.url,
            skinTone: result.skinTone,
            skinType: result.skinType,
            concerns: result.concerns,
            summary: result.summary || '',
            progressNote: result.progressNote ?? null,
            hydrationLevel: result.hydrationLevel || '',
            zoneNotes: result.zoneNotes || {},
            faceBox,
            zoneMarkers: sanitizedZoneMarkers,
            heatmaps: Object.values(heatmaps).some(Boolean) ? heatmaps : null,
            heatmapSource,
            heatmapSourceReason,
            recommendations: result.recommendations,
            notes: notes || '',
          },
        });

        // Keep the user's "current known" tone/type in sync with their most
        // recent scan, so anything elsewhere in the app that already reads
        // User.skinTone/skinType (profile display, future matching) reflects
        // it automatically without those call sites needing to change.
        // Deliberately always the LAST scanner's reading, on whichever
        // profile — a genuinely shaky spot on a shared account, but no
        // worse than before this feature existed (there was only ever one
        // tone/type on the User row regardless of who scanned).
        await tx.user.update({
          where: { id: req.user.id },
          data: { skinTone: result.skinTone, skinType: result.skinType },
        });

        return created;
      });

      console.log(`[skin] scan ${scan.id} for user ${req.user.id} (profile ${scan.profileId}${isNewProfile ? ', new' : ''}) served by: ${analysisSource}`);
      res.status(201).json({
        scan: serializeScan(scan),
        bookCategory: result.bookCategory,
        isNewProfile,
      });
    } catch (err) {
      console.error('POST /skin/scan error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get(
  '/scans',
  authenticate,
  async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
      const cursor = req.query.cursor;
      // Optional — scoping to one profile is how My Space shows "this
      // person's" timeline on a shared-device account instead of everyone's
      // scans interleaved together.
      const profileId = req.query.profileId;

      const scans = await prisma.skinScan.findMany({
        where: { userId: req.user.id, ...(profileId ? { profileId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      const hasMore = scans.length > limit;
      const page = scans.slice(0, limit);
      res.json({ scans: page.map(serializeScan), nextCursor: hasMore ? page[page.length - 1].id : null });
    } catch (err) {
      console.error('GET /skin/scans error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get(
  '/latest',
  authenticate,
  async (req, res) => {
    try {
      const profileId = req.query.profileId;
      const scan = await prisma.skinScan.findFirst({
        where: { userId: req.user.id, ...(profileId ? { profileId } : {}) },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ scan: scan ? serializeScan(scan) : null });
    } catch (err) {
      console.error('GET /skin/latest error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Profiles — the different physical people who've scanned on this account
// (see schema.prisma's SkinProfile). Almost every account has exactly one;
// this is what lets a shared-device household keep separate histories.
router.get(
  '/profiles',
  authenticate,
  async (req, res) => {
    try {
      const profiles = await prisma.skinProfile.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'asc' },
        include: {
          scans: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { scans: true } },
        },
      });
      res.json({
        profiles: profiles
          // A profile with zero scans is a leftover from a request that
          // failed after resolveProfile ran but before the scan committed
          // — shouldn't normally happen (they're created inside the same
          // transaction as the scan) but isn't worth showing if it did.
          .filter(p => p._count.scans > 0)
          .map(p => ({
            id: p.id,
            label: p.label,
            scanCount: p._count.scans,
            latestPhotoUrl: p.scans[0]?.photoUrl || null,
            latestScanAt: p.scans[0]?.createdAt || null,
            createdAt: p.createdAt,
            goalText: p.goalText || null,
            goalSetAt: p.goalSetAt || null,
            goalCheckInAt: p.goalCheckInAt || null,
          }))
          .sort((a, b) => new Date(b.latestScanAt).getTime() - new Date(a.latestScanAt).getTime()),
      });
    } catch (err) {
      console.error('GET /skin/profiles error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.patch(
  '/profiles/:id',
  authenticate,
  async (req, res) => {
    try {
      const { label } = req.body;
      if (!label || typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'Label required' });
      if (label.trim().length > 30) return res.status(400).json({ error: 'Label must be 30 characters or fewer' });

      const profile = await prisma.skinProfile.findUnique({ where: { id: req.params.id } });
      if (!profile || profile.userId !== req.user.id) return res.status(404).json({ error: 'Profile not found' });

      const updated = await prisma.skinProfile.update({ where: { id: profile.id }, data: { label: label.trim() } });
      res.json({ profile: { id: updated.id, label: updated.label } });
    } catch (err) {
      console.error('PATCH /skin/profiles/:id error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// A self-set focus with a target check-in date — what makes progress
// tracking feel like an actual plan ("reduce redness, check back in a
// week") instead of a passive timeline. Body: { goalText, checkInDays } to
// set, or { goalText: null } to clear.
router.patch(
  '/profiles/:id/goal',
  authenticate,
  async (req, res) => {
    try {
      const profile = await prisma.skinProfile.findUnique({ where: { id: req.params.id } });
      if (!profile || profile.userId !== req.user.id) return res.status(404).json({ error: 'Profile not found' });

      const { goalText, checkInDays } = req.body;

      if (goalText === null) {
        const updated = await prisma.skinProfile.update({
          where: { id: profile.id },
          data: { goalText: null, goalSetAt: null, goalCheckInAt: null },
        });
        return res.json({ profile: { id: updated.id, goalText: null, goalSetAt: null, goalCheckInAt: null } });
      }

      const cleanGoal = typeof goalText === 'string' ? goalText.trim() : '';
      if (!cleanGoal) return res.status(400).json({ error: 'goalText is required' });
      if (cleanGoal.length > 120) return res.status(400).json({ error: 'Goal must be 120 characters or fewer' });

      const days = Number(checkInDays);
      if (!Number.isFinite(days) || days < 1 || days > 90) {
        return res.status(400).json({ error: 'checkInDays must be between 1 and 90' });
      }

      const now = new Date();
      const checkInAt = new Date(now.getTime() + days * 86_400_000);
      const updated = await prisma.skinProfile.update({
        where: { id: profile.id },
        data: { goalText: cleanGoal, goalSetAt: now, goalCheckInAt: checkInAt },
      });
      res.json({
        profile: { id: updated.id, goalText: updated.goalText, goalSetAt: updated.goalSetAt, goalCheckInAt: updated.goalCheckInAt },
      });
    } catch (err) {
      console.error('PATCH /skin/profiles/:id/goal error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete(
  '/scans/:id',
  authenticate,
  async (req, res) => {
    try {
      const scan = await prisma.skinScan.findUnique({ where: { id: req.params.id } });
      if (!scan || scan.userId !== req.user.id) return res.status(404).json({ error: 'Scan not found' });

      await prisma.skinScan.delete({ where: { id: scan.id } });
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /skin/scans/:id error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
