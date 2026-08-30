// src/utils/skinAnalysis.js
'use strict';

// Free, on-device-style skin analysis for the "My Space" skin-scan feature —
// deliberately NOT a paid vision-API call (cost was ruled out for this
// feature). Everything here is plain pixel math (run server-side on a small
// cropped/downsampled buffer via sharp — see routes/skin.js) plus a short
// in-app quiz, blended into the app's existing SkinTone/SkinType enums.
//
// This is cosmetic guidance, not a medical or dermatological diagnosis —
// routes/skin.js surfaces that disclaimer alongside every result.

// ── Skin tone: nearest-reference-swatch color matching ─────────────────────
// Reference RGB swatches roughly spanning the app's 6 SkinTone values,
// compared in CIE Lab space (perceptually uniform, unlike raw RGB distance)
// so the nearest match tracks how a person actually perceives closeness in
// tone rather than being skewed by, say, green channel differences.
const TONE_REFERENCE_RGB = {
  FAIR:   [245, 213, 192],
  LIGHT:  [232, 184, 148],
  MEDIUM: [198, 136, 99],
  TAN:    [169, 103, 63],
  DEEP:   [122, 75, 50],
  RICH:   [74, 44, 32],
};

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function rgbToLab(r, g, b) {
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
  // sRGB → XYZ (D65)
  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
  const z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;
  // XYZ → Lab (D65 reference white)
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / Xn), fy = f(y / Yn), fz = f(z / Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labDistance(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function nearestSkinTone([r, g, b]) {
  const target = rgbToLab(r, g, b);
  let best = 'MEDIUM', bestDist = Infinity;
  for (const [tone, rgb] of Object.entries(TONE_REFERENCE_RGB)) {
    const dist = labDistance(target, rgbToLab(...rgb));
    if (dist < bestDist) { bestDist = dist; best = tone; }
  }
  return best;
}

// ── Pixel sampling ───────────────────────────────────────────────────────
// `buffer` is a raw (uncompressed) pixel buffer from sharp's .raw() output —
// flat [R,G,B,R,G,B,...] (or RGBA) for the already-cropped-to-face-region,
// downsampled image. Rejects the brightest ~15%/darkest ~15% of pixels by
// luma before averaging (specular highlights and shadow/hair edge pixels
// otherwise skew the average away from actual skin color), and separately
// reports what fraction of pixels WERE bright outliers — a cheap proxy for
// how much specular shine is in the shot, used as one signal for oiliness.
function analyzeSkinPixels(buffer, channels) {
  const n = Math.floor(buffer.length / channels);
  if (n === 0) return { avgRgb: [200, 150, 120], shineRatio: 0 };

  const luma = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    const l = 0.2126 * buffer[o] + 0.7152 * buffer[o + 1] + 0.0722 * buffer[o + 2];
    luma[i] = l;
    sum += l;
  }
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (luma[i] - mean) ** 2;
  const stddev = Math.sqrt(variance / n);

  const hiThresh = mean + 1.4 * stddev;
  const loThresh = mean - 1.4 * stddev;

  let rSum = 0, gSum = 0, bSum = 0, count = 0, highlightCount = 0;
  for (let i = 0; i < n; i++) {
    if (luma[i] > hiThresh) { highlightCount++; continue; }
    if (luma[i] < loThresh) continue;
    const o = i * channels;
    rSum += buffer[o]; gSum += buffer[o + 1]; bSum += buffer[o + 2];
    count++;
  }
  if (count === 0) {
    // Degenerate (near-flat) image — fall back to a plain full-frame average
    // rather than dividing by zero.
    for (let i = 0; i < n; i++) {
      const o = i * channels;
      rSum += buffer[o]; gSum += buffer[o + 1]; bSum += buffer[o + 2];
    }
    count = n;
  }

  return {
    avgRgb: [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)],
    shineRatio: highlightCount / n,
  };
}

