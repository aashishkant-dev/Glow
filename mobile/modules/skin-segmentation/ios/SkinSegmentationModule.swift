import ExpoModulesCore
import Vision
import UIKit
import CoreImage

// Real per-photo segmentation for the post-capture step ONLY — this is a
// plain Expo Modules AsyncFunction (not a Nitro HybridObject/frame
// processor the way Part 2's live MediaPipe plugin is), because it runs
// once per captured photo with no live-performance budget: a single
// VNImageRequestHandler pass, .accurate quality, no frame-thread
// constraints. Confirmed against Apple's own docs: VNGeneratePersonSegmentationRequest
// needs iOS 15+; this project's SDK 56 default deployment target (16.4,
// confirmed against this module's own podspec) already clears that with
// room to spare — nothing to raise.
//
// NOT verified against a real device or the Xcode/Swift toolchain — this
// environment has neither (confirmed: no xcodebuild/swiftc/xcrun anywhere).
// Written against Apple's documented Vision framework API surface, which
// has been stable for years, but the very first real EAS build + TestFlight
// run is this code's actual first compile.
public class SkinSegmentationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SkinSegmentation")

    AsyncFunction("getSkinSegmentation") { (uri: String) throws -> [String: Any?] in
      // Same file:// stripping SkinScanCamera.tsx's own uri handling already
      // does before handing a path to native code — UIImage(contentsOfFile:)
      // wants a plain filesystem path, not a URL string.
      let path = uri.hasPrefix("file://") ? String(uri.dropFirst("file://".count)) : uri
      guard let image = UIImage(contentsOfFile: path) else {
        throw NSError(domain: "SkinSegmentation", code: 1, userInfo: [
          NSLocalizedDescriptionKey: "Could not load photo at \(uri)",
        ])
      }
      guard let cgImage = image.cgImage else {
        throw NSError(domain: "SkinSegmentation", code: 2, userInfo: [
          NSLocalizedDescriptionKey: "Photo has no backing CGImage",
        ])
      }

      // CGImage itself carries no orientation — Vision needs it passed
      // explicitly (this is what UIImage.imageOrientation is FOR: without
      // this, a portrait selfie shot with the phone held normally gets
      // processed as if it were landscape, and every landmark/mask pixel
      // ends up rotated 90° from where it actually is on screen — the
      // exact class of bug this app's own HybridImageFaceDetector.swift
      // patch (see mobile/patches/) already had to fix once for ML Kit).
      let orientation = Self.cgOrientation(from: image.imageOrientation)

      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])

      let landmarksRequest = VNDetectFaceLandmarksRequest()
      let segmentationRequest = VNGeneratePersonSegmentationRequest()
      // .accurate, not .balanced/.fast — Apple's own guidance (see this
      // module's file header) is .accurate for still images, .fast for
      // video/live; this runs once per captured photo, so there's no
      // reason to trade accuracy for speed here.
      segmentationRequest.qualityLevel = .accurate
      segmentationRequest.outputPixelFormat = kCVPixelFormatType_OneComponent8

      try handler.perform([landmarksRequest, segmentationRequest])

      // --- Segmentation mask ---
      // A genuine miss (no person in frame at all) is real, useful signal —
      // same "don't guess, report the honest miss" convention
      // detectFaceRegion (SkinScanCamera.tsx) already follows for ML Kit —
      // not an error, personDetected: false with a null mask.
      guard let maskObservation = segmentationRequest.results?.first else {
        return ["personDetected": false, "maskBase64": nil, "maskWidth": 0, "maskHeight": 0, "faceLandmarks": nil]
      }
      let maskBuffer = maskObservation.pixelBuffer
      let maskWidth = CVPixelBufferGetWidth(maskBuffer)
      let maskHeight = CVPixelBufferGetHeight(maskBuffer)
      // Software renderer explicitly avoided (useSoftwareRenderer: false) —
      // same choice react-native-vision-camera-ocr-plus's own reference
      // implementation makes for the identical CVPixelBuffer→CGImage
      // conversion, for the same reason: GPU-backed CIContext rendering is
      // materially faster for this exact conversion.
      let ciContext = CIContext(options: [.useSoftwareRenderer: false])
      let ciImage = CIImage(cvPixelBuffer: maskBuffer)
      guard let maskCGImage = ciContext.createCGImage(ciImage, from: ciImage.extent),
            let maskPNG = UIImage(cgImage: maskCGImage).pngData() else {
        throw NSError(domain: "SkinSegmentation", code: 3, userInfo: [
          NSLocalizedDescriptionKey: "Could not encode segmentation mask",
        ])
      }
      let maskBase64 = maskPNG.base64EncodedString()

      // --- Face landmarks (largest face, matching detectFaceRegion's own
      // "a photo/poster in the background shouldn't win" convention) ---
      var landmarksDict: [String: Any?]? = nil
      if let faces = landmarksRequest.results, !faces.isEmpty {
        let face = faces.max(by: { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height })!
        if let regions = face.landmarks {
          landmarksDict = [
            "faceContour": Self.points(regions.faceContour),
            "leftEye": Self.points(regions.leftEye),
            "rightEye": Self.points(regions.rightEye),
            "leftEyebrow": Self.points(regions.leftEyebrow),
            "rightEyebrow": Self.points(regions.rightEyebrow),
            "nose": Self.points(regions.nose),
            "outerLips": Self.points(regions.outerLips),
            "innerLips": Self.points(regions.innerLips),
          ]
        }
      }

      return [
        "personDetected": true,
        "maskBase64": maskBase64,
        "maskWidth": maskWidth,
        "maskHeight": maskHeight,
        "faceLandmarks": landmarksDict,
      ]
    }
  }

  // Vision's VNFaceLandmarkRegion2D.normalizedPoints are in Vision's own
  // coordinate space — origin bottom-left, y increasing UPWARD (the classic
  // Core Image/Vision convention, opposite of UIKit/most image formats).
  // Flipping here (1 - y) once, at the native boundary, means every JS
  // consumer of FacePoint can treat these exactly like the ML Kit-derived
  // points skinZones.ts already works with (top-left origin, y down) — no
  // second coordinate convention leaking into JS.
  private static func points(_ region: VNFaceLandmarkRegion2D?) -> [[String: Double]] {
    guard let region = region else { return [] }
    return region.normalizedPoints.map { ["x": Double($0.x), "y": Double(1 - $0.y)] }
  }

  private static func cgOrientation(from uiOrientation: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch uiOrientation {
    case .up: return .up
    case .upMirrored: return .upMirrored
    case .down: return .down
    case .downMirrored: return .downMirrored
    case .left: return .left
    case .leftMirrored: return .leftMirrored
    case .right: return .right
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
