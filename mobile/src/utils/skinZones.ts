/**
 * Shared zone geometry — the sub-rects used both by SkinZoneOverlay (labeled,
 * tappable markers on a finished result photo) and SkinScanCamera's live
 * preview (unlabeled real-time guide lines while framing the shot). One
 * definition so the two never drift apart — a mismatch would mean the live
 * guide points at a different spot than the markers the result screen ends
 * up showing for the exact same face.
 *
 * Standard portrait-proportion estimates WITHIN a face box, not per-feature
 * detection — good enough to visually "point at" the right area, not a
 * precision medical measurement.
 *
 * Eight zones (forehead/nose/chin/cheekL/cheekR/underEyeL/underEyeR/
 * jawline) — split out from an earlier 3-zone version (tZone/cheeks/
 * underEye, kept below as LEGACY_ZONE_RECTS) so a scan can point out as much
 * or as little as the photo actually shows: Gemini only writes a note for a
 * zone with something genuinely visible there, so a clear-skinned photo
 * might surface 2-3 markers and a more textured one 6-8, instead of always
 * exactly the same fixed count regardless of the photo.
 */

export type FaceBox = { x: number; y: number; width: number; height: number };
export type ZoneKey = 'forehead' | 'nose' | 'chin' | 'cheekL' | 'cheekR' | 'underEyeL' | 'underEyeR' | 'jawline';
export type LegacyZoneKey = 'tZone' | 'cheekL' | 'cheekR' | 'underEye';

// Mirrors DEFAULT_REGION in src/routes/skin.js.
export const DEFAULT_FACE_BOX: FaceBox = { x: 0.22, y: 0.16, width: 0.56, height: 0.6 };

// Metadata driving both SkinZoneOverlay's tappable markers and
// SkinScanResultScreen's text list — one source so a zone's label/side never
// drifts between the photo overlay and the list underneath it.
export const ZONE_META: { key: ZoneKey; label: string; align: 'left' | 'right' | 'center' }[] = [
  { key: 'forehead', label: 'Forehead', align: 'center' },
  { key: 'nose', label: 'Nose', align: 'center' },
  { key: 'chin', label: 'Chin', align: 'center' },
  { key: 'cheekL', label: 'Left cheek', align: 'left' },
  { key: 'cheekR', label: 'Right cheek', align: 'right' },
  { key: 'underEyeL', label: 'Left under-eye', align: 'left' },
  { key: 'underEyeR', label: 'Right under-eye', align: 'right' },
  { key: 'jawline', label: 'Jawline', align: 'center' },
];

// Fractions OF the face box (not the full photo). Deliberately checked
// pairwise for actual rectangle overlap, not just eyeballed — the previous
// values had two real intersections (underEyeL/R clipped into nose's
// corners, and chin sat almost entirely inside jawline's box), which is
// what made a scan with several zones active read as visually cluttered
// rather than 8 distinct, separated markers. Every pair below has a real
// gap or at most a touching edge, never an overlapping area.
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

// Coarser 3-zone geometry from before the granular breakdown above — kept
// only so a scan saved before this change still renders its markers (its
// zoneNotes only ever has tZone/cheeks/underEye, never the 8 keys above).
export const LEGACY_ZONE_RECTS: Record<LegacyZoneKey, FaceBox> = {
  tZone:    { x: 0.30, y: 0.03, width: 0.40, height: 0.58 },
  cheekL:   { x: 0.04, y: 0.42, width: 0.30, height: 0.30 },
  cheekR:   { x: 0.66, y: 0.42, width: 0.30, height: 0.30 },
  underEye: { x: 0.20, y: 0.30, width: 0.60, height: 0.11 },
};

function toPhotoFrac(rect: FaceBox, faceBox: FaceBox): FaceBox {
  return {
    x: faceBox.x + rect.x * faceBox.width,
    y: faceBox.y + rect.y * faceBox.height,
    width: rect.width * faceBox.width,
    height: rect.height * faceBox.height,
  };
}

