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
export const ZONE_RECTS: Record<ZoneKey, FaceBox> = {
  forehead:   { x: 0.22, y: 0.02, width: 0.56, height: 0.20 },
  underEyeL:  { x: 0.14, y: 0.26, width: 0.22, height: 0.09 },
  underEyeR:  { x: 0.64, y: 0.26, width: 0.22, height: 0.09 },
  nose:       { x: 0.42, y: 0.32, width: 0.16, height: 0.24 },
  cheekL:     { x: 0.02, y: 0.40, width: 0.26, height: 0.26 },
  cheekR:     { x: 0.72, y: 0.40, width: 0.26, height: 0.26 },
  chin:       { x: 0.36, y: 0.67, width: 0.28, height: 0.13 },
  jawline:    { x: 0.06, y: 0.82, width: 0.88, height: 0.12 },
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

function centroid(points: Point[]): Point | null {
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

    const chinCentroid = bottomCentroid(points.faceContour || [], 0.12)
      ?? (points.mouthBottom ? { x: points.mouthBottom.x, y: points.mouthBottom.y + faceBoxPx.height * 0.14 } : null);
    set('chin', chinCentroid);

    set('jawline', bottomCentroid(points.faceContour || [], 0.28));
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
