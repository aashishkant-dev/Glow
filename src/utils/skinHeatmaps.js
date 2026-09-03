// src/utils/skinHeatmaps.js
'use strict';

// Interim/MVP heatmap engine for the "My Space" skin-scan results screen —
// replaces the old point-marker + tooltip system entirely (see the mobile
// SkinZoneOverlay/MarkerCallout removal in the same change that added this
// file). A marker/tooltip represented a region's condition with a single
// coordinate, which meant its correctness was hostage to landmark-detection
// quality for that one point — occlusion or head tilt had no way to
// "partially" degrade a point, so it either sat at a wrong spot or vanished.
// A heatmap is masked to a REGION instead, so it structurally cannot render
// outside the assessable skin area, regardless of detection quality.
//
// Every concern here is deliberately plain, well-understood image
// processing (Lab color space, Laplacian/Sobel edge response, luminance
// percentile) — NOT a trained model. This is the explicitly-labeled interim
// path (see the product decision this shipped under): free, on-device-style
// compute (same "no paid per-call AI API" principle as skinAnalysis.js),
// shippable now, with real, disclosed fidelity limits — a licensed vision
// SDK (Perfect Corp/Haut.AI/Revieve) remains the higher-fidelity path if
// this proves insufficient.
//
// All scoring is SELF-RELATIVE (z-scored against this photo's own
// assessable-skin mean/stddev), not against a fixed absolute threshold —
// deliberately, so a heuristic tuned on one skin tone/lighting setup doesn't
// systematically over- or under-flag another. This is a materially
// different (fairer, but still approximate) design than a single hardcoded
// brightness/color cutoff would give.

const { rgbToLab } = require('./skinAnalysis');
const { CONCERN_CONTENT } = require('./skinConcernContent');

// Mirrors mobile/src/utils/skinZones.ts's ZONE_RECTS exactly — fractions OF
// the face box (not the full photo), one definition kept in sync by hand on
// both sides of the JS/TS boundary, same convention this file already
// follows for DEFAULT_REGION/DEFAULT_FACE_BOX (see routes/skin.js). A
// mismatch here would mean the heatmap masks itself out of sync with where
// the SAME zoneMarkers data anchors an old-style marker, if either side
// were still using markers — kept identical on purpose.
const ZONE_RECTS = {
  forehead: { x: 0.22, y: 0.22, width: 0.56, height: 0.15 },
  underEyeL: { x: 0.20, y: 0.49, width: 0.22, height: 0.08 },
  underEyeR: { x: 0.58, y: 0.49, width: 0.22, height: 0.08 },
  nose: { x: 0.42, y: 0.46, width: 0.16, height: 0.24 },
  cheekL: { x: 0.14, y: 0.52, width: 0.26, height: 0.22 },
  cheekR: { x: 0.60, y: 0.52, width: 0.26, height: 0.22 },
  chin: { x: 0.36, y: 0.78, width: 0.28, height: 0.08 },
  jawline: { x: 0.14, y: 0.83, width: 0.72, height: 0.06 },
};
const ZONE_KEYS = Object.keys(ZONE_RECTS);

// Zones a crease/fine-line actually forms along — forehead (horizontal
// creases) and under-eye (crow's-feet-adjacent) are direct matches; there's
// no separate "nasolabial fold" zone in this app's 8-zone breakdown, so the
// nose zone (immediately adjacent to where a nasolabial fold runs) stands
// in for it. Restricting wrinkle-line detection to just these — rather than
// the whole face — is what makes it read as "creases," not generic texture.
const WRINKLE_ZONES = ['forehead', 'underEyeL', 'underEyeR', 'nose'];

// Pores are naturally most visible (and most relevant to actually treat) in
// the T-zone and inner cheeks — the nose and cheek zones already defined
// above — not the forehead/jawline/chin the same way. Restricting the pore
// detector to just these, same principle as WRINKLE_ZONES, is what keeps
// the resulting heatmap reading as "pores in the T-zone," not generic
// texture smeared across the whole face.
const PORE_ZONES = ['nose', 'cheekL', 'cheekR'];

function zoneRectToPhotoFrac(zone, faceBox) {
  const r = ZONE_RECTS[zone];
  return {
    x: faceBox.x + r.x * faceBox.width,
    y: faceBox.y + r.y * faceBox.height,
    width: r.width * faceBox.width,
    height: r.height * faceBox.height,
  };
}

// Elliptical falloff instead of a hard rectangle — a rounded region reads
// as "the skin here," not a blocky crop, and adjacent zone masks blend at
// their shared edge instead of showing a visible seam. Returns 0 outside
// the ellipse, 1 well inside it, smoothly transitioning across the outer
// ~18% of the radius.
function ellipseWeight(px, py, rect, imgWidth, imgHeight) {
  const cx = (rect.x + rect.width / 2) * imgWidth;
  const cy = (rect.y + rect.height / 2) * imgHeight;
  const rx = (rect.width / 2) * imgWidth;
  const ry = (rect.height / 2) * imgHeight;
  if (rx <= 0 || ry <= 0) return 0;
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= 1) return 0;
  const edge = 0.82;
  if (d <= edge) return 1;
  return 1 - (d - edge) / (1 - edge);
}

// Which zones are assessable for THIS scan, and where — same fallback rule
// as mobile's buildZoneMarkers (skinZones.ts), applied to a region instead
// of a point:
// - zoneMarkers a real object with a key for this zone: use that key's own
//   anchored rect (already full-photo 0-1 fractions, real per-photo
//   landmark geometry) — the most accurate placement available.
// - zoneMarkers a real object WITHOUT this key: the landmark pass ran and
//   explicitly could not place it (occlusion, low confidence — see
//   mobile/src/utils/skinZones.ts's deriveZoneMarkers) — excluded, not
//   guessed. This is the direct fix for the reported bug class: a heavily
//   occluded photo now excludes those regions from the heatmap instead of
//   painting a heatmap where a marker used to land wrong.
// - zoneMarkers null/undefined (no landmark pass ever ran — legacy scan,
//   web, detector unavailable): fall back to the ZONE_RECTS proportion
//   estimate for every zone, same "best information available" reasoning
//   as before.
function assessableZoneRects(faceBox, zoneMarkers) {
  const out = {};
  for (const zone of ZONE_KEYS) {
    if (zoneMarkers && typeof zoneMarkers === 'object') {
      const anchored = zoneMarkers[zone];
      if (anchored && typeof anchored === 'object') out[zone] = anchored;
      // else: explicitly excluded, no fallback.
    } else {
      out[zone] = zoneRectToPhotoFrac(zone, faceBox);
    }
  }
  return out;
}

// Approximates the mouth as the gap between the 'nose' zone's bottom edge
// and the 'chin' zone's top edge — there's no dedicated mouth/lip zone in
// this app's 8-zone breakdown, but the nose/chin zones already bracket it.
// Found by actually rendering this heatmap engine against a real photo and
// looking at the result (not assumed): lips read as strongly "red" in Lab's
// a* channel — a real, physiological fact about lip color, not a sensor
// artifact — so without this exclusion, redness gets falsely reported on
// lips on almost every photo, regardless of anything to do with skin
// condition. Only computed when both anchors are present; a scan missing
// either just doesn't get this specific exclusion (a residual gap, not a
// crash) rather than guessing at a mouth position with no real anchor.
// Superseded by the real lip contour when the client sends one (see
// exclusionGeometry below) — this stays as the no-landmark fallback only.
function mouthExclusionRect(zoneRects) {
  const nose = zoneRects.nose;
  const chin = zoneRects.chin;
  if (!nose || !chin) return null;
  const top = nose.y + nose.height;
  const bottom = chin.y;
  if (bottom <= top) return null;
  const width = Math.max(nose.width, chin.width) * 0.9;
  const cx = nose.x + nose.width / 2;
  return { x: cx - width / 2, y: top, width, height: bottom - top };
}

// ── Landmark-driven face region + exclusion geometry ────────────────────────
//
// Found on the first real on-device look at these overlays (see the
// screenshots that drove this change): the zone ellipses alone were never a
// hard "this is skin" constraint. Two concrete leaks —
//   1. Neck/collar: `faceBox` is the client's EXPANDED ML Kit box (bottom
//      pushed 25% of the face height below the chin, see SkinScanCamera's
//      detectFaceRegion), so the chin/jawline zones — and, on the
//      no-landmark proportional fallback, the whole lower band — sat on the
//      neck. The segmentation mask couldn't catch it either: it is a PERSON
//      mask (Vision's VNGeneratePersonSegmentationRequest / ML Kit selfie
//      segmentation), and a neck and a shirt collar are "person" too.
//   2. Eyes/brows: nothing ever carved the eye itself, the lids, or the
//      eyebrows out of any zone, so eyelashes/brow hair (dark, high-contrast,
//      linear) fed every DoG/Laplacian/Sobel detector as if it were skin.
//
// The client now sends the actual ML Kit contours for this photo
// (`faceLandmarks`, 0-1 photo fractions — see mobile's extractFaceLandmarks
// in skinZones.ts): the face outline polygon becomes a hard face mask, and
// eye/brow/lip/nostril contours become explicit exclusion ellipses. Every
// level below has a real fallback for a scan that didn't send it (older
// app, web, a detection that lacked a given contour), so nothing regresses
// to "no mask" — it degrades to a geometric estimate instead.

function pointsToPx(points, width, height) {
  if (!Array.isArray(points)) return [];
  const out = [];
  for (const p of points) {
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    out.push({ x: p.x * width, y: p.y * height });
  }
  return out;
}

function bboxOf(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, halfW: (maxX - minX) / 2, halfH: (maxY - minY) / 2 };
}

// Soft ellipse in pixel space: 1 well inside, 0 outside, smooth across the
// outer (1-edge) fraction of the radius. Same idea as ellipseWeight above,
// just parameterised by centre/radii instead of a fractional rect.
function softEllipse(px, py, e, edge) {
  if (e.rx <= 0 || e.ry <= 0) return 0;
  const dx = (px - e.cx) / e.rx;
  const dy = (py - e.cy) / e.ry;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= 1) return 0;
  if (d <= edge) return 1;
  return 1 - (d - edge) / (1 - edge);
}

// Even-odd scanline polygon fill — the one place a real outline (the face
// contour) is turned into a per-pixel mask. Deliberately simple: the face
// contour is a single convex-ish loop of ~36 points, so no clipping or
// self-intersection handling is needed.
function rasterizePolygon(pts, width, height) {
  const out = new Float32Array(width * height);
  const n = pts.length;
  if (n < 3) return out;
  const xs = [];
  for (let y = 0; y < height; y++) {
    xs.length = 0;
    const sy = y + 0.5;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > sy) !== (b.y > sy)) xs.push(a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) out[y * width + x] = 1;
    }
  }
  return out;
}