export function zoneRectToPhotoFrac(zone: ZoneKey, faceBox: FaceBox): FaceBox {
  return toPhotoFrac(ZONE_RECTS[zone], faceBox);
}

export function legacyZoneRectToPhotoFrac(zone: LegacyZoneKey, faceBox: FaceBox): FaceBox {
  return toPhotoFrac(LEGACY_ZONE_RECTS[zone], faceBox);
}

export function resolveFaceBox(raw?: { x?: number; y?: number; width?: number; height?: number } | null): FaceBox {
  return raw?.width && raw?.height
    ? { x: raw.x ?? DEFAULT_FACE_BOX.x, y: raw.y ?? DEFAULT_FACE_BOX.y, width: raw.width, height: raw.height }
    : DEFAULT_FACE_BOX;
}

// ---- Landmark-derived zone positions -------------------------------------
//
// Everything above (ZONE_RECTS) places a zone at a FIXED fraction of the
// detected face box — a reasonable estimate for a typically-framed face, but
// not actually anchored to where that zone is on THIS specific photo. The
// functions below compute a real center for each zone from ML Kit's own
// contour/landmark points (react-native-vision-camera-face-detector, already
// installed — see SkinScanCamera.tsx's detectFaceRegion, which is the only
// caller), reusing ZONE_RECTS' own already-tuned width/height for each zone
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
function centeredZoneRect(zone: ZoneKey, center: Point | null, faceBoxPx: FaceBox, imgWidth: number, imgHeight: number): FaceBox | null {
  if (!center || imgWidth <= 0 || imgHeight <= 0) return null;
  const template = ZONE_RECTS[zone];
  const widthPx = template.width * faceBoxPx.width;
  const heightPx = template.height * faceBoxPx.height;
  const maxLeft = Math.max(faceBoxPx.x, faceBoxPx.x + faceBoxPx.width - widthPx);
  const maxTop = Math.max(faceBoxPx.y, faceBoxPx.y + faceBoxPx.height - heightPx);
  const left = Math.min(Math.max(center.x - widthPx / 2, faceBoxPx.x), maxLeft);
  const top = Math.min(Math.max(center.y - heightPx / 2, faceBoxPx.y), maxTop);
  return { x: left / imgWidth, y: top / imgHeight, width: widthPx / imgWidth, height: heightPx / imgHeight };
}

// Derives real, per-photo zone positions from ML Kit's contour/landmark
// points. Returns only the zones it could actually place — any zone ML Kit
// didn't return usable points for is simply absent, letting the caller
// (buildZoneMarkers) fall back to the ZONE_RECTS estimate for just that one
// zone rather than an all-or-nothing result.
export function deriveZoneMarkers(points: RawFacialPoints, faceBoxPx: FaceBox, imgWidth: number, imgHeight: number, mirrored: boolean): Partial<Record<ZoneKey, FaceBox>> {
  const out: Partial<Record<ZoneKey, FaceBox>> = {};
  const set = (zone: ZoneKey, center: Point | null) => {
    const rect = centeredZoneRect(zone, center, faceBoxPx, imgWidth, imgHeight);
    if (rect) out[zone] = rect;
  };

  const browCentroid = centroid([...(points.leftEyebrowTop || []), ...(points.rightEyebrowTop || [])]);
  if (browCentroid) set('forehead', { x: browCentroid.x, y: browCentroid.y - faceBoxPx.height * 0.16 });

  const noseCentroid = centroid([...(points.noseBridge || []), ...(points.noseBottom || [])]);
  set('nose', noseCentroid);

  const chinCentroid = bottomCentroid(points.faceContour || [], 0.12)
    ?? (points.mouthBottom ? { x: points.mouthBottom.x, y: points.mouthBottom.y + faceBoxPx.height * 0.14 } : null);
  set('chin', chinCentroid);

  set('jawline', bottomCentroid(points.faceContour || [], 0.28));

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
  const swapLR = !mirrored;
  set('cheekL', (swapLR ? points.rightCheek : points.leftCheek) ?? null);
  set('cheekR', (swapLR ? points.leftCheek : points.rightCheek) ?? null);

  const underEyeOffset = faceBoxPx.height * 0.09;
  const leftEyeC = centroid((swapLR ? points.rightEye : points.leftEye) || []);
  if (leftEyeC) set('underEyeL', { x: leftEyeC.x, y: leftEyeC.y + underEyeOffset });
  const rightEyeC = centroid((swapLR ? points.leftEye : points.rightEye) || []);
  if (rightEyeC) set('underEyeR', { x: rightEyeC.x, y: rightEyeC.y + underEyeOffset });

  return out;
}

