// JNI_OnLoad shim — adapted from react-native-vision-camera-ocr-plus's own
// real cpp-adapter.cpp (this module's Android grounding reference). Just
// registers Nitrogen's generated natives via the generated
// NitroGlowFaceLandmarkerOnLoad.hpp; no logic of its own to get wrong.
#include <jni.h>
#include <fbjni/fbjni.h>
#include "NitroGlowFaceLandmarkerOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::glowfacelandmarker::registerAllNatives();
  });
}