// The hard "is this face skin at all" mask every concern is multiplied by.
// Preference order, most to least real:
//  - the client's own ML Kit FACE contour for this photo, shrunk 3% toward
//    its centroid (keeps the mask off the hairline/jaw edge pixels, which
//    read as strong edges in every detector) and feathered so it fades at
//    the outline instead of cutting hard;
//  - an ellipse un-expanded from the client's faceBox (which is ML Kit's
//    box grown 50% up, 25% down, 25% each side — see detectFaceRegion) back
//    to roughly the face oval, so the neck below the chin is outside it;
//  - for a scan with NO client face detection at all (faceBoxSource
//    'default' — the backend's generous centre-crop guess), the ellipse
//    inscribed in that guess: the least informed option, but still never a
//    full-frame rectangle.
// `segMask` (person segmentation) still multiplies in on top for
// background/hand/hair-edge suppression — it just isn't asked to know
// where a neck ends anymore.
function faceRegionMask(width, height, faceBox, faceBoxSource, landmarks, segMask) {
  let base;
  const contour = pointsToPx(landmarks?.faceContour, width, height);
  if (contour.length >= 8) {
    let sx = 0, sy = 0;
    for (const p of contour) { sx += p.x; sy += p.y; }
    const cx = sx / contour.length, cy = sy / contour.length;
    const shrunk = contour.map((p) => ({ x: cx + (p.x - cx) * 0.97, y: cy + (p.y - cy) * 0.97 }));
    base = gaussianApprox(rasterizePolygon(shrunk, width, height), width, height, Math.max(2, Math.round(Math.min(width, height) / 140)));
  } else {
    const fb = faceBox;
    const e = faceBoxSource === 'default'
      ? { cx: (fb.x + fb.width / 2) * width, cy: (fb.y + fb.height / 2) * height, rx: fb.width * 0.5 * width, ry: fb.height * 0.5 * height }
      : { cx: (fb.x + fb.width / 2) * width, cy: (fb.y + fb.height * 0.56) * height, rx: fb.width * 0.34 * width, ry: fb.height * 0.31 * height };
    base = new Float32Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) base[y * width + x] = softEllipse(x, y, e, 0.9);
  }
  if (segMask) for (let i = 0; i < base.length; i++) base[i] *= segMask[i];
  return base;
}

// Eye / eyebrow / lip / nostril exclusion ellipses, in pixel space. Two eye
// variants: `eyeWide` (eye + both lids + the immediate socket — carved out
// of every skin-surface concern, where lashes, lid creases and socket
// shadow have no physiological meaning) and `eyeTight` (just the eyeball
// and lash line — what fine-line detection keeps out, since crow's feet
// and under-eye lines genuinely live right next to the eye).
//
// Fallbacks when a given contour wasn't sent: the eye is placed from the
// under-eye zone rect (its centre is, by deriveZoneMarkers' own
// construction, exactly 0.09 face-box heights below the eye centre) and
// the brow a fixed fraction above that; with no under-eye rect either, a
// last-resort proportional guess against faceBox. Lips fall back to the
// nose/chin gap (mouthExclusionRect); nostrils have no sane geometric
// fallback and are simply not excluded without a contour.
function exclusionGeometry(width, height, faceBox, zoneRects, landmarks) {
  const pad = Math.min(width, height) / 220; // ~5px at 1080 — lash/brow hair sticks out past the contour points
  const eyeWide = [], eyeTight = [], other = [];
  const fbH = faceBox.height * height, fbW = faceBox.width * width;

  const eyeFromContour = (pts) => {
    const b = bboxOf(pts);
    eyeWide.push({ cx: b.cx, cy: b.cy, rx: b.halfW * 1.45 + pad, ry: Math.max(b.halfH * 2.6, b.halfW * 0.8) + pad });
    eyeTight.push({ cx: b.cx, cy: b.cy, rx: b.halfW * 1.2 + pad, ry: Math.max(b.halfH * 1.9, b.halfW * 0.55) + pad });
  };
  const eyeFromRect = (rect) => {
    const cx = (rect.x + rect.width / 2) * width;
    const cy = (rect.y + rect.height / 2) * height - fbH * 0.09;
    const halfW = rect.width * width * 0.42;
    eyeWide.push({ cx, cy, rx: halfW * 1.45 + pad, ry: fbH * 0.05 + pad });
    eyeTight.push({ cx, cy, rx: halfW * 1.2 + pad, ry: fbH * 0.035 + pad });
    other.push({ cx, cy: cy - fbH * 0.055, rx: halfW * 1.5 + pad, ry: fbH * 0.022 + pad }); // brow
  };
  const eyeFromProportion = (side) => {
    const cx = (faceBox.x + faceBox.width * (side === 'L' ? 0.31 : 0.69)) * width;
    const cy = (faceBox.y + faceBox.height * 0.44) * height;
    eyeWide.push({ cx, cy, rx: fbW * 0.09 + pad, ry: fbH * 0.05 + pad });
    eyeTight.push({ cx, cy, rx: fbW * 0.075 + pad, ry: fbH * 0.035 + pad });
    other.push({ cx, cy: cy - fbH * 0.055, rx: fbW * 0.095 + pad, ry: fbH * 0.022 + pad });
  };

  for (const [eyeKey, browKey, rectKey, side] of [['leftEye', 'leftEyebrow', 'underEyeL', 'L'], ['rightEye', 'rightEyebrow', 'underEyeR', 'R']]) {
    const eyePts = pointsToPx(landmarks?.[eyeKey], width, height);
    if (eyePts.length >= 4) {
      eyeFromContour(eyePts);
      const browPts = pointsToPx(landmarks?.[browKey], width, height);
      if (browPts.length >= 3) {
        const b = bboxOf(browPts);
        other.push({ cx: b.cx, cy: b.cy, rx: b.halfW * 1.08 + pad, ry: Math.max(b.halfH * 1.5, b.halfW * 0.28) + pad });
      } else {
        const b = bboxOf(eyePts);
        other.push({ cx: b.cx, cy: b.cy - fbH * 0.055, rx: b.halfW * 1.5 + pad, ry: fbH * 0.022 + pad });
      }
    } else if (zoneRects[rectKey]) {
      eyeFromRect(zoneRects[rectKey]);
    } else {
      eyeFromProportion(side);
    }
  }

  const lipPts = [...pointsToPx(landmarks?.upperLipTop, width, height), ...pointsToPx(landmarks?.lowerLipBottom, width, height)];
  if (lipPts.length >= 4) {
    const b = bboxOf(lipPts);
    other.push({ cx: b.cx, cy: b.cy, rx: b.halfW * 1.12 + pad, ry: b.halfH * 1.25 + pad });
  } else {
    const m = mouthExclusionRect(zoneRects);
    if (m) other.push({ cx: (m.x + m.width / 2) * width, cy: (m.y + m.height / 2) * height, rx: m.width / 2 * width, ry: m.height / 2 * height });
  }

  const nosePts = pointsToPx(landmarks?.noseBottom, width, height);
  if (nosePts.length >= 2) {
    const b = bboxOf(nosePts);
    other.push({ cx: b.cx, cy: b.cy, rx: b.halfW * 1.15 + pad, ry: Math.max(b.halfH, 1) * 1.5 + Math.min(width, height) / 90 });
  }

  return { eyeWide, eyeTight, other };
}

// Builds the per-pixel [0,1] masks (Float32Array, row-major, width*height)
// every concern is scored and rendered against:
//   full    — union of every assessable zone's ellipse, for region concerns
//   wrinkle — the same restricted to WRINKLE_ZONES
//   pore    — the same restricted to PORE_ZONES
// each multiplied by the hard face-region mask (faceRegionMask) and by the
// exclusion ellipses (exclusionGeometry) — so a pixel only counts if it is
// inside a named zone AND inside the face outline AND not an eye, brow,
// lip or nostril AND (when a segmentation mask exists) confidently a
// person. All multiplicative, so every soft edge blends rather than cuts.
// `zoneRects` values are already full-photo 0-1 fractions (see
// assessableZoneRects). Returns the face mask too, so callers can compute
// "how much of the face did we actually assess."
function buildMasks(width, height, zoneRects, segMask, geometry = {}) {
  const { faceBox = { x: 0, y: 0, width: 1, height: 1 }, faceBoxSource = 'client', landmarks = null } = geometry;
  const full = new Float32Array(width * height);
  const wrinkle = new Float32Array(width * height);
  const pore = new Float32Array(width * height);
  const rectList = Object.entries(zoneRects);
  const wrinkleRectList = rectList.filter(([zone]) => WRINKLE_ZONES.includes(zone));
  const poreRectList = rectList.filter(([zone]) => PORE_ZONES.includes(zone));
  const face = faceRegionMask(width, height, faceBox, faceBoxSource, landmarks, segMask);
  const ex = exclusionGeometry(width, height, faceBox, zoneRects, landmarks);
  const EDGE = 0.7;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const f = face[i];
      if (f <= 0.001) continue;
      let w = 0;
      for (const [, rect] of rectList) w = Math.max(w, ellipseWeight(x, y, rect, width, height));
      let ww = 0;
      for (const [, rect] of wrinkleRectList) ww = Math.max(ww, ellipseWeight(x, y, rect, width, height));
      let wp = 0;
      for (const [, rect] of poreRectList) wp = Math.max(wp, ellipseWeight(x, y, rect, width, height));
      if (w <= 0 && ww <= 0 && wp <= 0) continue;
      let cut = 0;
      for (const e of ex.other) cut = Math.max(cut, softEllipse(x, y, e, EDGE));
      let cutWide = cut;
      for (const e of ex.eyeWide) cutWide = Math.max(cutWide, softEllipse(x, y, e, EDGE));
      let cutTight = cut;
      for (const e of ex.eyeTight) cutTight = Math.max(cutTight, softEllipse(x, y, e, EDGE));
      full[i] = w * f * (1 - cutWide);
      pore[i] = wp * f * (1 - cutWide);
      wrinkle[i] = ww * f * (1 - cutTight);
    }
  }
  return { full, wrinkle, pore, face, assessedZoneCount: rectList.length, totalZoneCount: ZONE_KEYS.length };
}

function toGrayscaleAndLab(buffer, channels, width, height) {
  const n = width * height;
  const gray = new Float32Array(n);
  const labA = new Float32Array(n); // a* — red-green axis (rednessSeverity, blemishSeverity)
  const labB = new Float32Array(n); // b* — yellow-blue axis (ageSpotSeverity's brownness signal)
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    const r = buffer[o], g = buffer[o + 1], b = buffer[o + 2];
    gray[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const lab = rgbToLab(r, g, b);
    labA[i] = lab[1];
    labB[i] = lab[2];
  }
  return { gray, labA, labB };
}

