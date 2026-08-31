/**
 * HybridGlowFaceLandmarker.cpp
 *
 * JNI helper that converts an AHardwareBuffer (passed as a jlong pointer from
 * VisionCamera's frame.getNativeBuffer()) into an android.graphics.Bitmap so
 * MediaPipe's FaceLandmarker can run on it.
 *
 * GROUNDING: this is a close adaptation of
 * react-native-vision-camera-ocr-plus's own real, actively-maintained
 * HybridTextRecognizer.cpp (confirmed via that project's public GitHub
 * repo — same v5/Nitro/AHardwareBuffer problem, solved there for ML Kit
 * OCR instead of MediaPipe). The lock/unlock discipline, the CPU-vs-GPU
 * fallback structure, and the JNI local-ref cleanup pattern below are
 * carried over from that real, working implementation rather than
 * reinvented — see each function's own comment for exactly what changed
 * and why.
 *
 * ONE deliberate, extra-defensive change from that reference, per explicit
 * instruction on this specific piece (a mistake here crashes the app, not
 * just produces a wrong number): the reference returns a HARDWARE-config
 * Bitmap as-is from the GPU path (ML Kit's InputImage.fromBitmap() accepts
 * that directly). This module does NOT do that — see
 * createBitmapViaHardwarePath's own comment below for why a HARDWARE
 * bitmap is a real, additional risk surface this implementation avoids
 * entirely by always producing an ordinary software ARGB_8888 bitmap
 * before returning to Kotlin, at a real but bounded extra-copy cost.
 *
 * KNOWN, DOCUMENTED GOTCHA carried over directly from the reference
 * (confirmed load-bearing, not just a comment there): VisionCamera v5
 * delivers GPU-only AHardwareBuffers (ImageFormat.PRIVATE) by default. The
 * CPU-lock path below only ever succeeds if the frame output was created
 * with pixelFormat='rgb' (see MediaPipeFaceLandmarkerSensor's own comment
 * in SkinScanCamera.tsx) — without that, EVERY frame silently falls
 * through to the GPU path, which itself requires Android API 31+
 * (Bitmap.wrapHardwareBuffer). This is the single most load-bearing fact
 * in this whole file — verify pixelFormat is actually 'rgb' on Android
 * before assuming the CPU path is even being exercised on a real device.
 *
 * NOT verified against a real device, a real NDK/CMake build, or even a
 * syntax check — this environment has none of those (no gradle/adb/
 * kotlinc/clang toolchain at all — see this project's own scope report).
 * Written against Android's documented AHardwareBuffer/AndroidBitmap NDK
 * APIs and this real reference implementation, which is the highest-
 * confidence grounding available without a device — but still genuinely
 * less certain than the rest of this project's work. See the honest
 * confidence assessment in this project's own scope report; this is the
 * one piece in the whole MediaPipe swap I'd call out as "I'm not fully
 * confident," not just "unverified because no device."
 */

#include <jni.h>
#include <android/hardware_buffer.h>
#include <android/hardware_buffer_jni.h>
#include <android/bitmap.h>
#include <android/log.h>
#include <cstring>

#define TAG "HybridGlowFaceLandmarker"

// ---------------------------------------------------------------------------
// Helper: given ANY jobject Bitmap (software OR HARDWARE-config), returns a
// definite, ordinary ARGB_8888 software copy — Bitmap.copy() is Android's
// own documented, safe way to materialize a HARDWARE bitmap into pixels
// (confirmed against the real reference's Kotlin-side equivalent,
// copyToSoftwareBitmap, which does the identical thing one layer up in
// Kotlin rather than here in C++ — done here instead, at the JNI boundary,
// so EVERY path below (CPU lock AND GPU wrap) funnels through the exact
// same, single "materialize to software" step rather than two separate
// call sites that could drift out of sync). This IS the extra-defensive
// choice made for this specific piece: the reference hands a HARDWARE
// bitmap straight to ML Kit (which documents that it accepts one); this
// module does not assume MediaPipe's Android API has the same guarantee
// (unverified — no device, no docs excerpt confirming it), so it never
// hands anything but a plain, unambiguous software bitmap across the
// JNI→Kotlin boundary at all. Slightly more copying, zero uncertainty
// about what MediaPipe receives.
static jobject toSoftwareCopy(JNIEnv* env, jobject bitmap) {
  if (!bitmap) return nullptr;
  jclass bitmapClass = env->FindClass("android/graphics/Bitmap");
  jclass configClass = env->FindClass("android/graphics/Bitmap$Config");
  jfieldID argbField = env->GetStaticFieldID(configClass, "ARGB_8888", "Landroid/graphics/Bitmap$Config;");
  jobject argbConfig = env->GetStaticObjectField(configClass, argbField);
  jmethodID copyMid = env->GetMethodID(bitmapClass, "copy",
      "(Landroid/graphics/Bitmap$Config;Z)Landroid/graphics/Bitmap;");
  jobject softwareCopy = env->CallObjectMethod(bitmap, copyMid, argbConfig, JNI_FALSE);
  env->DeleteLocalRef(configClass);
  env->DeleteLocalRef(bitmapClass);
  env->DeleteLocalRef(bitmap);
  if (!softwareCopy) {
    __android_log_print(ANDROID_LOG_ERROR, TAG, "Bitmap.copy(ARGB_8888) failed");
  }
  return softwareCopy;
}

