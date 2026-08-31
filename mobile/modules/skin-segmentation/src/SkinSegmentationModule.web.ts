import { registerWebModule, NativeModule } from 'expo';
import type { SkinSegmentationResult } from './SkinSegmentation.types';

// No web implementation — Vision framework and ML Kit's native segmentation
// SDK are both native-only. Matches SkinScanCamera.web.tsx's own established
// pattern for this exact situation (that file's own header comment covers
// why): throw a clear, honest error rather than returning a fabricated
// empty/false result a caller could mistake for "genuinely ran and found
// nothing." The real call site (SkinScanCamera.tsx) is native-only already
// (SkinScanCamera.web.tsx never renders a camera at all on web), so this
// path should never actually be reached in practice — this exists so an
// accidental web call fails loudly instead of silently.
class SkinSegmentationModule extends NativeModule<{}> {
  async getSkinSegmentation(_uri: string): Promise<SkinSegmentationResult> {
    throw new Error('SkinSegmentation is not available on web.');
  }
}

export default registerWebModule(SkinSegmentationModule, 'SkinSegmentationModule');
