import { NativeModule, requireNativeModule } from 'expo';
import type { SkinSegmentationResult } from './SkinSegmentation.types';

declare class SkinSegmentationModule extends NativeModule<{}> {
  // `uri` is a plain filesystem path or file:// URI to the ALREADY-CAPTURED
  // photo (the same file shot()/detectFaceRegion already work with in
  // SkinScanCamera.tsx) — this module never touches the live camera feed.
  // Runs VNGeneratePersonSegmentationRequest (+ VNDetectFaceLandmarksRequest
  // on iOS) or ML Kit's native Selfie Segmentation SDK (Android) at full
  // accuracy, once, on this one photo — no live-performance budget the way
  // Part 2's frame processor has.
  getSkinSegmentation(uri: string): Promise<SkinSegmentationResult>;
}

export default requireNativeModule<SkinSegmentationModule>('SkinSegmentation');
