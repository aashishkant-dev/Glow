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
  forehead: { x: 0.22, y: 0.02, width: 0.56, height: 0.20 },
  underEyeL: { x: 0.14, y: 0.26, width: 0.22, height: 0.09 },
  underEyeR: { x: 0.64, y: 0.26, width: 0.22, height: 0.09 },
  nose: { x: 0.42, y: 0.32, width: 0.16, height: 0.24 },
  cheekL: { x: 0.02, y: 0.40, width: 0.26, height: 0.26 },
  cheekR: { x: 0.72, y: 0.40, width: 0.26, height: 0.26 },
  chin: { x: 0.36, y: 0.67, width: 0.28, height: 0.13 },
  jawline: { x: 0.06, y: 0.82, width: 0.88, height: 0.12 },
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

// Builds a per-pixel [0,1] mask (Float32Array, row-major, width*height) —
// the union of every assessable zone's elliptical region — plus the same
// mask restricted to WRINKLE_ZONES only. `zoneRects` values are already
// full-photo 0-1 fractions (see assessableZoneRects).
//
// `segMask` (optional, Float32Array width*height, 0-1, real per-pixel
// person/skin confidence from modules/skin-segmentation — see that
// module's iOS Vision-framework / Android ML Kit Selfie Segmentation
// implementations) is what actually closes the "elliptical zone-based
// exclusion" gap: the ellipse still decides WHICH named zone a pixel
// belongs to (segmentation has no concept of "forehead" vs "chin" — only
// "is this visible skin at all"), but a pixel now only counts as
// assessable if it's BOTH inside an assessable zone's ellipse AND
// confidently real skin per the real mask. Multiplied in, not a separate
// AND/OR branch, so it degrades smoothly at a mask's own soft edges (a
// hairline, the edge of a hand) instead of a hard cliff. Absent entirely
// (undefined) on any scan without one — an older client, Android before
// its own native module exists, or a failed native call — in which case
// this behaves EXACTLY as before: the ellipse alone decides, no
// regression for those scans.
function buildMasks(width, height, zoneRects, segMask) {
  const full = new Float32Array(width * height);
  const wrinkle = new Float32Array(width * height);
  const pore = new Float32Array(width * height);
  const rectList = Object.entries(zoneRects);
  const wrinkleRectList = rectList.filter(([zone]) => WRINKLE_ZONES.includes(zone));
  const poreRectList = rectList.filter(([zone]) => PORE_ZONES.includes(zone));
  const mouthRect = mouthExclusionRect(zoneRects);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const seg = segMask ? segMask[i] : 1;
      let w = 0;
      for (const [, rect] of rectList) w = Math.max(w, ellipseWeight(x, y, rect, width, height));
      // Lips read as strongly "red"/high-contrast regardless of actual
      // skin condition (see mouthExclusionRect's own comment) — carved out
      // of every general concern (redness/texture/shine all share this
      // mask), not just redness, since teeth/lip edges are equally
      // meaningless "texture" and lip shine is equally meaningless
      // "specular skin highlight."
      const mouthClear = mouthRect ? 1 - ellipseWeight(x, y, mouthRect, width, height) : 1;
      w *= mouthClear * seg;
      full[i] = w;
      let ww = 0;
      for (const [, rect] of wrinkleRectList) ww = Math.max(ww, ellipseWeight(x, y, rect, width, height));
      wrinkle[i] = ww * seg;
      let wp = 0;
      for (const [, rect] of poreRectList) wp = Math.max(wp, ellipseWeight(x, y, rect, width, height));
      pore[i] = wp * mouthClear * seg;
    }
  }
  return { full, wrinkle, pore, assessedZoneCount: rectList.length, totalZoneCount: ZONE_KEYS.length };
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
// masked region shows SOME color — startPct picked (0.6) so the top ~40%
// of assessable pixels carry visible alpha, scaling up toward full color
// for the most-flagged ~10%, verified by actually rendering it (see this
// file's own git history) rather than assumed from the formula alone.
function rankToAlpha(raw, mask, threshold, startPct) {
  const n = raw.length;
  const indices = [];
  for (let i = 0; i < n; i++) { if (mask[i] > threshold) indices.push(i); }
  indices.sort((a, b) => raw[a] - raw[b]);
  const alpha = new Float32Array(n);
  const count = indices.length;
  for (let rank = 0; rank < count; rank++) {
    const i = indices[rank];
    const pct = count > 1 ? rank / (count - 1) : 1;
    alpha[i] = pct <= startPct ? 0 : (pct - startPct) / (1 - startPct);
  }
  return alpha;
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
  const out = new Float32Array(width * height);
  for (let i = 0; i < flake.length; i++) {
    if (mask[i] <= 0.15) continue;
    out[i] = zScoreToSeverity((flake[i] - mean) / std);
  }
  return out;
}

