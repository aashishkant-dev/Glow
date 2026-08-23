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
