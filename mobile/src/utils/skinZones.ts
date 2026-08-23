/**
 * Shared zone geometry — the T-zone/cheeks/under-eye sub-rects used both by
 * SkinZoneOverlay (labeled, tappable markers on a finished result photo) and
 * SkinScanCamera's live preview (unlabeled real-time guide lines while
 * framing the shot). One definition so the two never drift apart — a
 * mismatch would mean the live guide points at a different spot than the
 * markers the result screen ends up showing for the exact same face.
 *
 * Standard portrait-proportion estimates WITHIN a face box, not per-feature
 * detection — good enough to visually "point at" the right area, not a
 * precision medical measurement.
 */

export type FaceBox = { x: number; y: number; width: number; height: number };
export type ZoneKey = 'tZone' | 'cheekL' | 'cheekR' | 'underEye';

// Mirrors DEFAULT_REGION in src/routes/skin.js.
export const DEFAULT_FACE_BOX: FaceBox = { x: 0.22, y: 0.16, width: 0.56, height: 0.6 };

// Fractions OF the face box (not the full photo).
export const ZONE_RECTS: Record<ZoneKey, FaceBox> = {
  tZone:    { x: 0.30, y: 0.03, width: 0.40, height: 0.58 },
  cheekL:   { x: 0.04, y: 0.42, width: 0.30, height: 0.30 },
  cheekR:   { x: 0.66, y: 0.42, width: 0.30, height: 0.30 },
  underEye: { x: 0.20, y: 0.30, width: 0.60, height: 0.11 },
};

export function zoneRectToPhotoFrac(zone: ZoneKey, faceBox: FaceBox): FaceBox {
  const r = ZONE_RECTS[zone];
  return {
    x: faceBox.x + r.x * faceBox.width,
    y: faceBox.y + r.y * faceBox.height,
    width: r.width * faceBox.width,
    height: r.height * faceBox.height,
  };
}

export function resolveFaceBox(raw?: { x?: number; y?: number; width?: number; height?: number } | null): FaceBox {
  return raw?.width && raw?.height
    ? { x: raw.x ?? DEFAULT_FACE_BOX.x, y: raw.y ?? DEFAULT_FACE_BOX.y, width: raw.width, height: raw.height }
    : DEFAULT_FACE_BOX;
}
