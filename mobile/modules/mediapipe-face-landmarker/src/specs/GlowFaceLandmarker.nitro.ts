import type { HybridObject, UInt64 } from 'react-native-nitro-modules';

// Deliberately the SAME shape as react-native-vision-camera-face-detector's
// own `Face` type (bounds + Euler angles) — see this module's own header
// comment in ios/HybridGlowFaceLandmarker.swift for how MediaPipe's actual
// 478-point output gets reduced to this on the native side. This is what
// makes the swap a detector swap, not a gating-system redesign:
// SkinScanCamera.tsx's positionGate/angleGate/lightingGate math (sizeRatio,
// centerOffsetX/Y, maxTilt vs PITCH_GATE_DEG) reads this exact shape
// already, unchanged, regardless of which detector produced it.
export interface DetectedFaceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  bounds: DetectedFaceBounds;
  pitchAngle: number;
  rollAngle: number;
  yawAngle: number;
}

/**
 * Nitro HybridObject wrapping MediaPipe's Face Landmarker Tasks Vision SDK
 * as a live vision-camera frame processor. Mirrors
 * react-native-vision-camera-ocr-plus's real, working v5/Nitro pattern
 * (confirmed against its actual source — see this project's own commit
 * history for that research) for the non-blocking frame call: detectFrame
 * never blocks the frame thread on inference — it enqueues MediaPipe work
 * asynchronously and returns the last COMPLETED result immediately, same
 * "isBusy/lastResult" shape as that reference's scanFrame.
 */
export interface GlowFaceLandmarker extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  /**
   * Detect faces in a live camera frame. Non-blocking: returns the most
   * recently completed MediaPipe result, not necessarily from THIS exact
   * frame — same tradeoff the existing ML Kit live detector already makes
   * implicitly (its own per-frame latency), made explicit here.
   *
   * On iOS the pointer is a CVPixelBufferRef with retain count +1; callers
   * must release the NativeBuffer after this call (see Camera.tsx's own
   * nb.release() pattern for the exact same reason on the OCR-plus
   * reference this is modeled on).
   */
  detectFrame(nativeBufferPointer: UInt64, orientation: string): DetectedFace[];
}
