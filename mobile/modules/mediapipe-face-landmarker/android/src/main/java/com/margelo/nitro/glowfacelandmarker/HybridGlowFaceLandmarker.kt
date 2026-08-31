package com.margelo.nitro.glowfacelandmarker

import android.graphics.Bitmap
import android.util.Log
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Android Nitro HybridObject wrapping MediaPipe's Face Landmarker Tasks
 * Vision SDK as a live vision-camera frame processor — the Android
 * counterpart to HybridGlowFaceLandmarker.swift (iOS). Output reduced to
 * the exact same DetectedFace shape for the exact same reason: so
 * SkinScanCamera.tsx's existing gating math needs zero changes regardless
 * of which detector produced it — see GlowFaceLandmarker.nitro.ts's own
 * header comment.
 *
 * GROUNDING for the native-buffer piece specifically (the part built this
 * round, with extra care per explicit instruction): the
 * nativeCreateBitmapFromHardwareBuffer external fun below is implemented in
 * HybridGlowFaceLandmarker.cpp, itself a close adaptation of
 * react-native-vision-camera-ocr-plus's own real, working
 * HybridTextRecognizer.cpp — see that file's own header for the full
 * grounding, caveats, and the one deliberate defensive change made here
 * (always materializing a plain software bitmap, never handing a
 * HARDWARE-config one across the JNI boundary).
 *
 * NOT verified against a real device, a real Kotlin/NDK/Gradle build, or
 * even a syntax check — this environment has none of those (see this
 * project's own scope report). Written against MediaPipe's documented
 * Android Tasks Vision API surface. The facial transformation matrix
 * decomposition below carries the SAME flagged uncertainty as its iOS
 * counterpart (see that comment) — not verified against the real Android
 * API's exact matrix type/convention.
 */
@DoNotStrip
@Keep
class HybridGlowFaceLandmarker : HybridGlowFaceLandmarkerSpec() {

  // Implemented in HybridGlowFaceLandmarker.cpp — see this class's own
  // header for the grounding. Returns null on any native-side failure
  // (buffer lock failed, GPU path unavailable below API 31, etc.) —
  // detectFrame below treats that identically to "no face this frame,"
  // same as every other soft-failure path in this module.
  @DoNotStrip
  @Keep
  private external fun nativeCreateBitmapFromHardwareBuffer(pointer: Long): Bitmap?

  companion object {
    init {
      // Matches CMakeLists.txt's PACKAGE_NAME / add_library(...) name —
      // already loaded once via NitroGlowFaceLandmarkerOnLoad in the
      // ordinary autolinking path, this is the same defensive fallback
      // pattern the OCR-plus reference uses for its own equivalent load.
      try { System.loadLibrary("NitroGlowFaceLandmarker") } catch (_: UnsatisfiedLinkError) {}
    }
    private const val TAG = "GlowFaceLandmarker"
    // MediaPipe Face Mesh's own stable, documented canonical landmark
    // indices for the outer eye corners — identical topology/ordering on
    // iOS and Android (same underlying model), so this is the exact same,
    // real justification HybridGlowFaceLandmarker.swift's own roll
    // computation already relies on, not re-derived or guessed separately
    // here.
    private const val RIGHT_EYE_OUTER = 33
    private const val LEFT_EYE_OUTER = 263
  }

  private var landmarker: FaceLandmarker? = null
  private val isBusy = AtomicBoolean(false)
  @Volatile private var lastResult: Array<DetectedFace> = emptyArray()

  init {
    setupLandmarker()
  }

  private fun setupLandmarker() {
    val context = getApplicationContextOrNull()
    if (context == null) {
      Log.e(TAG, "No application context available — detection will return no faces")
      return
    }
    try {
      val baseOptions = BaseOptions.builder()
        // Loaded from this module's own bundled asset (see build.gradle's
        // own comment on how src/main/assets/face_landmarker.task merges
        // into the final app's assets) — resolved through the app's
        // AssetManager via this asset-relative path, not a filesystem path.
        .setModelAssetPath("face_landmarker.task")
        .build()
      val options = FaceLandmarker.FaceLandmarkerOptions.builder()
        .setBaseOptions(baseOptions)
        .setRunningMode(RunningMode.LIVE_STREAM)
        .setNumFaces(1) // only the primary/largest face — same as iOS
        // Same bug caught in self-review on the iOS side (see that file's
        // own comment) — defaults false; without it,
        // result.facialTransformationMatrixes() is always empty/absent and
        // pitch/yaw silently reads 0 forever.
        .setOutputFacialTransformationMatrixes(true)
        .setResultListener(this::onResult)
        .setErrorListener { error -> Log.e(TAG, "FaceLandmarker error: ${error.message}") }
        .build()
      landmarker = FaceLandmarker.createFromOptions(context, options)
    } catch (e: Exception) {
      // Same "fails to empty, never crashes the screen" contract as every
      // other native-piece-not-linked-yet case in this app (LightingSensor's
      // own ErrorBoundary is the JS-side equivalent of this same
      // philosophy) — detectFrame below simply returns emptyArray()
      // forever if this happens.
      Log.e(TAG, "FaceLandmarker failed to initialize: ${e.message}")
      landmarker = null
    }
  }

  // MARK: - HybridGlowFaceLandmarkerSpec

  override fun detectFrame(nativeBufferPointer: ULong, orientation: String): Array<DetectedFace> {
    val landmarker = this.landmarker ?: return emptyArray()

    // Never blocks the frame thread on MediaPipe inference — same
    // non-blocking isBusy/lastResult contract as the iOS side and the
    // OCR-plus reference's own scanFrame.
    if (isBusy.get()) return lastResult

    val bitmap = nativeCreateBitmapFromHardwareBuffer(nativeBufferPointer.toLong())
      ?: return lastResult // native conversion failed — see HybridGlowFaceLandmarker.cpp's own header for why this can legitimately happen (pixelFormat, API level)

    isBusy.set(true)
    try {
      val mpImage: MPImage = BitmapImageBuilder(bitmap).build()
      val timestampMs = System.currentTimeMillis()
      landmarker.detectAsync(mpImage, timestampMs)
      // detectAsync takes ownership of / retains what it needs from mpImage
      // internally (MediaPipe's own documented contract for LIVE_STREAM
      // mode) — the underlying bitmap is safe to let go of on this side
      // once this call returns; onResult below is where the actual
      // detection result — and any further reference to the frame's
      // pixel data — is handled.
    } catch (e: Exception) {
      isBusy.set(false)
      Log.e(TAG, "detectAsync submission failed: ${e.message}")
    }
    return lastResult
  }

  // MARK: - MediaPipe result listener

  private fun onResult(result: FaceLandmarkerResult, input: MPImage) {
    try {
      val allLandmarks = result.faceLandmarks()
      if (allLandmarks.isEmpty()) {
        lastResult = emptyArray()
        return
      }

      // Largest face wins — same convention as iOS.
      var biggestIndex = 0
      var biggestArea = -1f
      for (i in allLandmarks.indices) {
        val (w, h) = boundingSize(allLandmarks[i])
        val area = w * h
        if (area > biggestArea) { biggestArea = area; biggestIndex = i }
      }
      val landmarks = allLandmarks[biggestIndex]
      val bounds = boundingBox(landmarks)

      // Roll: same simple, well-understood 2D atan2 on two known eye
      // landmarks as iOS — the one angle in this module with real
      // confidence behind it (see this class's own header).
      val rightEye = landmarks[RIGHT_EYE_OUTER]
      val leftEye = landmarks[LEFT_EYE_OUTER]
      val rollRadians = Math.atan2(
        (leftEye.y() - rightEye.y()).toDouble(),
        (leftEye.x() - rightEye.x()).toDouble()
      )
      val rollDegrees = Math.toDegrees(rollRadians)

      // Pitch/yaw: same UNVERIFIED transformation-matrix decomposition
      // approach as iOS, with the same explicit low-confidence flag — see
      // HybridGlowFaceLandmarker.swift's own comment on this exact
      // tradeoff. Android's FaceLandmarkerResult.facialTransformationMatrixes()
      // returns Optional<MutableList<FloatArray>> per MediaPipe's
      // documented Android API — each FloatArray a 16-element row-major
      // 4x4 matrix. UNVERIFIED against the real installed library version;
      // wrapped defensively so a shape mismatch degrades to 0.0 (reads as
      // "straight") rather than an out-of-bounds crash or garbage value.
      var pitchDegrees = 0.0
      var yawDegrees = 0.0
      val matrices = result.facialTransformationMatrixes()
      if (matrices.isPresent && matrices.get().isNotEmpty()) {
        val m = matrices.get()[0]
        if (m.size >= 16) {
          // Row-major 4x4: m[8..11] is the third row (Z basis vector) in
          // this indexing convention — same standard R = Rz*Ry*Rx
          // extraction as iOS, same convention-uncertainty caveat.
          val m20 = m[8]; val m21 = m[9]; val m22 = m[10]
          pitchDegrees = Math.toDegrees(Math.atan2((-m21).toDouble(), Math.sqrt((m20 * m20 + m22 * m22).toDouble())))
          yawDegrees = Math.toDegrees(Math.atan2(m20.toDouble(), m22.toDouble()))
        }
      }

      lastResult = arrayOf(
        DetectedFace(
          bounds = bounds,
          pitchAngle = pitchDegrees,
          rollAngle = rollDegrees,
          yawAngle = yawDegrees
        )
      )
    } catch (e: Exception) {
      Log.e(TAG, "onResult processing failed: ${e.message}")
      lastResult = emptyArray()
    } finally {
      isBusy.set(false)
    }
  }

  // Copied verbatim (structure and reasoning) from the OCR-plus reference's
  // own getApplicationContextOrNull — Nitro HybridObjects have no
  // constructor-injected Context the way an Expo Module does (see this
  // module's own skin-segmentation sibling, which gets one via
  // appContext?.reactContext), so this reflects into
  // android.app.ActivityThread.currentApplication() the same way that
  // reference does for the identical problem. Grounded in real, working
  // code, not invented here.
  private fun getApplicationContextOrNull(): android.content.Context? {
    return try {
      val activityThread = Class.forName("android.app.ActivityThread")
      val currentApplicationMethod = activityThread.getMethod("currentApplication")
      currentApplicationMethod.invoke(null) as? android.app.Application
    } catch (_: Exception) {
      null
    }
  }

  private fun boundingSize(landmarks: List<com.google.mediapipe.tasks.components.containers.NormalizedLandmark>): Pair<Float, Float> {
    var minX = 1f; var minY = 1f; var maxX = 0f; var maxY = 0f
    for (p in landmarks) {
      if (p.x() < minX) minX = p.x()
      if (p.x() > maxX) maxX = p.x()
      if (p.y() < minY) minY = p.y()
      if (p.y() > maxY) maxY = p.y()
    }
    return Pair(maxX - minX, maxY - minY)
  }

  private fun boundingBox(landmarks: List<com.google.mediapipe.tasks.components.containers.NormalizedLandmark>): DetectedFaceBounds {
    var minX = 1f; var minY = 1f; var maxX = 0f; var maxY = 0f
    for (p in landmarks) {
      if (p.x() < minX) minX = p.x()
      if (p.x() > maxX) maxX = p.x()
      if (p.y() < minY) minY = p.y()
      if (p.y() > maxY) maxY = p.y()
    }
    return DetectedFaceBounds(
      x = minX.toDouble(), y = minY.toDouble(),
      width = (maxX - minX).toDouble(), height = (maxY - minY).toDouble()
    )
  }
}
