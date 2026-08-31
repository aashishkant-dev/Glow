# Structure adapted from react-native-vision-camera-ocr-plus's own real,
# working v5/Nitro Android CMakeLists.txt — same reference this module's
# whole Android/native piece is grounded against. jnigraphics (AndroidBitmap
# API) and android (core lib, for AHardwareBuffer) are the two extra native
# libs this module needs beyond what Nitrogen's own generated cmake already
# links — required specifically for HybridGlowFaceLandmarker.cpp's
# AHardwareBuffer→Bitmap conversion (see that file's own header for why).
project(NitroGlowFaceLandmarker)
cmake_minimum_required(VERSION 3.9.0)

set (PACKAGE_NAME NitroGlowFaceLandmarker)
set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

add_library(${PACKAGE_NAME} SHARED
        src/main/cpp/cpp-adapter.cpp
        src/main/cpp/HybridGlowFaceLandmarker.cpp
)

# Nitrogen-generated specs
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/NitroGlowFaceLandmarker+autolinking.cmake)

include_directories(
        "src/main/cpp"
        "../cpp"
)

find_library(LOG_LIB log)
find_library(JNIGRAPHICS_LIB jnigraphics)

target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        ${JNIGRAPHICS_LIB}   # <-- AndroidBitmap API (AndroidBitmap_lockPixels etc.)
        android              # <-- Android core (AHardwareBuffer_* functions)
)