// ── Skin type: photo shine signal only ──────────────────────────────────────
// Used to ask a short quiz (tightness/midday-shine/sensitivity/pores) and
// blend the answers in as points alongside this signal. Removed entirely —
// this is the FALLBACK path only (real scans go through Gemini's own vision
// classification in geminiSkinAnalysis.js, which reads all of this straight
// off the photo), and every real skin-analysis reference this app has been
// built against (Sephora's own Smart Skin Scan, Perfect Corp's AI Skin
// Diagnostic) skips a manual quiz for the scan itself — see the mobile
// camera's own comment for the sourced research this decision is based on.
// Real, disclosed trade-off: SENSITIVE can no longer be reached via this
// heuristic at all (it only ever scored from the quiz's sensitivity
// question — nothing in a single still photo reliably shows how skin reacts
// to new products over time) — Gemini's own path can still classify
// SENSITIVE from visible signs (widespread redness, visible reactivity), so
// this only narrows the free/no-Gemini fallback, not the primary path.
function scoreSkinType(shineRatio) {
  const scores = { DRY: 0, OILY: 0, COMBINATION: 0, NORMAL: 0, SENSITIVE: 0 };

  // Photo shine signal — thresholds picked so an average, evenly-lit selfie
  // lands in the "no strong signal" middle band and only a clearly shiny or
  // clearly matte capture moves the needle.
  if (shineRatio > 0.16) scores.OILY += 2;
  else if (shineRatio > 0.10) scores.COMBINATION += 1;
  else if (shineRatio < 0.03) scores.DRY += 1;

  let best = 'NORMAL', bestScore = 0;
  for (const [type, s] of Object.entries(scores)) {
    if (s > bestScore) { bestScore = s; best = type; }
  }

  return { skinType: best, scores };
}

// ── Concerns + recommendations ──────────────────────────────────────────
const TYPE_RECOMMENDATIONS = {
  OILY: [
    { category: 'Cleanser', title: 'Gel or foaming cleanser', note: 'Twice daily — a gel formula clears excess oil without over-stripping.' },
    { category: 'Treatment', title: 'Niacinamide serum', note: 'Helps visibly balance oil production and refine pores over a few weeks.' },
    { category: 'Moisturizer', title: 'Oil-free, lightweight moisturizer', note: 'Skipping moisturizer can actually trigger more oil — go light, not none.' },
    { category: 'SPF', title: 'Oil-free, matte-finish SPF 30+', note: 'Daily, even indoors — look for "non-comedogenic" on the label.' },
  ],
  DRY: [
    { category: 'Cleanser', title: 'Cream or balm cleanser', note: 'Avoid foaming/sulfate cleansers — they tend to worsen tightness.' },
    { category: 'Treatment', title: 'Hyaluronic acid serum', note: 'Apply to damp skin so it draws moisture in rather than out.' },
    { category: 'Moisturizer', title: 'Ceramide-rich, richer cream', note: 'Look for ceramides or squalane to help rebuild the skin barrier.' },
    { category: 'SPF', title: 'Hydrating SPF 30+', note: 'A moisturizing SPF base prevents that dry, tight after-feel.' },
  ],
  COMBINATION: [
    { category: 'Cleanser', title: 'Balanced gel-cream cleanser', note: 'Gentle enough for dry cheeks, thorough enough for an oily T-zone.' },
    { category: 'Treatment', title: 'Niacinamide serum', note: 'Evens out oil production across mixed skin without over-drying.' },
    { category: 'Moisturizer', title: 'Zone it — light gel on the T-zone, richer cream on cheeks', note: 'Two textures from one routine beats one texture that fits nowhere.' },
    { category: 'SPF', title: 'Lightweight SPF 30+', note: 'A gel or fluid formula sits well under makeup on combination skin.' },
  ],
  NORMAL: [
    { category: 'Cleanser', title: 'Gentle daily cleanser', note: 'Skin is balanced — the goal here is maintenance, not correction.' },
    { category: 'Treatment', title: 'Vitamin C serum, mornings', note: 'A solid antioxidant habit protects tone and texture over time.' },
    { category: 'Moisturizer', title: 'Daily lightweight moisturizer', note: 'Keep the barrier steady rather than chasing a specific concern.' },
    { category: 'SPF', title: 'Broad-spectrum SPF 30+', note: 'The single highest-impact daily habit for skin, at any tone or type.' },
  ],
  SENSITIVE: [
    { category: 'Cleanser', title: 'Fragrance-free, minimal-ingredient cleanser', note: 'Look for "for sensitive skin" formulas — fewer ingredients means fewer possible triggers.' },
    { category: 'Treatment', title: 'Centella or ceramide serum', note: 'Calming, barrier-supporting ingredients rather than active exfoliants for now.' },
    { category: 'Moisturizer', title: 'Fragrance-free barrier cream', note: 'Ceramides help rebuild a compromised barrier, which is often what drives reactivity.' },
    { category: 'SPF', title: 'Mineral (zinc oxide) SPF 30+', note: 'Mineral sunscreens are generally better tolerated than chemical ones on reactive skin.' },
    { category: 'Care', title: 'Patch-test everything new', note: 'A 48-hour patch test on your inner arm before trying any new product on your face.' },
  ],
};

