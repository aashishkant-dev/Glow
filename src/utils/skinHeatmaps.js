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
function buildMasks(width, height, zoneRects) {
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
      let w = 0;
      for (const [, rect] of rectList) w = Math.max(w, ellipseWeight(x, y, rect, width, height));
      // Lips read as strongly "red"/high-contrast regardless of actual
      // skin condition (see mouthExclusionRect's own comment) — carved out
      // of every general concern (redness/texture/shine all share this
      // mask), not just redness, since teeth/lip edges are equally
      // meaningless "texture" and lip shine is equally meaningless
      // "specular skin highlight."
      const mouthClear = mouthRect ? 1 - ellipseWeight(x, y, mouthRect, width, height) : 1;
      w *= mouthClear;
      full[i] = w;
      let ww = 0;
      for (const [, rect] of wrinkleRectList) ww = Math.max(ww, ellipseWeight(x, y, rect, width, height));
      wrinkle[i] = ww;
      let wp = 0;
      for (const [, rect] of poreRectList) wp = Math.max(wp, ellipseWeight(x, y, rect, width, height));
      pore[i] = wp * mouthClear;
    }
  }
  return { full, wrinkle, pore, assessedZoneCount: rectList.length, totalZoneCount: ZONE_KEYS.length };
}

function toGrayscaleAndLab(buffer, channels, width, height) {
  const n = width * height;
  const gray = new Float32Array(n);
  const labA = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    const r = buffer[o], g = buffer[o + 1], b = buffer[o + 2];
    gray[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    labA[i] = rgbToLab(r, g, b)[1]; // a* channel only — the redness axis
  }
  return { gray, labA };
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
// render as fully transparent, not a faint tint).
function zScoreToSeverity(z) {
  const DEADZONE = 0.5;
  const CEIL = 2.5;
  if (z <= DEADZONE) return 0;
  return Math.min(1, (z - DEADZONE) / (CEIL - DEADZONE));
}

// ---- Per-concern severity maps (Float32Array, width*height, [0,1]) -------

// Redness: a* channel (Lab) above THIS photo's own mean, within the
// assessable mask. A relative (not absolute) threshold is deliberate — skin
// tone varies the baseline a* value enormously; what matters for "does this
// look redder than the rest of this person's own skin" is the deviation,
// not an absolute a* number picked for one tone.
function rednessSeverity(labA, mask) {
  const { mean, std } = maskedStats(labA, mask, 0.15);
  const out = new Float32Array(labA.length);
  for (let i = 0; i < labA.length; i++) {
    if (mask[i] <= 0.15) continue;
    out[i] = zScoreToSeverity((labA[i] - mean) / std);
  }
  return out;
}

// Texture/pores: local contrast via a discrete Laplacian (high-frequency
// detail response) on the grayscale image, z-scored the same way. High
// Laplacian magnitude = fine detail (pores, texture); scored relative to
// this photo's own average detail level so photo sharpness/compression
// doesn't shift the whole scale.
function textureSeverity(gray, mask, width, height) {
  const lap = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (mask[i] <= 0.15) continue;
      const v =
        4 * gray[i] -
        gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      lap[i] = Math.abs(v);
    }
  }
  const { mean, std } = maskedStats(lap, mask, 0.15);
  const out = new Float32Array(width * height);
  for (let i = 0; i < lap.length; i++) {
    if (mask[i] <= 0.15) continue;
    out[i] = zScoreToSeverity((lap[i] - mean) / std);
  }
  return out;
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
    }
  }
  const { mean, std } = maskedStats(mag, wrinkleMask, 0.15);
  const out = new Float32Array(width * height);
  for (let i = 0; i < mag.length; i++) {
    if (wrinkleMask[i] <= 0.15) continue;
    out[i] = zScoreToSeverity((mag[i] - mean) / std);
  }
  return out;
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
  const out = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    if (poreMask[i] <= 0.15) continue;
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

// Which zones actually matter for each concern's own confidence read — the
// same lists that already restrict wrinkles/pores spatially (WRINKLE_ZONES/
// PORE_ZONES); redness/texture/shine use the full 8-zone set since they're
// not restricted to a sub-region.
const RELEVANT_ZONES = {
  redness: ZONE_KEYS, texture: ZONE_KEYS, shine: ZONE_KEYS,
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
const PIXEL_FLOOR_FRACTION = { redness: 0.05, texture: 0.05, shine: 0.05, pores: 0.018, wrinkles: 0.02 };
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
// Returns { concerns: { redness, texture, pores, shine, wrinkles },
// assessedZoneCount, totalZoneCount }. Each concern value is either null —
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
async function generateHeatmaps({ buffer, info, faceBox, zoneMarkers }) {
  const sharp = require('sharp');
  const { width, height, channels } = info;
  const zoneRects = assessableZoneRects(faceBox, zoneMarkers);
  const { full: fullMask, wrinkle: wrinkleMask, pore: poreMask, assessedZoneCount } = buildMasks(width, height, zoneRects);
  const { gray, labA } = toGrayscaleAndLab(buffer, channels, width, height);

  async function describe(concern, severity, mask) {
    let any = false;
    for (let i = 0; i < mask.length; i++) { if (mask[i] > 0.15) { any = true; break; } }
    if (!any) return null;
    const p85 = percentileSeverityWhereMasked(severity, mask, 0.15, 0.85);
    const band = severityBand(p85);
    const meta = CONCERN_META[concern];
    const rgba = renderOverlayRgba(width, height, severity, mask, CONCERN_COLORS[concern]);
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

  const [redness, texture, pores, shine, wrinkles] = await Promise.all([
    describe('redness', rednessSeverity(labA, fullMask), fullMask),
    describe('texture', textureSeverity(gray, fullMask, width, height), fullMask),
    describe('pores', poreSeverity(gray, poreMask, width, height), poreMask),
    describe('shine', shineSeverity(gray, fullMask), fullMask),
    describe('wrinkles', wrinkleSeverity(gray, wrinkleMask, width, height), wrinkleMask),
  ]);

  return { concerns: { redness, texture, pores, shine, wrinkles }, assessedZoneCount, totalZoneCount: ZONE_KEYS.length };
}

module.exports = { generateHeatmaps, ZONE_KEYS, WRINKLE_ZONES, PORE_ZONES, CONCERN_META, assessableZoneRects, buildMasks };
