// Shared shape both platforms return — the call site (SkinScanCamera.tsx)
// never branches on Platform.OS to read this. A 2D point in an unspecified
// but consistent normalized space: 0-1 fractions of the SOURCE PHOTO (not
// the mask bitmap, which can be a different resolution) — same convention
// SkinScanCamera.tsx's existing detectFaceRegion/skinZones.ts already use
// for faceRegion/zoneMarkers, so nothing downstream has to learn a second
// coordinate convention.
export type FacePoint = { x: number; y: number };

// Named regions matching Vision framework's own VNFaceLandmarks2D groups —
// iOS-only (see SkinSegmentationResult.faceLandmarks below for why).
export interface FaceLandmarks {
  faceContour: FacePoint[];
  leftEye: FacePoint[];
  rightEye: FacePoint[];
  leftEyebrow: FacePoint[];
  rightEyebrow: FacePoint[];
  nose: FacePoint[];
  outerLips: FacePoint[];
  innerLips: FacePoint[];
}

export interface SkinSegmentationResult {
  // False when no person/face was found at all — maskBase64 is null in that
  // case, never a guessed/empty mask standing in for "nothing detected."
  personDetected: boolean;
  // A grayscale PNG, base64-encoded, no data: prefix — one byte per pixel,
  // 255 = confidently person/skin, 0 = confidently background, values in
  // between are the source SDK's own confidence gradient (both Vision's
  // segmentation output and ML Kit's SegmentationMask are already
  // continuous-confidence, not a hard binary mask, so this preserves that
  // rather than thresholding it away here and losing information a
  // consumer might want). null when personDetected is false.
  maskBase64: string | null;
  // The mask's OWN pixel dimensions — not necessarily the same as the
  // source photo's (Vision/ML Kit's segmentation output resolution is
  // model-determined, not configurable to match input size 1:1). A
  // consumer must scale by (photoWidth/maskWidth, photoHeight/maskHeight)
  // to map a mask pixel onto the source photo — same "never assume,
  // measure" lesson this file's own SkinScanCamera.tsx neighbor already
  // learned the hard way for photo.width/height vs. the saved file's real
  // dimensions (see that file's getImageSize comment).
  maskWidth: number;
  maskHeight: number;
  // iOS only. Vision framework's VNDetectFaceLandmarksRequest runs in the
  // same pass as segmentation (one photo decode, one VNImageRequestHandler),
  // so it's free to also return here — but this is NOT what currently
  // drives zone placement in skinZones.ts (that stays on the existing
  // ML Kit-based live/post-capture detector, both platforms, unchanged).
  // Undefined on Android, where the new native module here is
  // segmentation-only (ML Kit's Selfie Segmentation SDK has no landmark
  // output of its own — Android's landmarks already come from the existing
  // react-native-vision-camera-face-detector pipeline, which this module
  // doesn't touch or duplicate).
  faceLandmarks?: FaceLandmarks;
}
