/**
 * Real, per-photo zone geometry derived from ML Kit's own contour/landmark
 * points on a captured skin-scan photo (see SkinScanCamera.tsx's
 * detectFaceRegion, the only caller of deriveZoneMarkers below). Historically
 * this fed a point-marker + tooltip overlay on the result screen
 * (SkinZoneOverlay/MarkerCallout) — that whole rendering approach has been
 * replaced by full-region heatmap overlays generated server-side (see
 * src/utils/skinHeatmaps.js), since a heatmap masks itself to an actual
 * region and structurally cannot render "on a hat" or "on the ceiling" the
 * way a coordinate point could.
 *
 * This file's job now is narrower but still real: computing `zoneMarkers`
 * (StoredZoneMarkers below) client-side and sending it to the backend, which
 * uses those same per-zone rects as the source of truth for which regions of
 * the photo are confidently assessable skin — a zone this pass couldn't
 * place (occlusion, low confidence) is excluded from the heatmap entirely,
 * not guessed at, exactly the same "no marker beats a wrong marker"
 * principle the old point-marker system was built around, just applied to a
 * region mask instead of a dot.
 */

export type FaceBox = { x: number; y: number; width: number; height: number };
export type ZoneKey = 'forehead' | 'nose' | 'chin' | 'cheekL' | 'cheekR' | 'underEyeL' | 'underEyeR' | 'jawline';

// Fractions OF the face box (not the full photo). Deliberately checked
// pairwise for actual rectangle overlap, not just eyeballed — the previous
// values had two real intersections (underEyeL/R clipped into nose's
// corners, and chin sat almost entirely inside jawline's box). Every pair
// below has a real gap or at most a touching edge, never an overlapping
// area. Mirrored in src/utils/skinHeatmaps.js on the backend (kept in sync
// by hand, same convention as DEFAULT_REGION/DEFAULT_FACE_BOX already used
// across the JS/TS boundary) — the exact width/height a zone gets here is
// also the shape of its heatmap mask region server-side.
//
// Re-laid-out after the first real on-device look at the heatmaps: these
// fractions are of the EXPANDED face box detectFaceRegion actually sends
// (ML Kit's box grown 50% upward, 25% downward, 25% each side — see
// SkinScanCamera.tsx), and the previous values were laid out as if the box
// were the tight face. On the real box that put the "under-eye" band on
// the eyes themselves, the cheeks half outside the face, and the chin/
// jawline band on the neck — exactly the eyelid/neck leaks in the
// screenshots. Measured against a real photo's expanded box: brows sit at
// ~0.38 of its height, eye centres ~0.44, nose tip ~0.63, mouth ~0.74, chin
// ~0.86; the face itself spans ~0.17–0.83 of its width. Every rect below
// is placed off those, and the mouth (0.70–0.78) stays in the gap between
// nose and chin that the backend's mouthExclusionRect fallback relies on.
export const ZONE_RECTS: Record<ZoneKey, FaceBox> = {
  forehead:   { x: 0.22, y: 0.22, width: 0.56, height: 0.15 },
  underEyeL:  { x: 0.20, y: 0.49, width: 0.22, height: 0.08 },
  underEyeR:  { x: 0.58, y: 0.49, width: 0.22, height: 0.08 },
  nose:       { x: 0.42, y: 0.46, width: 0.16, height: 0.24 },
  cheekL:     { x: 0.14, y: 0.52, width: 0.26, height: 0.22 },
  cheekR:     { x: 0.60, y: 0.52, width: 0.26, height: 0.22 },
  chin:       { x: 0.36, y: 0.78, width: 0.28, height: 0.08 },
  jawline:    { x: 0.14, y: 0.83, width: 0.72, height: 0.06 },
};

// ---- Landmark-derived zone positions -------------------------------------
//
// Computes a real center for each zone from ML Kit's own contour/landmark
// points (react-native-vision-camera-face-detector, already installed —
// see SkinScanCamera.tsx's detectFaceRegion, which is the only caller),
// reusing ZONE_RECTS' own already-tuned width/height for each zone
// (non-overlapping, visually reasonable) so only the CENTER changes, not the
// box shape/size.
//
// Deliberately still runs entirely client-side, in pixel space matching the
// already-established faceRegion convention (0-1 fractions of the full
// photo) — no new coordinate system, no new native dependency (ML Kit's
// contour output was already available in the installed detector, just not
// enabled).

