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
const { pickSharpest, qcCheck } = require('../utils/photoQuality');
const { setJob, getJob } = require('../utils/scanJobs');
const { analyzeWithIvyAi } = require('../utils/ivyAiClient');
const { CONCERN_CONTENT, severityBand, buildVerdict, CONCERN_RECORD_SCHEMA_VERSION, validateConcernRecord } = require('../utils/skinConcernContent');

const router = express.Router();

// The heuristic engine's two oldest concern keys (skinHeatmaps.js, from
// before this app's 7-tab naming existed) don't match it — remapped here,
// once, rather than touching that file's established internal naming.
// moisture/age_spot/acne are newer additions to skinHeatmaps.js and were
// named to match the app's own keys directly, so they're identity-mapped.
// 'shine' has no tab in this app's 7-concern spec and is dropped here (not
// surfaced) — skinHeatmaps.js still computes it (used nowhere downstream),
// left alone rather than touched for an unrelated cleanup.
const HEURISTIC_KEY_MAP = { pores: 'pore', wrinkles: 'wrinkle', texture: 'texture', redness: 'redness', moisture: 'moisture', age_spot: 'age_spot', acne: 'acne' };

// Builds one concern's full record from EITHER engine's raw output —
// content (label/verdict/education/tips) always comes from
// skinConcernContent.js, so the copy a user reads is identical regardless
// of which engine produced the severity number underneath it. `maskUrl` is
// already the uploaded (our own blob storage) URL by the time this runs.
function buildConcernRecord(key, { severity, maskUrl, confidence, source, rawScore, uiScore, zoneBreakdown, overlay }) {
  const content = CONCERN_CONTENT[key];
  const band = severityBand(severity);
  const record = {
    url: maskUrl,
    label: content.label,
    tabLabel: content.tabLabel,
    source,
    gradientLabels: content.gradientLabels,
    severity,
    severityScore: Math.round(severity * 100),
    band,
    // Real per-scan specificity, not a fixed band sentence regardless of
    // what this particular photo showed — see buildVerdict's own comment.
    verdict: buildVerdict(key, band, zoneBreakdown),
    education: content.education,
    tips: content.tips,
    confidence,
    // Per-zone severity for the tap-to-highlight interaction (see mobile
    // SkinConcernTabs.tsx) — computed by skinHeatmaps.js from the same
    // severity map as the overlay itself. Always [] when it couldn't be
    // placed, never a guess — the UI treats an empty array as "no
    // tappable zones for this concern," not an error.
    zoneBreakdown: zoneBreakdown || [],
    // What the rendered PNG actually contains (skinHeatmaps.js's own
    // measurement of its output, not a guess): how much of the assessed
    // area carries visible colour, and for the discrete-finding concerns
    // (blemishes, dark spots) how many marks were drawn. Optional —
    // historical records predate it — and what overlayNoteFor below reads
    // to keep the verdict text honest about an overlay that marks nothing.
    ...(overlay ? { overlay } : {}),
    ...(rawScore != null ? { rawScore, uiScore } : {}),
  };
  // Validated at the exact point every concern record is generated —
  // THE single source of truth this app has for that shape now (see
  // validateConcernRecord's own comment). A malformed record never reaches
  // storage or the client: this app's own established convention for
  // "couldn't produce a real read" is null ("not assessed"), so a schema
  // failure degrades to that same safe, already-handled UI state instead
  // of shipping broken data — logged loudly so it's never silent.
  const errors = validateConcernRecord(key, record);
  if (errors.length > 0) {
    console.error(`[skin] buildConcernRecord produced an invalid ${key} record, discarding it:`, errors);
    return null;
  }
  return record;
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

// Every scan — this is the ONLY concern-analysis path left in the app now
// that Perfect Corp has been removed entirely (see POST /scans/:id/deep-scan
// below) — is our own on-device-geometry + pixel heuristic, no external
// vendor API call at all. 'not_configured' as the reason isn't a misnomer:
// its UI copy ("uses our free estimate model, not the full AI Skin
// Diagnostic") stays accurate — this is simply the only tier there is now.
async function getConcernAnalysis({ heuristicPixels, heuristicInfo, faceBox, faceBoxSource, zoneMarkers, faceLandmarks, userId, segMask }) {
  return runHeuristicFallback({ heuristicPixels, heuristicInfo, faceBox, faceBoxSource, zoneMarkers, faceLandmarks, userId, reason: 'not_configured', segMask });
}

async function runHeuristicFallback({ heuristicPixels, heuristicInfo, faceBox, faceBoxSource, zoneMarkers, faceLandmarks, userId, reason, segMask }) {
  const { concerns } = await generateHeatmaps({ buffer: heuristicPixels, info: heuristicInfo, faceBox, faceBoxSource, zoneMarkers, segMask, faceLandmarks }).catch((err) => {
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
      overlay: concern.overlay,
    });
  }
  // moisture/age_spot/acne now go through the same loop above as every
  // other concern (see HEURISTIC_KEY_MAP) — real heuristic signal, same
  // null-on-occlusion handling, not a separate hardcoded-null branch
  // anymore.
  return { heatmaps, heatmapSource: 'estimated', heatmapSourceReason: reason };
}