// Mean/stddev of `values` restricted to where mask > threshold — every
// concern's severity is scored relative to THIS photo's own assessable
// skin, not a fixed absolute cutoff (see file header).
function maskedStats(values, mask, threshold) {
  let sum = 0, count = 0;
  for (let i = 0; i < values.length; i++) {
    if (mask[i] <= threshold) continue;
    sum += values[i];
    count++;
  }
  if (count === 0) return { mean: 0, std: 1, count: 0 };
  const mean = sum / count;
  let sq = 0;
  for (let i = 0; i < values.length; i++) {
    if (mask[i] <= threshold) continue;
    sq += (values[i] - mean) ** 2;
  }
  const std = Math.sqrt(sq / count) || 1;
  return { mean, std, count };
}

// Maps a z-score to [0,1] severity — clipped at +/-2.5 std so a handful of
// extreme outlier pixels don't wash out the rest of the scale, and a
// deadzone below 0.5 std keeps completely ordinary variation from painting
// as "flagged" at all (an evenly-lit, textbook-clear patch of skin should
// render as fully transparent, not a faint tint). This is the SCORING
// curve — feeds the reported severity/band/verdict text (via
// percentileSeverityWhereMasked's p85) — deliberately conservative so
// "clear"/"mild" language stays honest.
function zScoreToSeverity(z) {
  const DEADZONE = 0.5;
  const CEIL = 2.5;
  if (z <= DEADZONE) return 0;
  return Math.min(1, (z - DEADZONE) / (CEIL - DEADZONE));
}

// Percentile-RANK based alpha for the VISUAL overlay — never used for
// severity/band/verdict (that stays on zScoreToSeverity above, unchanged).
// NOT a z-score deadzone, on purpose: tried that first (DEADZONE=0, i.e.
// "any above-average pixel gets some alpha") and tested it against a real
// photo through the real pipeline — coverage barely moved (redness stayed
// at ~1% of masked pixels). That means these metrics (Laplacian magnitude,
// DoG blob response, Sobel magnitude, Lab a*) are heavily RIGHT-SKEWED in
// practice, not roughly normal — a few strong outlier pixels (real edges,
// real texture) pull the MEAN well above the MEDIAN, so "above the mean"
// is still a small minority of pixels, not roughly half. A rank-based
// mapping sidesteps that entirely: sort the masked region's raw values
// once, place every pixel by where it falls in that sorted order, not its
// distance from a mean/std the same outliers already skewed. This
// guarantees a predictable, distribution-shape-independent fraction of the
// masked region shows SOME color, scaling up toward full color for the
// most-flagged pixels. `gamma` (> 1) bends the ramp so the colour builds
// slowly through the lower ranks and only saturates near the top — what
// keeps a region wash reading as a gradient rather than a flat blot.
function rankToAlpha(raw, mask, threshold, startPct, gamma = 1) {
  const n = raw.length;
  const indices = [];
  for (let i = 0; i < n; i++) { if (mask[i] > threshold) indices.push(i); }
  indices.sort((a, b) => raw[a] - raw[b]);
  const alpha = new Float32Array(n);
  const count = indices.length;
  for (let rank = 0; rank < count; rank++) {
    const i = indices[rank];
    const pct = count > 1 ? rank / (count - 1) : 1;
    const t = pct <= startPct ? 0 : (pct - startPct) / (1 - startPct);
    alpha[i] = gamma === 1 ? t : Math.pow(t, gamma);
  }
  return alpha;
}

// Median + MAD (median absolute deviation) of `values` where mask >
// threshold — the robust counterpart of maskedStats. Every blob detector
// here produces a heavily right-skewed response (mostly ~0, a sparse tail
// of real features), and on such a distribution a mean/std pair is
// dragged by the very tail it's meant to find, so "2 std above the mean"
// lands somewhere inside the noise floor. Median/MAD are set by the bulk of
// ordinary skin instead, which makes "k robust-sigmas above" a real
// "unlike the surrounding skin" test. Subsampled every 3rd pixel — the
// estimate only needs to be stable, not exact, and a full sort of a
// 1.4-megapixel mask is the difference between ~60ms and ~250ms here.
function robustStats(values, mask, threshold) {
  const sample = [];
  for (let i = 0; i < values.length; i += 3) { if (mask[i] > threshold) sample.push(values[i]); }
  if (sample.length === 0) return { median: 0, mad: 1 };
  sample.sort((a, b) => a - b);
  const median = sample[Math.floor(sample.length / 2)];
  for (let i = 0; i < sample.length; i++) sample[i] = Math.abs(sample[i] - median);
  sample.sort((a, b) => a - b);
  // 1.4826 scales MAD to the std of a normal distribution; the floor keeps
  // a near-constant region (MAD ≈ 0) from turning every tiny ripple into an
  // "outlier."
  const mad = Math.max(sample[Math.floor(sample.length / 2)] * 1.4826, 1e-3);
  return { median, mad };
}

// Sobel-gradient structure-tensor coherence in [0,1] — 1 = strongly
// directional local structure (a hair, a line edge), 0 = isotropic (a
// round blob). Shared by every blob detector below (pores, blemishes,
// dark spots) as their "is this a dot or a stroke" discriminator — see
// poreSeverity's own comment for the full reasoning. `smoothRadius` sets
// the neighbourhood the tensor is averaged over (roughly the feature
// scale being judged).
function coherenceMap(src, mask, width, height, smoothRadius) {
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (mask[i] <= 0.15) continue;
      gx[i] =
        -src[i - width - 1] + src[i - width + 1] +
        -2 * src[i - 1] + 2 * src[i + 1] +
        -src[i + width - 1] + src[i + width + 1];
      gy[i] =
        -src[i - width - 1] - 2 * src[i - width] - src[i - width + 1] +
        src[i + width - 1] + 2 * src[i + width] + src[i + width + 1];
    }
  }
  const Ixx = new Float32Array(width * height);
  const Iyy = new Float32Array(width * height);
  const Ixy = new Float32Array(width * height);
  for (let i = 0; i < gx.length; i++) {
    Ixx[i] = gx[i] * gx[i];
    Iyy[i] = gy[i] * gy[i];
    Ixy[i] = gx[i] * gy[i];
  }
  const Sxx = gaussianApprox(Ixx, width, height, smoothRadius);
  const Syy = gaussianApprox(Iyy, width, height, smoothRadius);
  const Sxy = gaussianApprox(Ixy, width, height, smoothRadius);
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const trace = Sxx[i] + Syy[i];
    out[i] = trace > 1e-6 ? Math.sqrt((Sxx[i] - Syy[i]) ** 2 + 4 * Sxy[i] * Sxy[i]) / trace : 0;
  }
  return out;
}

// Connected components (4-connectivity) of `binary` (Float32Array, >0 =
// set), restricted to `mask`. Returns one entry per component with its
// pixel indices, area, bounding box and the mean of `strength` over it.
// Used by the dark-spot and blemish detectors to turn a per-pixel outlier
// map into discrete "here is a spot" findings — with a real size/shape
// gate, so a lone noisy pixel or a long thin hair can't count as one.
function connectedComponents(binary, mask, strength, width, height) {
  const label = new Int32Array(width * height); // 0 = unvisited
  const comps = [];
  const stack = [];
  for (let s = 0; s < binary.length; s++) {
    if (binary[s] <= 0 || mask[s] <= 0.15 || label[s]) continue;
    const id = comps.length + 1;
    const pixels = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, sum = 0;
    stack.push(s); label[s] = id;
    while (stack.length) {
      const i = stack.pop();
      pixels.push(i);
      sum += strength[i];
      const x = i % width, y = (i - x) / width;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      const nb = [i - 1, i + 1, i - width, i + width];
      if (x === 0) nb[0] = -1; if (x === width - 1) nb[1] = -1; if (y === 0) nb[2] = -1; if (y === height - 1) nb[3] = -1;
      for (const j of nb) {
        if (j < 0 || label[j] || binary[j] <= 0 || mask[j] <= 0.15) continue;
        label[j] = id; stack.push(j);
      }
    }
    comps.push({ pixels, area: pixels.length, minX, maxX, minY, maxY, strength: sum / pixels.length });
  }
  return comps;
}

// ---- Per-concern severity maps (Float32Array, width*height, [0,1]) -------

// Redness: a* channel (Lab) above THIS photo's own mean, within the
// assessable mask. A relative (not absolute) threshold is deliberate — skin
// tone varies the baseline a* value enormously; what matters for "does this
// look redder than the rest of this person's own skin" is the deviation,
// not an absolute a* number picked for one tone.
function rednessSeverity(labA, mask) {
  const { mean, std } = maskedStats(labA, mask, 0.15);
  const severity = new Float32Array(labA.length);
  for (let i = 0; i < labA.length; i++) {
    if (mask[i] <= 0.15) continue;
    severity[i] = zScoreToSeverity((labA[i] - mean) / std);
  }
  const alpha = rankToAlpha(labA, mask, 0.15, 0.6);
  return { severity, alpha };
}

// Texture/pores: local contrast via a discrete Laplacian (high-frequency
// detail response) on the grayscale image, z-scored the same way. High
// Laplacian magnitude = fine detail (pores, texture); scored relative to
// this photo's own average detail level so photo sharpness/compression
// doesn't shift the whole scale.
// Discrete Laplacian magnitude, |4*center - 4 neighbors| — extracted as its
// own function (unchanged math, just pulled out of textureSeverity below)
// specifically so photoQuality.js's burst-sharpness scoring can reuse the
// exact same real, already-proven kernel rather than a second hand-rolled
// copy. `mask` is optional (defaults to "every pixel counts") — sharpness
// scoring runs on a raw candidate frame before any face/zone geometry
// exists at all, so it has no mask to restrict to; textureSeverity below
// still always passes its own real zone mask, unaffected by this default.
function laplacianMagnitude(gray, width, height, mask) {
  const lap = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (mask && mask[i] <= 0.15) continue;
      const v =
        4 * gray[i] -
        gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      lap[i] = Math.abs(v);
    }
  }
  return lap;
}

function textureSeverity(gray, mask, width, height) {
  const lap = laplacianMagnitude(gray, width, height, mask);
  const { mean, std } = maskedStats(lap, mask, 0.15);
  const severity = new Float32Array(width * height);
  for (let i = 0; i < lap.length; i++) {
    if (mask[i] <= 0.15) continue;
    severity[i] = zScoreToSeverity((lap[i] - mean) / std);
  }
  const alpha = rankToAlpha(lap, mask, 0.15, 0.6);
  return { severity, alpha };
}