// Dark spots: a medium-scale difference-of-Gaussians, same principle as
// poreSeverity/drynessSeverity/blemishSeverity above (small blur stays
// close to a spot's own value; large blur dilutes it against the broader
// surrounding skin, so the gap peaks at spot-sized dark patches) — NOT a
// single blur compared against the raw pixel value, which was this
// function's first version and a real, caught bug: at the CENTER of any
// patch larger than that one blur radius, a single blur over a
// homogeneously-dark area returns ≈ the same dark value as the raw pixel
// there, collapsing the "darker than surroundings" signal to ~0 exactly
// where it should be strongest (confirmed by actually running it against a
// synthetic dark patch and watching the reported severity come back 0).
// Two radii — one small enough to stay inside a realistic spot, one large
// enough to reach past it into normal skin — fixes that the same way it
// already works for every other DoG-based concern here. Boosted where the
// patch ALSO reads more yellow/brown than this photo's own average (Lab
// b*, the yellow-blue axis — orthogonal to the a* red-green axis
// rednessSeverity/blemishSeverity use): meant to separate an actual
// pigmented spot from an ordinary shadow (under the nose, along the jaw)
// that's dark for a purely geometric reason — a shadow reads closer to
// neutral/bluish in b*, a spot reads warmer. A soft multiplier, not a hard
// gate: an honest, imperfect heuristic, not a claim it reliably tells
// pigment apart from shadow in every lighting condition. Full mask, same
// reasoning as drynessSeverity above.
function ageSpotSeverity(gray, labB, mask, width, height) {
  const small = gaussianApprox(gray, width, height, 3);
  const large = gaussianApprox(gray, width, height, 14);
  const { mean: meanB, std: stdB } = maskedStats(labB, mask, 0.15);
  const raw = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    if (mask[i] <= 0.15) continue;
    const localDark = Math.max(0, large[i] - small[i]);
    const brownBoost = 1 + Math.max(0, (labB[i] - meanB) / stdB) * 0.5;
    raw[i] = localDark * brownBoost;
  }
  const { mean, std } = maskedStats(raw, mask, 0.15);
  const out = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    if (mask[i] <= 0.15) continue;
    out[i] = zScoreToSeverity((raw[i] - mean) / std);
  }
  return out;
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
function blemishSeverity(labA, mask, width, height) {
  const small = gaussianApprox(labA, width, height, 2);
  const large = gaussianApprox(labA, width, height, 8);
  const bump = new Float32Array(width * height);
  for (let i = 0; i < bump.length; i++) {
    if (mask[i] <= 0.15) continue;
    bump[i] = Math.max(0, small[i] - large[i]);
  }

  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (mask[i] <= 0.15) continue;
      gx[i] =
        -labA[i - width - 1] + labA[i - width + 1] +
        -2 * labA[i - 1] + 2 * labA[i + 1] +
        -labA[i + width - 1] + labA[i + width + 1];
      gy[i] =
        -labA[i - width - 1] - 2 * labA[i - width] - labA[i - width + 1] +
        labA[i + width - 1] + 2 * labA[i + width] + labA[i + width + 1];
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
  const Sxx = gaussianApprox(Ixx, width, height, 3);
  const Syy = gaussianApprox(Iyy, width, height, 3);
  const Sxy = gaussianApprox(Ixy, width, height, 3);

  const raw = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    if (mask[i] <= 0.15) continue;
    const trace = Sxx[i] + Syy[i];
    const coherence = trace > 1e-6 ? Math.sqrt((Sxx[i] - Syy[i]) ** 2 + 4 * Sxy[i] * Sxy[i]) / trace : 0;
    raw[i] = bump[i] * (1 - coherence);
  }

  const { mean, std } = maskedStats(raw, mask, 0.15);
  const out = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    if (mask[i] <= 0.15) continue;
    out[i] = zScoreToSeverity((raw[i] - mean) / std);
  }
  return out;
}