export type Point = { x: number; y: number };

// Raw points pulled from ML Kit's Face.contours/Face.landmarks (pixel space,
// matching the same imgWidth/imgHeight the caller already normalizes
// faceRegion against). Any field can be missing — ML Kit doesn't guarantee
// every contour/landmark is present for every detection (a turned head, an
// occluded feature) — each zone below degrades independently rather than
// requiring all of them.
export interface RawFacialPoints {
  faceContour?: Point[];
  leftEyebrowTop?: Point[];
  rightEyebrowTop?: Point[];
  noseBridge?: Point[];
  noseBottom?: Point[];
  leftEye?: Point[];
  rightEye?: Point[];
  leftCheek?: Point;
  rightCheek?: Point;
  mouthBottom?: Point;
}

// ML Kit's own head-pose and eye-openness numbers (Face.pitchAngle/
// leftEyeOpenProbability/rightEyeOpenProbability — always/optionally present
// on every detection, see react-native-vision-camera-face-detector's Face
// type) — the only real, native confidence-adjacent signals this detector
// exposes. Neither one is a general occlusion detector (there's no "is
// something covering this feature" API), but each catches a specific,
// concrete failure mode: a large pitch means the head is tilted enough
// (back or forward) that 2D forehead/chin landmark geometry stops being
// trustworthy even when points are returned, and a low eye-open probability
// means whatever ML Kit is looking at for that eye isn't a clearly open,
// clearly visible eye (closed, or occluded by hair/a cap brim/a hand) — both
// exactly the "head tilted back" and "cap" conditions from the reported
// off-face markers. Eye-open probabilities are subject-relative (ML Kit's
// own LEFT_EYE/RIGHT_EYE convention), same as the raw contour points, so the
// caller must apply the same mirrored-based swap before comparing one to the
// other.
export interface FaceConfidenceSignals {
  pitchAngle: number;
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
}

// Beyond this many degrees of pitch (chin tipped up or down), the forehead/
// chin/jawline zones stop getting placed at all — the head tilted back in
// both reported broken photos is squarely the case this exists for.
const PITCH_GATE_DEG = 18;
// Below this, ML Kit isn't looking at a clearly-open, clearly-visible eye —
// don't trust that eye's contour for an under-eye marker.
const EYE_OPEN_MIN = 0.4;

export function centroid(points: Point[]): Point | null {
  if (!points.length) return null;
  let sx = 0, sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  return { x: sx / points.length, y: sy / points.length };
}

// Average of the bottom `fraction` of points by y (largest y = lowest on the
// photo) — a stable "how low does this contour reach, roughly centered"
// read, not just the single lowest (possibly noisy) point.
function bottomCentroid(points: Point[], fraction: number): Point | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => b.y - a.y);
  const take = Math.max(1, Math.round(sorted.length * fraction));
  return centroid(sorted.slice(0, take));
}

// ZONE_RECTS' own width/height (already tuned to not overlap), centered on a
// real point instead of a fixed fraction. Hard-clamped inside the detected
// face's own pixel bounding box — a single noisy input point putting a
// marker outside the actual face is exactly the bug this feature exists to
// fix, so this is a floor/ceiling, not a nicety.
//
// A center that needs REAL clamping (more than a few px of rounding slop) to
// even land inside the face box is rejected outright, not clamped-and-shown.
// This is the guard against ML Kit's own failure mode under occlusion: it
// has no concept of "can't see this feature" and no per-point confidence —
// asked for an eyebrow/eye contour it doesn't actually have visual evidence
// for (hidden under a cap), it still returns a full point, extrapolated from
// generic face-proportion priors rather than this photo's real geometry.
// That point is usually still "roughly near the face" (so a naive in-bounds
// check wouldn't catch it) but a genuinely on-face point from a clean
// detection essentially never needs clamping — clamping firing at all is
// itself the signal something's wrong, so treat it as "couldn't place this
// zone," same as ML Kit returning no points at all, rather than silently
// snapping the guess into bounds and displaying it as if it were confident.
const CLAMP_TOLERANCE_PX = 3;
function centeredZoneRect(zone: ZoneKey, center: Point | null, faceBoxPx: FaceBox, imgWidth: number, imgHeight: number): FaceBox | null {
  if (!center || imgWidth <= 0 || imgHeight <= 0) return null;
  const template = ZONE_RECTS[zone];
  const widthPx = template.width * faceBoxPx.width;
  const heightPx = template.height * faceBoxPx.height;
  const maxLeft = Math.max(faceBoxPx.x, faceBoxPx.x + faceBoxPx.width - widthPx);
  const maxTop = Math.max(faceBoxPx.y, faceBoxPx.y + faceBoxPx.height - heightPx);
  const idealLeft = center.x - widthPx / 2;
  const idealTop = center.y - heightPx / 2;
  const left = Math.min(Math.max(idealLeft, faceBoxPx.x), maxLeft);
  const top = Math.min(Math.max(idealTop, faceBoxPx.y), maxTop);
  if (Math.abs(left - idealLeft) > CLAMP_TOLERANCE_PX || Math.abs(top - idealTop) > CLAMP_TOLERANCE_PX) return null;
  return { x: left / imgWidth, y: top / imgHeight, width: widthPx / imgWidth, height: heightPx / imgHeight };
}