// Shine/dryness proxy: specular-highlight detection — the exact same
// "brightest pixels by luma" concept skinAnalysis.js's analyzeSkinPixels
// already uses for its shineRatio signal (there: one aggregate ratio for
// skin-type scoring; here: the same idea rendered per-pixel as a map).
// High luma relative to this photo's own mean = a localized bright/oily
// cluster, not a shadow or a matte area.
function shineSeverity(gray, mask) {
  const { mean, std } = maskedStats(gray, mask, 0.15);
  const out = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    if (mask[i] <= 0.15) continue;
    out[i] = zScoreToSeverity((gray[i] - mean) / std);
  }
  return out;
}

// Wrinkles/fine lines: Sobel gradient magnitude (a standard, simpler stand-
// in for full Canny — no non-max suppression/hysteresis thresholding, so
// this reads as "where the strongest edges are," not perfectly thinned
// single-pixel lines), restricted to the wrinkle-prone zones only
// (WRINKLE_ZONES) so it traces along expected crease geometry rather than
// picking up every edge on the face (hairline, glasses, jaw contour).
function wrinkleSeverity(gray, wrinkleMask, width, height) {
  const mag = new Float32Array(width * height);
  const gxOut = new Float32Array(width * height);
  const gyOut = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (wrinkleMask[i] <= 0.15) continue;
      const gx =
        -gray[i - width - 1] + gray[i - width + 1] +
        -2 * gray[i - 1] + 2 * gray[i + 1] +
        -gray[i + width - 1] + gray[i + width + 1];
      const gy =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      mag[i] = Math.sqrt(gx * gx + gy * gy);
      gxOut[i] = gx;
      gyOut[i] = gy;
    }
  }
  const { mean, std } = maskedStats(mag, wrinkleMask, 0.15);
  const severity = new Float32Array(width * height);
  for (let i = 0; i < mag.length; i++) {
    if (wrinkleMask[i] <= 0.15) continue;
    severity[i] = zScoreToSeverity((mag[i] - mean) / std);
  }
  const alpha = rankToAlpha(mag, wrinkleMask, 0.15, 0.6);
  // gx/gy are returned (not discarded) so renderTracedLinesRgba can run
  // non-max suppression along the real gradient direction — thinning the
  // band this function produces into the actual crease line. Nothing about
  // severity/alpha changed; these are the same intermediates as before,
  // just no longer thrown away.
  return { severity, alpha, gx: gxOut, gy: gyOut };
}

// Separable box blur, run 3x — a standard cheap approximation of a Gaussian
// blur (central-limit theorem: three box convolutions converge close to a
// true Gaussian) without needing real Gaussian kernel math. O(width*height)
// per pass regardless of radius via a sliding-window running sum, not
// O(width*height*radius²) — matters here since pore detection needs this
// run twice (two different radii) plus three more times for the structure
// tensor below.
function boxBlurPass(src, width, height, radius) {
  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  const norm = 1 / (radius * 2 + 1);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[row + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum * norm;
      sum += src[row + Math.min(width - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum * norm;
      sum += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x];
    }
  }
  return out;
}
function gaussianApprox(src, width, height, radius) {
  return boxBlurPass(boxBlurPass(boxBlurPass(src, width, height, radius), width, height, radius), width, height, radius);
}

// Pores/blackheads: a distinct signal from general texture (textureSeverity
// above uses a single Laplacian pass at one scale — real for "is this
// surface rough," not tuned to small dark roughly-circular features
// specifically). This is a difference-of-Gaussians (DoG) blob detector — a
// small-radius blur stays close to a dark pore's own value (little
// smoothing at that scale) while a larger-radius blur dilutes it with
// surrounding lighter skin; the gap between them peaks exactly at
// pore-sized dark dips and is naturally small for both larger, flatter
// features (a mole, a shadow) and much smaller high-frequency noise.
//
// DoG magnitude alone cannot tell a small dark round pore apart from a
// small dark LINEAR feature — an individual stray hair or a patch of
// stubble is exactly as "small and dark" as a pore at this scale, which is
// the real, physically-grounded reason this is a genuinely hard heuristic
// problem, not a tuning issue. The structure-tensor coherence term below is
// this heuristic's actual attempt at that distinction: hair/stubble has a
// strongly DIRECTIONAL local gradient (the edge along a hair's length all
// points one way), while a pore's roughly circular depression has a
// locally ISOTROPIC gradient (pointing outward in every direction roughly
// equally). Coherence near 1 (strongly directional) down-weights a
// dark-blob response toward zero; coherence near 0 (isotropic) leaves it
// intact. This is a real, principled filter, not a guarantee — a very
// short, fine stubble at low resolution can still present as near-isotropic
// at this photo's resolution and slip through. See generateHeatmaps' own
// confidence field and this file's test notes for how that was actually
// checked against a bearded photo, not assumed.
function poreSeverity(gray, poreMask, width, height) {
  const small = gaussianApprox(gray, width, height, 1);
  const large = gaussianApprox(gray, width, height, 4);
  const dark = new Float32Array(width * height);
  for (let i = 0; i < dark.length; i++) {
    if (poreMask[i] <= 0.15) continue;
    dark[i] = Math.max(0, large[i] - small[i]);
  }

  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (poreMask[i] <= 0.15) continue;
      gx[i] =
        -gray[i - width - 1] + gray[i - width + 1] +
        -2 * gray[i - 1] + 2 * gray[i + 1] +
        -gray[i + width - 1] + gray[i + width + 1];
      gy[i] =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
    }
  }
  const Ixx = new Float32Array(width * height);
  const Iyy = new Float32Array(width * height);
  const Ixy = new Float32Array(width * height);
  for (let i = 0; i < gx.length; i++) {
    Ixx[i] = gx[i] * gx[i];
    Iyy[i] = gy[i] * gy[i];
    Ixy[i] = gx[i] * gy[i];
  }
  const Sxx = gaussianApprox(Ixx, width, height, 2);
  const Syy = gaussianApprox(Iyy, width, height, 2);
  const Sxy = gaussianApprox(Ixy, width, height, 2);

  const raw = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    if (poreMask[i] <= 0.15) continue;
    const trace = Sxx[i] + Syy[i];
    const coherence = trace > 1e-6 ? Math.sqrt((Sxx[i] - Syy[i]) ** 2 + 4 * Sxy[i] * Sxy[i]) / trace : 0;
    raw[i] = dark[i] * (1 - coherence);
  }

  const { mean, std } = maskedStats(raw, poreMask, 0.15);
  const severity = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    if (poreMask[i] <= 0.15) continue;
    severity[i] = zScoreToSeverity((raw[i] - mean) / std);
  }
  const alpha = rankToAlpha(raw, poreMask, 0.15, 0.6);
  return { severity, alpha };
}

// Dryness/flaking: small BRIGHT dips against slightly larger surroundings —
// the mirror image of poreSeverity's dark-blob DoG above (a small-radius
// blur stays close to a light flake's own brightness; a large-radius blur
// dilutes it with the darker surrounding skin, so the gap peaks at
// flake-sized bright specks). No structure-tensor exclusion like pores —
// flaking doesn't have as clean a directional counter-signal to filter
// against, so this is an honestly simpler, more easily fooled signal: a
// small bright freckle, a sun fleck, or a compression artifact can trigger
// it the same way a real flake does. Same class of disclosed limitation as
// poreSeverity's own comment on hair/stubble, not a claim of more accuracy
// than that. Full mask (not zone-restricted) — flaking isn't confined to
// the T-zone/cheeks the way pore size is.
function drynessSeverity(gray, mask, width, height) {
  const small = gaussianApprox(gray, width, height, 2);
  const large = gaussianApprox(gray, width, height, 9);
  // Real, caught bug (found by actually running this against a synthetic
  // dark patch, not assumed): a naive small-minus-large DoG gap goes
  // POSITIVE not just at a genuine bright fleck, but in a ring just OUTSIDE
  // any nearby DARKER feature (a mole, an age spot, a shadow, even a pore)
  // — the wide blur's own kernel reaches back into the dark feature and
  // gets dragged down, while the narrow blur (further from the dark
  // feature's center) doesn't, producing a gap with nothing actually bright
  // there. Confirmed directly: a plain flat gray=170 background pixel
  // sitting just outside a radius-16 dark patch read as a "flake" response
  // of 15+ with zero real brightness variation anywhere nearby. Gating on
  // the pixel's own small-blur value being genuinely at-or-above this
  // photo's own average brightness (not just locally above ITS OWN large
  // blur) excludes that case — the halo pixel is not itself bright, only
  // relatively brighter than a blur value that got dragged down by
  // something else — while still passing a real bright fleck through
  // (which genuinely IS elevated above the photo's own average). This
  // REDUCES the halo, it doesn't eliminate it — re-tested after this fix:
  // the worst false-positive response near the same test patch dropped
  // from 15+ to about 8, not zero, since the wide blur's kernel can still
  // reach a large/nearby dark feature from a few pixels further out. An
  // honestly imperfect mitigation, not a claim of a full fix.
  const { mean: meanGray } = maskedStats(gray, mask, 0.15);
  const flake = new Float32Array(width * height);
  for (let i = 0; i < flake.length; i++) {
    if (mask[i] <= 0.15) continue;
    if (small[i] <= meanGray) continue;
    flake[i] = Math.max(0, small[i] - large[i]);
  }
  const { mean, std } = maskedStats(flake, mask, 0.15);
  const severity = new Float32Array(width * height);
  for (let i = 0; i < flake.length; i++) {
    if (mask[i] <= 0.15) continue;
    severity[i] = zScoreToSeverity((flake[i] - mean) / std);
  }
  // Rank-based, like redness/texture, but starting higher up the
  // distribution (top ~22% rather than top 40%): flaking is a sparse
  // finding, and a wash that always tints 40% of the face read as a
  // blotchy "your skin is dry everywhere" no matter what the photo showed.
  const alpha = rankToAlpha(flake, mask, 0.15, 0.78, 1.3);
  return { severity, alpha };
}