function toneAdvisory(skinTone) {
  const deeper = skinTone === 'DEEP' || skinTone === 'RICH';
  return {
    category: 'Shade match',
    title: deeper ? 'Look for mineral SPF labeled "no white cast"' : 'Any broad-spectrum SPF works well for your tone',
    note: deeper
      ? 'Some mineral sunscreens leave a visible cast on deeper tones — chemical or tinted-mineral formulas usually blend in cleaner.'
      : 'Reapply every ~2 hours in direct sun regardless of formula.',
  };
}

function concernsFor(skinType, shineRatio) {
  const concerns = [];
  if (skinType === 'OILY') concerns.push('Excess shine', 'Enlarged pores');
  if (skinType === 'DRY') concerns.push('Tightness', 'Flaking');
  if (skinType === 'COMBINATION') concerns.push('Uneven oil balance');
  if (skinType === 'NORMAL') concerns.push('General maintenance');
  // SENSITIVE can no longer win skinType on this heuristic path (see
  // scoreSkinType's own comment) — no dead "reactivity" branch kept for it.
  if (shineRatio > 0.2) concerns.push('Midday shine breakthrough');
  return [...new Set(concerns)];
}

function buildRecommendations(skinType, skinTone) {
  const base = TYPE_RECOMMENDATIONS[skinType] || TYPE_RECOMMENDATIONS.NORMAL;
  return [...base, toneAdvisory(skinTone)];
}

const TYPE_SUMMARY = {
  DRY: 'Your skin is reading dry today — a bit of extra hydration will go a long way.',
  OILY: "You've got that oily-skin shine — nothing wrong with it, just means a lighter routine works better than a heavy one.",
  COMBINATION: "Combination skin — a bit of both, so today's picks balance rather than pick one extreme.",
  NORMAL: "Your skin looks balanced and healthy right now — today's about keeping it that way.",
  SENSITIVE: "Your skin's telling us it's a little reactive — today's picks lean gentle on purpose.",
};

function buildSummary(skinType) {
  return TYPE_SUMMARY[skinType] || TYPE_SUMMARY.NORMAL;
}

// ── Public entry point ──────────────────────────────────────────────────
// buffer/channels: raw pixel data for the cropped, downsampled face region.
function analyzeSkin({ buffer, channels }) {
  const { avgRgb, shineRatio } = analyzeSkinPixels(buffer, channels);
  const skinTone = nearestSkinTone(avgRgb);
  const { skinType } = scoreSkinType(shineRatio);

  return {
    skinTone,
    skinType,
    concerns: concernsFor(skinType, shineRatio),
    // Free heuristic has no basis to compare two photos, unlike the Gemini
    // path — always null here, never fabricated.
    summary: buildSummary(skinType),
    progressNote: null,
    recommendations: buildRecommendations(skinType, skinTone),
    avgRgb,
    shineRatio,
    // Surfaces the recommended booking category for the "Book an artist" CTA
    // — see src/utils/categories.js, must stay one of its 9 values.
    bookCategory: 'Facials & Skin',
  };
}

module.exports = { analyzeSkin, nearestSkinTone, analyzeSkinPixels, scoreSkinType, rgbToLab };
