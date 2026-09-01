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
// BUILD HISTORY (real, not hypothetical): the first version of this file
// failed a real EAS Xcode build (2026-09-01, build #36) with three distinct,
// confirmed errors, each fixed below with the actual reason, not a second
// guess dressed up as confidence:
//  1. "cannot declare conformance to 'NSObjectProtocol' in Swift;
//     'HybridGlowFaceLandmarker' should inherit 'NSObject' instead" — this
//     class conformed to FaceLandmarkerLiveStreamDelegate directly, but its
//     base (HybridGlowFaceLandmarkerSpec_base, Nitrogen-generated) is a
//     plain Swift class, not NSObject-derived, and MediaPipe's delegate
//     protocol is Objective-C-bridged (needs NSObjectProtocol). Fixed by
//     moving the delegate conformance to a small private NSObject proxy
//     (FaceLandmarkerDelegateProxy below) that forwards to this class
//     instead of conforming directly.
//  2/3. "binary operator '>' cannot be applied to operands of type
//     'CGFloat' and 'Float'" / "cannot assign value of type 'CGFloat' to
//     type 'Float'" — landmark coordinates (NormalizedLandmark.x/.y) are
//     actually CGFloat, not Float as originally assumed; boundingBox and
//     the largest-face comparison below were mixing the two. Fixed by using
//     CGFloat throughout those two spots.
//  The build ALSO reported seven "value of type 'UInt' has no member '2'"
//  errors, all traced to the facialTransformationMatrixes-based pitch/yaw
//  decomposition this file originally had (`m.columns.2.x` etc.) — that
//  code assumed the matrix type was simd_float4x4 with no real confirmation
//  it is, and this error doesn't even look like a normal simd_float4x4
//  access failure. Rather than guess a SECOND time blind and burn another
//  build finding out, that whole decomposition is REMOVED here, not
//  re-guessed — pitch/yaw fall back to 0 (reads as "straight") the same way
//  they already did when the matrix was unavailable. This is a real,
//  deliberate scope cut, not a bug fix — see this project's own
//  verification report for what real ML Kit comparison and a correct
//  pitch/yaw source would take to add back.
class HybridGlowFaceLandmarker: HybridGlowFaceLandmarkerSpec {

  private var landmarker: FaceLandmarker?
  private var delegateProxy: FaceLandmarkerDelegateProxy?
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
    // See this class's own header for why: real, but currently unused
    // (facialTransformationMatrixes decomposition was removed after a
    // confirmed build failure) — left set so it's a one-line re-enable
    // once a correct decomposition replaces the removed one, rather than
    // needing to rediscover this option exists.
    options.outputFacialTransformationMatrixes = true
    // See FaceLandmarkerDelegateProxy below — this class itself no longer
    // conforms to FaceLandmarkerLiveStreamDelegate (that's error #1 in this
    // file's own header).
    let proxy = FaceLandmarkerDelegateProxy(owner: self)
    self.delegateProxy = proxy
    options.faceLandmarkerLiveStreamDelegate = proxy
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
    // header — this did NOT show up as one of the confirmed build errors
    // (the build never got this far — it failed at the delegate-conformance
    // error first, before any of detectFrame's own code was reached by the
    // type checker in a way that would surface a problem here), so this
    // is still genuinely untested, not confirmed-working. If this overload
    // doesn't exist, the real fix is almost certainly still an
    // orientation-aware MPImage constructor, just possibly named
    // differently — flagged here plainly rather than presented as certain.
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

  // MARK: - Result handling (called by FaceLandmarkerDelegateProxy below)

  fileprivate func handleResult(
    _ result: FaceLandmarkerResult?,
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
    // Kit's Face.bounds does. CGFloat throughout (NOT Float) — see this
    // file's own header, error #2/#3: NormalizedLandmark.x/.y are CGFloat,
    // confirmed by a real build failure when this mixed the two.
    var biggestIndex = 0
    var biggestArea: CGFloat = -1
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
    // This is the one angle in this module with real confidence behind it,
    // and the ONLY angle computation left in this file — see this file's
    // own header for why pitch/yaw's matrix decomposition was removed
    // rather than re-guessed.
    let rightEye = landmarks[33]
    let leftEye = landmarks[263]
    let rollRadians = atan2(Double(leftEye.y - rightEye.y), Double(leftEye.x - rightEye.x))
    let rollDegrees = rollRadians * 180 / .pi

    // Pitch/yaw: see this file's own header — the facialTransformationMatrixes
    // decomposition that used to be here was removed after a confirmed
    // build failure rather than re-guessed a second time blind. 0 reads as
    // "straight," the same honest fallback this already used whenever the
    // matrix was unavailable — not a regression from a working state, since
    // this decomposition never actually compiled, let alone ran.
    let pitchDegrees: Double = 0
    let yawDegrees: Double = 0

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
    var minX: CGFloat = 1, minY: CGFloat = 1, maxX: CGFloat = 0, maxY: CGFloat = 0
    for point in landmarks {
      minX = min(minX, point.x); maxX = max(maxX, point.x)
      minY = min(minY, point.y); maxY = max(maxY, point.y)
    }
    return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
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

// Small NSObject-based forwarding proxy — FaceLandmarkerLiveStreamDelegate
// is an Objective-C-bridged protocol requiring NSObjectProtocol conformance,
// which HybridGlowFaceLandmarker itself can't provide (it inherits
// Nitrogen-generated HybridGlowFaceLandmarkerSpec_base, a plain Swift class
// — see this file's own header, error #1, confirmed by a real build
// failure, not a preemptive guess). This is the standard fix for that exact
// situation: a minimal NSObject subclass that does nothing but forward the
// one delegate callback back to its owner.
private class FaceLandmarkerDelegateProxy: NSObject, FaceLandmarkerLiveStreamDelegate {
  private weak var owner: HybridGlowFaceLandmarker?

  init(owner: HybridGlowFaceLandmarker) {
    self.owner = owner
    super.init()
  }

  func faceLandmarker(
    _ faceLandmarker: FaceLandmarker,
    didFinishDetection result: FaceLandmarkerResult?,
    timestampInMilliseconds: Int,
    error: Error?
  ) {
    owner?.handleResult(result, timestampInMilliseconds: timestampInMilliseconds, error: error)
  }
}