// Dark spots: a medium-scale difference-of-Gaussians (small blur stays
// close to a spot's own value; large blur dilutes it against the broader
// surrounding skin, so the gap peaks at spot-sized dark patches — see this
// function's own history for why a single blur against the raw pixel was
// a real, caught bug), boosted where the patch ALSO reads more yellow/
// brown than this photo's own average (Lab b* — a shadow reads closer to
// neutral/bluish, a pigmented spot warmer; a soft multiplier, not a hard
// gate), and down-weighted where the local structure is strongly
// directional (a stray hair lying across the cheek is exactly as "small
// and dark" as a spot, but it is a stroke, not a dot).
//
// Scored against MEDIAN/MAD rather than mean/std (see robustStats) — this
// is the direct fix for the "Dark Spots tab is blank" report: on a real
// photo the response is ~0 almost everywhere with a sparse tail of real
// spots, and mean/std computed over THAT is pulled up by the tail until
// even a clearly visible mole sat under the 0.5-std deadzone. Against the
// robust baseline the same mole reads as many sigmas out, which is what it
// actually is.
//
// Returns discrete `spots` (connected components of the outlier map that
// pass a size/shape gate) alongside the per-pixel maps — the overlay draws
// those, not a wash, because "a dark spot" is a thing with an outline, and
// a wash of the raw response reads as generic mottling.
function ageSpotSeverity(gray, labB, mask, width, height) {
  const small = gaussianApprox(gray, width, height, 2);
  const large = gaussianApprox(gray, width, height, 12);
  const { mean: meanB, std: stdB } = maskedStats(labB, mask, 0.15);
  const coherence = coherenceMap(gray, mask, width, height, 3);
  // SIGNED response (positive = darker than its surroundings, negative =
  // lighter), not clamped at zero before the statistics: a clamped map is
  // zero on more than half the face, which puts its median AND its MAD at
  // zero and turns every faintly-dark pixel into an infinite outlier (the
  // first version of this did exactly that and flagged sixty "spots" on a
  // cheek with a handful of freckles). The signed map is roughly symmetric
  // around ordinary skin, so median/MAD describe ordinary skin.
  const raw = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    if (mask[i] <= 0.15) continue;
    const signed = (large[i] - small[i]) * (1 - 0.8 * coherence[i]);
    const brownBoost = signed > 0 ? 1 + Math.max(0, (labB[i] - meanB) / stdB) * 0.5 : 1;
    raw[i] = signed * brownBoost;
  }
  const { median, mad } = robustStats(raw, mask, 0.15);
  const severity = new Float32Array(width * height);
  const rz = new Float32Array(width * height);
  const candidate = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    if (mask[i] <= 0.15) continue;
    const z = (raw[i] - median) / mad;
    rz[i] = z;
    // 2.5..8 robust sigmas → 0..1: a spot has to be well clear of ordinary
    // skin variation before it scores at all, then saturates at "unmistakable."
    severity[i] = Math.min(1, Math.max(0, (z - 2.5) / 5.5));
    if (z >= 4) candidate[i] = 1;
  }
  const minDim = Math.min(width, height);
  const minArea = Math.round((minDim / 180) ** 2);           // ~36px² at 1080: a ~6px spot
  let maskArea = 0;
  for (let i = 0; i < mask.length; i++) { if (mask[i] > 0.15) maskArea++; }
  const maxArea = Math.max(minArea * 4, Math.round(maskArea * 0.012)); // bigger than this is a shadow, not a spot
  const spots = connectedComponents(candidate, mask, rz, width, height).filter((c) => {
    if (c.area < minArea || c.area > maxArea) return false;
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
    const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    if (aspect > 3.2) return false;                           // a stroke (hair, crease shadow), not a spot
    if (c.area < 0.3 * bw * bh) return false;                 // too sparse to be one solid patch
    return true;
  });
  return { severity, spots, score: findingsScore(spots, maskArea, 14) };
}

// Summary severity for a discrete-finding concern. The p85-of-severity
// summary every region concern uses is the wrong shape here: on a face
// with three moles, 85% of the assessed pixels are ordinary skin, so p85
// says "clear" no matter how prominent those three are; on a face with
// freckled cheeks it says "notable" for what is mostly one uniform
// pattern. What a person actually reads off the photo is HOW MANY marks
// were found and HOW MUCH area they cover — so that is what's scored:
// `typicalCount` findings, or 2% of the face in area, reads as 1.0.
function findingsScore(spots, maskArea, typicalCount) {
  if (!spots.length || !maskArea) return 0;
  let area = 0;
  for (const s of spots) area += s.area;
  const byCount = Math.min(1, spots.length / typicalCount);
  const byArea = Math.min(1, (area / maskArea) / 0.02);
  return Math.min(1, byCount * 0.7 + byArea * 0.3);
}

// Blemishes: small RED blobs — the same difference-of-Gaussians +
// structure-tensor coherence approach as poreSeverity above (see its own
// comment for the full isotropic-blob-vs-directional-feature reasoning),
// run on the Lab a* (redness) channel instead of grayscale, with no zone
// restriction (blemishes aren't confined to the T-zone/cheeks the way pore
// size is). Deliberately a DIFFERENT signal from rednessSeverity, not a
// duplicate: rednessSeverity is a plain a*-channel z-score, high wherever a
// BROAD area reads red — exactly what a diffuse flush should trigger. This
// DoG version only responds to LOCALIZED red bumps — a small-radius blur of
// a* stays close to an isolated red spot's own high value; a large-radius
// blur dilutes it against the surrounding, less-red skin. A broadly flushed
// cheek has almost no gap between those two blurs (both are already high),
// so it stays quiet here even though it lights up rednessSeverity — which
// is the intended split between "your skin looks flushed" and "you have an
// active blemish." The coherence term down-weights a linear red feature
// (a scratch, a visible vein) the same way it down-weights hair for pores.
//
// Same robust median/MAD scoring and discrete-finding output as
// ageSpotSeverity above: the first on-device look at this concern showed a
// scatter of tiny pink specks (every pixel a hair above a skewed mean),
// which read as noise, not "these are your blemishes." A blemish is a
// discrete thing; the overlay now marks each one it actually finds.
function blemishSeverity(labA, gray, mask, width, height) {
  const small = gaussianApprox(labA, width, height, 2);
  const large = gaussianApprox(labA, width, height, 8);
  const coherence = coherenceMap(labA, mask, width, height, 3);
  // Signed for the same statistical reason as ageSpotSeverity above.
  const raw = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    if (mask[i] <= 0.15) continue;
    raw[i] = (small[i] - large[i]) * (1 - coherence[i]);
  }
  // A freckle or mole on warm-toned skin reads slightly redder than its
  // surroundings in a* too, so on the a* channel alone it is
  // indistinguishable from a small pimple — the first run marked a
  // freckled cheek as a breakout. The physiological difference is
  // luminance: an inflamed blemish is red at about the same brightness as
  // the skin around it (or lighter), while pigment is DARKER. So the same
  // dark-blob response ageSpotSeverity uses is computed here on gray and
  // used as a veto — a red blob that is also a dark blob is a spot, not a
  // blemish, and goes to that tab instead.
  const smallG = gaussianApprox(gray, width, height, 2);
  const largeG = gaussianApprox(gray, width, height, 8);
  const dark = new Float32Array(width * height);
  for (let i = 0; i < dark.length; i++) { if (mask[i] > 0.15) dark[i] = largeG[i] - smallG[i]; }
  const darkStats = robustStats(dark, mask, 0.15);
  const { median, mad } = robustStats(raw, mask, 0.15);
  const severity = new Float32Array(width * height);
  const rz = new Float32Array(width * height);
  const candidate = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    if (mask[i] <= 0.15) continue;
    const darkZ = Math.max(0, (dark[i] - darkStats.median) / darkStats.mad);
    const z = (raw[i] - median) / mad - 0.6 * darkZ;
    rz[i] = z;
    severity[i] = Math.min(1, Math.max(0, (z - 2.5) / 5.5));
    if (z >= 4.5 && darkZ < 3) candidate[i] = 1;
  }
  const minDim = Math.min(width, height);
  const minArea = Math.round((minDim / 200) ** 2);
  let maskArea = 0;
  for (let i = 0; i < mask.length; i++) { if (mask[i] > 0.15) maskArea++; }
  const maxArea = Math.max(minArea * 4, Math.round(maskArea * 0.008));
  const spots = connectedComponents(candidate, mask, rz, width, height).filter((c) => {
    if (c.area < minArea || c.area > maxArea) return false;
    const bw = c.maxX - c.minX + 1, bh = c.maxY - c.minY + 1;
    if (Math.max(bw, bh) / Math.max(1, Math.min(bw, bh)) > 2.6) return false;
    return c.area >= 0.3 * bw * bh;
  });
  return { severity, spots, score: findingsScore(spots, maskArea, 12) };
}

// One calm family, on brand: the app's own rose/coral/gold (see mobile
// utils/colors.ts — brand #D97A91, brandDeep #A34D63, gold #D4AF37) for
// the "warm" concerns, muted mocha for pigment (the one colour a dark
// spot should be), and two quiet cool complements (lilac for lines, a
// dusty blue for dryness — the near-universal "hydration" cue) so seven
// concerns still tell apart at a glance. Saturation deliberately pulled
// back from the first version's pure red/orange: these are informative
// tints laid over a face, not alarm colours.
const CONCERN_COLORS = {
  redness: [222, 108, 118],
  texture: [204, 158, 96],
  pores: [138, 104, 118],
  shine: [212, 175, 55],
  wrinkles: [150, 122, 180],
  moisture: [140, 162, 198],
  age_spot: [146, 100, 74],
  acne: [186, 70, 116],
};

// A PLAIN MEAN across the whole assessable region was tried first and
// rejected after actually looking at the result: real skin concerns are
// usually localized (a patch, not the whole face uniformly), so averaging
// a small-but-real flagged area in with a much larger calm area washed the
// summary number down to "clear" even when the heatmap image itself
// clearly showed something. The 85th percentile instead answers "how bad
// is the worst genuinely-flagged area," which is what the verdict line and
// gradient-bar marker are actually trying to communicate — matching how a
// person reads the heatmap image itself (by its brightest/most-colored
// spot, not its average tint).
function percentileSeverityWhereMasked(severity, mask, threshold, percentile) {
  const values = [];
  for (let i = 0; i < severity.length; i++) {
    if (mask[i] <= threshold) continue;
    values.push(severity[i]);
  }
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  const idx = Math.min(values.length - 1, Math.floor(percentile * values.length));
  return values[idx];
}

function severityBand(mean) {
  if (mean < 0.15) return 'clear';
  if (mean < 0.35) return 'mild';
  if (mean < 0.6) return 'moderate';
  return 'notable';
}