export interface ZoneNotes {
  forehead?: string; nose?: string; chin?: string;
  cheekL?: string; cheekR?: string;
  underEyeL?: string; underEyeR?: string;
  jawline?: string;
  tZone?: string; cheeks?: string; underEye?: string;
}

export interface ZoneMarker {
  key: string;
  label: string;
  note: string;
  rect: FaceBox;
  align: 'left' | 'right' | 'center';
  // True when `rect` came from this scan's own real landmark geometry
  // (deriveZoneMarkers, persisted as SkinScan.zoneMarkers) rather than the
  // ZONE_RECTS proportion estimate — not currently shown in the UI, but a
  // cheap, honest signal to have on hand rather than needing to re-derive
  // it later (e.g. for a future "estimated position" affordance).
  anchored: boolean;
}

// Already-persisted, landmark-derived rects for THIS scan (SkinScan.
// zoneMarkers — 0-1 fractions of the full photo, same space as faceBox
// itself) — null/undefined for a scan captured before this existed, or
// where the client's contour pass didn't yield usable geometry, in which
// case every zone falls back to the ZONE_RECTS estimate below exactly as
// it always has.
export type StoredZoneMarkers = Partial<Record<ZoneKey, FaceBox>>;

// Single source for "which zones does this scan have something to point
// at, and where" — SkinZoneOverlay (the tappable photo markers) and
// SkinScanResultScreen (the list underneath, which also wants the flagged/
// clear split for ALL 8 zones, not just the flagged ones) both build off
// this instead of each re-deriving it, so the two views can never drift
// out of sync with each other.
export function buildZoneMarkers(zoneNotes: ZoneNotes | undefined, faceBox: FaceBox, storedMarkers?: StoredZoneMarkers | null): ZoneMarker[] {
  const isGranular = ZONE_META.some(z => !!zoneNotes?.[z.key]);
  if (isGranular) {
    return ZONE_META
      .filter(z => !!zoneNotes?.[z.key])
      .map(z => {
        const anchoredRect = storedMarkers?.[z.key];
        return {
          key: z.key,
          label: z.label,
          note: zoneNotes![z.key]!,
          rect: anchoredRect ?? zoneRectToPhotoFrac(z.key, faceBox),
          align: z.align,
          anchored: !!anchoredRect,
        };
      });
  }
  const markers: ZoneMarker[] = [];
  if (zoneNotes?.tZone) {
    markers.push({ key: 'tZone', label: 'T-zone', note: zoneNotes.tZone, rect: legacyZoneRectToPhotoFrac('tZone', faceBox), align: 'center', anchored: false });
  }
  if (zoneNotes?.cheeks) {
    markers.push({ key: 'cheekL', label: 'Cheeks', note: zoneNotes.cheeks, rect: legacyZoneRectToPhotoFrac('cheekL', faceBox), align: 'left', anchored: false });
    markers.push({ key: 'cheekR', label: 'Cheeks', note: zoneNotes.cheeks, rect: legacyZoneRectToPhotoFrac('cheekR', faceBox), align: 'right', anchored: false });
  }
  if (zoneNotes?.underEye) {
    markers.push({ key: 'underEye', label: 'Under-eye', note: zoneNotes.underEye, rect: legacyZoneRectToPhotoFrac('underEye', faceBox), align: 'center', anchored: false });
  }
  return markers;
}
