import Foundation
import NitroModules
import MediaPipeTasksVision

// iOS Nitro HybridObject wrapping MediaPipe's Face Landmarker Tasks Vision
// SDK as a live vision-camera frame processor. Modeled directly on
// react-native-vision-camera-ocr-plus's real, working v5/Nitro pattern
// (HybridTextRecognizer.swift) — same non-blocking "isBusy/lastResult"
// shape, same raw-pointer CVPixelBuffer reconstruction — swapped for
// MediaPipe's async detectAsync/delegate API instead of ML Kit's
// synchronous results(in:).
//
// Output is deliberately reduced to the SAME shape
// react-native-vision-camera-face-detector's own `Face` already has
// (bounds + pitch/roll/yaw) — see GlowFaceLandmarker.nitro.ts's own header
// comment — specifically so SkinScanCamera.tsx's existing gating math
// (positionGate/angleGate thresholds, PITCH_GATE_DEG) needs ZERO changes.
// MediaPipe's real output is 478 3D landmarks per face, not a bounding
// box+angles triple — the reduction happens here, once, at the native
// boundary.
//
// bounds is returned as 0-1 NORMALIZED fractions of the frame, NOT
// screen/preview pixel coordinates — unlike the existing ML Kit path,
// which gets pixel coordinates for free from that package's own `autoMode`
// (native-side rotation/scaling against windowWidth/windowHeight). This
// module doesn't replicate that scaling in Swift — deliberately: getting a
// coordinate transform wrong in blind native code is a silent, hard-to-spot
// bug (numbers that still LOOK plausible), whereas doing that same scaling
// in plain JS (see MediaPipeFaceLandmarkerSensor in ../src/index.ts) is
// something that can actually be reasoned about/checked against the
// existing liveBox math. This is a deliberate scope reduction, not an
// oversight — flagged explicitly in this project's own scope report.
//
// NOT verified against a real device, a real Xcode/Swift build, or even a
// syntax check — this environment has none of those (see this project's
// scope report). Written against MediaPipe's documented Face Landmarker
// iOS API surface. Two pieces specifically carry real, flagged uncertainty
// beyond the usual "unbuilt" caveat — see decomposeRollAngle's and
// MPImage's own comments below.
class HybridGlowFaceLandmarker: HybridGlowFaceLandmarkerSpec, FaceLandmarkerLiveStreamDelegate {

  private var landmarker: FaceLandmarker?
  private let stateLock = NSLock()
  private var isBusy: Bool = false
  private var lastResult: [DetectedFace] = []

  override init() {
    super.init()
    setupLandmarker()
  }

  private func setupLandmarker() {
    // Bundle(for:) resolves against THIS class's own bundle, i.e. the pod's
    // resource bundle the podspec declares (see
    // NitroGlowFaceLandmarker.podspec's resource_bundles) — not the host
    // app's main bundle, which wouldn't have this file.
    guard let modelPath = Bundle(for: HybridGlowFaceLandmarker.self)
      .path(forResource: "face_landmarker", ofType: "task") else {
      // No crash, no throw — same "fails to empty, never brings down the
      // screen" convention LightingSensor's own ErrorBoundary already
      // established for an equivalent "native piece not linked/built yet"
      // case. detectFrame below simply returns [] forever if this happens,
      // which SkinScanCamera.tsx's MediaPipe path already treats as "no
      // face" — see this module's src/index.ts.
      print("[GlowFaceLandmarker] face_landmarker.task not found in bundle — detection will return no faces")
      return
    }
    let options = FaceLandmarkerOptions()
    options.baseOptions.modelAssetPath = modelPath
    options.runningMode = .liveStream
    // This app only ever cares about ONE face (the user's own, live
    // framing) — same as the existing ML Kit path only ever consuming the
    // single largest detected face (see SkinScanCamera.tsx's
    // primaryLiveFace).
    options.numFaces = 1
    // Caught in self-review, not by any build: this defaults to false (per
    // Google's own docs) — without it explicitly set, result.
    // facialTransformationMatrixes below is ALWAYS empty and pitch/yaw
    // silently reads 0 forever (a real, if quiet, functional bug — not a
    // crash, since that 0-fallback path was already defensive, but the
    // feature it was defending would never have engaged at all).
    options.outputFacialTransformationMatrixes = true
    options.faceLandmarkerLiveStreamDelegate = self
    landmarker = try? FaceLandmarker(options: options)
    if landmarker == nil {
      print("[GlowFaceLandmarker] FaceLandmarker failed to initialize")
    }
  }