// Resolves one zone's rect in FULL-PHOTO 0-1 fraction space (same space as
// faceBox/photoUrl) — the geometry the tap-to-highlight spotlight overlay
// (SkinConcernTabs.tsx's ZoneHighlightMask) needs to position itself.
// Prefers this scan's own real landmark-derived rect (zoneMarkers[zone] —
// already full-photo fractions) when present; falls back to ZONE_RECTS'
// fixed proportion of faceBox otherwise — the exact same "real geometry
// first, proportion estimate as fallback" rule already used everywhere
// else this data flows (see deriveZoneMarkers' own file header, and
// skinHeatmaps.js's assessableZoneRects on the backend, which this
// mirrors). Returns null only if faceBox itself is missing/empty (a scan
// from before faceBox existed) — there's no reasonable proportion to fall
// back to without it.
export function resolveZoneRect(zone: ZoneKey, zoneMarkers: StoredZoneMarkers | null | undefined, faceBox: FaceBox | undefined): FaceBox | null {
  const anchored = zoneMarkers?.[zone];
  if (anchored) return anchored;
  if (!faceBox || !faceBox.width || !faceBox.height) return null;
  const r = ZONE_RECTS[zone];
  return {
    x: faceBox.x + r.x * faceBox.width,
    y: faceBox.y + r.y * faceBox.height,
    width: r.width * faceBox.width,
    height: r.height * faceBox.height,
  };
}

// Already-persisted, landmark-derived rects for a scan (SkinScan.
// zoneMarkers — 0-1 fractions of the full photo, same space as faceBox
// itself) — null/undefined for a scan captured before this existed, or
// where the client's contour pass didn't yield usable geometry at all.
export type StoredZoneMarkers = Partial<Record<ZoneKey, FaceBox>>;