// Stage 7 — fold a real Ivy AI vendor read into the heuristic's records.
//
// Ivy returns SCORES ONLY, no pixel data of any kind, so it can never
// replace the overlay: every concern keeps the heuristic engine's own
// rendered PNG for localisation ("where on the face"), and Ivy supplies the
// authoritative severity ("how bad"). That split is the honest one — a
// licensed vision model is a better judge of degree than our pixel maths,
// but it literally cannot tell us where, having returned no map.
//
// 'acne' is deliberately never overridden: Ivy has no blemish metric at all
// (confirmed in their docs AND in every live response during Part A), so
// blemishes stay 100% heuristic rather than being silently dropped or
// faked from an unrelated metric.
//
// Only concerns the heuristic actually assessed get overridden — a concern
// the heuristic returned null for (occluded, not assessable) STAYS null.
// Ivy has no idea which parts of the face were visible to us, so letting it
// resurrect a concern we couldn't see would reintroduce exactly the
// "confident number over an unassessable area" problem this app has
// repeatedly refused to ship.
function mergeIvyIntoHeatmaps(heatmaps, ivy) {
  if (!ivy?.severities) return { heatmaps, ivyApplied: [] };
  const applied = [];
  for (const [concernKey, severity] of Object.entries(ivy.severities)) {
    const record = heatmaps[concernKey];
    if (!record) continue; // not assessed by us — see comment above
    const band = severityBand(severity);
    heatmaps[concernKey] = {
      ...record,
      severity,
      severityScore: Math.round(severity * 100),
      band,
      // Rebuilt, not left stale: the old verdict sentence was written for
      // the heuristic's band and would contradict the new one otherwise.
      verdict: buildVerdict(concernKey, band, record.zoneBreakdown),
      source: 'ivyai',
      // The vendor publishes no per-concern confidence, so this reflects
      // "a licensed vision model produced this", not a precision claim —
      // same reasoning the old perfectcorp path used.
      confidence: { level: 'high' },
    };
    applied.push(concernKey);
  }
  return { heatmaps, ivyApplied: applied };
}