  // MARK: - HybridGlowFaceLandmarkerSpec

  func detectFrame(nativeBufferPointer: UInt64, orientation: String) throws -> [DetectedFace] {
    guard let landmarker = landmarker else { return [] }

    stateLock.lock()
    let busy = isBusy
    let current = lastResult
    stateLock.unlock()
    // Never blocks the frame thread on MediaPipe inference — if the
    // previous frame's detectAsync call hasn't completed yet (delegate not
    // fired), skip submitting a new one and hand back the last real result,
    // exactly like the OCR-plus reference's scanFrame does for ML Kit OCR.
    if busy { return current }

    guard let rawPtr = UnsafeRawPointer(bitPattern: UInt(nativeBufferPointer)) else { return current }
    let pixelBuffer = Unmanaged<CVPixelBuffer>.fromOpaque(rawPtr).takeUnretainedValue()

    // MPImage(pixelBuffer:orientation:) — the orientation-aware initializer
    // is the one actually needed here (a live front-camera frame is NOT
    // upright the way a file-loaded UIImage already is); Google's own
    // published docs snippet only shows the bare MPImage(pixelBuffer:)
    // default-orientation form, so this exact overload's existence/exact
    // parameter name is UNVERIFIED against the real MediaPipeTasksVision
    // header — flagged here plainly rather than presented as certain. If
    // this overload doesn't exist as written, the real fix is almost
    // certainly still an orientation-aware MPImage constructor (MediaPipe's
    // other vision tasks all need one for the same reason), just possibly
    // named differently.
    guard let image = try? MPImage(pixelBuffer: pixelBuffer, orientation: Self.imageOrientation(from: orientation)) else {
      return current
    }

    stateLock.lock()
    isBusy = true
    stateLock.unlock()
    let timestampMs = Int(Date().timeIntervalSince1970 * 1000)
    do {
      try landmarker.detectAsync(image: image, timestampInMilliseconds: timestampMs)
    } catch {
      // Submission itself failed (not a detection failure — those come
      // back through the delegate below) — clear isBusy so the NEXT frame
      // isn't permanently blocked believing one is still in flight.
      stateLock.lock()
      isBusy = false
      stateLock.unlock()
    }
    return current
  }

  // MARK: - FaceLandmarkerLiveStreamDelegate