// ---------------------------------------------------------------------------
// Helper: GPU path — Bitmap.wrapHardwareBuffer(hardwareBuffer, null), then
// immediately materialized to a software copy (see toSoftwareCopy above).
// Requires API 31+. Same structure as the reference's own
// createBitmapViaHardwarePath, minus the "return the HARDWARE bitmap
// as-is" step it takes (deliberately not carried over — see this file's
// own header).
// ---------------------------------------------------------------------------
static jobject createBitmapViaHardwarePath(JNIEnv* env, AHardwareBuffer* ahb) {
  jobject hardwareBuffer = AHardwareBuffer_toHardwareBuffer(env, ahb);
  if (!hardwareBuffer) {
    __android_log_print(ANDROID_LOG_ERROR, TAG, "AHardwareBuffer_toHardwareBuffer failed");
    return nullptr;
  }

  jclass bitmapClass = env->FindClass("android/graphics/Bitmap");
  if (!bitmapClass) {
    env->DeleteLocalRef(hardwareBuffer);
    return nullptr;
  }

  jmethodID wrapMid = env->GetStaticMethodID(bitmapClass, "wrapHardwareBuffer",
      "(Landroid/hardware/HardwareBuffer;Landroid/graphics/ColorSpace;)Landroid/graphics/Bitmap;");
  if (!wrapMid) {
    env->ExceptionClear();
    env->DeleteLocalRef(bitmapClass);
    env->DeleteLocalRef(hardwareBuffer);
    __android_log_print(ANDROID_LOG_WARN, TAG, "Bitmap.wrapHardwareBuffer not available (requires API 31+).");
    return nullptr;
  }

  jobject hwBitmap = env->CallStaticObjectMethod(bitmapClass, wrapMid, hardwareBuffer, nullptr /*colorSpace*/);
  env->DeleteLocalRef(bitmapClass);
  env->DeleteLocalRef(hardwareBuffer);

  if (!hwBitmap) {
    __android_log_print(ANDROID_LOG_ERROR, TAG, "Bitmap.wrapHardwareBuffer returned null");
    return nullptr;
  }
  // Materialize immediately — see toSoftwareCopy's own comment for why this
  // module never hands a HARDWARE-config bitmap across the JNI boundary.
  return toSoftwareCopy(env, hwBitmap);
}

// ---------------------------------------------------------------------------
// Helper: CPU path — AHardwareBuffer_lock + memcpy into a fresh software
// Bitmap. Only valid when the buffer was allocated with CPU_READ usage
// (pixelFormat='rgb' on the JS side — see this file's own header). Lock/
// unlock pairing and JNI local-ref cleanup copied structurally from the
// real reference, including its defensive early-unlock on every failure
// path (a lock left unreleased on an early return is exactly the kind of
// mistake that reads fine in review and hangs/crashes the NEXT frame's
// attempt to use the same buffer).
// ---------------------------------------------------------------------------
static jobject createBitmapViaCpuLock(JNIEnv* env, AHardwareBuffer* ahb,
                                       int32_t width, int32_t height,
                                       uint32_t stridePixels) {
  void* data = nullptr;
  int ret = AHardwareBuffer_lock(ahb, AHARDWAREBUFFER_USAGE_CPU_READ_RARELY, -1, nullptr, &data);
  if (ret != 0 || data == nullptr) {
    __android_log_print(ANDROID_LOG_WARN, TAG,
        "AHardwareBuffer_lock failed (ret=%d), falling back to hardware bitmap path", ret);
    return nullptr; // Caller tries the GPU path — no lock was taken, nothing to unlock.
  }

  jclass bitmapClass = env->FindClass("android/graphics/Bitmap");
  jclass configClass = env->FindClass("android/graphics/Bitmap$Config");
  jfieldID argbField = env->GetStaticFieldID(configClass, "ARGB_8888", "Landroid/graphics/Bitmap$Config;");
  jobject argbConfig = env->GetStaticObjectField(configClass, argbField);
  jmethodID createBitmapMid = env->GetStaticMethodID(bitmapClass, "createBitmap",
      "(IILandroid/graphics/Bitmap$Config;)Landroid/graphics/Bitmap;");
  env->DeleteLocalRef(configClass);

  jobject bitmap = env->CallStaticObjectMethod(bitmapClass, createBitmapMid, width, height, argbConfig);
  if (!bitmap) {
    AHardwareBuffer_unlock(ahb, nullptr);
    env->DeleteLocalRef(bitmapClass);
    __android_log_print(ANDROID_LOG_ERROR, TAG, "Failed to create Bitmap");
    return nullptr;
  }

  void* pixels = nullptr;
  AndroidBitmap_lockPixels(env, bitmap, &pixels);
  if (!pixels) {
    AHardwareBuffer_unlock(ahb, nullptr);
    env->DeleteLocalRef(bitmapClass);
    __android_log_print(ANDROID_LOG_ERROR, TAG, "Failed to lock Bitmap pixels");
    return nullptr;
  }

  AndroidBitmapInfo bitmapInfo;
  AndroidBitmap_getInfo(env, bitmap, &bitmapInfo);

  // stridePixels is in PIXELS (AHardwareBuffer_Desc's own unit); each RGBA
  // pixel is 4 bytes. dstStride comes from AndroidBitmapInfo, already in
  // BYTES — these two strides are not guaranteed equal (row padding can
  // differ between the hardware buffer's own allocation and the Bitmap's),
  // which is exactly why this copies row-by-row instead of one single
  // memcpy of the whole buffer — a single bulk copy here would silently
  // shear/skew the image on any device where they actually differ, not
  // crash, so this exact per-row structure (copied directly from the
  // reference, not simplified) matters.
  auto srcStride = stridePixels * 4u;
  auto dstStride = static_cast<uint32_t>(bitmapInfo.stride);
  auto rowBytes = static_cast<uint32_t>(width) * 4u;

  for (int32_t y = 0; y < height; y++) {
    const auto* src = static_cast<const uint8_t*>(data) + static_cast<size_t>(y) * srcStride;
    auto* dst = static_cast<uint8_t*>(pixels) + static_cast<size_t>(y) * dstStride;
    std::memcpy(dst, src, rowBytes);
  }

  AndroidBitmap_unlockPixels(env, bitmap);
  AHardwareBuffer_unlock(ahb, nullptr);
  env->DeleteLocalRef(bitmapClass);

  // Already a plain software ARGB_8888 bitmap (created via
  // Bitmap.createBitmap, never wrapped) — no toSoftwareCopy() call needed
  // on this path, unlike the GPU path above.
  return bitmap;
}

