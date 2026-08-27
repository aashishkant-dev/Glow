/**
 * SkinScanCamera — capture flow for the "My Space" AI skin scan. Deliberately
 * NOT a third CameraCapture variant: a diagnostic photo must never go through
 * a color filter (it would corrupt the exact signal being analyzed), so this
 * has no filter carousel at all, forces the front camera, and swaps the
 * usual caption/category compose panel for a short skin quiz + an
 * "Analyzing…" step. What IS reused from CameraCapture is the *pattern* —
 * one flex-column bottom cluster instead of independently-anchored rows —
 * so this starts from the corrected layout, not a second copy of the bug it
 * fixed.
 *
 * Analysis is free/on-device-style pixel math + this quiz (see
 * src/utils/skinAnalysis.js on the backend) — never a paid vision API call.
 *
 * Camera: react-native-vision-camera (not expo-camera) specifically so the
 * live preview can run a real-time ML Kit face detector via
 * react-native-vision-camera-face-detector and draw a genuine tracking box
 * while framing the shot, not just a fixed oval guide. A SEPARATE
 * detection pass still runs on the captured photo itself (detectFaceRegion,
 * via that SAME package's useImageFaceDetector — see below) for the actual
 * faceRegion sent to the backend — deliberately not reusing the live
 * stream's last detection, since the live stream runs on lower-res preview
 * frames and coupling the analyzed region to "whatever frame happened to be
 * live right as the shutter fired" is a lot more fragile than a fresh
 * detection on the exact photo bytes being analyzed. The live box is
 * real-time UI feedback only.
 *
 * Deliberately ONE face-detection library for both jobs (not
 * @react-native-ml-kit/face-detection for the still-photo pass alongside
 * this package for the live one) — two separate wrappers around Google's
 * same underlying ML Kit Face Detection SDK is exactly the kind of setup
 * that causes CocoaPods to fail resolving compatible pod versions between
 * them (hit this for real on an EAS build). useImageFaceDetector below is
 * this package's own static-image API, so there's only ever one native
 * face-detection dependency in the app.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Animated,
  Image as RNImage,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Brightness from 'expo-brightness';
import { Platform } from 'react-native';
import { useCameraDevice, useCameraPermission, useFrameOutput, usePhotoOutput, type CameraRef, type Photo } from 'react-native-vision-camera';
import { Camera as FaceDetectCamera, useImageFaceDetector, type Face as LiveFace } from 'react-native-vision-camera-face-detector';
import { runOnJS } from 'react-native-worklets';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Fonts } from '../utils/colors';
import { GlowMark } from './GlowLogo';
import { SparkleIcon } from './BeautyIcons';
import { SKIN_QUIZ_QUESTIONS } from '../data/skinQuiz';
import { apiScanSkin, SkinScan } from '../api/client';
import { tapLight, tapWarning } from '../utils/haptics';
import { ScanBracket } from './ScanBracket';
import { deriveZoneMarkers, type RawFacialPoints, type StoredZoneMarkers, type FaceConfidenceSignals } from '../utils/skinZones';

function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(',');
  return value.startsWith('data:') && commaIndex !== -1 ? value.slice(commaIndex + 1) : value;
}

// Real, file-derived dimensions — replaces a previous swapsDimensions
// heuristic (photo.orientation === 'left'/'right' ? swap photo.width/height
// : don't) that guessed at the relationship between vision-camera's raw
// Photo.width/height (its own docs: "SENSOR/BUFFER dimensions... orientation
// applied lazily via EXIF flags," i.e. NOT what's baked into these two
// properties) and the SAVED FILE's actual dimensions. That heuristic was
// still in place after last round's native-side coordinate-transpose fix,
// and is the likely reason zone markers were still landing off-face in the
// screenshot that prompted this: HybridImageFaceDetector.swift (patched
// last round) computes its own width/height from `uiImage.size` — loaded
// from this SAME file via UIImage(contentsOfFile:), which — like any
// standard image loader — already resolves the file's real EXIF-corrected
// dimensions. Normalizing that native detector's (now correctly ordered)
// pixel-space bounding box against a DIFFERENT, guessed pair of dimensions
// (photo.width/height + a swap guess) would silently reintroduce the exact
// class of bug the native patch fixed, just one layer up in JS. Image.
// getSize reads the same saved file the detector itself reads, so there's
// no second, independent guess left to disagree with it.
function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

// A stable module-level constant, not an inline object literal at the
// useImageFaceDetector(...) call site — that hook memoizes its returned
// detector on this options object's IDENTITY (useMemo(..., [options])), not
// its contents. A fresh `{ performanceMode: 'accurate' }` literal passed
// inline is a NEW reference on every single render, which — while this
// modal is open and re-rendering constantly from live face-tracking state
// (up to ~10x/sec) — was making that hook tear down and reconstruct a
// brand-new native ML Kit detector object on every render, abandoning the
// previous one with no disposal call. Same unsafe-GC-thread-teardown crash
// class as the captured Photo needed a fix for (see shoot()'s try/finally),
// just firing many times a second instead of once per capture, and real
// wasted native-object-construction overhead on top of that.
// runLandmarks/runContours: off by default in this library — switched on
// here to get ML Kit's real per-photo geometry (10 landmarks + face-oval/
// eyebrow/eye/nose/lip contours) for placing zone markers on the actual
// detected features (see deriveZoneMarkers in skinZones.ts) instead of a
// fixed proportion-of-face-box estimate. No new dependency: this is the
// same ML Kit wrapper already installed and patched for the live preview.
// runClassifications: also off by default — switched on to get
// leftEyeOpenProbability/rightEyeOpenProbability, the only real per-feature
// confidence signal this detector exposes. deriveZoneMarkers uses it (along
// with the always-present pitchAngle) to refuse to place an under-eye/
// forehead/chin/jawline marker it can't actually trust, instead of
// forwarding whatever point ML Kit hands back regardless of whether that
// feature is actually visible (a cap brim, hair, a hand) — see that
// function's own comment for why "the array had points in it" was never a
// real confidence check.
const IMAGE_FACE_DETECTOR_OPTIONS = { performanceMode: 'accurate' as const, runLandmarks: true, runContours: true, runClassifications: true };

type FaceRegion = { x: number; y: number; width: number; height: number };

// Runs real on-device face detection (ML Kit — free, no API call, no rate
// limit) on the JUST-CAPTURED photo, replacing the old fixed-oval guess with
// the actual detected face for THIS photo. Native-only: on web, or a native
// build that hasn't been rebuilt with this module yet, ML Kit isn't
// available at all — caught and treated as "unavailable," never surfaced as
// a false "no face" warning, since that would blame the user for something
// that isn't about their photo. A genuine zero-faces result IS surfaced
// (noFaceDetected), since that's real, useful signal to retake before ever
// spending an upload + Gemini call on an unusable photo.
//
// `detector` comes from useImageFaceDetector(), a hook — must be created in
// the component body and passed in, not created here (this isn't a
// component). performanceMode 'accurate' (not 'fast', unlike the live
// camera overlay below) — this runs ONCE on a still photo during the
// already-visible "Checking your photo…" step, not per-frame on a live
// stream, so the ~100–300ms extra cost is invisible while the more precise
// bounding box directly improves the crop Gemini actually analyzes.
function detectFaceRegion(detector: ReturnType<typeof useImageFaceDetector>, uri: string, imgWidth: number, imgHeight: number, mirrored: boolean): { faceRegion: FaceRegion | null; noFaceDetected: boolean; zoneMarkers: StoredZoneMarkers | null } {
  if (Platform.OS === 'web' || !imgWidth || !imgHeight) return { faceRegion: null, noFaceDetected: false, zoneMarkers: null };
  try {
    const faces = detector.detectFaces(uri);
    if (!faces || faces.length === 0) return { faceRegion: null, noFaceDetected: true, zoneMarkers: null };

    // Largest face wins — guards against a photo/poster in the background
    // being picked over the real subject.
    const face = faces.reduce((biggest, f) => (f.bounds.width * f.bounds.height > biggest.bounds.width * biggest.bounds.height ? f : biggest), faces[0]);
    const { x: left, y: top, width, height } = face.bounds;

    // ML Kit's box is tight — roughly eyebrows-to-chin — so it's expanded
    // into a fuller "beauty crop" that actually includes the forehead, full
    // jaw, and a little ear/temple margin on each side, matching what
    // zoneMarkers (skinZones.ts) and the backend's DEFAULT_REGION fallback
    // assume.
    const expLeft = left - width * 0.25;
    const expTop = top - height * 0.5;
    const expRight = left + width * 1.25;
    const expBottom = top + height * 1.25;

    const clampedLeft = Math.max(0, expLeft);
    const clampedTop = Math.max(0, expTop);
    const clampedRight = Math.min(imgWidth, expRight);
    const clampedBottom = Math.min(imgHeight, expBottom);

    const region: FaceRegion = {
      x: clampedLeft / imgWidth,
      y: clampedTop / imgHeight,
      width: (clampedRight - clampedLeft) / imgWidth,
      height: (clampedBottom - clampedTop) / imgHeight,
    };

    // Sanity check before trusting this box at all — confirmed live on a
    // real device that ML Kit can return a detection that's technically
    // "a face" but geometrically nonsense once mapped through imgWidth/
    // imgHeight (seen in production: a box 2.7x wider than tall, hugging
    // the bottom edge — width:0.88 height:0.32 y:0.68 — almost certainly an
    // EXIF/sensor-orientation mismatch between the coordinate space ML Kit
    // detected in and the width/height used to normalize it, and not
    // something fixable by guessing at a rotation correction without a
    // device to verify it against). The aspect check alone already catches
    // that exact case (0.88/0.32 = 2.75, well outside 0.45–1.6) — a `y`
    // position check used to ALSO reject anything more than 45% down the
    // photo, on the theory that a real face that low was unlikely. That
    // theory doesn't hold: confirmed against real result photos where the
    // camera is genuinely held low/tilted (face in the lower half, real
    // headroom above), a real, valid detection was being thrown out for
    // exactly that reason, silently falling back to a fixed centered guess
    // — which is what actually produced the visibly wrong result (zone
    // markers landing in hair/ceiling, well above the real face). Aspect +
    // width alone are enough to catch genuinely malformed boxes without
    // also rejecting legitimate low-angle framing.
    const aspect = region.width / region.height;
    const plausible = aspect > 0.45 && aspect < 1.6 && region.width < 0.85;
    if (!plausible) {
      console.warn('[SkinScanCamera] rejected implausible face detection', region);
      return { faceRegion: null, noFaceDetected: false, zoneMarkers: null };
    }

    // Same expanded "beauty crop" box as `region` above, just still in
    // pixels — deriveZoneMarkers clamps every zone into this box, so a
    // landmark-derived rect and the ZONE_RECTS fallback estimate stay in
    // the same reference frame (the one already persisted as
    // SkinScan.faceBox) regardless of which one a given zone ends up using.
    const faceBoxPx = { x: clampedLeft, y: clampedTop, width: clampedRight - clampedLeft, height: clampedBottom - clampedTop };
    const points: RawFacialPoints = {
      faceContour: face.contours?.FACE,
      leftEyebrowTop: face.contours?.LEFT_EYEBROW_TOP,
      rightEyebrowTop: face.contours?.RIGHT_EYEBROW_TOP,
      noseBridge: face.contours?.NOSE_BRIDGE,
      noseBottom: face.contours?.NOSE_BOTTOM,
      leftEye: face.contours?.LEFT_EYE,
      rightEye: face.contours?.RIGHT_EYE,
      leftCheek: face.landmarks?.LEFT_CHEEK,
      rightCheek: face.landmarks?.RIGHT_CHEEK,
      mouthBottom: face.landmarks?.MOUTH_BOTTOM,
    };
    const signals: FaceConfidenceSignals = {
      pitchAngle: face.pitchAngle,
      leftEyeOpenProbability: face.leftEyeOpenProbability,
      rightEyeOpenProbability: face.rightEyeOpenProbability,
    };
    const derived = deriveZoneMarkers(points, faceBoxPx, imgWidth, imgHeight, mirrored, signals);
    // Always the real object ML Kit's landmark pass produced for THIS
    // photo — even `{}` when it confidently placed zero zones (heavy
    // occlusion, extreme pose). Collapsing that empty-but-real result to
    // `null` here used to be indistinguishable, downstream, from "this
    // scan's client never ran the landmark pass at all" — and
    // assessableZoneRects (src/utils/skinHeatmaps.js, backend) treats THAT
    // case as license to fall back to the blind ZONE_RECTS proportion
    // guess for every single zone. That collapse is exactly backwards: the
    // more thoroughly occlusion/pose defeated the real detector, the more
    // confidently every zone fell back to a guess instead of being
    // skipped. A scan that genuinely never had this
    // feature (no face detected, an implausible box, web, detector
    // unavailable) still sends `zoneMarkers: null` from the other
    // early-return branches above — only this one, reached after a real,
    // plausible detection, needs to preserve an empty result as empty
    // rather than erasing it to `null`.
    const zoneMarkers = derived;

    if (__DEV__) {
      // ML Kit's API exposes NAMED contour/landmark points (LEFT_CHEEK,
      // NOSE_BRIDGE, ...), not numeric indices — this is that same set,
      // logging which ones were actually present on this detection (a
      // missing one is exactly why a given zone below might be absent from
      // zoneMarkers, having its photo marker skipped instead of a guessed
      // one) and the confidence signals (pitch/eye-open) that can ALSO drop
      // a zone even when its points were present — see deriveZoneMarkers's
      // own comment for why raw point presence alone was never enough.
      console.log('[SkinScanCamera] deriveZoneMarkers sources', {
        faceContourPts: points.faceContour?.length ?? 0,
        leftEyebrowTopPts: points.leftEyebrowTop?.length ?? 0,
        rightEyebrowTopPts: points.rightEyebrowTop?.length ?? 0,
        noseBridgePts: points.noseBridge?.length ?? 0,
        noseBottomPts: points.noseBottom?.length ?? 0,
        leftEyePts: points.leftEye?.length ?? 0,
        rightEyePts: points.rightEye?.length ?? 0,
        leftCheek: points.leftCheek ?? null,
        rightCheek: points.rightCheek ?? null,
        mouthBottom: points.mouthBottom ?? null,
        faceBoxPx,
        signals,
      });
      console.log('[SkinScanCamera] deriveZoneMarkers result (zones absent here get NO photo marker at all, never a guess)', derived);
    }

    return { faceRegion: region, noFaceDetected: false, zoneMarkers };
  } catch (err) {
    // Web already returned early above, so reaching here means a native
    // build — genuinely not linked (an update from before this module was
    // added) is possible but rare; worth logging either way. This exact
    // catch block previously hid a real, now-fixed bug (see the
    // orientation comment above) behind total silence, which made it
    // indistinguishable from "not linked" with nothing to go on from a bug
    // report alone.
    console.warn('[SkinScanCamera] detectFaces threw', err instanceof Error ? err.message : err);
    return { faceRegion: null, noFaceDetected: false, zoneMarkers: null };
  }
}

interface Props {
  visible: boolean;
  onClose: () => void;
  // isNewProfile: true when the backend's face-match decided this photo is
  // someone not previously seen on this account and started a fresh profile.
  onComplete: (scan: SkinScan, bookCategory: string, isNewProfile?: boolean) => void;
  // The active profile's most recent scan, if any — lets the camera screen
  // show a tip grounded in what was actually noted last time ("last scan
  // flagged X, make sure that area is lit"), not just generic photography
  // advice. Omit/null on a first-ever scan.
  previousScan?: SkinScan | null;
}

const GENERIC_TIPS = [
  'Face a window or light source — even, natural light reads skin tone truest.',
  'Remove glasses so the AI can read the skin around your eyes clearly.',
  'Pull hair back from your forehead and cheeks for the clearest read.',
  'A neutral, relaxed expression works best — no smiling or squinting.',
  'Hold the phone at eye level, arm-length away, centered in the oval.',
  'Bare skin (no fresh makeup) gives the most accurate reading.',
];

function buildTips(previousScan?: SkinScan | null): string[] {
  const tips = [...GENERIC_TIPS];
  if (previousScan) {
    // Prefer whichever zone had something notable last time — the most
    // concrete, specific tip beats a generic one. Granular zones first
    // (current scans), falling back to the old 3-zone shape for scans
    // saved before that breakdown.
    const zone = previousScan.zoneNotes || {};
    const zoneHit = zone.forehead ? { label: 'forehead', note: zone.forehead }
      : zone.nose ? { label: 'nose', note: zone.nose }
      : zone.chin ? { label: 'chin', note: zone.chin }
      : zone.cheekL ? { label: 'left cheek', note: zone.cheekL }
      : zone.cheekR ? { label: 'right cheek', note: zone.cheekR }
      : zone.underEyeL ? { label: 'left under-eye area', note: zone.underEyeL }
      : zone.underEyeR ? { label: 'right under-eye area', note: zone.underEyeR }
      : zone.jawline ? { label: 'jawline', note: zone.jawline }
      : zone.tZone ? { label: 'T-zone (forehead & nose)', note: zone.tZone }
      : zone.cheeks ? { label: 'cheeks', note: zone.cheeks }
      : zone.underEye ? { label: 'under-eye area', note: zone.underEye }
      : null;
    if (zoneHit) {
      tips.unshift(`Last scan noted your ${zoneHit.label}: "${zoneHit.note}" — make sure it's clearly lit this time so we can track the change.`);
    } else if (previousScan.concerns?.[0]) {
      tips.unshift(`Last time we flagged "${previousScan.concerns[0]}" — center your face well so we can see if it's changed.`);
    }
  }
  return tips;
}

type Step = 'camera' | 'quiz' | 'analyzing';

function AnalyzingStepRow({ label, done, active }: { label: string; done: boolean; active?: boolean }) {
  return (
    <View style={analyzingStepStyles.row}>
      <View style={[analyzingStepStyles.dot, done && analyzingStepStyles.dotDone, active && !done && analyzingStepStyles.dotActive]}>
        {done && <Text style={analyzingStepStyles.check}>✓</Text>}
      </View>
      <Text style={[analyzingStepStyles.label, done && analyzingStepStyles.labelDone]}>{label}</Text>
    </View>
  );
}

const analyzingStepStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.separator,
    alignItems: 'center', justifyContent: 'center',
  },
  dotActive: { borderColor: Colors.brand },
  dotDone: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  check: { color: '#fff', fontSize: 11, fontFamily: Fonts.bold },
  label: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.tertiaryLabel },
  labelDone: { color: Colors.label, fontFamily: Fonts.semibold },
});

// Bright, screen-emitted fill light for the front-camera selfie in low
// ambient light — the same trick Snapchat/Instagram/TikTok use for
// front-camera shots, done here as a real light SOURCE (opaque white
// pixels genuinely emit light that bounces off the face and back into the
// lens) rather than a translucent layer drawn on top of the preview.
// Alpha-blending white over an already near-black feed mostly just
// produces flat gray — there's no buried detail to reveal in a frame this
// dark, since the sensor never captured that detail to begin with; only
// adding real photons to the actual scene helps. Screen brightness (see
// the effect above) helps the same way but is capped by how much of the
// screen is actually bright pixels — mostly black chrome/camera feed
// before this.
//
// A soft radial gradient, not a hard-edged cutout — the first version drew
// a flat white rect with a sharp-edged ellipse punched out of it
// (fillRule="evenodd"), which is functionally the same light output but
// reads as "the screen glitched to a wall of white with a hole in it,"
// not an intentional design choice. This fades smoothly from fully
// transparent at the center out to fully opaque white by the edge of the
// same ellipse (SVG's default spreadMethod="pad" holds that same opaque
// white for everything past it, all the way to the screen edges) — same
// light output at the edges, same clear view of the face at the center,
// but a genuine soft glow in between instead of a cliff edge.
//
// The see-through window tracks the REAL detected face (`face`, i.e.
// liveBox) once one's found — same "real detection, not a generic guess"
// principle the tracking bracket already follows, applied here too: a
// face filling more of the frame (closer/bigger) gets a genuinely bigger
// window, a smaller/farther face gets a smaller one, padded a fixed 35%/
// 25% (width/height) beyond the raw detected box so the window frames
// comfortably around it rather than clipping tight to it. Before any face
// is detected yet, falls back to the fixed guide-oval size centered on
// screen — same as the bracket overlay's own liveBox-or-fallback split.
// The white "fill light" mask (a full-screen radial-gradient scrim with a
// see-through window around the face) is GONE, not just retuned — this is
// the third round of visible problems from that specific approach (a hard
// cutout, then a too-small window, then this: real content behind the
// gradient's semi-transparent transition band — a wall fixture in the
// room, confirmed against the actual reported screenshot — showing through
// as a pale, smudgy blob, reading as a rendering glitch even though it was
// the gradient doing exactly what it was coded to do). Removed at the
// source rather than patched again. The screen-brightness boost above and
// exposure/low-light-boost on the <Camera> below are the real, non-visual
// fixes for a dark preview — they don't render anything over the feed at
// all, so they can't produce this class of artifact. What's left here is
// just the plain ring outline: liveBox when a face is tracked, the fixed
// guide oval otherwise, no mask/scrim in either case.
function ringGeometry(width: number, height: number, face?: { x: number; y: number; width: number; height: number } | null) {
  if (face) return { left: face.x, top: face.y, width: face.width, height: face.height };
  return { left: width / 2 - OVAL_W / 2, top: height / 2 - OVAL_H / 2, width: OVAL_W, height: OVAL_H };
}

export function SkinScanCamera({ visible, onClose, onComplete, previousScan }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  // canRequestPermission is true only while status is 'not-determined' (the
  // OS will still show its dialog). Once it's false but hasPermission is
  // also false, the user already answered "Don't Allow" (or it's
  // 'restricted') — iOS will NEVER show that dialog again, so calling
  // requestPermission() a second time just silently resolves to the same
  // denied status with no visible dialog at all. Confirmed against this
  // package's own usePermission.ts: requestPermission() only wraps the
  // native request call, it doesn't know or care whether the OS will
  // actually prompt. Treating "denied" the same as "haven't asked yet" is
  // exactly what made the old single "Allow Camera" button a dead tap for
  // anyone in that state — indistinguishable from the screen just being
  // broken, since nothing on screen changes when you press it.
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  // containerFormat explicitly 'jpeg' — the default ('native') captures
  // HEIC on modern iPhones, which the server's sharp install can't decode
  // (confirmed live in production: "heif: Error while loading plugin:
  // Support for this compression format has not been built in" — sharp's
  // HEIF support needs libheif built in at the OS/container level, which
  // this backend's deploy doesn't have). expo-camera's old capture path
  // always produced JPEG, which is why this regressed only after switching
  // to vision-camera. JPEG decodes everywhere with no extra plugins.
  const photoOutput = usePhotoOutput({ containerFormat: 'jpeg' });
  // Static-image detector for the captured photo (detectFaceRegion) — a
  // separate instance from the live camera's own detection, tuned for
  // accuracy over speed since it only ever runs once per scan.
  const imageFaceDetector = useImageFaceDetector(IMAGE_FACE_DETECTOR_OPTIONS);
  const cameraRef = useRef<CameraRef>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  // Real-time face box from the live preview — pure UI feedback (see the
  // file header comment for why the actual analyzed faceRegion is computed
  // separately, from the captured photo, not from this stream).
  const [liveFaces, setLiveFaces] = useState<LiveFace[]>([]);
  // onFacesDetected has no built-in rate limit — it fires on every frame
  // the native side processes, and the plugin doesn't expose a throttle
  // option. Each call re-renders the tracking ring and the debug readout
  // below; doing that at full frame rate is enough JS-thread work to
  // visibly stall the UI
  // (the preview itself is native and keeps rendering, but everything
  // ELSE — including how responsive the screen feels — can bog down
  // badly enough to read as "frozen"). Capping state updates to ~10/sec
  // is still smooth for a slowly-moving tracking box and cuts that load
  // by roughly two-thirds to five-sixths depending
  // on the device's actual detection rate.
  const lastFaceUpdateRef = useRef(0);
  const onFacesDetected = useCallback((faces: LiveFace[]) => {
    const now = Date.now();
    if (now - lastFaceUpdateRef.current < 100) return;
    lastFaceUpdateRef.current = now;
    setLiveFaces(faces);
  }, []);

  // Real per-frame brightness — the one framing signal the live ring
  // couldn't previously give any real answer on (see the old captureState
  // comment, now below, on why it never claimed to detect "poor light").
  // useFrameOutput (react-native-vision-camera's Nitro frame-access API,
  // wired to react-native-worklets via the newly added
  // react-native-vision-camera-worklets) streams real YUV frames; the Y
  // (luma) plane's raw bytes are genuine per-pixel brightness with zero ML
  // model needed — averaging a stride-sampled subset of them (not every
  // byte, to keep this cheap enough to run every frame) gives a real scene
  // brightness reading, and the fraction of very-dark sampled pixels is a
  // cheap proxy for "harsh, unevenly lit" rather than "evenly dim."
  // pixelFormat 'yuv' + enablePreviewSizedOutputBuffers keep this on the
  // cheap zero-conversion path — see useFrameOutput's own doc comment on
  // why 'yuv' (not 'rgb') is the right format when only CPU pixel access is
  // needed, not GPU rendering.
  const [lightingSample, setLightingSample] = useState<{ avgLuma: number; darkFraction: number } | null>(null);
  // Throttles the EXPENSIVE part (sampling + averaging the frame) at the
  // source, not just the React state update after — mutated from inside the
  // worklet, which runs on its own persistent thread/runtime, so this plain
  // ref (not a React state value) is the correct primitive here: the same
  // compiled worklet function is reused for every frame rather than
  // recreated, so mutations to a captured ref persist across calls exactly
  // like the vision-camera community's own documented frame-skipping
  // pattern for frame processors.
  const lastLightingSampleAtRef = useRef(0);
  const LIGHTING_SAMPLE_INTERVAL_MS = 350;
  const LIGHTING_SAMPLE_STRIDE = 41; // prime — avoids landing on a repeating row/column pattern
  const LIGHTING_DARK_BYTE_THRESHOLD = 40; // 0-255 luma
  const lightingOutput = useFrameOutput({
    pixelFormat: 'yuv',
    enablePreviewSizedOutputBuffers: true,
    onFrame(frame) {
      'worklet';
      const now = Date.now();
      if (now - lastLightingSampleAtRef.current < LIGHTING_SAMPLE_INTERVAL_MS) {
        frame.dispose();
        return;
      }
      lastLightingSampleAtRef.current = now;
      if (!frame.isPlanar) {
        frame.dispose();
        return;
      }
      const planes = frame.getPlanes();
      if (planes.length === 0) {
        frame.dispose();
        return;
      }
      // Plane 0 of a YUV frame is always the full-resolution Y (luma)
      // plane — exactly the channel that represents brightness, with no
      // color information to discard first.
      const luma = new Uint8Array(planes[0].getPixelBuffer());
      frame.dispose();
      const len = luma.length;
      if (len === 0) return;
      let sum = 0, dark = 0, sampled = 0;
      for (let i = 0; i < len; i += LIGHTING_SAMPLE_STRIDE) {
        const v = luma[i];
        sum += v;
        if (v < LIGHTING_DARK_BYTE_THRESHOLD) dark++;
        sampled++;
      }
      if (sampled === 0) return;
      runOnJS(setLightingSample)({ avgLuma: sum / sampled, darkFraction: dark / sampled });
    },
  });

  const [step, setStep] = useState<Step>('camera');
  const [shot, setShot] = useState<{ uri: string; base64: string; mimeType: string; faceRegion: FaceRegion | null; zoneMarkers: StoredZoneMarkers | null } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // A failed capture (bad temp-file write, unreadable file, etc.) used to
  // just console.error and silently reset back to a tappable shutter —
  // nothing on screen ever showed anything went wrong, which is exactly
  // what "the button doesn't work" looks like from the outside. Shown
  // in place of the usual framing hint below the shutter, briefly.
  const [captureError, setCaptureError] = useState<string | null>(null);
  // Real on-device detection found zero faces in the captured photo — not
  // fatal (Gemini still gets the final say server-side), just a heads-up
  // before spending an upload + API call on a photo likely to get rejected.
  const [noFaceWarning, setNoFaceWarning] = useState(false);
  const [detectingFace, setDetectingFace] = useState(false);
  const flashAnim = useRef(new Animated.Value(0)).current;
  // Springs 1.08→1 the moment framing state reaches 'ready' — the "tightens
  // into focus" feedback called out below, alongside a haptic tick fired
  // the same way (see the effect near captureState's own computation).
  const readyScaleAnim = useRef(new Animated.Value(1)).current;
  const wasReadyRef = useRef(false);
  // Start of the lighting grace window (see lightingGate below) — reset
  // each time this sheet actually opens, not just on mount, since the
  // underlying Camera/frame-output stays mounted but paused between scans.
  const cameraActiveSinceRef = useRef(Date.now());
  useEffect(() => {
    if (visible) cameraActiveSinceRef.current = Date.now();
  }, [visible]);

  // Live, rotating tips on the camera step itself — real-time coaching
  // instead of a single static hint, and personalized off the last scan's
  // own findings when there is one (see buildTips).
  const tips = useMemo(() => buildTips(previousScan), [previousScan]);
  const [tipIndex, setTipIndex] = useState(0);
  const tipFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (step !== 'camera' || tips.length <= 1) return;
    const id = setInterval(() => {
      Animated.timing(tipFade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setTipIndex(i => (i + 1) % tips.length);
        Animated.timing(tipFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    }, 4200);
    return () => clearInterval(id);
  }, [step, tips, tipFade]);

  // Ask for camera permission the moment this sheet actually opens, instead
  // of waiting on a tap — this package's own docs recommend exactly this
  // pattern (useCameraPermission's JSDoc example does the same request-on-
  // mount). canRequestPermission guards it to only fire while the OS dialog
  // is actually available (status 'not-determined'); once denied, this
  // effect goes quiet and the permission-gate UI below takes over with an
  // Open Settings action instead.
  useEffect(() => {
    if (visible && !hasPermission && canRequestPermission) {
      requestPermission();
    }
  }, [visible, hasPermission, canRequestPermission, requestPermission]);

  // Boosts screen brightness to max while the front camera is actively
  // framing — turns the screen itself into a fill light aimed straight at
  // the user's face, the same trick Snapchat/Instagram use for front-camera
  // shots in low light. Confirmed directly (frame-by-frame from a real
  // screen recording) that the live preview is genuinely live and updating
  // even in a very dark room — it's just hard to see, which this targets.
  //
  // setBrightnessAsync specifically (NOT setSystemBrightnessAsync) — this
  // one is app-scoped and needs no permission on either platform: iOS
  // reverts it automatically on lock, Android reverts it the moment this
  // app leaves the foreground. Nothing to restore in either of those
  // cases; only the normal in-session transitions below need to put the
  // user's own brightness back.
  const originalBrightnessRef = useRef<number | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web' || !visible || step !== 'camera') return;
    let cancelled = false;
    (async () => {
      try {
        const available = await Brightness.isAvailableAsync();
        if (!available || cancelled) return;
        const current = await Brightness.getBrightnessAsync();
        if (cancelled) return;
        originalBrightnessRef.current = current;
        await Brightness.setBrightnessAsync(1);
      } catch {
        // Not available in every context (e.g. some simulators) — the
        // preview just stays whatever brightness it already was.
      }
    })();
    return () => {
      cancelled = true;
      if (originalBrightnessRef.current != null) {
        Brightness.setBrightnessAsync(originalBrightnessRef.current).catch(() => {});
        originalBrightnessRef.current = null;
      }
    };
  }, [visible, step]);

  // Diagnostic only — permission granted and a device resolved, but the
  // native preview never fired onPreviewStarted. Every report of "camera is
  // blank" so far has turned out to be something upstream of this (denied
  // permission, HEIC server error) rather than the preview itself hanging,
  // but there's been no actual signal to confirm that on a report without a
  // screenshot — this at least leaves a breadcrumb in device logs instead of
  // another guess.
  useEffect(() => {
    if (!visible || step !== 'camera' || !hasPermission || device == null || cameraReady) return;
    const t = setTimeout(() => {
      console.warn('[SkinScanCamera] preview has not started 6s after mount', { deviceId: device.id, hasPermission });
    }, 6000);
    return () => clearTimeout(t);
  }, [visible, step, hasPermission, device, cameraReady]);

  // Diagnostic only — logs once whether THIS device's front camera actually
  // supports the two brightness levers above at all. Low-light boost and
  // exposure-bias support both vary by device/camera; if a report of "still
  // dark" comes in after this, checking these values first tells us whether
  // the levers are engaging with nothing left to give on this specific
  // hardware, versus something else being wrong — instead of guessing at
  // iPhone model capabilities from a hardware string in a crash log.
  useEffect(() => {
    if (!device) return;
    console.log('[SkinScanCamera] front camera brightness capabilities', {
      supportsLowLightBoost: device.supportsLowLightBoost,
      supportsExposureBias: device.supportsExposureBias,
      minExposureBias: device.minExposureBias,
      maxExposureBias: device.maxExposureBias,
    });
  }, [device]);

  // The `exposure` prop below is NOT the same unit on both platforms, even
  // though vision-camera's JS types make it look like one shared number.
  // iOS: CameraDevice.exposureBias wraps AVFoundation's exposureTargetBias,
  // which IS true EV (see HybridCameraController.swift — passed straight to
  // setExposureTargetBias(Float(exposure))) — so a flat "+1.5" is a real,
  // meaningful +1.5 stops.
  // Android: vision-camera's HybridCameraController.kt does
  // `.setExposureCompensationIndex(exposure.toInt())` — CameraX's raw AE
  // compensation INDEX, not EV (min/maxExposureBias on Android are that same
  // raw index range, from exposureCompensationRange, confirmed in
  // HybridCameraDevice.kt). A flat "+1.5" truncates to index 1, and most
  // Android camera2 HALs step that index in increments as small as 1/6–1/2
  // EV — i.e. as little as +0.17 EV, an imperceptible nudge. That mismatch
  // is almost certainly why "brightness is minimal to none" persisted
  // through the low-light-boost and exposure-bias attempts above: those
  // levers were real on iOS and nearly inert on Android. Scaling by the
  // device's own reported range (which IS already in the right unit on both
  // platforms, since it comes from the same getter the setter's value space
  // matches) fixes this without needing the actual EV-per-step size, which
  // vision-camera doesn't expose to JS at all.
  // Maxed out, not conservatively capped — an overexposed-in-a-bright-room
  // selfie is a minor cosmetic issue; a preview too dark to see yourself in
  // at all is a broken feature. Between those two failure modes, this
  // deliberately picks the one that's still usable.
  const exposureBias = useMemo(() => {
    if (!device?.supportsExposureBias) return 0;
    if (Platform.OS === 'android') return Math.round(device.maxExposureBias);
    return device.maxExposureBias;
  }, [device]);

  function reset() {
    setStep('camera');
    setShot(null);
    setAnswers({});
    setCameraReady(false);
    setError(null);
    setNoFaceWarning(false);
    setLiveFaces([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function shoot() {
    if (capturing) return;
    if (!cameraReady) {
      tapWarning();
      return;
    }
    setCapturing(true);
    setCaptureError(null);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flashAnim.setValue(1);
    Animated.timing(flashAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    // Declared outside the try block, disposed in `finally` — not just at
    // the end of the happy path. `photo` is a native Nitro object (the same
    // GC-thread-unsafe-teardown class of object CameraSession already
    // needed the patch in patches/ for — see useCameraSession's cleanup
    // comment). Previously `photo.dispose()` only ran after every step
    // below it succeeded (saving to a temp file, reading it back as
    // base64); if ANY of those threw, the catch block below swallowed it
    // silently and this Photo was left for Hermes's background GC to
    // eventually finalize instead of being disposed synchronously on the
    // JS thread — confirmed as a real TestFlight crash: that finalization
    // triggers AVCaptureOutput/detachFromFigCaptureSession off the main
    // thread, which asserts and aborts the whole process. This is also
    // almost certainly why the shutter button could feel like "it doesn't
    // work" — a thrown error here was only ever logged to the console, with
    // capturing reset back to tappable and nothing shown to the user at all.
    let photo: Photo | null = null;
    try {
      // vision-camera v5's photo pipeline hands back an in-memory Photo, not
      // a file — saved to a temp file, then read back as base64 the same way
      // shareLook.ts/exportSkinHistory.ts already do elsewhere in this app,
      // rather than hand-rolling an ArrayBuffer→base64 encoder.
      photo = await photoOutput.capturePhoto({ flashMode: 'off' }, {});
      const tempPath = await photo.saveToTemporaryFileAsync();
      const uri = tempPath.startsWith('file://') ? tempPath : `file://${tempPath}`;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      // See getImageSize's own comment — this reads the SAME saved file the
      // native detector reads, instead of guessing at photo.width/height's
      // relationship to it.
      const { width: imgWidth, height: imgHeight } = await getImageSize(uri);

      setStep('quiz');
      setDetectingFace(true);
      setNoFaceWarning(false);
      // isMirrored decides which side ML Kit's anatomical LEFT_CHEEK/
      // LEFT_EYE points actually land on in THIS photo — see
      // deriveZoneMarkers' own comment for why that swap can't just be
      // assumed from vision-camera's typical capture defaults.
      const { faceRegion, noFaceDetected, zoneMarkers } = detectFaceRegion(imageFaceDetector, uri, imgWidth, imgHeight, photo.isMirrored);
      if (__DEV__) {
        console.log('[SkinScanCamera] detectFaceRegion result', {
          imgWidth, imgHeight, photoWidth: photo.width, photoHeight: photo.height, photoOrientation: photo.orientation,
          faceRegion, noFaceDetected, zoneMarkerKeys: zoneMarkers ? Object.keys(zoneMarkers) : null,
        });
      }
      setShot({ uri, base64: stripDataUrlPrefix(base64), mimeType: 'image/jpeg', faceRegion, zoneMarkers });
      setNoFaceWarning(noFaceDetected);
      setDetectingFace(false);
    } catch (err) {
      console.error('[SkinScanCamera] shoot failed', err);
      tapWarning();
      setCaptureError('Could not capture that photo — try again.');
    } finally {
      photo?.dispose();
    }
    setCapturing(false);
  }

  function selectAnswer(questionId: string, choiceId: string) {
    tapLight();
    setAnswers(prev => ({ ...prev, [questionId]: choiceId }));
  }

  const allAnswered = SKIN_QUIZ_QUESTIONS.every(q => !!answers[q.id]);

  // The real analysis is one request/response — Gemini doesn't hand back
  // incremental progress — but showing it as a flat single spinner made the
  // "actually scan a face" step invisible, like a black box. Staged reveals
  // on a timer (a standard pattern for AI operations without real granular
  // progress — the API is one request/response, not a stream, so there's
  // no real per-stage signal to attach to) mirror what's genuinely
  // happening in order: the photo really is checked for a face before
  // tone/type/concerns are ever read from it, and texture/pores/redness/
  // shine/wrinkles really are what the backend's heatmap engine computes
  // (see src/utils/skinHeatmaps.js) — that sequencing and vocabulary are
  // real, it's just the on-screen PACING that's simulated rather than
  // tied to actual milestones from the API.
  //
  // Spread across ~9s (not the old 2.6s) specifically because a real
  // Gemini call commonly runs several seconds and can run past 30s under
  // load (see routes/skin.js's own comment on production timings up to
  // ~36s) — the old 3-stage version topped out at 2.6s and then sat
  // static on "Writing your results…" for however much longer the real
  // wait was, which is exactly the "feels frozen" problem being fixed
  // here. The LAST stage is deliberately sticky (no further timeout) —
  // once reached, copy stays put until the real response actually lands,
  // rather than looping or fabricating a further stage with nothing to
  // legitimately point at.
  const ANALYZING_STAGES = [
    'Reading your photo…',
    'Detecting your face…',
    'Checking skin tone & hydration…',
    'Analyzing texture & pores…',
    'Checking for redness & shine…',
    'Tracing fine lines…',
    'Writing your personalized recommendations…',
  ];
  const [analyzingStage, setAnalyzingStage] = useState(0);
  useEffect(() => {
    if (step !== 'analyzing') { setAnalyzingStage(0); return; }
    const delays = [900, 2000, 3400, 5000, 6600, 8500]; // ms from entering this step to reaching stage i+1
    const timers = delays.map((ms, i) => setTimeout(() => setAnalyzingStage(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [step]);
  // Short crossfade (~200ms) between stage labels instead of the text
  // snapping instantly — same short-motion language the rest of the app
  // uses for state changes (e.g. the framing tips above fade the same way).
  const analyzingTextFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    analyzingTextFade.setValue(0);
    Animated.timing(analyzingTextFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [analyzingStage, analyzingTextFade]);

  async function submit() {
    if (!shot || !allAnswered) return;
    setStep('analyzing');
    setError(null);
    try {
      const { scan, bookCategory, isNewProfile } = await apiScanSkin({
        photoBase64: shot.base64,
        mimeType: shot.mimeType,
        quizAnswers: answers,
        faceRegion: shot.faceRegion || undefined,
        zoneMarkers: shot.zoneMarkers || undefined,
      });
      reset();
      onComplete(scan, bookCategory, isNewProfile);
    } catch (err: any) {
      console.error('[SkinScanCamera] scan failed', err);
      setError(err?.message || 'Could not analyze your photo. Please try again.');
      setStep('quiz');
    }
  }

  // Biggest live-detected face — null when nothing's currently detected.
  // autoMode (below, on the Camera itself) is what makes `bounds` already be
  // in screen/preview coordinates instead of raw sensor-frame pixels — a
  // first hand-rolled version of this scale+rotate math (see git history)
  // assumed frame and screen shared an orientation, which real sensor
  // frames often don't; that's what put the box in the wrong place
  // on-device. autoMode hands the rotation/scaling to the plugin's native
  // side instead of guessing at it in JS.
  const primaryLiveFace = liveFaces.length
    ? liveFaces.reduce((biggest, f) => (f.bounds.width * f.bounds.height > biggest.bounds.width * biggest.bounds.height ? f : biggest), liveFaces[0])
    : null;
  const liveBox = primaryLiveFace?.bounds ?? null;
  // The fixed, honest guide-oval size (OVAL_W×OVAL_H) — NOT the fill-
  // light window's old inflated ~90%-of-screen sizing. That distinction
  // matters beyond the visual: the "too small" threshold below is a
  // fraction of THIS reference, and computed against the old inflated
  // window it meant a normally-framed face (a modest fraction of the full
  // SCREEN width) had to clear 62% of ~90%-of-screen-width to read as
  // "ready" — a bar high enough that "Move a little closer" could show for
  // a perfectly well-framed face. OVAL_W/H is sized as an actual framing
  // guide, not a brightness-coverage window, so the same fraction against
  // it is a real "is this face a reasonable size" check again.
  const fallbackRing = ringGeometry(winW, winH, null);
  const idealCx = fallbackRing.left + fallbackRing.width / 2;
  const idealCy = fallbackRing.top + fallbackRing.height / 2;

  // Three independent gates — Position, Lighting, Head angle — each its own
  // red/amber/green, replacing the old single merged "searching / poor /
  // ready" state. This matches how the industry-standard capture-quality
  // gate works (Sephora/Perfect Corp/Haut.AI/Revieve all show separate
  // Lighting/Angle/Position status): each is a simple, deterministic
  // threshold check, not a trained model, and the shutter only unlocks once
  // ALL THREE read green — no more vague "Move to a brighter area" folded
  // into the same signal as framing.
  type Gate = 'red' | 'amber' | 'green';

  // --- Position: face size + centering relative to the guide oval ---
  // Same underlying signal as before (no new capability needed here), now
  // split into a real three-band read instead of a binary pass/fail so the
  // pill can show amber while genuinely close, not just flip straight from
  // red to green.
  const sizeRatio = liveBox ? liveBox.width / OVAL_W : 0;
  const centerOffsetX = liveBox ? Math.abs(liveBox.x + liveBox.width / 2 - idealCx) / OVAL_W : 1;
  const centerOffsetY = liveBox ? Math.abs(liveBox.y + liveBox.height / 2 - idealCy) / OVAL_H : 1;
  const positionGate: Gate = !liveBox ? 'red'
    : (sizeRatio < 0.62 || centerOffsetX > 0.22 || centerOffsetY > 0.22) ? 'red'
    : (sizeRatio < 0.75 || centerOffsetX > 0.14 || centerOffsetY > 0.14) ? 'amber'
    : 'green';
  const positionReason = !liveBox ? 'Position your face in the frame'
    : sizeRatio < 0.62 ? 'Move a little closer'
    : (centerOffsetX > 0.22 || centerOffsetY > 0.22) ? 'Center your face in the frame'
    : sizeRatio < 0.75 ? 'A little closer'
    : 'Almost centered';

  // --- Head angle: real ML Kit pitch/roll/yaw on the live-tracked face ---
  // These numbers were already being computed by the same on-device
  // detector powering the tracking ring — Bug 1's fix (skinZones.ts) reads
  // them from the STILL photo after capture; this reads them live, before
  // capture, so a tilted-back head (the exact condition that produced
  // off-face zone markers) gets caught and corrected BEFORE the shutter
  // fires, instead of only being handled after the fact by refusing to
  // place a marker.
  const pitchAngle = primaryLiveFace?.pitchAngle ?? null;
  const rollAngle = primaryLiveFace?.rollAngle ?? null;
  const yawAngle = primaryLiveFace?.yawAngle ?? null;
  const maxTilt = pitchAngle == null ? null : Math.max(Math.abs(pitchAngle), Math.abs(rollAngle ?? 0), Math.abs(yawAngle ?? 0));
  const angleGate: Gate = maxTilt == null ? 'red' : maxTilt <= 10 ? 'green' : maxTilt <= 20 ? 'amber' : 'red';
  const angleReason = maxTilt == null ? 'Look straight at the camera' : angleGate === 'red' ? 'Straighten your head' : 'Almost straight';

  // --- Lighting: real per-frame brightness (see lightingOutput above) ---
  // `lightingSample` starts null and only ever gets its first value once
  // the frame-output worklet has actually fired — this is new, on-device
  // native plumbing (react-native-vision-camera-worklets) that could not be
  // verified against a real device from where this was written. Rather
  // than let a worklet that silently never fires permanently red-light the
  // shutter (bricking capture entirely), a short grace window is given for
  // a first sample to arrive; past it with still nothing, lighting is
  // treated as passing (not blocking) rather than failing closed — the
  // same "no verified signal" outcome as before this feature existed, not
  // a worse one. `__DEV__` logging below makes that exact situation
  // impossible to miss if it happens, instead of silently masking a broken
  // frame output as "good light."
  const LIGHTING_GRACE_MS = 1200;
  const lightingGraceElapsed = Date.now() - cameraActiveSinceRef.current > LIGHTING_GRACE_MS;
  const lightingGate: Gate = lightingSample == null
    ? (lightingGraceElapsed ? 'green' : 'red')
    : (lightingSample.avgLuma < 45 || lightingSample.avgLuma > 230 || lightingSample.darkFraction >= 0.5) ? 'red'
    : (lightingSample.avgLuma < 70 || lightingSample.avgLuma > 205 || lightingSample.darkFraction >= 0.3) ? 'amber'
    : 'green';
  const lightingReason = lightingSample != null && lightingSample.avgLuma < 45 ? 'Find brighter light'
    : lightingSample != null && lightingSample.avgLuma > 230 ? 'Too much direct light'
    : lightingSample != null && lightingSample.darkFraction >= 0.3 ? 'Avoid harsh shadows'
    : 'Even out the lighting';

  const allGreen = positionGate === 'green' && angleGate === 'green' && lightingGate === 'green';
  const isReady = allGreen;
  // Priority for the single line of copy under the shutter: a genuinely
  // absent face always wins (nothing else is assessable yet), then
  // whichever gate is worst, in the order a person would naturally fix
  // them — get in frame, then find good light, then straighten up.
  const captureHint = positionGate !== 'green' ? positionReason
    : lightingGate !== 'green' ? lightingReason
    : angleGate !== 'green' ? angleReason
    : 'Perfect — tap to scan';

  useEffect(() => {
    if (isReady && !wasReadyRef.current) {
      tapLight();
      readyScaleAnim.setValue(1.08);
      Animated.spring(readyScaleAnim, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
    }
    wasReadyRef.current = isReady;
  }, [isReady, readyScaleAnim]);

  const ringBox = ringGeometry(winW, winH, liveBox);
  const ringColor = positionGate === 'green' ? Colors.brand : positionGate === 'amber' ? Colors.systemOrange : 'rgba(255,255,255,0.8)';
  const GATE_COLOR: Record<Gate, string> = { red: Colors.systemRed, amber: Colors.systemOrange, green: Colors.brand };
  // __DEV__-only live readout of exactly what each gate is seeing —
  // requested explicitly: a way to visually confirm on-device that these
  // are real, moving numbers, not a static/fake state. Off in production
  // builds (wrapped in the same __DEV__ check used for the console logging
  // elsewhere in this file).
  const debugBox = __DEV__ ? liveBox : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.root}>
        {/* The Camera itself is deliberately NOT gated on step === 'camera'
            — it stays mounted (paused via isActive) for as long as this
            sheet exists at all, only truly unmounting when hasPermission/
            device change (rare) or SkinScanCamera itself unmounts. Mounting
            it fresh on every step change (i.e. every single photo capture)
            crashed on-device in production: React would unmount it after
            each shot, and Hermes's GC finalized the underlying native
            camera session LATER, on its own background thread — vision-
            camera's Swift teardown (AVCaptureSession dealloc →
            detachFromFigCaptureSession) isn't safe to run there, so
            AVFoundation asserted and the whole process aborted. isActive
            (tied to the Modal's own `visible`, not just `step`, so it goes
            false the instant the sheet starts closing too) is vision-
            camera's actual supported start/stop path — synchronous,
            main-thread-coordinated — instead of relying on unmount +
            eventual GC to tear down a native capture session. */}
        {hasPermission && device != null && (
          <FaceDetectCamera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={visible && step === 'camera'}
            outputs={[photoOutput, lightingOutput]}
            onFacesDetected={onFacesDetected}
            onError={(err: Error) => console.error('[SkinScanCamera] camera error', err)}
            performanceMode="fast"
            // Native iOS Low Light Boost — brightens the actual sensor
            // image/preview in dark scenes, not just the screen around it
            // (see the screen-brightness effect above, which is a
            // complementary fill-light, not a substitute for this). Gated
            // on the device actually supporting it, matching vision-
            // camera's own documented usage
            // (CameraDevice.supportsLowLightBoost's doc comment). It's
            // adaptive — iOS only engages it when the scene is actually
            // dark — so normal, well-lit framing is unaffected.
            enableLowLightBoost={device.supportsLowLightBoost}
            // Unlike enableLowLightBoost (adaptive — iOS only engages it in
            // an actually-dark scene), exposure bias is a FIXED offset
            // applied regardless of current light — computed above in
            // exposureBias, platform-aware (see that comment for why this
            // can't just be one flat constant across iOS/Android).
            exposure={exposureBias}
            // autoMode + window size: hands rotation/scaling to the
            // plugin's native side so `face.bounds` come back already in
            // screen/preview coordinates — see the comment above liveBox.
            autoMode
            windowWidth={winW}
            windowHeight={winH}
            onPreviewStarted={() => setCameraReady(true)}
          />
        )}

        {step === 'camera' && hasPermission && device != null && (
          <>
            {/* No mask/scrim over the live feed at all anymore — see
                ringGeometry's own comment for why (three rounds of visible
                artifacts from that approach, the last one a real piece of
                the room bleeding through the gradient's soft edge). Just
                the plain camera feed and this one ring, sized off the live
                tracked face once found or the fixed guide-oval size
                otherwise. The ring itself only ever reflects the Position
                gate now (framing is what it visually frames) — Lighting and
                Head angle get their own pills below, instead of all three
                being folded into one merged ring color/copy the way the old
                single captureState did. */}
            <Animated.View pointerEvents="none" style={[styles.ringWrap, ringBox, { transform: [{ scale: readyScaleAnim }] }]}>
              <ScanBracket
                style={StyleSheet.absoluteFill}
                color={ringColor}
                size={liveBox ? 22 : 18}
                thickness={liveBox ? 3 : 2.5}
                pulse={!isReady}
              />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flashAnim }]} />

            {/* Dev-only: the exact numbers driving all three gates, so this
                can be visually confirmed against the real, moving camera
                feed instead of taken on faith — move your face / tilt your
                head / cover the lens and watch these change live. Never
                present in a production build. */}
            {debugBox && (
              <View style={styles.debugBox} pointerEvents="none">
                <Text style={styles.debugText}>
                  position={positionGate} size={sizeRatio.toFixed(2)} offX={centerOffsetX.toFixed(2)} offY={centerOffsetY.toFixed(2)}
                  {'\n'}angle={angleGate} pitch={pitchAngle?.toFixed(1) ?? '—'} roll={rollAngle?.toFixed(1) ?? '—'} yaw={yawAngle?.toFixed(1) ?? '—'}
                  {'\n'}lighting={lightingGate} avgLuma={lightingSample?.avgLuma.toFixed(1) ?? (lightingGraceElapsed ? 'NO SAMPLE — worklet not firing?' : 'sampling…')} darkFrac={lightingSample?.darkFraction.toFixed(2) ?? '—'}
                  {'\n'}box: x={debugBox.x.toFixed(0)} y={debugBox.y.toFixed(0)} w={debugBox.width.toFixed(0)} h={debugBox.height.toFixed(0)}
                </Text>
              </View>
            )}

            {/* Three independent status pills — Lighting / Head angle /
                Position — each red→amber→green off a real, cheap threshold
                check (no trained model needed, matching how Sephora/Perfect
                Corp/Haut.AI/Revieve all gate capture). Capture only unlocks
                once every pill is green; see isReady above. */}
            <View style={[styles.pillRow, { top: insets.top + 58 }]} pointerEvents="none">
              <View style={[styles.pill, { backgroundColor: GATE_COLOR[lightingGate] }]}>
                <Text style={styles.pillText}>Lighting</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: GATE_COLOR[angleGate] }]}>
                <Text style={styles.pillText}>Look Straight</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: GATE_COLOR[positionGate] }]}>
                <Text style={styles.pillText}>Position</Text>
              </View>
            </View>

            <View style={[styles.topBar, { top: insets.top + 10 }]}>
              <Pressable style={styles.roundBtn} onPress={handleClose} hitSlop={10}>
                <Text style={styles.roundBtnText}>✕</Text>
              </Pressable>
              {/* Backed by the same dark chip roundBtn uses — the live
                  camera feed behind it varies (a bright wall, a window),
                  so this can't assume it's always dark enough for plain
                  white petals to read clearly on their own. */}
              <View style={styles.logoChip}>
                <GlowMark size={22} petal="#fff" petalInner="rgba(255,255,255,0.55)" core={Colors.gold} />
              </View>
              <View style={{ width: 42 }} />
            </View>

            {/* Pushed down from its old insets.top+60 to make room for the
                status pill row above it, which now occupies that space. */}
            {cameraReady && !!tips[tipIndex] && (
              <Animated.View style={[styles.tipCard, { top: insets.top + 98, opacity: tipFade }]} pointerEvents="none">
                <SparkleIcon size={12} color="#fff" />
                <Text style={styles.tipCardText}>{tips[tipIndex]}</Text>
              </Animated.View>
            )}

            <View style={[styles.bottomCluster, { paddingBottom: insets.bottom + 20 }]}>
              {/* One line, one message at a time — this used to double up
                  with a separate always-visible instruction banner saying
                  something adjacent but not identical. The rotating
                  coaching tips above are genuinely different content
                  (personalized photography advice, not gate state), so they
                  stay; this line now speaks only for the three status
                  pills above (see captureHint's own priority order). */}
              <Text style={[styles.hint, !!captureError ? styles.hintError : isReady && styles.hintReady]}>
                {captureError
                  ? captureError
                  : !cameraReady ? 'Camera warming up…'
                  : captureHint}
              </Text>
              <View style={styles.shootRow}>
                <Pressable style={[styles.shutterOuter, isReady && styles.shutterOuterReady]} onPress={shoot} disabled={capturing} hitSlop={12}>
                  <View style={styles.shutterInner}>{capturing && <ActivityIndicator color="#fff" />}</View>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {step === 'camera' && !hasPermission && (
          <View style={styles.permissionGate}>
            <GlowMark size={40} />
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.permissionBody}>
              {canRequestPermission
                ? 'Allow camera access to scan your skin — nothing leaves your control, and photos are only used for your own results.'
                : "Camera access is off for Glow. iOS won't show that prompt again in-app — open Settings and turn it on to scan your skin."}
            </Text>
            <Pressable
              style={styles.permissionBtn}
              onPress={() => (canRequestPermission ? requestPermission() : Linking.openSettings())}
            >
              <Text style={styles.permissionBtnText}>{canRequestPermission ? 'Allow Camera' : 'Open Settings'}</Text>
            </Pressable>
            <Pressable onPress={handleClose} style={{ marginTop: 18 }}>
              <Text style={styles.permissionLink}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {step === 'camera' && hasPermission && device == null && (
          <View style={styles.permissionGate}>
            <GlowMark size={40} />
            <Text style={styles.permissionTitle}>No front camera found</Text>
            <Text style={styles.permissionBody}>This device doesn't have a usable front camera for scanning.</Text>
            <Pressable onPress={handleClose} style={{ marginTop: 18 }}>
              <Text style={styles.permissionLink}>Close</Text>
            </Pressable>
          </View>
        )}

        {step === 'quiz' && shot && (
          <View style={styles.quizRoot}>
            {/* justifyContent: 'center' on the content container (which
                needs the ScrollView's own flex:1 to have a bounded height
                to center WITHIN) — the quiz is down to one question, so
                stretching a scroll area to fill the whole screen and
                pinning the buttons to the very bottom left a large dead
                gap between them; a short screen now reads as intentionally
                compact instead of broken. Still scrolls normally if
                content ever grows past one screen (e.g. error banner +
                warning banner + question all showing on a small device). */}
            <ScrollView
              style={styles.quizScroll}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24, paddingHorizontal: 20 }}
            >
              <View style={styles.quizPhotoRow}>
                <Image source={{ uri: shot.uri }} style={styles.quizPhotoThumb} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.quizTitle}>One quick question</Text>
                  <Text style={styles.quizSubtitle}>
                    {detectingFace ? 'Checking your photo…' : 'Our AI reads the rest straight from your photo.'}
                  </Text>
                </View>
              </View>

              {!!error && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              )}

              {/* Real on-device face detection (not Gemini — free, instant,
                  no rate limit) came back empty for this photo. Not a hard
                  block: Gemini still gets the final say server-side, and a
                  detection miss in tricky lighting doesn't always mean
                  Gemini will miss it too — but worth flagging before
                  spending an upload + API call on it. */}
              {noFaceWarning && (
                <View style={styles.faceWarningBanner}>
                  <Text style={styles.faceWarningBannerText}>We couldn't clearly detect a face in this photo. You can retake it below, or continue anyway.</Text>
                </View>
              )}

              {SKIN_QUIZ_QUESTIONS.map(q => (
                <View key={q.id} style={styles.questionCard}>
                  <Text style={styles.questionText}>{q.question}</Text>
                  <View style={styles.choiceGrid}>
                    {q.choices.map(c => {
                      const active = answers[q.id] === c.id;
                      return (
                        <Pressable
                          key={c.id}
                          style={[styles.choicePill, active && styles.choicePillActive]}
                          onPress={() => selectAnswer(q.id, c.id)}
                        >
                          <Text style={[styles.choicePillText, active && styles.choicePillTextActive]}>{c.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}

              <View style={styles.quizButtonRow}>
                <Pressable onPress={() => { setShot(null); setStep('camera'); }} style={styles.retakeBtn}>
                  <Text style={styles.retakeBtnText}>Retake</Text>
                </Pressable>
                <Pressable
                  style={[styles.analyzeBtn, !allAnswered && styles.analyzeBtnDisabled]}
                  onPress={submit}
                  disabled={!allAnswered}
                >
                  <Text style={styles.analyzeBtnText}>Analyze my skin ✨</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        )}

        {step === 'analyzing' && (
          <View style={styles.analyzingRoot}>
            <SparkleIcon size={40} color={Colors.brand} />
            <ActivityIndicator size="large" color={Colors.brand} style={{ marginTop: 20 }} />
            <Animated.Text style={[styles.analyzingText, { opacity: analyzingTextFade }]}>
              {ANALYZING_STAGES[analyzingStage]}
            </Animated.Text>
            <View style={styles.analyzingSteps}>
              <AnalyzingStepRow label="Face detected" done={analyzingStage >= 1} />
              <AnalyzingStepRow label="Tone, type & hydration read" done={analyzingStage >= 3} active={analyzingStage >= 1 && analyzingStage < 3} />
              <AnalyzingStepRow label="Texture, redness, shine & fine lines checked" done={analyzingStage >= 6} active={analyzingStage >= 3 && analyzingStage < 6} />
              <AnalyzingStepRow label="Personalized recommendations" done={false} active={analyzingStage >= 6} />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const OVAL_W = 220;
const OVAL_H = 280;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  // left/top/width/height come from ringBox at the call site (liveBox once
  // tracking, otherwise the fixed guide-oval size from ringGeometry) —
  // position: 'absolute' is the only fixed part here.
  ringWrap: { position: 'absolute' },
  debugBox: {
    position: 'absolute', left: 12, right: 12, bottom: 190,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: 8,
  },
  debugText: { color: '#0f0', fontSize: 10.5, fontFamily: 'Courier', lineHeight: 14 },
  pillRow: {
    position: 'absolute', left: 0, right: 0, zIndex: 1,
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  pill: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { color: '#fff', fontSize: 11, fontFamily: Fonts.semibold, letterSpacing: 0.2 },
  topBar: {
    position: 'absolute', left: 16, right: 16, zIndex: 2,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  tipCard: {
    position: 'absolute', left: 24, right: 24, zIndex: 2,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  tipCardText: { flex: 1, color: '#fff', fontSize: 12.5, fontFamily: Fonts.medium, lineHeight: 17 },
  roundBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  roundBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.semibold },
  logoChip: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },

  bottomCluster: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 14, alignItems: 'center' },
  // A background pill, not bare white text — the live camera feed behind
  // it varies (a bright wall, daylight), so plain white text can't assume
  // it'll always be legible on its own. Same reasoning the top bar's
  // roundBtn and tipCard already use their own background boxes for.
  hint: {
    color: '#fff', fontSize: 12.5, fontFamily: Fonts.medium,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  hintError: { backgroundColor: Colors.systemRed },
  // Brand-tinted pill instead of the usual neutral dark one, once framing
  // reads as ready — the pill itself picking up the same accent color the
  // ring/shutter do, not just the text changing.
  hintReady: { backgroundColor: Colors.brand },
  shootRow: { flexDirection: 'row', justifyContent: 'center' },
  shutterOuter: {
    width: 78, height: 78, borderRadius: 39,
    borderWidth: 4, borderColor: Colors.brand,
    alignItems: 'center', justifyContent: 'center',
    // A soft shadow keeps the button reading as a raised, distinct
    // control regardless of what's behind it in the live feed.
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 4,
  },
  // Still always tappable regardless of framing state (never actually
  // disabled — a detection false-negative blocking capture entirely would
  // be a worse failure mode than letting someone take the photo on their
  // own judgment). This is cosmetic-only: a deeper shadow reading as
  // "solid, ready to go" once all three gates read green, matching the
  // ring/pills' own color cue instead of contradicting it.
  shutterOuterReady: { shadowOpacity: 0.32, shadowRadius: 12 },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  permissionGate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 14 },
  permissionTitle: { color: '#fff', fontSize: 19, fontFamily: Fonts.semibold, textAlign: 'center' },
  permissionBody: { color: 'rgba(255,255,255,0.7)', fontSize: 13.5, textAlign: 'center', lineHeight: 19, marginTop: -8 },
  permissionBtn: { backgroundColor: Colors.brand, borderRadius: 24, paddingHorizontal: 26, paddingVertical: 13 },
  permissionBtnText: { fontSize: 15, fontFamily: Fonts.semibold, color: '#fff' },
  permissionLink: { color: 'rgba(255,255,255,0.8)', fontSize: 13.5, fontFamily: Fonts.medium },

  quizRoot: { flex: 1, backgroundColor: Colors.systemBackground },
  // flex:1 here is required for the ScrollView's own contentContainerStyle
  // (justifyContent: 'center', set where it's used) to have a bounded
  // height to center within — see the comment there.
  quizScroll: { flex: 1 },
  quizPhotoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 22 },
  quizPhotoThumb: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.brandLight },
  quizTitle: { fontSize: 19, fontFamily: Fonts.display, color: Colors.label },
  quizSubtitle: { fontSize: 12.5, color: Colors.secondaryLabel, fontFamily: Fonts.regular, marginTop: 3 },

  errorBanner: { backgroundColor: '#FDECEC', borderRadius: 14, padding: 12, marginBottom: 16 },
  errorBannerText: { color: Colors.systemRed, fontSize: 12.5, fontFamily: Fonts.medium },
  faceWarningBanner: { backgroundColor: Colors.brandLight, borderRadius: 14, padding: 12, marginBottom: 16 },
  faceWarningBannerText: { color: Colors.brandDark, fontSize: 12.5, fontFamily: Fonts.medium, lineHeight: 17 },

  questionCard: { marginBottom: 20 },
  questionText: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label, marginBottom: 10 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choicePill: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
    backgroundColor: Colors.surfaceCream, borderWidth: 1, borderColor: Colors.separator,
  },
  choicePillActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  choicePillText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.label },
  choicePillTextActive: { color: '#fff', fontFamily: Fonts.semibold },

  // Buttons now live inside the centered scroll content, right after the
  // question, instead of pinned to the screen's bottom edge (see the
  // ScrollView's contentContainerStyle comment above).
  quizButtonRow: { flexDirection: 'row', gap: 10, marginTop: 28 },
  retakeBtn: {
    paddingHorizontal: 18, paddingVertical: 14, borderRadius: 16,
    backgroundColor: Colors.surfaceCream,
  },
  retakeBtnText: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  analyzeBtn: { flex: 1, backgroundColor: Colors.brand, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  analyzeBtnDisabled: { backgroundColor: Colors.systemGray4 },
  analyzeBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.semibold },

  analyzingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.systemBackground, gap: 4 },
  analyzingText: { fontSize: 17, fontFamily: Fonts.semibold, color: Colors.label, marginTop: 16 },
  analyzingSteps: { marginTop: 26, gap: 14, alignItems: 'flex-start' },
});