  func faceLandmarker(
    _ faceLandmarker: FaceLandmarker,
    didFinishDetection result: FaceLandmarkerResult?,
    timestampInMilliseconds: Int,
    error: Error?
  ) {
    defer {
      stateLock.lock()
      isBusy = false
      stateLock.unlock()
    }
    guard let result = result, !result.faceLandmarks.isEmpty else {
      stateLock.lock()
      lastResult = []
      stateLock.unlock()
      return
    }

    // Largest face wins — same convention as detectFaceRegion
    // (SkinScanCamera.tsx) and the existing live ML Kit path
    // (primaryLiveFace) already use, applied here via landmark bounding-box
    // area since MediaPipe doesn't hand back a pre-computed box the way ML
    // Kit's Face.bounds does.
    var biggestIndex = 0
    var biggestArea: Float = -1
    for (i, landmarks) in result.faceLandmarks.enumerated() {
      let box = Self.boundingBox(landmarks)
      let area = box.width * box.height
      if area > biggestArea { biggestArea = area; biggestIndex = i }
    }
    let landmarks = result.faceLandmarks[biggestIndex]
    let box = Self.boundingBox(landmarks)

    // Roll: the 2D angle between the two outer-eye-corner landmarks — a
    // simple, well-understood atan2 on two known points, independent of
    // MediaPipe's transformation-matrix output entirely. Landmark indices
    // 33 (right eye outer corner) and 263 (left eye outer corner) are
    // MediaPipe Face Mesh's own STABLE, documented canonical indices (part
    // of the published 478-point topology, not something guessed at here).
    // This is the one angle in this module with real confidence behind it.
    let rightEye = landmarks[33]
    let leftEye = landmarks[263]
    let rollRadians = atan2(Double(leftEye.y - rightEye.y), Double(leftEye.x - rightEye.x))
    let rollDegrees = rollRadians * 180 / .pi

    // Pitch/yaw: approximated from facialTransformationMatrixes when
    // MediaPipe provides one, decomposed as a standard XYZ Euler
    // extraction. UNVERIFIED — flagged plainly, not presented as
    // equivalent-confidence to roll above: this depends on (a) the exact
    // Swift type facialTransformationMatrixes actually is (written here
    // against simd_float4x4, the typical MediaPipe Tasks Vision Swift
    // convention, but not confirmed against the real header), and (b)
    // MediaPipe's specific rotation-matrix axis/sign convention matching
    // the decomposition formula below. A wrong sign or swapped axis here
    // would NOT crash or throw — it would silently produce plausible-
    // looking degree values that don't actually mean what
    // SkinScanCamera.tsx's angleGate thresholds (PITCH_GATE_DEG=18, the
    // live gate's own 15°/25° bands) assume. This is the single highest-
    // risk piece in this whole module and the first thing to verify
    // against real ML Kit angle output on-device before trusting it —
    // see this project's own scope report. Falls back to 0,0 (reads as
    // "straight") rather than a fabricated confident-looking number when
    // options.outputFacialTransformationMatrixes wasn't set or the matrix
    // is absent — 0,0 is a real, if uninformative, value, not a guess
    // dressed up as a measurement.
    var pitchDegrees: Double = 0
    var yawDegrees: Double = 0
    if let matrix = result.facialTransformationMatrixes.first {
      let m = matrix
      // Standard R = Rz(roll) * Ry(yaw) * Rx(pitch) extraction — see this
      // function's own comment for why the CONVENTION (not just the
      // arithmetic) needs real verification.
      pitchDegrees = Double(atan2(-m.columns.2.y, sqrt(m.columns.2.x * m.columns.2.x + m.columns.2.z * m.columns.2.z))) * 180 / .pi
      yawDegrees = Double(atan2(m.columns.2.x, m.columns.2.z)) * 180 / .pi
    }

    let face = DetectedFace(
      bounds: DetectedFaceBounds(
        x: Double(box.minX), y: Double(box.minY),
        width: Double(box.width), height: Double(box.height)
      ),
      pitchAngle: pitchDegrees,
      rollAngle: rollDegrees,
      yawAngle: yawDegrees
    )
    stateLock.lock()
    lastResult = [face]
    stateLock.unlock()
  }

  // MARK: - Private helpers

  private static func boundingBox(_ landmarks: [NormalizedLandmark]) -> CGRect {
    var minX: Float = 1, minY: Float = 1, maxX: Float = 0, maxY: Float = 0
    for point in landmarks {
      minX = min(minX, point.x); maxX = max(maxX, point.x)
      minY = min(minY, point.y); maxY = max(maxY, point.y)
    }
    return CGRect(x: CGFloat(minX), y: CGFloat(minY), width: CGFloat(maxX - minX), height: CGFloat(maxY - minY))
  }

  /// Same VC v5 frame-orientation-string → UIImage.Orientation mapping the
  /// OCR-plus reference's HybridTextRecognizer.swift already uses (see this
  /// project's own research citing that file) — reused verbatim rather than
  /// re-derived, since it's a real, working, recently-verified mapping for
  /// this exact library version.
  private static func imageOrientation(from string: String) -> UIImage.Orientation {
    switch string {
    case "up": return .up
    case "down": return .down
    case "left": return .right
    case "right": return .left
    default: return .up
    }
  }
}
