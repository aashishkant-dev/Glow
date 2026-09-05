// src/utils/photoQuality.js
'use strict';

// Two real, small jobs that both run BEFORE the main analysis pipeline
// (routes/skin.js's POST /scan): picking the sharpest of a multi-frame
// burst, and rejecting a photo whose actual saved pixels are too dark or
// too blurry to analyze meaningfully — a real check on the FILE that was
// actually captured, not just trusting the live gates' last reading before
// the shutter fired (see this project's own "hard capture gates" vs.
// "captured-file QC" distinction).
//
// Deliberately reuses skinHeatmaps.js's real, already-proven Laplacian
// kernel (laplacianMagnitude) rather than a second hand-rolled copy — same
// underlying edge-response math, just summarized differently: skinHeatmaps
// z-scores it per-pixel against a masked region to find WHERE detail is
// unusual for THIS photo; this module takes its VARIANCE across a whole
// candidate frame as a single number — the standard "variance of
// Laplacian" sharpness metric (the same one OpenCV's own cv2.Laplacian()
// .var() computes), used here to compare frames against EACH OTHER, not to
// score any one concern.

const { laplacianMagnitude } = require('./skinHeatmaps');

// Decodes one candidate to a SMALL grayscale buffer for scoring — burst
// frames are near-identical (locked exposure/focus, captured within a
// fraction of a second — see SkinScanCamera.tsx's shoot()), so comparing
// them at full 1080x1350 resolution buys nothing: relative sharpness
// differences are already clear at a much smaller size, and every frame in
// the burst needs this decode, so keeping it cheap matters more than usual.
async function decodeForScoring(sharp, base64) {
  const buf = Buffer.from(base64, 'base64');
  const { data, info } = await sharp(buf)
    .rotate()
    .resize(360, 450, { fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { gray: data, width: info.width, height: info.height };
}

// Variance of the Laplacian response over a whole frame — higher means
// more real high-frequency detail (in focus); a blurred frame's edges
// smear out, so its Laplacian response stays low and uniform everywhere,
// which is exactly what variance measures the absence of.
function sharpnessScore(gray, width, height) {
  const lap = laplacianMagnitude(gray, width, height, null);
  let sum = 0, sumSq = 0, count = 0;
  for (let i = 0; i < lap.length; i++) {
    // Laplacian is only computed for interior pixels (1..width-2,
    // 1..height-2 — see laplacianMagnitude's own loop bounds); border
    // pixels stay exactly 0 and would silently drag variance down toward
    // zero at small sizes, disproportionately at THIS module's small
    // decode size where the unset border is a much bigger fraction of the
    // total than it is at skinHeatmaps.js's full working resolution.
    const x = i % width, y = Math.floor(i / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) continue;
    sum += lap[i];
    sumSq += lap[i] * lap[i];
    count++;
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

// Plain mean luma (ITU-R BT.709 grayscale, matching toGrayscaleAndLab's own
// weighting in skinHeatmaps.js) over the whole frame — cheap, real
// brightness signal for the QC gate below.
function brightnessScore(gray) {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  return sum / gray.length;
}

// Scores every candidate (base64 strings) and returns the index of the
// sharpest, plus every candidate's own scores for logging/debugging. Never
// throws on a single bad candidate — a corrupt/undecodable frame just
// scores 0 and loses to any real one, rather than failing the whole burst
// over one bad frame.
async function pickSharpest(sharp, candidatesBase64) {
  const scored = await Promise.all(candidatesBase64.map(async (b64, i) => {
    try {
      const { gray, width, height } = await decodeForScoring(sharp, b64);
      return { index: i, sharpness: sharpnessScore(gray, width, height), brightness: brightnessScore(gray) };
    } catch (err) {
      console.error(`[photoQuality] candidate ${i} failed to decode:`, err.message);
      return { index: i, sharpness: 0, brightness: 0, decodeError: true };
    }
  }));
  let best = scored[0];
  for (const s of scored) { if (s.sharpness > best.sharpness) best = s; }
  return { bestIndex: best.index, scores: scored };
}

// Thresholds — one well-grounded, one deliberately conservative and
// flagged as such. Both checked against this exact code (not a
// simplified stand-in), not guessed:
//
// BRIGHTNESS_CEILING still mirrors the live lightingGate's red threshold
// (avgLuma > 235, SkinScanCamera.tsx). BRIGHTNESS_FLOOR no longer does, and
// that divergence is deliberate — see its own note below for the production
// evidence that forced it.
//
// SHARPNESS_FLOOR is NOT equally well-grounded, and that's stated plainly
// rather than dressed up as calibrated. Real run of THIS module's own
// sharpnessScore against a real local photo, synthetically blurred at two
// levels:
//   clean:              1597.00
//   mildly soft (σ1.5):  904.43  (57% of clean)
//   genuinely blurry(σ4): 65.64  (4% of clean)
// The problem: that source photo is a UI SCREENSHOT (status bar, on-
// screen text, icons), not a real selfie — screenshots carry much sharper,
// higher-contrast edges (anti-aliased text/icons) than real skin/hair/
// background ever does, so these absolute numbers are almost certainly
// inflated well above what a genuine clean selfie would score. Setting
// SHARPNESS_FLOOR anywhere near what this test's "genuinely blurry" case
// suggests would risk rejecting perfectly fine real photos. Set low and
// conservative instead — comfortably below even this unrepresentative
// test's blurry-frame score, so it only catches something drastically,
// unmistakably out of focus rather than merely not-perfectly-crisp — and
// flagged here for exactly what it is: a placeholder that needs real
// calibration against real captured selfies (not screenshots) before it
// should be trusted at a tighter setting. See this project's own
// verification report.
const SHARPNESS_FLOOR = 15;
// Raised 40 -> 60 against real production evidence, not taste.
//
// A real scan (production, 2026-09-05) came in at brightness 50.0 — a
// near-dark selfie with half the face in shadow — passed this gate by ten
// points, and was analysed into a confident "notable acne, 14 findings"
// whose markers sat on the subject's eyelids and moustache. The vendor
// rejected the very same photo outright: "Poor lighting | Harsh shadows
// obscuring facial features | Low resolution and digital noise." The vendor
// was right and this gate was wrong.
//
// 40 came from reusing the LIVE PREVIEW gate's red threshold, and that was
// the mistake: red there means "this frame is unusable at all", while the
// same gate already calls anything under 55 "a bit dark". A still that is
// about to be measured for pores and blemishes needs a higher bar than a
// viewfinder frame, not the same one — noise rises as light falls, and
// sensor noise in shadow is exactly what gets counted as blemishes.
//
// 60 sits above the 50 that produced nonsense and far below the 94.9 of a
// real good scan from this same app, so it separates the two known cases
// with margin on both sides. Only those two real points anchor it, so it is
// deliberately just above the live gate's own "a bit dark" line rather than
// somewhere more aggressive that two samples cannot justify. Refusing a
// borderline photo costs a retake; accepting one costs a confident wrong
// answer about someone's skin, which is the worse failure for this product.
const BRIGHTNESS_FLOOR = 60;
const BRIGHTNESS_CEILING = 235;

// Real QC gate on the actual selected frame — returns null when it passes,
// or a user-facing reason string when it doesn't. Called AFTER burst
// selection (or on the single photo when there was no burst), so this
// always checks the one frame that's actually about to be analyzed.
function qcCheck(sharpness, brightness) {
  if (brightness < BRIGHTNESS_FLOOR) return 'too_dark';
  if (brightness > BRIGHTNESS_CEILING) return 'too_bright';
  if (sharpness < SHARPNESS_FLOOR) return 'too_blurry';
  return null;
}

module.exports = { decodeForScoring, sharpnessScore, brightnessScore, pickSharpest, qcCheck, SHARPNESS_FLOOR, BRIGHTNESS_FLOOR, BRIGHTNESS_CEILING };