// Derives real, per-photo zone positions from ML Kit's contour/landmark
// points. Returns only the zones it could actually place — any zone ML Kit
// didn't return usable points for (or that failed a confidence check below)
// is simply absent, which the backend's heatmap masking (skinHeatmaps.js)
// reads as "exclude this region," never a guess.
export function deriveZoneMarkers(points: RawFacialPoints, faceBoxPx: FaceBox, imgWidth: number, imgHeight: number, mirrored: boolean, signals: FaceConfidenceSignals): StoredZoneMarkers {
  const out: StoredZoneMarkers = {};
  const set = (zone: ZoneKey, center: Point | null) => {
    const rect = centeredZoneRect(zone, center, faceBoxPx, imgWidth, imgHeight);
    if (rect) out[zone] = rect;
  };

  // Forehead/chin/jawline all rely on the head being roughly level — a
  // sharp pitch (chin tipped up, as in the reported "head tilted back"
  // photos) foreshortens exactly this geometry, so skip placing any of them
  // rather than trust a 2D projection that's no longer reliable.
  const poseReliable = Math.abs(signals.pitchAngle) <= PITCH_GATE_DEG;

  if (poseReliable) {
    const browCentroid = centroid([...(points.leftEyebrowTop || []), ...(points.rightEyebrowTop || [])]);
    if (browCentroid) set('forehead', { x: browCentroid.x, y: browCentroid.y - faceBoxPx.height * 0.16 });

    // bottomCentroid lands ON the chin's lowest edge; a rect centred there
    // hangs half off the face onto the neck (seen on device — the chin
    // blob below the jaw). Lifted by half the rect's own height so its
    // bottom edge, not its centre, sits at the chin. Same for the jawline.
    const chinLift = ZONE_RECTS.chin.height * faceBoxPx.height * 0.5;
    const jawLift = ZONE_RECTS.jawline.height * faceBoxPx.height * 0.5;
    const chinBottom = bottomCentroid(points.faceContour || [], 0.12)
      ?? (points.mouthBottom ? { x: points.mouthBottom.x, y: points.mouthBottom.y + faceBoxPx.height * 0.14 } : null);
    set('chin', chinBottom ? { x: chinBottom.x, y: chinBottom.y - chinLift } : null);

    const jawBottom = bottomCentroid(points.faceContour || [], 0.28);
    set('jawline', jawBottom ? { x: jawBottom.x, y: jawBottom.y - jawLift } : null);
  }

  const noseCentroid = centroid([...(points.noseBridge || []), ...(points.noseBottom || [])]);
  set('nose', noseCentroid);

  // ML Kit's LEFT_*/RIGHT_* points are the SUBJECT's own anatomical
  // left/right, not viewer-left/right — a photo of someone shows their own
  // left cheek on the VIEWER's right unless the image is actually mirrored.
  // This app's existing convention (ZONE_RECTS' own fixed x positions —
  // cheekL sits near the left edge of the DISPLAYED photo) is viewer-
  // relative, so ML Kit's labels need a swap whenever the captured photo is
  // NOT mirrored (the common case for a still photo, even though the live
  // preview shown while framing typically is). `mirrored` comes from the
  // captured Photo's own isMirrored flag (see SkinScanCamera.tsx), not an
  // assumption about capture defaults, so this self-corrects either way.
  // The same swap applies to eye-open probabilities below — they're
  // reported in the same subject-relative LEFT_EYE/RIGHT_EYE convention as
  // the contours, so whichever raw eye a zone's contour came from is also
  // whichever raw probability must gate it.
  const swapLR = !mirrored;
  set('cheekL', (swapLR ? points.rightCheek : points.leftCheek) ?? null);
  set('cheekR', (swapLR ? points.leftCheek : points.rightCheek) ?? null);

  const underEyeOffset = faceBoxPx.height * 0.09;
  const leftEyeOpen = (swapLR ? signals.rightEyeOpenProbability : signals.leftEyeOpenProbability) ?? 1;
  const rightEyeOpen = (swapLR ? signals.leftEyeOpenProbability : signals.rightEyeOpenProbability) ?? 1;
  if (leftEyeOpen >= EYE_OPEN_MIN) {
    const leftEyeC = centroid((swapLR ? points.rightEye : points.leftEye) || []);
    if (leftEyeC) set('underEyeL', { x: leftEyeC.x, y: leftEyeC.y + underEyeOffset });
  }
  if (rightEyeOpen >= EYE_OPEN_MIN) {
    const rightEyeC = centroid((swapLR ? points.leftEye : points.rightEye) || []);
    if (rightEyeC) set('underEyeR', { x: rightEyeC.x, y: rightEyeC.y + underEyeOffset });
  }

  return out;
}

// ---- Raw contour payload for the backend's face/exclusion masks -----------
//
// The zone rects above say WHERE each named region is; they say nothing
// about where the face ENDS or where the eyes/brows/lips/nostrils are —
// and nothing server-side could, from rects alone. The first real
// on-device heatmaps showed the cost: blemish marks on a shirt collar,
// dryness "found" along the eyebrows, redness on the eyelids. So the
// actual ML Kit contours are now sent alongside (0-1 fractions of the
// photo, same space as faceRegion/zoneMarkers) and skinHeatmaps.js turns
// them into a hard face-outline mask plus eye/brow/lip/nostril exclusions
// (see exclusionGeometry there). Left/right naming is ML Kit's own
// subject-relative convention, deliberately NOT swapped here — every use
// of these on the backend is symmetric (an exclusion is an exclusion
// whichever eye it is), so a swap would be pure risk for no gain.
// Any contour ML Kit didn't return is simply omitted; the backend has a
// geometric fallback for each.
export interface FaceLandmarkPayload {
  faceContour?: Point[];
  leftEye?: Point[];
  rightEye?: Point[];
  leftEyebrow?: Point[];
  rightEyebrow?: Point[];
  noseBottom?: Point[];
  upperLipTop?: Point[];
  lowerLipBottom?: Point[];
}

