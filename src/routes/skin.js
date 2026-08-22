// src/routes/skin.js
'use strict';

const express = require('express');
const sharp   = require('sharp');
const prisma  = require('../lib/prisma');
const { uploadFile } = require('../utils/storage');
const { authenticate } = require('../middleware/auth');
const { analyzeSkin } = require('../utils/skinAnalysis');
const { analyzeWithGemini, matchFaceProfile } = require('../utils/geminiSkinAnalysis');

const router = express.Router();

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
    daysAgo: Math.max(0, Math.round((Date.now() - scan.createdAt.getTime()) / 86_400_000)),
  };
}

async function fetchImageBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString('base64');
}

// Decides which SkinProfile (see schema.prisma) this new scan belongs to —
// the thing that keeps two people sharing one account/device from having
// their skin histories folded together. Side-effect-free: never creates a
// profile itself (a rejected scan — no face, upload failure — shouldn't
// leave an empty orphaned profile behind); the caller creates one, using
// the returned `label`, only once it knows the scan is actually going to be
// saved. Returns `profileId: null` in that case.
async function resolveProfile(userId, newPhotoBase64) {
  const profiles = await prisma.skinProfile.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { scans: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  if (profiles.length === 0) {
    return { profileId: null, label: 'You', previousScan: undefined, isNewProfile: false };
  }

  // Compare against the handful of most recently active profiles — bounds
  // Gemini cost/latency on an account with a long tail of old profiles.
  const candidates = profiles
    .filter(p => p.scans.length > 0)
    .sort((a, b) => b.scans[0].createdAt.getTime() - a.scans[0].createdAt.getTime())
    .slice(0, 5);

  let matched = null;
  let consultedGemini = false;
  if (candidates.length > 0) {
    try {
      const referencePhotos = [];
      for (const p of candidates) {
        try {
          referencePhotos.push({ profile: p, photoBase64: await fetchImageBase64(p.scans[0].photoUrl) });
        } catch (err) {
          console.error(`[skin] could not fetch reference photo for profile ${p.id}:`, err.message);
        }
      }
      if (referencePhotos.length > 0) {
        const result = await matchFaceProfile(newPhotoBase64, referencePhotos);
        if (result) {
          consultedGemini = true;
          if (result.matchedIndex != null && result.confidence !== 'LOW') {
            matched = referencePhotos[result.matchedIndex - 1].profile;
          }
        }
      }
    } catch (err) {
      console.error('[skin] face-match failed:', err.message);
    }
  }

  // Gemini not configured, unreachable, errored, or had nothing yet to
  // compare against — can't tell people apart right now, so default to the
  // account's original profile rather than fragmenting history into a new
  // profile on every single scan.
  if (!matched && !consultedGemini) matched = profiles[0];

  if (matched) {
    return {
      profileId: matched.id,
      label: null,
      previousScan: toPreviousScanContext(matched.scans[0]),
      isNewProfile: false,
    };
  }

  // Gemini was actually consulted and confidently found no match — a
  // different person just used this account for the first time.
  return { profileId: null, label: `Profile ${profiles.length + 1}`, previousScan: undefined, isNewProfile: true };
}

// Maps the one remaining quiz question's choice id to a plain sentence
// Gemini's prompt can drop straight in — everything else the old
// 4-question quiz asked, Gemini now reads directly from the photo instead.
const SENSITIVITY_HINTS = {
  often: 'reacts often to new products (redness, itching, stinging)',
  sometimes: 'sometimes reacts to new products',
  rarely: 'rarely or never reacts to new products',
};

// Resolves the pixel-space crop rect to analyze. `faceRegion` (optional) is
// {x,y,width,height} as 0–1 fractions of the photo, computed client-side from
// where the on-screen alignment oval sits over the live camera preview (see
// SkinScanCamera.tsx) — there's no on-device face detector in this app, so
// the oval is a guide the user aligns to, not a verified detection. Without
// one (older clients, or the guide couldn't be mapped), falls back to a
// generous center crop, since a front-camera selfie framed normally puts the
// face roughly there anyway.
const DEFAULT_REGION = { x: 0.22, y: 0.16, width: 0.56, height: 0.6 };

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

  return { left, top, width, height };
}