// ---------------------------------------------------------------------------
// JNI entry point — must exactly match
// com.margelo.nitro.glowfacelandmarker.HybridGlowFaceLandmarker's
// `external fun nativeCreateBitmapFromHardwareBuffer(pointer: Long): Bitmap?`
// declaration (package + class name baked into the mangled symbol name by
// the JNI naming convention — a mismatch here doesn't fail to compile, it
// fails at RUNTIME with UnsatisfiedLinkError the first time this is
// called, which is exactly the kind of failure mode that needs real
// device verification to catch — see this project's own pre-flight
// checklist).
// ---------------------------------------------------------------------------
extern "C" JNIEXPORT jobject JNICALL
Java_com_margelo_nitro_glowfacelandmarker_HybridGlowFaceLandmarker_nativeCreateBitmapFromHardwareBuffer(
    JNIEnv* env,
    jobject /* thiz */,
    jlong pointer) {

  if (pointer == 0) {
    __android_log_print(ANDROID_LOG_ERROR, TAG, "Received null native buffer pointer");
    return nullptr;
  }

  auto* ahb = reinterpret_cast<AHardwareBuffer*>(static_cast<uintptr_t>(pointer));

  AHardwareBuffer_Desc desc;
  AHardwareBuffer_describe(ahb, &desc);

  bool cpuReadable = (desc.usage & AHARDWAREBUFFER_USAGE_CPU_READ_RARELY) ||
                      (desc.usage & AHARDWAREBUFFER_USAGE_CPU_READ_OFTEN);
  if (cpuReadable) {
    jobject result = createBitmapViaCpuLock(env, ahb,
        static_cast<int32_t>(desc.width),
        static_cast<int32_t>(desc.height),
        desc.stride);
    if (result) return result;
    // Lock path can still legitimately fail even when the usage flags claim
    // CPU-readability (e.g. a transient allocator issue) — same fallback
    // the reference takes, not a new behavior invented here.
  }

  jclass bitmapClass = env->FindClass("android/graphics/Bitmap");
  jmethodID wrapMid = bitmapClass
      ? env->GetStaticMethodID(bitmapClass, "wrapHardwareBuffer",
          "(Landroid/hardware/HardwareBuffer;Landroid/graphics/ColorSpace;)Landroid/graphics/Bitmap;")
      : nullptr;
  if (bitmapClass) env->DeleteLocalRef(bitmapClass);
  if (!wrapMid) env->ExceptionClear();

  if (wrapMid) {
    jobject result = createBitmapViaHardwarePath(env, ahb);
    if (result) return result;
  }

  __android_log_print(ANDROID_LOG_ERROR, TAG,
      "Buffer is GPU-only (usage=0x%llx) and Bitmap.wrapHardwareBuffer is unavailable (API<31). "
      "Confirm pixelFormat='rgb' is actually set on Android's useFrameOutput call — see this file's own header.",
      (unsigned long long)desc.usage);
  return nullptr;
}