// Real, once-written content per concern/band — not placeholder text, and
// not the same generic template reused with a find/replaced noun. Every
// verdict line is specific to what this concern actually looks like at
// that severity; every education paragraph explains cause + what the
// signal actually measures (never a diagnosis); tips are ingredient
// CATEGORIES a person can act on, not specific SKUs (no product catalog to
// link yet — see the CTA, which points at the existing skin-type
// recommendations instead of duplicating this list). gradientLabels name
// the two ends of THIS concern's severity bar specifically — deliberately
// not one generic "Low/High" pair reused everywhere.
//
// Read back together once, on purpose (per the explicit ask to check for
// contradictions/repetition across concerns before shipping): every
// education paragraph follows the same two-sentence shape (what it is /
// what this scan actually measures), no two concerns share a verdict
// sentence, and tips never overlap in wording across concerns even where
// the underlying advice rhymes (e.g. "don't skip moisturizer" appears once,
// under Texture, not copy-pasted into Shine too).
const CONCERN_META = {
  redness: {
    label: 'Redness',
    gradientLabels: { high: 'Flushed', low: 'Even Tone' },
    education: "Redness usually comes from surface irritation, broken capillaries, or inflammation — weather, new products, sun, or conditions like rosacea can all trigger it. This scan compares how red each area reads against your own skin's baseline in this photo, not a fixed cutoff, so it adjusts to your natural tone rather than assuming one baseline for everyone.",
    tips: [
      'Look for centella asiatica, niacinamide, or azelaic acid — they help calm visible redness over time.',
      'Avoid hot water and harsh scrubs on flushed areas; both can make redness more visible, not less.',
      'A fragrance-free moisturizer with ceramides supports a barrier that redness-prone skin often has trouble with.',
      'Redness that persists or comes with stinging is worth a dermatologist visit to rule out rosacea or an allergy.',
    ],
    verdict: {
      clear: 'Your tone reads even, with no notable redness detected.',
      mild: 'A little redness shows in a few small areas — nothing that stands out.',
      moderate: 'Your skin shows moderate redness, concentrated in a few areas rather than all over.',
      notable: 'Noticeable redness is flagged across a larger area of your skin today.',
    },
  },
  texture: {
    label: 'Texture',
    gradientLabels: { high: 'Rough', low: 'Smooth' },
    education: 'Overall surface texture is driven by how much dead skin has built up and how much collagen support skin still has underneath — rougher skin scatters light less evenly than smooth skin. This looks at fine surface detail and contrast across the whole face, separately from pore size (see the Pores tab) or fine lines (see Fine Lines).',
    tips: [
      'Chemical exfoliants (AHAs like glycolic or lactic acid) clear built-up dead skin more evenly than physical scrubs.',
      "Don't skip moisturizer — dehydrated skin often reads as MORE textured, not less.",
      'Retinoids are the most evidence-backed long-term option for smoother texture, introduced gradually.',
      'Give any new exfoliant 4-6 weeks before judging results — texture changes slowly, not overnight.',
    ],
    verdict: {
      clear: 'Your skin reads smooth, with fine and even texture.',
      mild: 'Minor texture is visible — fairly typical, nothing to be concerned about.',
      moderate: 'Some visible roughness is showing, especially compared to smoother areas nearby.',
      notable: 'More pronounced texture is visible across a larger area of your skin.',
    },
  },
  pores: {
    label: 'Pores',
    gradientLabels: { high: 'Enlarged', low: 'Refined' },
    education: "Pores don't actually change size — they LOOK larger when stretched by trapped oil, dead skin, or a natural loss of elasticity around them, most often in the T-zone and inner cheeks. This looks specifically for small, dark, round dips in exactly those areas (not general roughness) and tries to tell them apart from stray facial hair by shape — a real distinction that isn't perfect on dense stubble (see this concern's own confidence note when that applies).",
    tips: [
      'Salicylic acid (BHA) is the most direct option — it dissolves the oil and debris that stretch pores open.',
      'A clay or charcoal mask once or twice a week can temporarily draw out buildup in oilier areas.',
      'Niacinamide, used consistently over several weeks, can visibly refine how pores read.',
      'Over-cleansing or scrubbing can trigger more oil production, making pores look worse, not better.',
    ],
    verdict: {
      clear: 'Pores read fine and minimally visible across your T-zone and cheeks.',
      mild: 'A few pores are slightly visible — fairly typical for this skin type.',
      moderate: 'Pores read visibly enlarged in parts of your T-zone or cheeks.',
      notable: 'Pores read as enlarged and dense across a larger area today.',
    },
  },
  shine: {
    label: 'Shine',
    gradientLabels: { high: 'Oily', low: 'Matte' },
    education: "Shine comes from sebum — skin's own natural oil — sitting on the surface; genetics, hormones, humidity, and skincare or makeup all affect how much builds up over a day. This looks for bright, localized highlights that usually mean surface oil, measured relative to the rest of this same photo, not a fixed brightness cutoff.",
    tips: [
      'A gel or foaming cleanser twice daily helps control oil without over-stripping skin.',
      "Choose an oil-free or 'non-comedogenic' moisturizer and SPF — skipping moisturizer often triggers MORE oil, not less.",
      'Niacinamide can help balance visible oil production over time, alongside a lighter routine.',
      'Blotting papers are a quick, product-free fix for midday shine without disturbing makeup.',
    ],
    verdict: {
      clear: 'Your skin reads matte and balanced right now.',
      mild: 'A little natural shine shows — within a normal range.',
      moderate: 'Noticeable shine is showing in some areas, likely where oil builds up fastest.',
      notable: 'Significant shine is flagged across a larger area in this photo.',
    },
  },
  wrinkles: {
    label: 'Fine Lines',
    gradientLabels: { high: 'Deep Lines', low: 'Smooth' },
    education: 'Fine lines form where skin creases repeatedly — smiling, squinting — combined with a natural drop in collagen and elastin over time; sun exposure speeds this up more than almost anything else. This traces edge patterns across the forehead, under-eye, and nose specifically, the areas lines form most often, not the whole face.',
    tips: [
      'Daily SPF is the single most effective way to slow new fine lines from forming.',
      'Retinoids remain the most evidence-backed ingredient for softening existing fine lines over time.',
      'Peptide or vitamin C serums can support collagen and improve how fine lines read.',
      'Consistent sleep and hydration visibly reduce how deep temporary expression lines look day to day.',
    ],
    verdict: {
      clear: 'No notable fine lines are detected in these areas.',
      mild: 'A few faint lines are visible — well within a normal range.',
      moderate: 'Your skin shows moderate lines in expression-prone areas like the forehead and under-eyes.',
      notable: 'More pronounced lines are flagged in these areas today.',
    },
  },
};

// Renders one concern's alpha map as a transparent RGBA buffer — color is
// fixed per concern, alpha = mask * value (scaled to a legible max), so
// zero-value / unmasked pixels are fully transparent and only genuinely
// flagged, assessable skin shows color. This is the hard constraint that
// replaces "marker inside bounding box": alpha is mathematically zero
// everywhere mask is zero, so occluded/background/neck/eye pixels cannot
// show color regardless of what the detector above did.
function renderOverlayRgba(width, height, value, mask, colorRgb, maxAlpha) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = Math.round(Math.min(1, value[i] * mask[i]) * maxAlpha);
    const o = i * 4;
    out[o] = colorRgb[0];
    out[o + 1] = colorRgb[1];
    out[o + 2] = colorRgb[2];
    out[o + 3] = a;
  }
  return out;
}

// ── Concern-appropriate overlay styles ──────────────────────────────────────
// A single flat wash is the right depiction for a concern that genuinely IS
// a region (redness spreads across an area), but it misrepresents concerns
// whose underlying signal is not region-shaped: fine lines are CURVES
// (Sobel ridges along a crease), pores are POINTS (isotropic dark blobs),
// and blemishes / dark spots are discrete FINDINGS with an outline. Each
// style below draws from that same already-computed signal — no new
// detection, just an honest depiction of what was actually found.
const OVERLAY_STYLE = {
  redness: 'wash', texture: 'wash', shine: 'wash', moisture: 'wash',
  wrinkles: 'lines',
  pores: 'stipple',
  acne: 'markers',
  age_spot: 'spots',
};

// Fine lines: thin traced contours instead of a fuzzy band. Non-maximum
// suppression along the LOCAL GRADIENT DIRECTION (the missing step called
// out in wrinkleSeverity's own comment — "no non-max suppression, so this
// reads as 'where the strongest edges are', not perfectly thinned
// single-pixel lines") keeps a pixel only where it is the ridge crest
// across the crease, thinning a several-pixel-wide gradient band down to
// the actual line. Widened by exactly one pixel afterwards so a 1px trace
// stays visible once the PNG is scaled down into a phone-sized photo view.
// Minimum ridge strength for a pixel to be traced as a line at all.
//
// Left at 0.2 deliberately, after sweeping it against a real bearded face:
// 0.2 -> 45.0% of the assessed area painted, 0.35 -> 38.9%, 0.5 -> 32.1%,
// 0.65 -> 24.7%. Even the most aggressive gate leaves a quarter of the face
// covered in "fine lines" ink on a man in his twenties with essentially no
// wrinkles, while a gate that high would start erasing genuine lines on
// someone who does have them.
//
// That curve is the actual finding: this is NOT a rendering-threshold
// problem, so raising the gate would have been a cosmetic change that traded
// real sensitivity for a slightly less embarrassing number. Facial hair is
// dense high-frequency ridge structure, WRINKLE_ZONES covers the nasolabial
// area, and the face mask does not exclude hair — so a beard is being traced
// as creases. The fix belongs in the mask, alongside the hair-bleed work,
// not here.
const LINE_GATE = 0.2;

function renderTracedLinesRgba(width, height, alpha, mask, gx, gy, colorRgb) {
  const MAX_ALPHA = 200;
  const keep = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (mask[i] <= 0.15 || alpha[i] <= LINE_GATE) continue;
      // Step one pixel along the gradient (perpendicular to the crease) in
      // both directions and keep only a local maximum — the crest itself.
      const g = Math.hypot(gx[i], gy[i]);
      if (g < 1e-6) continue;
      const sx = Math.round(gx[i] / g);
      const sy = Math.round(gy[i] / g);
      const a1 = alpha[i + sy * width + sx];
      const a2 = alpha[i - sy * width - sx];
      if (alpha[i] >= a1 && alpha[i] >= a2) keep[i] = alpha[i];
    }
  }
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // 1px dilation: a crest pixel paints itself and its 4-neighbours, so
      // the trace survives the downscale to screen size.
      let v = keep[i];
      if (x > 0) v = Math.max(v, keep[i - 1] * 0.75);
      if (x < width - 1) v = Math.max(v, keep[i + 1] * 0.75);
      if (y > 0) v = Math.max(v, keep[i - width] * 0.75);
      if (y < height - 1) v = Math.max(v, keep[i + width] * 0.75);
      const o = i * 4;
      out[o] = colorRgb[0];
      out[o + 1] = colorRgb[1];
      out[o + 2] = colorRgb[2];
      out[o + 3] = Math.round(Math.min(1, v * mask[i]) * MAX_ALPHA);
    }
  }
  return out;
}

// Soft filled disc stamped into an accumulation map — full strength at the
// centre, smoothstep falloff to nothing at the rim, so marks read as dots,
// never squares. Shared by the stipple/marker/spot renderers below.
function stampDisc(acc, width, height, cx, cy, radius, strength) {
  const R = Math.ceil(radius);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dy) / radius;
      if (d > 1) continue;
      const yy = cy + dy, xx = cx + dx;
      if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
      const t = 1 - d;
      const fall = t * t * (3 - 2 * t);
      const j = yy * width + xx;
      acc[j] = Math.max(acc[j], strength * fall);
    }
  }
}