router.post(
  '/scan',
  authenticate,
  async (req, res) => {
    try {
      const { photoBase64, mimeType = 'image/jpeg', quizAnswers, faceRegion, notes } = req.body;
      if (!photoBase64) return res.status(400).json({ error: 'photoBase64 required' });
      if (photoBase64.length > 8_000_000) return res.status(413).json({ error: 'Image too large. Maximum 6 MB.' });
      if (notes && notes.length > 300) return res.status(400).json({ error: 'Notes must be 300 characters or fewer' });
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return res.status(500).json({ error: 'File storage is not configured. Contact support.' });
      }

      const buf = Buffer.from(photoBase64, 'base64');
      const base = sharp(buf).rotate(); // auto-orient from EXIF before anything else touches pixel coordinates
      const meta = await base.metadata();
      if (!meta.width || !meta.height) return res.status(400).json({ error: 'Could not read image' });

      const box = resolveCropBox(faceRegion, meta.width, meta.height);

      // Two forks of the same decoded pipeline: a small raw-pixel crop for
      // analysis, and a normal-sized JPEG for storage/history display —
      // sharp's .clone() lets both draw from the one decode instead of
      // re-parsing the buffer twice.
      const { data: rawPixels, info: rawInfo } = await base
        .clone()
        .extract(box)
        .resize(40, 40, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const storedBuf = await base
        .clone()
        .resize(1080, 1350, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      const storedB64 = storedBuf.toString('base64');

      // Figures out WHICH person this scan is (face-match against this
      // account's other profiles — see resolveProfile) before analysis runs,
      // so the previous-scan comparison Gemini gets is the right person's
      // history, not just "whoever scanned on this account most recently."
      const resolved = await resolveProfile(req.user.id, storedB64);
      const previousScan = resolved.previousScan;
      const sensitivityHint = SENSITIVITY_HINTS[quizAnswers?.sensitivity];

      // Real vision-model analysis when GEMINI_API_KEY is configured, with
      // the free pixel-math + quiz heuristic (skinAnalysis.js) as a fallback
      // — both on any Gemini error (bad key, network, rate limit) and when
      // the key simply isn't set, so this route works either way. A face
      // Gemini can't find is the one case that should NOT silently fall
      // back to the heuristic (which has no way to know a face is even
      // present) — that's real, actionable feedback for the user to retake
      // the photo, so it becomes a 400 instead.
      let result;
      let analysisSource = 'heuristic';
      try {
        const gemini = await analyzeWithGemini(storedB64, { sensitivityHint, previousScan });
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
            zoneNotes: {
              tZone: gemini.tZoneNote || '',
              cheeks: gemini.cheeksNote || '',
              underEye: gemini.underEyeNote || '',
            },
            recommendations: gemini.recommendations,
            bookCategory: BOOK_CATEGORY,
          };
        }
      } catch (err) {
        console.error('Gemini skin analysis failed, falling back to free heuristic:', err.message);
      }
      if (!result) {
        result = analyzeSkin({ buffer: rawPixels, channels: rawInfo.channels, quizAnswers });
      }

      const uploaded = await uploadFile(`skin-scans/${req.user.id}-${Date.now()}.jpg`, storedBuf, 'image/jpeg');
      if (!uploaded?.url) return res.status(500).json({ error: 'Photo upload failed. Please try again.' });

      const scan = await prisma.$transaction(async (tx) => {
        // A new profile is only ever actually created here — once a scan is
        // definitely being saved under it — never speculatively during
        // face-match (see resolveProfile's comment).
        let profileId = resolved.profileId;
        if (!profileId) {
          const profile = await tx.skinProfile.create({ data: { userId: req.user.id, label: resolved.label } });
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
            recommendations: result.recommendations,
            quizAnswers: quizAnswers || {},
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

      console.log(`[skin] scan ${scan.id} for user ${req.user.id} (profile ${scan.profileId}${resolved.isNewProfile ? ', new' : ''}) served by: ${analysisSource}`);
      res.status(201).json({
        scan: serializeScan(scan),
        bookCategory: result.bookCategory,
        isNewProfile: resolved.isNewProfile,
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
