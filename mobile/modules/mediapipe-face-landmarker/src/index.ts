import { NitroModules } from 'react-native-nitro-modules';
import type { GlowFaceLandmarker, DetectedFace } from './specs/GlowFaceLandmarker.nitro';

export type { DetectedFace, DetectedFaceBounds } from './specs/GlowFaceLandmarker.nitro';

// One shared native instance — matches the OCR-plus reference's own
// createTextRecognitionPlugin pattern (a HybridObject constructed once,
// reused across frames), rather than one per render.
let landmarker: GlowFaceLandmarker | null = null;
function getLandmarker(): GlowFaceLandmarker {
  if (!landmarker) {
    landmarker = NitroModules.createHybridObject<GlowFaceLandmarker>('GlowFaceLandmarker');
  }
  return landmarker;
}

// The per-frame call this module exists for. Deliberately a plain function,
// not a React hook — SkinScanCamera.tsx's own MediaPipeFaceLandmarkerSensor
// (that file, not here — see this project's own scope report for why the
// live-camera wiring stays there rather than a <Camera> wrapper this module
// would own, unlike the OCR-plus reference's own Camera.tsx) calls this
// directly inside its onFrame worklet, the same "call the HybridObject
// directly, no wrapper" pattern that reference uses (HybridObjects are JSI
// HostObjects — worklet-safe, callable synchronously off the JS thread).
export function detectFacesInFrame(nativeBufferPointer: bigint, orientation: string): DetectedFace[] {
  'worklet';
  return getLandmarker().detectFrame(nativeBufferPointer, orientation);
}