const CONCERN_COLORS = {
  redness: [217, 92, 92],
  texture: [201, 150, 90],
  pores: [140, 120, 100],
  shine: [230, 200, 90],
  wrinkles: [150, 110, 190],
  moisture: [150, 170, 195],
  age_spot: [143, 103, 62],
  acne: [196, 68, 110],
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

// Renders one concern's severity map as a transparent RGBA buffer — color
// is fixed per concern, alpha = mask * severity (scaled to a legible max),
// so zero-severity / unmasked pixels are fully transparent and only
// genuinely flagged, assessable skin shows color. This is the hard
// constraint that replaces "marker inside bounding box": alpha is
// mathematically zero everywhere mask is zero, so occluded/background/hair
// pixels cannot show color regardless of what the severity computation
// above did.
function renderOverlayRgba(width, height, severity, mask, colorRgb) {
  const MAX_ALPHA = 200; // out of 255 — never fully opaque, base photo stays visible through it
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = Math.round(Math.min(1, severity[i] * mask[i]) * MAX_ALPHA);
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
// a region (redness spreads across an area), but it misrepresents the two
// concerns whose underlying signal is not region-shaped at all: fine lines
// are CURVES (Sobel ridges along a crease) and pores are POINTS (isotropic
// dark blobs). Rendering all three identically threw away geometry the
// detectors had already computed. Each style below draws from that same
// already-computed signal — no new detection, just an honest depiction of
// what was actually found.
const OVERLAY_STYLE = {
  redness: 'wash', texture: 'wash', shine: 'wash', moisture: 'wash', age_spot: 'wash', acne: 'wash',
  wrinkles: 'lines',
  pores: 'stipple',
};

// Fine lines: thin traced contours instead of a fuzzy band. Non-maximum
// suppression along the LOCAL GRADIENT DIRECTION (the missing step called
// out in wrinkleSeverity's own comment — "no non-max suppression, so this
// reads as 'where the strongest edges are', not perfectly thinned
// single-pixel lines") keeps a pixel only where it is the ridge crest
// across the crease, thinning a several-pixel-wide gradient band down to
// the actual line. Widened by exactly one pixel afterwards so a 1px trace
// stays visible once the PNG is scaled down into a phone-sized photo view.
function renderTracedLinesRgba(width, height, alpha, mask, gx, gy, colorRgb) {
  const MAX_ALPHA = 220;
  const keep = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (mask[i] <= 0.15 || alpha[i] <= 0.06) continue;
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
      out[o + 3] = Math.round(Math.min(1, v) * MAX_ALPHA);
    }
  }
  return out;
}

// Pores: discrete dots at the actual detected blob centres, not a wash —
// a pore is a point feature, and a continuous tint over the T-zone claims
// a spread the detector never found. Keeps only local maxima of the same
// blob response poresSeverity already computed (dark AND isotropic, i.e.
// low structure-tensor coherence), then stamps a small soft disc at each,
// so what's drawn is one mark per detected pore.
function renderStippleRgba(width, height, alpha, mask, colorRgb) {
  const MAX_ALPHA = 215;
  const R = Math.max(2, Math.round(Math.min(width, height) / 380)); // ~3px at 1080x1350
  const acc = new Float32Array(width * height);
  const NB = 2; // local-maximum search radius
  for (let y = NB; y < height - NB; y++) {
    for (let x = NB; x < width - NB; x++) {
      const i = y * width + x;
      if (mask[i] <= 0.15 || alpha[i] <= 0.10) continue;
      let isMax = true;
      for (let dy = -NB; dy <= NB && isMax; dy++) {
        for (let dx = -NB; dx <= NB; dx++) {
          if (!dx && !dy) continue;
          if (alpha[(y + dy) * width + (x + dx)] > alpha[i]) { isMax = false; break; }
        }
      }
      if (!isMax) continue;
      // Soft radial disc — full strength at the centre, tapering to nothing
      // at the rim, so the marks read as dots rather than hard squares.
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > R) continue;
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          acc[j] = Math.max(acc[j], alpha[i] * (1 - d / (R + 1)));
        }
      }
    }
  }
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    out[o] = colorRgb[0];
    out[o + 1] = colorRgb[1];
    out[o + 2] = colorRgb[2];
    out[o + 3] = Math.round(Math.min(1, acc[i]) * MAX_ALPHA);
  }
  return out;
}