// The one honest sentence for the case the first on-device round hit on
// Dark Spots: a concern whose verdict says something is there, over an
// overlay that marks nothing. Two ways that happens, both real —
//  - Ivy AI scored it from the whole photo (it returns no pixels at all —
//    see mergeIvyIntoHeatmaps) while our own pixel map found nothing
//    discrete enough to draw;
//  - our own heuristic's band cleared "clear" on its p85 but no single
//    finding passed the size/shape gate the renderer draws from.
// Either way the user must not be left staring at a blank photo under a
// "some spots are showing" line and wondering whether the tab even
// worked. Reads the engine's own `overlay` measurement of the rendered
// PNG (skinHeatmaps.js), so this can never disagree with what's actually
// on screen. Historical records without that field get no note — nothing
// is known about their PNGs, so nothing is claimed.
function overlayNoteFor(record) {
  if (!record?.overlay || record.band === 'clear') return null;
  const { flaggedFraction, findings } = record.overlay;
  const empty = findings != null ? findings === 0 : flaggedFraction < 0.002;
  if (!empty) return null;
  return record.source === 'ivyai'
    ? 'Ivy AI rated this from the whole photo, but our pixel map found nothing distinct enough to mark on it — nothing is highlighted, not because there is nothing there, but because it could not be pinpointed.'
    : 'Nothing in this area stood out enough from the surrounding skin to mark on the photo — the reading is real, but no single spot could be pinpointed.';
}

// Booking-category hand-off is always the same regardless of which analysis
// path produced the result — it doesn't need AI to decide.
const BOOK_CATEGORY = 'Facials & Skin';