// `contours` is ML Kit's Face.contours object as react-native-vision-
// camera-face-detector exposes it (FACE, LEFT_EYE, LEFT_EYEBROW_TOP, ...).
// Returns null when nothing usable is present so the caller sends nothing
// rather than an empty object.
export function extractFaceLandmarks(contours: Record<string, Point[] | undefined> | undefined, imgWidth: number, imgHeight: number): FaceLandmarkPayload | null {
  if (!contours || imgWidth <= 0 || imgHeight <= 0) return null;
  const norm = (pts: (Point[] | undefined)[]): Point[] | undefined => {
    const out: Point[] = [];
    for (const list of pts) {
      for (const p of list || []) {
        if (typeof p?.x !== 'number' || typeof p?.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        out.push({ x: p.x / imgWidth, y: p.y / imgHeight });
      }
    }
    return out.length ? out : undefined;
  };
  const payload: FaceLandmarkPayload = {
    faceContour: norm([contours.FACE]),
    leftEye: norm([contours.LEFT_EYE]),
    rightEye: norm([contours.RIGHT_EYE]),
    leftEyebrow: norm([contours.LEFT_EYEBROW_TOP, contours.LEFT_EYEBROW_BOTTOM]),
    rightEyebrow: norm([contours.RIGHT_EYEBROW_TOP, contours.RIGHT_EYEBROW_BOTTOM]),
    noseBottom: norm([contours.NOSE_BOTTOM]),
    upperLipTop: norm([contours.UPPER_LIP_TOP]),
    lowerLipBottom: norm([contours.LOWER_LIP_BOTTOM]),
  };
  const any = Object.values(payload).some((v) => v && v.length);
  return any ? payload : null;
}

// ---- Face alignment (Stage 6) ---------------------------------------------
//
// A real similarity transform (uniform scale + rotation + translation — 4
// degrees of freedom, not a full 6-DOF affine that could also shear/
// non-uniformly scale) computed from the SAME ML Kit contour points
// deriveZoneMarkers already consumes — no new native dependency. Levels the
// eye line, scales so inter-eye distance hits a fixed target, and positions
// the eye midpoint at a fixed spot in a fixed-size output canvas — the
// standard "aligned face crop" recipe (the same idea dlib/OpenCV face-
// alignment tutorials and ArcFace/InsightFace-style preprocessing use,
// simplified to 2 fit points instead of 5). Two eye centers alone fully
// determine a similarity transform's 4 DOF (2 for the shared scale+rotation,
// 2 for translation) — nose-tip is deliberately NOT a third least-squares fit
// point (that would need a proper Procrustes/SVD solve, more moving parts to
// get right with no device to verify against); instead it's used only as a
// cheap PLAUSIBILITY gate on the input landmarks themselves (noseSanityGate
// below) — catching a degenerate/implausible detection before any transform
// math runs at all.
//
// Deliberately conservative about trusting its own geometry: rather than
// assuming how the actual image-manipulation library lays out a rotated
// canvas (untested, unverifiable without a device), the real safety net is
// downstream — re-running face detection on the transformed output and
// checking the result lands near where it was supposed to
// (checkAlignmentSanity). A transform that fails that check must be
// discarded in favor of the original, unaligned photo, never shipped anyway
// on the theory that the math "should" have been right.

// Output canvas: same 4:5 portrait ratio as the backend's own heatmapPixels/
// storedBuf target (src/routes/skin.js) — aligning to that same proportion
// client-side means the backend's own resize is close to a straight scale
// rather than a re-crop that could reintroduce the very misalignment this
// stage exists to remove.
//
// 1080x1350, not the 720x900 this started at, and the reason is measured
// rather than a preference. The backend resizes every uploaded frame to fit
// inside 1080x1350 before analysis (routes/skin.js) with
// withoutEnlargement: true — so a 720-wide aligned canvas was analysed at
// 720, two thirds of the linear detail the pipeline already supports, for
// no benefit. Run against a real photo through the real engine
// (src/utils/skinHeatmaps.js) at three effective face resolutions:
//
//   whole frame @720   pores 0   dark spots 26 (4 findings)   blemishes 0 (0)
//   whole frame @1024  pores 0   dark spots 40 (8 findings)   blemishes 0 (0)
//   face crop  @1080   pores 6   dark spots 50 (15 findings)  blemishes 37 (11)
//
// Blemishes are the clearest case: at the old resolution the detector finds
// NONE at all — not "few", zero — because a blemish is a handful of pixels
// wide once a face is rendered ~500px tall, and the difference-of-Gaussians
// it relies on has nothing left to separate. This is the actual gap behind
// "their scan is more detailed and accurate than ours": not the algorithms,
// the number of pixels they were given.
//
// Payload cost, measured on the same photo at quality 0.92: 220KB -> 396KB
// of base64. That is well inside budget now that a scan uploads ONE frame
// instead of four (the four-frame body is what produced the 56s POST and
// the "connection error"), and it is the same order as the unaligned path
// has always sent at 1080x1350.
export const ALIGN_OUTPUT_WIDTH = 1080;
export const ALIGN_OUTPUT_HEIGHT = 1350;

// Eyes at 38% down from the top (room for forehead above, chin/jaw below)
// and centered horizontally — a standard head-and-shoulders selfie
// composition, not an arbitrary number. Inter-eye distance targeted at 28%
// of the output width — a face filling a natural, comfortable portion of a
// head-and-shoulders frame (neither a tight close-up nor a distant subject).
export const TARGET_EYE_MID_FRAC: Point = { x: 0.5, y: 0.38 };
export const TARGET_EYE_DIST_FRAC = 0.28;

// Tolerances for checkAlignmentSanity, both expressed relative to the
// TARGET inter-eye distance (in output pixels) rather than a flat fraction
// of canvas size — a tolerance that scales with the feature actually being
// aligned, not with unrelated canvas dimensions. 30% of inter-eye distance
// is generous enough to absorb real redetection jitter (ML Kit's own contour
// centroid isn't pixel-exact run to run) while still catching a genuinely
// wrong transform (a missed 90 rotation, a wildly wrong scale, a swapped
// left/right eye) by a wide margin.
export const EYE_POSITION_TOLERANCE_FRAC = 0.30;
export const EYE_DIST_TOLERANCE_FRAC = 0.35;

export interface EyeNoseAnchors {
  leftEyeCenter: Point;
  rightEyeCenter: Point;
  noseTip: Point;
}

// Same subject-relative-vs-viewer-relative swap deriveZoneMarkers already
// applies (see its own comment) — "leftEyeCenter" here always means the
// VIEWER's left, matching TARGET_EYE_MID_FRAC/ZONE_RECTS' own convention.
// Returns null if ML Kit didn't return usable points for either eye or the
// nose on this detection — alignment simply doesn't run rather than guessing
// at a transform from partial geometry.
export function extractEyeNoseAnchors(points: RawFacialPoints, mirrored: boolean): EyeNoseAnchors | null {
  const swapLR = !mirrored;
  const leftEyeCenter = centroid((swapLR ? points.rightEye : points.leftEye) || []);
  const rightEyeCenter = centroid((swapLR ? points.leftEye : points.rightEye) || []);
  // noseBottom (the tip/base of the nose in ML Kit's contour scheme) is
  // preferred as the actual "nose tip"; noseBridge is only the upper ridge
  // and used solely to fill in when noseBottom itself is missing.
  const noseTip = centroid(points.noseBottom || []) ?? centroid([...(points.noseBridge || []), ...(points.noseBottom || [])]);
  if (!leftEyeCenter || !rightEyeCenter || !noseTip) return null;
  return { leftEyeCenter, rightEyeCenter, noseTip };
}

// Cheap plausibility gate on the raw landmarks themselves, before any
// transform math runs — catches a degenerate/implausible detection (nose
// point landing above or level with the eyes, or wildly off to one side)
// that a bare "were points present" check can't see. Not a precision check:
// generous bounds, meant to reject only clearly-wrong geometry.
export function noseSanityGate(anchors: EyeNoseAnchors): boolean {
  const { leftEyeCenter, rightEyeCenter, noseTip } = anchors;
  const dx = rightEyeCenter.x - leftEyeCenter.x;
  const dy = rightEyeCenter.y - leftEyeCenter.y;
  const eyeDist = Math.hypot(dx, dy);
  if (eyeDist < 2) return false; // degenerate/overlapping eye points
  const midEye: Point = { x: (leftEyeCenter.x + rightEyeCenter.x) / 2, y: (leftEyeCenter.y + rightEyeCenter.y) / 2 };
  // Perpendicular ("down the face") direction from the eye line, in the
  // same rotated frame the eye line itself defines — robust to head tilt,
  // unlike a plain vertical-distance check.
  const perpX = -dy / eyeDist, perpY = dx / eyeDist;
  const noseVecX = noseTip.x - midEye.x, noseVecY = noseTip.y - midEye.y;
  const alongPerp = noseVecX * perpX + noseVecY * perpY; // how far "down the face" the nose sits, in px
  const alongEyeLine = noseVecX * (dx / eyeDist) + noseVecY * (dy / eyeDist); // lateral offset along the eye line
  const belowEyes = alongPerp > eyeDist * 0.25 && alongPerp < eyeDist * 3.5;
  const roughlyCentered = Math.abs(alongEyeLine) < eyeDist * 0.9;
  return belowEyes && roughlyCentered;
}

export interface SimilarityTransform {
  correctionDeg: number; // pass directly to ImageManipulator's rotate() (clockwise-positive) to level the eye line
  eyeDist: number;
  midEye: Point;
}

// The whole transform's rotation+scale is fully determined by the two eye
// points alone (see this section's own header comment on why a 2-point fit
// is enough for a similarity transform, and why nose-tip stays a validation
// signal instead of a third fit point). Returns null only for a degenerate
// (near-zero-distance) eye pair — deriveEyeNoseAnchors's own null-checks
// already rule out missing points before this is ever called.
export function computeSimilarityTransform(anchors: EyeNoseAnchors): SimilarityTransform | null {
  const { leftEyeCenter, rightEyeCenter } = anchors;
  const dx = rightEyeCenter.x - leftEyeCenter.x;
  const dy = rightEyeCenter.y - leftEyeCenter.y;
  const eyeDist = Math.hypot(dx, dy);
  if (eyeDist < 2) return null;
  // atan2(dy,dx) in this y-DOWN pixel coordinate system is the eye line's
  // own apparent clockwise tilt (e.g. right eye lower than left = positive
  // angle = photo reads as if a clockwise rotation had been applied to a
  // level face) — negating it is exactly the correction that levels it.
  // Confirmed by hand against a concrete example before shipping (see this
  // module's own verification script, not just this comment) — a sign
  // error here would silently tilt every aligned photo the wrong way.
  const tiltDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  const correctionDeg = -tiltDeg;
  const midEye: Point = { x: (leftEyeCenter.x + rightEyeCenter.x) / 2, y: (leftEyeCenter.y + rightEyeCenter.y) / 2 };
  return { correctionDeg, eyeDist, midEye };
}

// Projects an arbitrary point through the SAME rotation applied to the image
// content (rotate() is clockwise-positive around the image's own center),
// re-centering it into a (possibly larger, bounding-box-expanded) output
// canvas of size newWidth x newHeight. `newWidth`/`newHeight` should be the
// REAL, MEASURED post-rotation dimensions (read back off the actual
// ImageManipulator result), not assumed — this function only assumes the
// rotated content stays centered in whatever canvas the library produces,
// which is the one piece of rotation-canvas behavior that's essentially
// universal (bounding-box expansion is symmetric around the rotation
// center) even when the exact expansion amount isn't independently
// verifiable from here.
export function rotatePointAroundCenter(point: Point, originalWidth: number, originalHeight: number, newWidth: number, newHeight: number, correctionDeg: number): Point {
  const theta = (correctionDeg * Math.PI) / 180;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const relX = point.x - originalWidth / 2;
  const relY = point.y - originalHeight / 2;
  const rotX = relX * cos - relY * sin;
  const rotY = relX * sin + relY * cos;
  return { x: newWidth / 2 + rotX, y: newHeight / 2 + rotY };
}

// Crop rect (in the SCALED image's own pixel space) that lands `scaledMidEye`
// at TARGET_EYE_MID_FRAC of the final ALIGN_OUTPUT_WIDTH x ALIGN_OUTPUT_HEIGHT
// canvas, clamped so the crop never runs off the scaled image's own bounds.
// Returns null when the scaled image is smaller than the output canvas in
// either dimension — cropping can't manufacture pixels that aren't there, so
// this bails out to the unaligned photo rather than padding with anything
// synthetic.
export function computeCropRect(scaledMidEye: Point, scaledWidth: number, scaledHeight: number): { originX: number; originY: number; width: number; height: number } | null {
  if (scaledWidth < ALIGN_OUTPUT_WIDTH || scaledHeight < ALIGN_OUTPUT_HEIGHT) return null;
  const idealOriginX = scaledMidEye.x - TARGET_EYE_MID_FRAC.x * ALIGN_OUTPUT_WIDTH;
  const idealOriginY = scaledMidEye.y - TARGET_EYE_MID_FRAC.y * ALIGN_OUTPUT_HEIGHT;
  const originX = Math.round(Math.min(Math.max(idealOriginX, 0), scaledWidth - ALIGN_OUTPUT_WIDTH));
  const originY = Math.round(Math.min(Math.max(idealOriginY, 0), scaledHeight - ALIGN_OUTPUT_HEIGHT));
  return { originX, originY, width: ALIGN_OUTPUT_WIDTH, height: ALIGN_OUTPUT_HEIGHT };
}

// The real sanity check Stage 6 asked for: re-detects landmarks on the
// ALREADY-TRANSFORMED output and checks the eyes actually landed near where
// the transform was supposed to put them, rather than trusting the transform
// math blindly. `redetected` comes from running extractEyeNoseAnchors again
// on the aligned photo. Tolerances are relative to the TARGET inter-eye
// distance in output pixels (see this section's own constants comment).
export function checkAlignmentSanity(redetected: EyeNoseAnchors): { ok: boolean; reason?: string; measured: { leftEye: Point; rightEye: Point; eyeDist: number }; expected: { leftEye: Point; rightEye: Point; eyeDist: number } } {
  const targetEyeDistPx = TARGET_EYE_DIST_FRAC * ALIGN_OUTPUT_WIDTH;
  const targetMidPx: Point = { x: TARGET_EYE_MID_FRAC.x * ALIGN_OUTPUT_WIDTH, y: TARGET_EYE_MID_FRAC.y * ALIGN_OUTPUT_HEIGHT };
  const expected = {
    leftEye: { x: targetMidPx.x - targetEyeDistPx / 2, y: targetMidPx.y },
    rightEye: { x: targetMidPx.x + targetEyeDistPx / 2, y: targetMidPx.y },
    eyeDist: targetEyeDistPx,
  };
  const { leftEyeCenter, rightEyeCenter } = redetected;
  const measuredEyeDist = Math.hypot(rightEyeCenter.x - leftEyeCenter.x, rightEyeCenter.y - leftEyeCenter.y);
  const measured = { leftEye: leftEyeCenter, rightEye: rightEyeCenter, eyeDist: measuredEyeDist };

  const posToleragePx = EYE_POSITION_TOLERANCE_FRAC * targetEyeDistPx;
  const leftOff = Math.hypot(leftEyeCenter.x - expected.leftEye.x, leftEyeCenter.y - expected.leftEye.y);
  const rightOff = Math.hypot(rightEyeCenter.x - expected.rightEye.x, rightEyeCenter.y - expected.rightEye.y);
  const distRatio = measuredEyeDist / targetEyeDistPx;

  if (leftOff > posToleragePx) return { ok: false, reason: `left eye off by ${leftOff.toFixed(1)}px (tolerance ${posToleragePx.toFixed(1)}px)`, measured, expected };
  if (rightOff > posToleragePx) return { ok: false, reason: `right eye off by ${rightOff.toFixed(1)}px (tolerance ${posToleragePx.toFixed(1)}px)`, measured, expected };
  if (distRatio < 1 - EYE_DIST_TOLERANCE_FRAC || distRatio > 1 + EYE_DIST_TOLERANCE_FRAC) {
    return { ok: false, reason: `eye distance ratio ${distRatio.toFixed(2)} outside [${(1 - EYE_DIST_TOLERANCE_FRAC).toFixed(2)}, ${(1 + EYE_DIST_TOLERANCE_FRAC).toFixed(2)}]`, measured, expected };
  }
  return { ok: true, measured, expected };
}
