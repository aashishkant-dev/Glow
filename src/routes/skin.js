// src/routes/skin.js
'use strict';

const express = require('express');
const sharp   = require('sharp');
const prisma  = require('../lib/prisma');
const { uploadFile } = require('../utils/storage');
const { authenticate } = require('../middleware/auth');
const { analyzeSkin } = require('../utils/skinAnalysis');
const { analyzeWithGemini } = require('../utils/geminiSkinAnalysis');

const router = express.Router();

// Booking-category hand-off is always the same regardless of which analysis
// path produced the result — it doesn't need AI to decide.
const BOOK_CATEGORY = 'Facials & Skin';

function serializeScan(s) {
  return {
    id: s.id,
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

      // Fetched up front (before analysis) so Gemini can compare THIS photo
      // against it directly — the progress commentary is only meaningful
      // when it's the model actually looking at both, not a second pass
      // stitched together after the fact.
      const previousScanRow = await prisma.skinScan.findFirst({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
      });
      const previousScan = previousScanRow
        ? {
            skinTone: previousScanRow.skinTone,
            skinType: previousScanRow.skinType,
            concerns: previousScanRow.concerns,
            daysAgo: Math.max(0, Math.round((Date.now() - previousScanRow.createdAt.getTime()) / 86_400_000)),
          }
        : undefined;
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
        const gemini = await analyzeWithGemini(storedBuf.toString('base64'), { sensitivityHint, previousScan });
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

      const [scan] = await prisma.$transaction([
        prisma.skinScan.create({
          data: {
            userId: req.user.id,
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
        }),
        // Keep the user's "current known" tone/type in sync with their most
        // recent scan, so anything elsewhere in the app that already reads
        // User.skinTone/skinType (profile display, future matching) reflects
        // it automatically without those call sites needing to change.
        prisma.user.update({
          where: { id: req.user.id },
          data: { skinTone: result.skinTone, skinType: result.skinType },
        }),
      ]);

      console.log(`[skin] scan ${scan.id} for user ${req.user.id} served by: ${analysisSource}`);
      res.status(201).json({
        scan: serializeScan(scan),
        bookCategory: result.bookCategory,
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

      const scans = await prisma.skinScan.findMany({
        where: { userId: req.user.id },
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
      const scan = await prisma.skinScan.findFirst({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ scan: scan ? serializeScan(scan) : null });
    } catch (err) {
      console.error('GET /skin/latest error:', err);
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