// Pores: discrete dots at the actual detected blob centres, not a wash —
// a pore is a point feature, and a continuous tint over the T-zone claims
// a spread the detector never found. Keeps only local maxima of the same
// blob response poreSeverity already computed (dark AND isotropic, i.e.
// low structure-tensor coherence) above a real alpha floor, then stamps a
// small soft disc at each. The floor and the local-maximum radius were
// both raised after the first on-device look: every faint above-median
// pixel got a dot, which read as "sand on the cheeks," not pores.
function renderStippleRgba(width, height, alpha, mask, colorRgb) {
  const MAX_ALPHA = 185;
  const R = Math.max(2.5, Math.min(width, height) / 250); // ~4.3px at 1080
  const NB = 4; // local-maximum search radius
  const acc = new Float32Array(width * height);
  for (let y = NB; y < height - NB; y++) {
    for (let x = NB; x < width - NB; x++) {
      const i = y * width + x;
      if (mask[i] <= 0.15 || alpha[i] <= 0.4) continue;
      let isMax = true;
      for (let dy = -NB; dy <= NB && isMax; dy++) {
        for (let dx = -NB; dx <= NB; dx++) {
          if (!dx && !dy) continue;
          if (alpha[(y + dy) * width + (x + dx)] > alpha[i]) { isMax = false; break; }
        }
      }
      if (!isMax) continue;
      stampDisc(acc, width, height, x, y, R, 0.55 + 0.45 * alpha[i]);
    }
  }
  return renderOverlayRgba(width, height, acc, mask, colorRgb, MAX_ALPHA);
}

// Blemishes: one consistently-sized soft marker per detected blemish
// (blemishSeverity's `spots`), strongest first, capped so a face with a
// real breakout reads as "these are the flagged spots" rather than a
// scatter. Markers closer than ~1.6 radii to a stronger one are merged
// into it — two adjacent findings become one mark, not a pink cluster.
function renderMarkersRgba(width, height, spots, mask, colorRgb) {
  const MAX_ALPHA = 190;
  const R = Math.max(5, Math.min(width, height) / 95); // ~11px at 1080
  const MAX_MARKERS = 40;
  const ordered = [...spots].sort((a, b) => b.strength - a.strength);
  const placed = [];
  for (const s of ordered) {
    if (placed.length >= MAX_MARKERS) break;
    const cx = (s.minX + s.maxX) / 2, cy = (s.minY + s.maxY) / 2;
    if (placed.some((p) => Math.hypot(p.cx - cx, p.cy - cy) < R * 1.6)) continue;
    placed.push({ cx, cy, strength: s.strength });
  }
  const acc = new Float32Array(width * height);
  for (const p of placed) {
    const strength = 0.7 + 0.3 * Math.min(1, (p.strength - 3.5) / 4);
    stampDisc(acc, width, height, Math.round(p.cx), Math.round(p.cy), R, strength);
  }
  return { rgba: renderOverlayRgba(width, height, acc, mask, colorRgb, MAX_ALPHA), count: placed.length };
}

// Dark spots: each detected component is painted as its own soft patch —
// its real outline, grown by a couple of pixels and feathered, at an
// alpha set by how far outside ordinary skin it read. Shape comes from the
// detector, not a fixed disc, because pigment patches genuinely vary in
// size; the feather is what keeps them from looking like stickers.
function renderSpotsRgba(width, height, spots, mask, colorRgb) {
  const MAX_ALPHA = 175;
  const acc = new Float32Array(width * height);
  for (const s of spots) {
    const strength = 0.6 + 0.4 * Math.min(1, (s.strength - 3) / 5);
    for (const i of s.pixels) acc[i] = Math.max(acc[i], strength);
  }
  const grown = gaussianApprox(acc, width, height, Math.max(1, Math.round(Math.min(width, height) / 360)));
  // Blur lowers the peak; renormalise so a patch's centre keeps its
  // intended strength while its edge fades out.
  for (let i = 0; i < grown.length; i++) grown[i] = Math.min(1, grown[i] * 1.6);
  return { rgba: renderOverlayRgba(width, height, grown, mask, colorRgb, MAX_ALPHA), count: spots.length };
}

// Region concerns: the wash, with the alpha map softened first so a blotch
// fades out at its edges instead of ending on a hard pixel border. Blur
// runs on ALPHA only (never on severity), so the reported score/band are
// bit-for-bit unchanged — this is purely how the region is drawn. The
// radius is ~2.5x the first version's (which looked feathered on paper and
// hard-cut on a phone), and the whole wash is scaled by the concern's own
// overall read (`intensity`, from its p85 severity) so a "clear" face
// gets a faint, informative tint rather than the same full-strength
// blotches a "notable" one does.
// Below this normalised severity a pixel gets NO ink at all, and everything
// above is rescaled to use the full alpha range.
//
// Without a floor, renderOverlayRgba gives every pixel with any non-zero
// severity a proportional alpha, and the gaussian feather below spreads each
// hot pixel over a ~10px radius — so an almost-clear face came back with a
// faint haze over most of it. Measured on a real face: Fine Lines painted
// 45% of the assessed area at band 'mild', Redness 23%. That is what makes
// the overlay read as a smudge rather than a measurement, and it is why a
// genuinely affected area doesn't stand out — it is competing with noise
// rendered in the same colour.
//
// A knee, not a hard cut: values above the floor are remapped to 0..1 rather
// than clipped, so the boundary of a real region still fades naturally
// instead of gaining a hard outline.
const WASH_FLOOR = 0.35;

function renderWashRgba(width, height, alpha, mask, colorRgb, intensity = 1) {
  const MAX_ALPHA = 150;
  const feathered = gaussianApprox(alpha, width, height, Math.max(3, Math.round(Math.min(width, height) / 110)));
  const scale = 0.45 + 0.55 * Math.min(1, intensity / 0.5);
  for (let i = 0; i < feathered.length; i++) {
    const v = feathered[i] * scale;
    feathered[i] = v <= WASH_FLOOR ? 0 : (v - WASH_FLOOR) / (1 - WASH_FLOOR);
  }
  return renderOverlayRgba(width, height, feathered, mask, colorRgb, MAX_ALPHA);
}

// Which zones actually matter for each concern's own confidence read — the
// same lists that already restrict wrinkles/pores spatially (WRINKLE_ZONES/
// PORE_ZONES); redness/texture/shine/moisture/age_spot/acne use the full
// 8-zone set since none of them are restricted to a sub-region (flaking,
// pigmentation, and blemishes can all occur anywhere on the face, unlike
// pore size or expression-line creases).
const RELEVANT_ZONES = {
  redness: ZONE_KEYS, texture: ZONE_KEYS, shine: ZONE_KEYS,
  moisture: ZONE_KEYS, age_spot: ZONE_KEYS, acne: ZONE_KEYS,
  pores: PORE_ZONES, wrinkles: WRINKLE_ZONES,
};

// Display names for the tap-to-highlight zone breakdown (see
// zoneBreakdownFor) — the only place these need to read like something a
// person taps on, rather than an internal key.
const ZONE_LABELS = {
  forehead: 'Forehead', nose: 'Nose', chin: 'Chin',
  cheekL: 'Left Cheek', cheekR: 'Right Cheek',
  underEyeL: 'Left Under-Eye', underEyeR: 'Right Under-Eye',
  jawline: 'Jawline',
};

// Per-zone severity for the tap-to-highlight interaction — the SAME
// severity map already computed for the whole concern, just re-summarized
// one zone's own ellipse at a time instead of the concern's full mask.
// Reuses ellipseWeight directly (not buildMasks' union) since each zone
// needs its OWN isolated weight, not the union every other zone's mask
// already blends into. Returns only zones that are both relevant to this
// concern (RELEVANT_ZONES) AND actually assessable for this scan
// (zoneRects has a real rect for it) — worst-first, so tapping the first
// chip always surfaces the most affected area. An empty array (not null)
// when nothing qualifies — the caller renders no chips, not a crash.
function zoneBreakdownFor(concern, severity, zoneRects, width, height) {
  const relevant = RELEVANT_ZONES[concern].filter((z) => !!zoneRects[z]);
  const out = relevant.map((zone) => {
    const rect = zoneRects[zone];
    const zoneMask = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) zoneMask[y * width + x] = ellipseWeight(x, y, rect, width, height);
    }
    const p85 = percentileSeverityWhereMasked(severity, zoneMask, 0.15, 0.85);
    return { zone, label: ZONE_LABELS[zone], severity: p85, band: severityBand(p85) };
  });
  return out.sort((a, b) => b.severity - a.severity);
}

// Confidence is a SEPARATE axis from severity — "how much do we trust this
// number," not "how bad is it." Two real, honestly-computed inputs, not a
// fabricated third heuristic on top of the others:
// - zoneFraction: of the zones this concern actually cares about, how many
//   were assessable at all (occlusion directly lowers this).
// - pixelFraction: even among assessable zones, how much real area backs
//   the read — a sliver of pixels (a zone barely poking past an edge) is a
//   weaker sample than a fully-visible region.
//
// PIXEL_FLOOR_FRACTION is per-concern and expressed as a FRACTION of the
// whole photo's pixel count, not an absolute number — a flat absolute floor
// was tried first and was a real bug, caught by actually running this
// against a test photo (not assumed): pores/wrinkles are spatially
// restricted to 3-4 zones by design (PORE_ZONES/WRINKLE_ZONES), so their
// mask is structurally smaller than redness/texture/shine's full 8-zone
// mask even at 100% zone coverage — one flat floor calibrated for the
// bigger masks was capping pores/wrinkles at "low" confidence even under
// perfect conditions. These fractions are calibrated against this file's
// own test run (see the accompanying test script) at each concern's own
// fully-assessed pixel count, kept resolution-independent by expressing
// them as a fraction of total image pixels rather than a hardcoded count.
// moisture/age_spot/acne use the same 0.05 floor as redness/texture/shine —
// same class of concern (full 8-zone mask, not spatially restricted), so
// the same reasoning against a structurally-smaller mask applies equally.
// Not independently recalibrated against a real test run the way the
// original five were (see this comment's own history) — a reasonable
// starting point given the identical mask shape, but worth revisiting once
// this has run against real photos.
const PIXEL_FLOOR_FRACTION = { redness: 0.05, texture: 0.05, shine: 0.05, pores: 0.018, wrinkles: 0.02, moisture: 0.05, age_spot: 0.05, acne: 0.05 };
function concernConfidence(concern, mask, zoneRects, width, height) {
  const relevant = RELEVANT_ZONES[concern];
  const zoneFraction = relevant.filter((z) => !!zoneRects[z]).length / relevant.length;
  let pixelCount = 0;
  for (let i = 0; i < mask.length; i++) { if (mask[i] > 0.15) pixelCount++; }
  const floor = PIXEL_FLOOR_FRACTION[concern] * width * height;
  const pixelFraction = Math.min(1, pixelCount / floor);
  const score = zoneFraction * pixelFraction;
  const level = score >= 0.75 ? 'high' : score >= 0.4 ? 'medium' : 'low';
  return { level, zoneFraction, pixelCount };
}

