package expo.modules.skinsegmentation

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.SegmentationMask
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

// Real per-photo segmentation for the post-capture step ONLY — plain Kotlin
// against ML Kit's native Selfie Segmentation SDK (com.google.mlkit:
// segmentation-selfie, see this module's build.gradle), NOT the JS-bridged
// package (react-native-vision-camera-face-detector) already used
// elsewhere in this app for live face detection, and NOT the live frame
// processor Part 2 needs — this decodes an already-captured photo file,
// same shape of problem as iOS's Vision-framework module beside it.
// SINGLE_IMAGE_MODE (not STREAM_MODE) — this is one static photo, not a
// video stream; STREAM_MODE's frame-to-frame smoothing has nothing to
// smooth against here and would only add irrelevant per-call state.
//
// NOT verified against a real device or an Android/Kotlin/Gradle
// toolchain — this environment has neither (confirmed: no gradle/adb/
// kotlinc anywhere). Written against Google's documented ML Kit Selfie
// Segmentation API surface; the first real EAS build is this code's
// actual first compile.
class SkinSegmentationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SkinSegmentation")

    AsyncFunction("getSkinSegmentation") { uri: String ->
      val bitmap = decodeBitmap(uri)
        ?: throw Exception("Could not load photo at $uri")

      val segmenter = Segmentation.getClient(
        SelfieSegmenterOptions.Builder()
          .setDetectorMode(SelfieSegmenterOptions.SINGLE_IMAGE_MODE)
          .build()
      )
      val inputImage = InputImage.fromBitmap(bitmap, 0)
      val mask: SegmentationMask = try {
        Tasks.await(segmenter.process(inputImage))
      } finally {
        segmenter.close()
      }

      val (maskBase64, personDetected) = encodeMaskAsPng(mask)

      mapOf(
        "personDetected" to personDetected,
        "maskBase64" to if (personDetected) maskBase64 else null,
        "maskWidth" to if (personDetected) mask.width else 0,
        "maskHeight" to if (personDetected) mask.height else 0,
        // Android's new module here is segmentation-only (see file header)
        // — face landmarks already come from the existing ML Kit-based
        // pipeline (react-native-vision-camera-face-detector) this app
        // already runs on both platforms, unchanged by this module.
        "faceLandmarks" to null
      )
    }
  }

  private fun decodeBitmap(uri: String): Bitmap? {
    return if (uri.startsWith("content://")) {
      val stream = appContext?.reactContext?.contentResolver?.openInputStream(Uri.parse(uri))
      stream?.use { BitmapFactory.decodeStream(it) }
    } else {
      val path = if (uri.startsWith("file://")) uri.removePrefix("file://") else uri
      BitmapFactory.decodeFile(path)
    }
  }

  // Unlike Vision framework's VNGeneratePersonSegmentationRequest — which
  // returns ZERO results for a photo with no person at all, a real, direct
  // "nothing found" signal from the SDK itself (see the iOS module's own
  // comment) — ML Kit's Selfie Segmenter has no such signal: it ALWAYS
  // returns a full mask, just one that reads low-confidence everywhere when
  // there's genuinely no person. personDetected here is therefore a
  // DERIVED heuristic, not a native guarantee: true only when a real
  // fraction of the mask is confidently person (>0.5 confidence over at
  // least 5% of pixels) — mirrors this app's own established "a genuine
  // miss is real signal, don't guess" convention (see detectFaceRegion,
  // SkinScanCamera.tsx) applied to a platform that doesn't hand you that
  // signal directly.
  private fun encodeMaskAsPng(mask: SegmentationMask): Pair<String, Boolean> {
    val width = mask.width
    val height = mask.height
    val buffer = mask.buffer // ByteBuffer of little-endian floats, one per pixel, 0f-1f confidence
    buffer.rewind()

    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val pixels = IntArray(width * height)
    var confidentPixels = 0
    for (i in 0 until width * height) {
      val confidence = buffer.float // 0.0 (background) .. 1.0 (person)
      val gray = (confidence * 255).toInt().coerceIn(0, 255)
      if (confidence > 0.5f) confidentPixels++
      pixels[i] = Color.rgb(gray, gray, gray)
    }
    bitmap.setPixels(pixels, 0, width, 0, 0, width, height)

    val personDetected = confidentPixels.toFloat() / (width * height).toFloat() > 0.05f

    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    bitmap.recycle()
    val base64 = android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
    return Pair(base64, personDetected)
  }
}