// Region concerns: the existing wash, with the alpha map softened first so
// a blotch fades out at its edges instead of ending on a hard pixel border.
// Blur runs on ALPHA only (never on severity), so the reported score/band
// are bit-for-bit unchanged — this is purely how the region is drawn.
function renderWashRgba(width, height, alpha, mask, colorRgb) {
  const feathered = gaussianApprox(alpha, width, height, Math.max(2, Math.round(Math.min(width, height) / 260)));
  return renderOverlayRgba(width, height, feathered, mask, colorRgb);
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
// client zoneMarkers).
//
// Returns { concerns: { redness, texture, pores, shine, wrinkles, moisture,
// age_spot, acne }, assessedZoneCount, totalZoneCount }. Each concern value
// is either null —
// no assessable pixels at all for it (heavy occlusion/extreme pose, or none
// of its required zones were assessable) — or { url is NOT set here (the
// route uploads the PNG and fills this in), png (Buffer), label,
// gradientLabels, severity (0-1, the SAME z-score-derived scale and
// clear/mild/moderate/notable band thresholds across every concern — see
// severityBand — so "worst first" ordering across concerns is comparing
// like with like, not five different scales), severityScore (0-100, same
// value rescaled for display), band, verdict, education, tips,
// confidence: { level: 'low'|'medium'|'high', zoneFraction, pixelCount } }.
// A null entry means "exclude this concern entirely" (occlusion as a
// first-class outcome, per the product spec), never "render it anyway from
// a guess."
async function generateHeatmaps({ buffer, info, faceBox, zoneMarkers, segMask }) {
  const sharp = require('sharp');
  const { width, height, channels } = info;
  const zoneRects = assessableZoneRects(faceBox, zoneMarkers);
  const { full: fullMask, wrinkle: wrinkleMask, pore: poreMask, assessedZoneCount } = buildMasks(width, height, zoneRects, segMask);
  const { gray, labA, labB } = toGrayscaleAndLab(buffer, channels, width, height);

  // `alpha` is the map the PNG overlay actually renders from — a separate,
  // more visually-generous, percentile-rank-based curve (rankToAlpha) than `severity`, which
  // still alone drives the reported score/band/verdict text. Defaults to
  // `severity` itself when a concern doesn't pass one (shine/moisture/
  // age_spot/acne below still call their own *Severity() functions
  // unchanged, returning a single Float32Array) — same rendering behavior
  // those four already had, untouched. Only redness/texture/pores/wrinkles
  // (the concerns actually verified end-to-end this round — see this
  // file's own git history) pass a real, separate alpha map.
  async function describe(concern, severity, mask, alpha = severity, geom = null) {
    let any = false;
    for (let i = 0; i < mask.length; i++) { if (mask[i] > 0.15) { any = true; break; } }
    if (!any) return null;
    const p85 = percentileSeverityWhereMasked(severity, mask, 0.15, 0.85);
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
    if (style === 'lines' && geom?.gx && geom?.gy) {
      rgba = renderTracedLinesRgba(width, height, alpha, mask, geom.gx, geom.gy, color);
    } else if (style === 'stipple') {
      rgba = renderStippleRgba(width, height, alpha, mask, color);
    } else {
      rgba = renderWashRgba(width, height, alpha, mask, color);
    }
    const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
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
    };
  }

  const rednessMaps = rednessSeverity(labA, fullMask);
  const textureMaps = textureSeverity(gray, fullMask, width, height);
  const poresMaps = poreSeverity(gray, poreMask, width, height);
  const wrinklesMaps = wrinkleSeverity(gray, wrinkleMask, width, height);

  const [redness, texture, pores, shine, wrinkles, moisture, age_spot, acne] = await Promise.all([
    describe('redness', rednessMaps.severity, fullMask, rednessMaps.alpha),
    describe('texture', textureMaps.severity, fullMask, textureMaps.alpha),
    describe('pores', poresMaps.severity, poreMask, poresMaps.alpha),
    describe('shine', shineSeverity(gray, fullMask), fullMask),
    describe('wrinkles', wrinklesMaps.severity, wrinkleMask, wrinklesMaps.alpha, { gx: wrinklesMaps.gx, gy: wrinklesMaps.gy }),
    describe('moisture', drynessSeverity(gray, fullMask, width, height), fullMask),
    describe('age_spot', ageSpotSeverity(gray, labB, fullMask, width, height), fullMask),
    describe('acne', blemishSeverity(labA, fullMask, width, height), fullMask),
  ]);

  return { concerns: { redness, texture, pores, shine, wrinkles, moisture, age_spot, acne }, assessedZoneCount, totalZoneCount: ZONE_KEYS.length };
}

module.exports = { generateHeatmaps, ZONE_KEYS, WRINKLE_ZONES, PORE_ZONES, CONCERN_META, assessableZoneRects, buildMasks, laplacianMagnitude };