// Public entry point. `buffer`/`info` are a raw (no-alpha) RGB pixel buffer
// from sharp's .raw().toBuffer({resolveWithObject:true}) — same width/
// height as the STORED photo (see routes/skin.js), so every returned
// overlay lines up pixel-for-pixel with photoUrl with zero client-side
// coordinate translation. `faceBox`/`zoneMarkers` are the same values
// already computed/persisted for this scan (resolveCropBox / sanitized
// client zoneMarkers). `faceBoxSource` is 'client' when faceBox came from
// the client's real detection (the expanded ML Kit box) or 'default' for
// the backend's centre-crop guess — faceRegionMask un-expands the former
// and can't the latter. `faceLandmarks` (optional) is the client's
// sanitized ML Kit contour set for this photo — see exclusionGeometry.
//
// Returns { concerns: { redness, texture, pores, shine, wrinkles, moisture,
// age_spot, acne }, assessedZoneCount, totalZoneCount }. Each concern value
// is either null — no assessable pixels at all for it (heavy occlusion/
// extreme pose, or none of its required zones were assessable) — or { url
// is NOT set here (the route uploads the PNG and fills this in), png
// (Buffer), label, gradientLabels, severity (0-1, the SAME scale and
// clear/mild/moderate/notable band thresholds across every concern — see
// severityBand — so "worst first" ordering across concerns is comparing
// like with like), severityScore (0-100), band, verdict, education, tips,
// confidence: { level, zoneFraction, pixelCount }, zoneBreakdown,
// overlay: { flaggedFraction, findings } — how much of the assessed area
// actually carries visible colour in the rendered PNG, and (for the
// discrete-finding concerns) how many marks were drawn, so a caller can
// tell "we looked and found nothing to highlight" apart from "we didn't
// look" without decoding the PNG }. A null entry means "exclude this
// concern entirely" (occlusion as a first-class outcome, per the product
// spec), never "render it anyway from a guess."
async function generateHeatmaps({ buffer, info, faceBox, zoneMarkers, segMask, faceLandmarks = null, faceBoxSource = 'client' }) {
  const sharp = require('sharp');
  const { width, height, channels } = info;
  const zoneRects = assessableZoneRects(faceBox, zoneMarkers);
  const { full: fullMask, wrinkle: wrinkleMask, pore: poreMask, assessedZoneCount } =
    buildMasks(width, height, zoneRects, segMask, { faceBox, faceBoxSource, landmarks: faceLandmarks });
  const { gray, labA, labB } = toGrayscaleAndLab(buffer, channels, width, height);

  // `alpha` is the map a wash/line/stipple overlay renders from — a
  // separate, more visually-generous, percentile-rank-based curve
  // (rankToAlpha) than `severity`, which alone drives the reported
  // score/band/verdict text. `spots` (blemishes, dark spots) are discrete
  // findings the marker/spot renderers draw instead of any per-pixel map.
  async function describe(concern, severity, mask, { alpha = severity, geom = null, spots = null, score = null } = {}) {
    let any = false, maskedCount = 0;
    for (let i = 0; i < mask.length; i++) { if (mask[i] > 0.15) { any = true; maskedCount++; } }
    if (!any) return null;
    // Region concerns summarise as the 85th percentile of per-pixel
    // severity; discrete-finding concerns pass their own findings-based
    // score instead (see findingsScore) — same 0-1 scale and bands.
    const p85 = score != null ? score : percentileSeverityWhereMasked(severity, mask, 0.15, 0.85);
    const band = severityBand(p85);
    // moisture/age_spot/acne have no CONCERN_META entry (that content was
    // never duplicated here — see CONCERN_CONTENT in skinConcernContent.js,
    // which routes/skin.js's buildConcernRecord actually sources
    // label/verdict/education/tips from for every concern; CONCERN_META's
    // own copy of those fields is unused dead weight the caller already
    // discards, kept only for the original five so as not to touch working
    // code while adding these three). Falls back to CONCERN_CONTENT so
    // `meta` is never undefined for the new concerns.
    const meta = CONCERN_META[concern] || CONCERN_CONTENT[concern];
    // Style per concern-shape, not one treatment for all — see OVERLAY_STYLE.
    // 'lines' needs the real gradient direction to thin against; without it
    // (a caller that didn't pass geom) it falls back to the wash rather than
    // silently drawing something geometrically wrong.
    const style = OVERLAY_STYLE[concern] || 'wash';
    const color = CONCERN_COLORS[concern];
    let rgba;
    let findings = null;

    // A concern this photo found nothing meaningful for draws NOTHING.
    //
    // This is the single biggest credibility gap against the reference
    // implementations, and it was measurable rather than a matter of taste:
    // on a real test face this engine was painting 20.7% of the assessed
    // area for Uneven Texture and 15.7% for Pores while its OWN band for
    // both was 'clear', and 45% for Fine Lines at 'mild'. renderOverlayRgba
    // has no floor — every pixel with any non-zero severity gets alpha
    // proportional to it — so a perfectly clear face still came back
    // smeared in colour, and a wash that is always present cannot mean
    // anything when it IS present.
    //
    // Region-shaped styles only (wash / stipple / lines). Discrete findings
    // are deliberately exempt: 'markers' and 'spots' already draw at real
    // detected components and nowhere else, so a single genuine mole on
    // otherwise clear skin should still be shown rather than suppressed for
    // being the only thing there.
    //
    // The tab is not left unexplained — overlayNoteFor (routes/skin.js)
    // already exists for exactly the "verdict says something, overlay marks
    // nothing" case, and the verdict/education/tips all still render. This
    // is the same "not assessed beats a wrong answer" stance the rest of
    // this file takes, applied to the picture instead of the text.
    const REGION_STYLES = new Set(['wash', 'stipple', 'lines']);
    const suppressOverlay = band === 'clear' && REGION_STYLES.has(style);

    if (suppressOverlay) {
      rgba = null;
    } else if (style === 'lines' && geom?.gx && geom?.gy) {
      rgba = renderTracedLinesRgba(width, height, alpha, mask, geom.gx, geom.gy, color);
    } else if (style === 'stipple') {
      rgba = renderStippleRgba(width, height, alpha, mask, color);
    } else if (style === 'markers' && spots) {
      ({ rgba, count: findings } = renderMarkersRgba(width, height, spots, mask, color));
    } else if (style === 'spots' && spots) {
      ({ rgba, count: findings } = renderSpotsRgba(width, height, spots, mask, color));
    } else {
      rgba = renderWashRgba(width, height, alpha, mask, color, p85);
    }
    let flagged = 0;
    if (rgba) for (let i = 3; i < rgba.length; i += 4) { if (rgba[i] > 24) flagged++; }
    // png null (not a fully-transparent PNG) when suppressed: routes/skin.js
    // only uploads and sets a url when png is present, and the client already
    // treats a concern with no url as "no overlay to show" — the same state a
    // concern that genuinely could not be assessed lands in. Encoding and
    // uploading a blank image instead would cost a real upload per clear
    // concern and give the client a url that renders nothing.
    const png = rgba ? await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer() : null;
    return {
      png,
      label: meta.label,
      gradientLabels: meta.gradientLabels,
      severity: p85,
      severityScore: Math.round(p85 * 100),
      band,
      verdict: meta.verdict[band],
      education: meta.education,
      tips: meta.tips,
      confidence: concernConfidence(concern, mask, zoneRects, width, height),
      zoneBreakdown: zoneBreakdownFor(concern, severity, zoneRects, width, height),
      overlay: {
        flaggedFraction: maskedCount ? flagged / maskedCount : 0,
        findings,
        // Where the discrete findings are (blemishes/dark spots only) — the
        // same components the renderer drew, as 0-1 photo fractions with a
        // radius, so a client can point at them (a highlight, a pulse, a
        // callout) without decoding the PNG. Strongest first, capped.
        ...(spots ? { points: [...spots].sort((a, b) => b.strength - a.strength).slice(0, 40).map((s) => ({
          x: (s.minX + s.maxX) / 2 / width,
          y: (s.minY + s.maxY) / 2 / height,
          r: Math.max(s.maxX - s.minX, s.maxY - s.minY, 2) / 2 / width,
          strength: Number(s.strength.toFixed(2)),
        })) } : {}),
      },
    };
  }

  const rednessMaps = rednessSeverity(labA, fullMask);
  const textureMaps = textureSeverity(gray, fullMask, width, height);
  const poresMaps = poreSeverity(gray, poreMask, width, height);
  const wrinklesMaps = wrinkleSeverity(gray, wrinkleMask, width, height);
  const moistureMaps = drynessSeverity(gray, fullMask, width, height);
  const ageSpotMaps = ageSpotSeverity(gray, labB, fullMask, width, height);
  const acneMaps = blemishSeverity(labA, gray, fullMask, width, height);

  const [redness, texture, pores, shine, wrinkles, moisture, age_spot, acne] = await Promise.all([
    describe('redness', rednessMaps.severity, fullMask, { alpha: rednessMaps.alpha }),
    describe('texture', textureMaps.severity, fullMask, { alpha: textureMaps.alpha }),
    describe('pores', poresMaps.severity, poreMask, { alpha: poresMaps.alpha }),
    describe('shine', shineSeverity(gray, fullMask), fullMask),
    describe('wrinkles', wrinklesMaps.severity, wrinkleMask, { alpha: wrinklesMaps.alpha, geom: { gx: wrinklesMaps.gx, gy: wrinklesMaps.gy } }),
    describe('moisture', moistureMaps.severity, fullMask, { alpha: moistureMaps.alpha }),
    describe('age_spot', ageSpotMaps.severity, fullMask, { spots: ageSpotMaps.spots, score: ageSpotMaps.score }),
    describe('acne', acneMaps.severity, fullMask, { spots: acneMaps.spots, score: acneMaps.score }),
  ]);

  return { concerns: { redness, texture, pores, shine, wrinkles, moisture, age_spot, acne }, assessedZoneCount, totalZoneCount: ZONE_KEYS.length };
}

module.exports = { generateHeatmaps, ZONE_KEYS, WRINKLE_ZONES, PORE_ZONES, CONCERN_META, assessableZoneRects, buildMasks, laplacianMagnitude };