function serializeScan(s) {
  return {
    // See CONCERN_RECORD_SCHEMA_VERSION's own comment (skinConcernContent.js)
    // — bumped together with it whenever this shape changes. A mobile
    // client can check this before trusting the shape it's about to render
    // rather than discovering a mismatch as a rendering crash.
    schemaVersion: CONCERN_RECORD_SCHEMA_VERSION,
    id: s.id,
    profileId: s.profileId,
    // Set only on an additional angle of a multi-angle session (see
    // schema.prisma's SkinScan.parentScanId) — null for a normal scan AND
    // for the primary/first photo of a multi-angle one (the one other
    // angles point back to, never itself pointing forward).
    parentScanId: s.parentScanId ?? null,
    photoUrl: s.photoUrl,
    photoAligned: s.photoAligned,
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

// Client-computed ML Kit contour points for THIS photo (see mobile's
// extractFaceLandmarks in skinZones.ts) — 0-1 fractions of the photo, same
// space as faceBox/zoneMarkers. Purely analysis geometry for
// skinHeatmaps.js's face mask + eye/brow/lip/nostril exclusions (see
// exclusionGeometry there); never persisted, never fed to the vision
// model. Sanitized the same way zoneMarkers is: unknown keys dropped, each
// point must have finite x/y (clamped to 0-1), each list capped at a sane
// length so a malformed client can't hand the pixel loop a million points.
// Returns null when nothing usable was sent — the engine's own geometric
// fallbacks then apply (older app, web, a detection missing a contour).
const FACE_LANDMARK_KEYS = ['faceContour', 'leftEye', 'rightEye', 'leftEyebrow', 'rightEyebrow', 'noseBottom', 'upperLipTop', 'lowerLipBottom'];
function sanitizeFaceLandmarks(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const out = {};
  let any = false;
  for (const key of FACE_LANDMARK_KEYS) {
    const pts = raw[key];
    if (!Array.isArray(pts)) continue;
    const clean = [];
    for (const p of pts.slice(0, 64)) {
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      clean.push({ x: clamp01(p.x), y: clamp01(p.y) });
    }
    if (clean.length === 0) continue;
    out[key] = clean;
    any = true;
  }
  return any ? out : null;
}

// Real, verified pipeline stages (this is what mobile SkinScanCamera.tsx's
// step indicator now actually maps to, replacing its old client-side timer
// guesses — see that file's own header comment): scoring_sharpness
// (pickSharpest+qcCheck) -> preparing_photo (decode/crop/resize + optional
// segMask decode) -> analyzing (the Gemini call, running concurrently with
// the heuristic heatmap engine and the blob upload — Gemini is the one
// genuinely non-subdividable stage: a single external request/response with
// no streaming/partial-progress signal, which is why the client's elapsed-
// time ticker is scoped to exactly this stage) -> saving (the DB
// transaction). Used by BOTH the legacy synchronous response (an older
// client that never sends `async: true` gets the exact same single 201/
// 4xx/5xx response it always has — this function's return value IS that
// response) and the new polling job path (GET /scan/jobs/:jobId/status
// below), so the two paths can never drift on what actually happens.
// `report(stage)` fires at the START of each real stage, before its work
// begins — a poll landing right after a report() call is observing a stage
// that has genuinely already started, never one that's already finished or
// hasn't begun yet.
async function runScanPipeline({ userId, photoBase64, burstCandidates, faceRegion, sanitizedZoneMarkers, faceLandmarks, notes, parentScan, rawSkinMask, aligned }, report) {
  try {
    // Burst sharpness selection + captured-file QC — runs on whichever
    // frame(s) actually arrived. With no burstCandidates this still runs
    // pickSharpest over a single-element array (cheap: one decode+score,
    // same cost the old code paid implicitly via the metadata() call
    // below) so the SAME qcCheck gate applies uniformly to old and new
    // clients rather than only to burst uploads.
    report('scoring_sharpness');
    const allCandidates = [photoBase64, ...burstCandidates];
    const { bestIndex, scores } = await pickSharpest(sharp, allCandidates);
    const selectedBase64 = allCandidates[bestIndex];
    const bestScore = scores[bestIndex];
    const qcFailure = qcCheck(bestScore.sharpness, bestScore.brightness);
    if (qcFailure) {
      const messages = {
        too_dark: "That photo came out too dark to analyze — try again somewhere with more even, direct light.",
        too_bright: "That photo came out overexposed — try again out of direct light or flash glare.",
        too_blurry: "That photo came out too blurry to analyze — hold steady and try again.",
      };
      return { ok: false, status: 400, body: { error: messages[qcFailure] || 'Photo quality was too low to analyze. Please try again.', reason: qcFailure } };
    }

    report('preparing_photo');
    const buf = Buffer.from(selectedBase64, 'base64');
    const base = sharp(buf).rotate(); // auto-orient from EXIF before anything else touches pixel coordinates
    const meta = await base.metadata();
    if (!meta.width || !meta.height) return { ok: false, status: 400, body: { error: 'Could not read image' } };

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
    const uploadPromise = uploadFile(`skin-scans/${userId}-${Date.now()}.jpg`, storedBuf, 'image/jpeg');

    // Real per-pixel segmentation confidence from modules/skin-segmentation
    // (mobile) — optional (undefined on Android before its own native
    // module exists, an older client, or a failed native call: same
    // graceful "no regression" fallback buildMasks itself already
    // implements for an absent segMask — see that function's own
    // comment). Decoded and resized here, once, to EXACTLY heatmapInfo's
    // own width/height — the same canonical resolution gray/labA/labB
    // (toGrayscaleAndLab, skinHeatmaps.js) are built at from
    // heuristicPixels — so a mask pixel and a photo pixel share the same
    // index with zero coordinate math needed downstream, the same
    // guarantee heatmapPixels/storedBuf already share via identical
    // resize params (see this file's own comment on that pairing).
    let segMask;
    if (rawSkinMask && typeof rawSkinMask === 'object' && typeof rawSkinMask.base64 === 'string' && rawSkinMask.base64) {
      try {
        const maskBuf = Buffer.from(rawSkinMask.base64, 'base64');
        const { data: maskRaw } = await sharp(maskBuf)
          .resize(heatmapInfo.width, heatmapInfo.height, { fit: 'fill' })
          .grayscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        segMask = new Float32Array(maskRaw.length);
        for (let i = 0; i < maskRaw.length; i++) segMask[i] = maskRaw[i] / 255;
      } catch (err) {
        // Never fails the scan over a bad/corrupt mask upload — same
        // "degrade to the existing ellipse-only behavior" fallback as
        // simply not sending one.
        console.error('[skin] could not decode skinMask, falling back to ellipse-only occlusion:', err.message);
        segMask = undefined;
      }
    }

    // Also fired off here rather than after the Gemini call, now that
    // Perfect Corp (the one thing that used to force this to wait for a
    // live public photoUrl — src_file_url — before it could even start)
    // is gone. getConcernAnalysis only ever needs heatmapPixels/
    // heatmapInfo, both already available above — it has no dependency on
    // Gemini's result or on uploadPromise, so it now runs concurrently
    // with both instead of serialized after them. Awaited later, at the
    // exact point its result is used, same pattern as uploadPromise above.
    const concernAnalysisPromise = getConcernAnalysis({
      heuristicPixels: heatmapPixels,
      heuristicInfo: heatmapInfo,
      faceBox,
      // 'client' = the expanded ML Kit box the app detected for this photo
      // (which skinHeatmaps.js's faceRegionMask knows how to un-expand back
      // to the face oval); 'default' = resolveCropBox's blind centre-crop
      // guess, where no such un-expansion is meaningful.
      faceBoxSource: faceRegion && typeof faceRegion === 'object' ? 'client' : 'default',
      zoneMarkers: sanitizedZoneMarkers,
      faceLandmarks,
      userId,
      segMask,
    });

    // Stage 7: started HERE, concurrently with the Gemini call and the
    // heuristic engine below — never sequentially after them. Part A's real
    // measurements are why: Ivy runs 21.7–25.1s (median 23.7s), and the
    // existing pipeline already takes ~29s end-to-end, so chaining them
    // would put a typical scan at ~53s against the client's 70s ceiling —
    // barely any headroom on a slow connection. Run concurrently it hides
    // almost entirely inside the wait that already exists.
    // Awaited far below, at the exact point its result is used.
    const ivyStartedAt = Date.now();
    const ivyPromise = process.env.IVYAI_API_KEY
      ? analyzeWithIvyAi(geminiB64).catch(() => null)
      : Promise.resolve(null);

    // Gathers this account's other profiles' reference photos up front —
    // pure data fetching, no API call yet (see gatherProfileCandidates).
    const { profiles, referenceProfiles } = await gatherProfileCandidates(userId);

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
    report('analyzing');
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
          console.log(`[skin] Gemini rejected scan from user ${userId}: no face detected`);
          return { ok: false, status: 400, body: { error: 'We couldn\'t clearly see a face in that photo. Try again with good lighting, centered in the oval.', code: 'NO_FACE_DETECTED' } };
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

    // Multi-angle scan: which profile this belongs to is already known
    // (the parent scan already went through real face-matching) — an
    // explicit "this is another angle of THAT session" beats re-running
    // face-match against this angle's own photo, which could disagree
    // with itself on a side profile Gemini reads as a different person.
    // Overrides whatever the analysis above computed; the skin
    // tone/type/concerns/heatmaps for THIS photo are untouched — only
    // which profile/history it files under changes.
    if (parentScan) {
      profileId = parentScan.profileId;
      isNewProfile = false;
    }

    const uploaded = await uploadPromise;
    if (!uploaded?.url) return { ok: false, status: 500, body: { error: 'Photo upload failed. Please try again.' } };

    // Started concurrently with the Gemini call and the upload above (see
    // concernAnalysisPromise's own comment) — just picking up the result
    // here. The heuristic engine never rejects on image quality the way
    // the old Perfect Corp Deep Scan path did — every concern it can't
    // assess just comes back null, labeled 'estimated' with a specific
    // reason, never a 400.
    const { heatmaps, heatmapSource, heatmapSourceReason } = await concernAnalysisPromise;

    // Stage 7 merge — see mergeIvyIntoHeatmaps. A null here (no key, vendor
    // refusal, timeout, quota) leaves every heuristic record exactly as it
    // was, which is the whole point: the vendor is an enhancement layered
    // on a path that already works alone, never a dependency of it.
    // Bounded await, not a bare one. Ivy is explicitly an enhancement layered
    // on a path that already works without it — but a plain `await` made it a
    // hard dependency on the vendor's LATENCY even though it isn't one on the
    // vendor's RESULT: everything else on this scan is finished by the time
    // we get here, so a hung Ivy call held a completed scan hostage for the
    // remainder of its timeout while the user watched a spinner.
    //
    // By this point Ivy has already been running for the whole pipeline
    // (~29s in production), which is comfortably past its measured p100 of
    // 25.1s. So anything still outstanding here is hung, not slow, and gets
    // a short grace rather than the rest of its budget. Losing the race is
    // exactly equivalent to the vendor returning null, which this path
    // already handles as a normal outcome (no key / refusal / quota all land
    // there too) — so a slow vendor degrades to "no vendor data" instead of
    // to a slow scan. The underlying request is left to its own timeout and
    // its result ignored; ivyPromise already has a .catch so abandoning it
    // can never surface as an unhandled rejection.
    const IVY_RESIDUAL_GRACE_MS = 4000;
    let ivyTimer;
    const ivy = await Promise.race([
      ivyPromise,
      new Promise((resolve) => { ivyTimer = setTimeout(() => resolve(null), IVY_RESIDUAL_GRACE_MS); }),
    ]);
    clearTimeout(ivyTimer);
    if (!ivy) {
      console.log(`[skin] ivy AI produced no usable result after ${Date.now() - ivyStartedAt}ms (no key, refusal, quota, timeout, or residual-grace cutoff) — heuristic severities kept as-is`);
    }
    const { ivyApplied } = mergeIvyIntoHeatmaps(heatmaps, ivy);
    for (const key of Object.keys(heatmaps)) {
      const note = overlayNoteFor(heatmaps[key]);
      if (note) heatmaps[key] = { ...heatmaps[key], overlayNote: note };
    }
    if (ivyApplied.length) {
      console.log(`[skin] ivy AI severities applied to: ${ivyApplied.join(', ')} (acne always stays heuristic — vendor has no blemish metric)`);
    }

    report('saving');
    const scan = await prisma.$transaction(async (tx) => {
      // A new profile is only ever actually created here — once a scan is
      // definitely being saved under it — never speculatively during the
      // face-match step above.
      if (!profileId) {
        const label = isNewProfile ? `Profile ${profiles.length + 1}` : 'You';
        const profile = await tx.skinProfile.create({ data: { userId, label } });
        profileId = profile.id;
      }

      const created = await tx.skinScan.create({
        data: {
          userId,
          profileId,
          photoUrl: uploaded.url,
          photoAligned: aligned,
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
          parentScanId: parentScan ? parentScan.id : null,
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
        where: { id: userId },
        data: { skinTone: result.skinTone, skinType: result.skinType },
      });

      return created;
    });

    console.log(`[skin] scan ${scan.id} for user ${userId} (profile ${scan.profileId}${isNewProfile ? ', new' : ''}) served by: ${analysisSource}`);
    return { ok: true, body: { scan: serializeScan(scan), bookCategory: result.bookCategory, isNewProfile } };
  } catch (err) {
    // Mirrors the route handler's own top-level catch — this is now the
    // ONLY place that logic lives, shared by both the synchronous and
    // polling paths, so they can never drift on what an unexpected failure
    // looks like to the client.
    console.error('runScanPipeline error:', err);
    return { ok: false, status: 500, body: { error: 'Server error' } };
  }
}

router.post(
  '/scan',
  authenticate,
  async (req, res) => {
    try {
      const { photoBase64, burstCandidates: rawBurstCandidates, mimeType = 'image/jpeg', faceRegion, zoneMarkers: rawZoneMarkers, faceLandmarks: rawFaceLandmarks, notes, parentScanId, skinMask: rawSkinMask, aligned: rawAligned, async: wantsAsync } = req.body;
      // True only when the CLIENT asserts photoBase64 is its own aligned
      // output (SkinScanCamera.tsx's Stage 6 pipeline) — coerced with ===
      // true rather than truthy so a stray non-boolean value can't slip
      // through as aligned. See schema.prisma's SkinScan.photoAligned for
      // why this matters for My Space's before/after history.
      const aligned = rawAligned === true;
      if (!photoBase64) return res.status(400).json({ error: 'photoBase64 required' });
      if (photoBase64.length > 8_000_000) return res.status(413).json({ error: 'Image too large. Maximum 6 MB.' });

      // burstCandidates is OPTIONAL and additive — an older client that only
      // ever sends photoBase64 (no burstCandidates field at all) hits
      // exactly the pre-existing single-photo path below unchanged. Only a
      // client that opts into the new 3-locked-frame capture (see
      // SkinScanCamera.tsx's shoot()) sends this, and even then it's capped
      // and validated defensively rather than trusted as already-correct.
      // Capped at 2 (not more) — matches the REAL design exactly: 1 primary
      // frame (photoBase64) + 2 additional locked-exposure frames = 3 total
      // (see SkinScanCamera.tsx's shoot(), BURST_FRAME_COUNT = 3). Capping
      // here at the real expected count, not a larger defensive-sounding
      // number, keeps the worst-case request body bounded — see app.js's
      // own comment on the route-specific JSON size limit this exact cap
      // was sized against.
      const burstCandidates = Array.isArray(rawBurstCandidates)
        ? rawBurstCandidates.filter((c) => typeof c === 'string' && c.length > 0).slice(0, 2)
        : [];
      for (const c of burstCandidates) {
        if (c.length > 8_000_000) return res.status(413).json({ error: 'Image too large. Maximum 6 MB.' });
      }
      if (notes && notes.length > 300) return res.status(400).json({ error: 'Notes must be 300 characters or fewer' });
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(500).json({ error: 'File storage is not configured. Contact support.' });
      }

      // Multi-angle scan (see schema.prisma's SkinScan.parentScanId): this
      // photo is explicitly another angle of an already-known scan session
      // ("straight-on, then either side"), not a brand-new unrelated scan.
      // Validated up front (real ownership check, real row) so a bad/
      // someone-else's id fails fast with a clear 404, not a foreign-key
      // error deep in the transaction below.
      let parentScan = null;
      if (parentScanId) {
        parentScan = await prisma.skinScan.findUnique({ where: { id: parentScanId } });
        if (!parentScan || parentScan.userId !== req.user.id) {
          return res.status(404).json({ error: 'Original scan not found for this additional angle.' });
        }
      }

      // Sanitized here, before any image decode/resize/upload/Gemini work —
      // reused again below for heatmap generation and the DB write, one
      // computation. Rejecting a genuinely too-poor photo as early as
      // possible (this needs nothing but the request body) avoids spending
      // real decode/upload/API cost on a scan that's going to get bounced
      // anyway.
      const sanitizedZoneMarkers = sanitizeZoneMarkers(rawZoneMarkers);
      const faceLandmarks = sanitizeFaceLandmarks(rawFaceLandmarks);

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

      const pipelineCtx = { userId: req.user.id, photoBase64, burstCandidates, faceRegion, sanitizedZoneMarkers, faceLandmarks, notes, parentScan, rawSkinMask, aligned };

      // Everything above this point is unavoidably synchronous either way —
      // it's cheap validation that can reject in milliseconds, so there's no
      // reason to make even a NEW client wait a poll round-trip just to
      // find out its request was malformed. Only real, potentially slow
      // pipeline work (sharpness scoring onward, inside runScanPipeline)
      // goes through the job/polling path below.
      //
      // `async: true` is how the updated mobile client opts into the new
      // polling contract (see mobile/src/api/client.ts's apiScanSkin) — an
      // older client that never sends this flag hits the exact same single-
      // request/single-response 201 (or 4xx/5xx) behavior this route has
      // always had, byte-for-byte, via the plain `await` branch below.
      // That's what keeps this change purely additive instead of breaking
      // every already-installed app version that predates it.
      if (wantsAsync === true) {
        const jobId = crypto.randomUUID();
        await setJob(jobId, req.user.id, { status: 'processing', stage: 'scoring_sharpness' });
        res.status(202).json({ jobId });
        runScanPipeline(pipelineCtx, (stage) => { setJob(jobId, req.user.id, { status: 'processing', stage }).catch(() => {}); })
          .then((result) => {
            if (result.ok) return setJob(jobId, req.user.id, { status: 'done', ...result.body });
            return setJob(jobId, req.user.id, { status: 'error', httpStatus: result.status, ...result.body });
          })
          .catch((err) => {
            console.error('POST /skin/scan (async) unexpected pipeline error:', err);
            setJob(jobId, req.user.id, { status: 'error', httpStatus: 500, error: 'Server error' }).catch(() => {});
          });
        return;
      }

      const result = await runScanPipeline(pipelineCtx, () => {});
      if (!result.ok) return res.status(result.status).json(result.body);
      return res.status(201).json(result.body);
    } catch (err) {
      console.error('POST /skin/scan error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Polling status for the async path above (see `wantsAsync` in POST /scan).
// Always answers 200 with a `status` field — a still-processing OR a FAILED
// job both come back as a normal 200 with status:'processing'/'error', not
// an HTTP-level 4xx/5xx, because a job failure is a real, meaningful STATE
// of the resource being polled, not a failure of the poll request itself
// (which client.ts's request() would otherwise treat as transient and
// retry). Only a genuinely unknown/expired/not-yours jobId is a real 404 —
// there the poll request itself failed to find its target.
router.get(
  '/scan/jobs/:jobId/status',
  authenticate,
  async (req, res) => {
    try {
      const job = await getJob(req.params.jobId);
      if (!job || job.userId !== req.user.id) {
        return res.status(404).json({ error: 'Scan job not found or expired.' });
      }
      if (job.status === 'done') {
        return res.json({ status: 'done', scan: job.scan, bookCategory: job.bookCategory, isNewProfile: job.isNewProfile });
      }
      if (job.status === 'error') {
        return res.json({ status: 'error', error: job.error, code: job.code });
      }
      return res.json({ status: 'processing', stage: job.stage });
    } catch (err) {
      console.error('GET /skin/scan/jobs/:jobId/status error:', err);
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

// Every scan in the same multi-angle session as :id — whether :id IS the
// primary (first) photo or one of its additional angles, this always
// resolves to the FULL group (primary + every angle), ordered oldest
// first (the capture order a gallery/carousel should show). Empty array
// (not 404) for an ordinary single-photo scan — "no other angles" is a
// normal, common answer, not an error.
router.get(
  '/scans/:id/angles',
  authenticate,
  async (req, res) => {
    try {
      const scan = await prisma.skinScan.findUnique({ where: { id: req.params.id } });
      if (!scan || scan.userId !== req.user.id) return res.status(404).json({ error: 'Scan not found' });

      const primaryId = scan.parentScanId || scan.id;
      const group = await prisma.skinScan.findMany({
        where: { userId: req.user.id, OR: [{ id: primaryId }, { parentScanId: primaryId }] },
        orderBy: { createdAt: 'asc' },
      });
      res.json({ angles: group.map(serializeScan) });
    } catch (err) {
      console.error('GET /skin/scans/:id/angles error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Deep Scan (the Perfect Corp vendor upgrade this route used to expose)
// removed entirely — the app no longer calls any external skin-analysis
// vendor API. All scans, quick or otherwise, use the free on-device/local
// heuristic exclusively (see getConcernAnalysis above). This route is kept
// only so an old app build still holding a "Run Deep Scan" button gets a
// clear, honest response instead of a raw 404.
router.post(
  '/scans/:id/deep-scan',
  authenticate,
  async (req, res) => {
    res.status(410).json({ error: 'Deep Scan has been removed.', code: 'REMOVED' });
  }
);

module.exports = router;
