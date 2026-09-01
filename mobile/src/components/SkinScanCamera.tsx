/**
 * SkinScanCamera — capture flow for the "My Space" AI skin scan. Deliberately
 * NOT a third CameraCapture variant: a diagnostic photo must never go through
 * a color filter (it would corrupt the exact signal being analyzed), so this
 * has no filter carousel at all, forces the front camera, and swaps the
 * usual caption/category compose panel for a brief "Checking your photo…"
 * beat + an "Analyzing…" step. No manual quiz — removed deliberately, not
 * an oversight: every real reference this screen is built against (Sephora's
 * own Smart Skin Scan, Perfect Corp's AI Skin Diagnostic) goes from one
 * well-lit selfie straight to results in seconds, with a two-stage
 * "validate capture conditions, THEN analyze" flow instead — which is
 * exactly what the three live status gates below already do. A face found
 * on the captured photo goes straight into analysis with no extra tap; a
 * miss gets an explicit retake prompt instead of a manual "answer this
 * first" gate. What IS reused from CameraCapture is the *pattern* — one
 * flex-column bottom cluster instead of independently-anchored rows — so
 * this starts from the corrected layout, not a second copy of the bug it
 * fixed.
 *
 * Analysis is free/on-device-style pixel math (see src/utils/skinAnalysis.js
 * on the backend) or Gemini vision when configured — never a paid
 * per-call vision API charged against a manual questionnaire's answers.
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
import { useCameraDevice, useCameraPermission, useFrameOutput, usePhotoOutput, type CameraFrameOutput, type CameraRef, type Photo } from 'react-native-vision-camera';
import { Camera as FaceDetectCamera, useImageFaceDetector, type Face as LiveFace } from 'react-native-vision-camera-face-detector';
import { runOnJS } from 'react-native-worklets';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Fonts } from '../utils/colors';
import { GlowMark } from './GlowLogo';
import { SparkleIcon } from './BeautyIcons';
import { apiScanSkin, SkinScan } from '../api/client';
import { tapLight, tapWarning } from '../utils/haptics';
import { ScanBracket } from './ScanBracket';
import { ErrorBoundary } from './ErrorBoundary';
import { deriveZoneMarkers, type RawFacialPoints, type StoredZoneMarkers, type FaceConfidenceSignals } from '../utils/skinZones';
import SkinSegmentationModule from '../../modules/skin-segmentation/src/SkinSegmentationModule';
import { detectFacesInFrame, type DetectedFace } from '../../modules/mediapipe-face-landmarker/src';

// Part 2 of this project's own scope report — OFF by default. Flip to true
// only once modules/mediapipe-face-landmarker has actually been built and
// verified on a real device (see MediaPipeFaceLandmarkerSensor's own
// comment): this module has never been compiled, let alone run — this
// environment has no Swift/Xcode toolchain at all (confirmed in that
// report). While false, MediaPipeFaceLandmarkerSensor never even mounts —
// the existing ML Kit live-detection path below (onFacesDetected/liveFaces)
// is completely unaffected, zero added runtime cost, zero risk.
const USE_MEDIAPIPE_LIVE_DETECTION = false;

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
  // Set only when this capture is an ADDITIONAL angle of an existing scan
  // session (see schema.prisma's SkinScan.parentScanId), never for a
  // normal new scan — passed straight through to apiScanSkin so the
  // backend skips face-matching (already known) and files this angle
  // under the same profile/session instead of starting a new one.
  parentScanId?: string;
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

type Step = 'camera' | 'reviewing' | 'analyzing';

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

// Real per-frame brightness via react-native-vision-camera's Nitro
// useFrameOutput, wired to react-native-worklets through the separately
// installed react-native-vision-camera-worklets package. The Y (luma)
// plane's raw bytes are genuine per-pixel brightness with zero ML model
// needed — averaging a stride-sampled subset of them (not every byte, to
// keep this cheap enough to run every frame) gives a real scene brightness
// reading, and the fraction of very-dark sampled pixels is a cheap proxy
// for "harsh, unevenly lit" rather than "evenly dim." pixelFormat 'yuv' +
// enablePreviewSizedOutputBuffers keep this on the cheap zero-conversion
// path — see useFrameOutput's own doc comment on why 'yuv' (not 'rgb') is
// right when only CPU pixel access is needed, not GPU rendering.
//
// A SEPARATE component, not inline in SkinScanCamera, specifically so it
// can be wrapped in an <ErrorBoundary fallback={null}> at the call site.
// useFrameOutput calls into the native worklets module SYNCHRONOUSLY during
// this component's first render (inside a useMemo) — if the app was built
// without a full native rebuild for the newly-added
// react-native-vision-camera-worklets dependency (a plain JS/Metro reload
// is NOT enough), that call throws immediately. Isolated in its own
// component, that throw is caught by the boundary and this piece alone
// disappears (onOutputReady/onSample simply never fire); inline in the main
// component, the same throw would crash the ENTIRE camera screen, taking
// working position/angle gating and the shutter down with it over a
// completely optional lighting nicety. lightingSample staying null forever
// is already a handled case (see lightingGate's own comment on the grace-
// period fallback) — this just makes "the native module isn't linked" hit
// that exact same safe path instead of a hard crash.
function LightingSensor({ onSample, onOutputReady }: {
  onSample: (s: { avgLuma: number; darkFraction: number; brightFraction: number }) => void;
  onOutputReady: (output: CameraFrameOutput) => void;
}) {
  const lastLightingSampleAtRef = useRef(0);
  const output = useFrameOutput({
    pixelFormat: 'yuv',
    enablePreviewSizedOutputBuffers: true,
    onFrame(frame) {
      'worklet';
      const now = Date.now();
      // Throttles the EXPENSIVE part (sampling + averaging the frame) at
      // the source, not just the React state update after — mutated from
      // inside the worklet, which runs on its own persistent
      // thread/runtime, so this plain ref (not a React state value) is the
      // correct primitive: the same compiled worklet function is reused
      // for every frame rather than recreated, so mutations to a captured
      // ref persist across calls exactly like the vision-camera
      // community's own documented frame-skipping pattern.
      if (now - lastLightingSampleAtRef.current < 350) {
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
      const STRIDE = 41; // prime — avoids landing on a repeating row/column pattern
      const DARK_BYTE_THRESHOLD = 40; // 0-255 luma
      // A harshly backlit frame (bright window/sky behind an underexposed
      // face — the actual scene in the reported "negative/orange-looking"
      // screenshot) can average out to a perfectly normal-looking avgLuma:
      // a large blown-out bright region and a darker face region cancel out
      // in the mean. brightFraction catches that bimodal case directly —
      // what fraction of the frame is already clipped/near-white —
      // independent of what the AVERAGE says.
      const BRIGHT_BYTE_THRESHOLD = 245; // 0-255 luma
      let sum = 0, dark = 0, bright = 0, sampled = 0;
      for (let i = 0; i < len; i += STRIDE) {
        const v = luma[i];
        sum += v;
        if (v < DARK_BYTE_THRESHOLD) dark++;
        if (v > BRIGHT_BYTE_THRESHOLD) bright++;
        sampled++;
      }
      if (sampled === 0) return;
      runOnJS(onSample)({ avgLuma: sum / sampled, darkFraction: dark / sampled, brightFraction: bright / sampled });
    },
  });
  useEffect(() => { onOutputReady(output); }, [output, onOutputReady]);
  return null;
}

// Part 2 of this project's own scope report (live MediaPipe Face Landmarker
// swap): a SEPARATE frame output alongside LightingSensor's, same
// ErrorBoundary-wrapped "fails to empty, never crashes the screen"
// contract — see this component's own call site for why (the same
// "native module not linked/built yet" case LightingSensor's own header
// comment already documents applies here too, and MORE so: this native
// module is genuinely new and unverified against a real device or even a
// compiler, see the scope report).
//
// GATED OFF BY DEFAULT (see USE_MEDIAPIPE_LIVE_DETECTION below) — this
// component is only actually mounted once that flag is flipped on, so
// until MediaPipe is verified working on a real device, this has ZERO
// runtime cost or risk to the existing, working ML Kit live-detection path
// (onFacesDetected/liveFaces below, unchanged).
//
// pixelFormat 'native' (not 'yuv' the way LightingSensor uses) — an
// UNVERIFIED choice: modules/mediapipe-face-landmarker's Swift side wraps
// the raw CVPixelBuffer directly via MPImage(pixelBuffer:) — 'native' there
// deliberately does NOT request a specific conversion the way
// LightingSensor's YUV-plane byte access does; whether MediaPipe's MPImage
// accepts vision-camera's particular default/native buffer format as-is is
// exactly the kind of thing that needs real on-device confirmation — see
// this project's own scope report.
//
// Android is DIFFERENT, and load-bearing, not a symmetric guess: confirmed
// directly against react-native-vision-camera-ocr-plus's own real, working
// Android native code (HybridGlowFaceLandmarker.cpp's own header cites the
// exact same fact from that reference) — VisionCamera v5 delivers GPU-only
// AHardwareBuffers by default on Android, which the CPU-lock path in that
// native code CANNOT read at all. pixelFormat: 'rgb' is what actually
// requests a CPU-readable buffer; without it, every single frame silently
// falls through to the GPU/API-31+ fallback path (or fails outright below
// that). This is the single highest-confidence, most load-bearing fact in
// the entire Android piece of this swap — verify this is still 'rgb' before
// debugging anything else if Android detection comes back empty.
function MediaPipeFaceLandmarkerSensor({ onFacesDetected, onOutputReady }: {
  onFacesDetected: (faces: DetectedFace[]) => void;
  onOutputReady: (output: CameraFrameOutput) => void;
}) {
  const lastUpdateRef = useRef(0);
  const output = useFrameOutput({
    pixelFormat: Platform.OS === 'android' ? 'rgb' : 'native',
    onFrame(frame) {
      'worklet';
      // Same ~10Hz throttle as the existing ML Kit path's onFacesDetected
      // (see that callback's own comment on why 10Hz specifically) — kept
      // identical so a side-by-side comparison between the two detectors
      // (see this project's own scope report on verifying MediaPipe
      // against the ML Kit baseline) isn't confounded by a different
      // update rate.
      const now = Date.now();
      if (now - lastUpdateRef.current < 100) {
        frame.dispose();
        return;
      }
      lastUpdateRef.current = now;
      // Same getNativeBuffer/.pointer/.release() pattern
      // react-native-vision-camera-ocr-plus's own real, working v5 Nitro
      // frame-processor plugin uses (see this project's own research citing
      // that library's Camera.tsx) — a raw native buffer pointer handed
      // directly to the Nitro HybridObject as a worklet-safe synchronous
      // call, not marshaled through React state first.
      const nb = (frame as any).getNativeBuffer() as { pointer: bigint; release: () => void };
      const orientation: string = (frame as any).orientation ?? 'unknown';
      let faces: DetectedFace[] = [];
      try {
        faces = detectFacesInFrame(nb.pointer, orientation);
      } finally {
        nb.release();
      }
      frame.dispose();
      runOnJS(onFacesDetected)(faces);
    },
  });
  useEffect(() => { onOutputReady(output); }, [output, onOutputReady]);
  return null;
}

// Moved to module scope from inside SkinScanCamera (where it's still used,
// alongside GATE_RANK/useStabilized below, which need it here — a local
// type declaration inside the component isn't visible to a module-level
// function).
type Gate = 'red' | 'amber' | 'green';

// Ordinal safety ranking for a Gate — red is worst, green is best — so
// useStabilized below can tell "this new reading is WORSE than what's
// currently shown" from "this is BETTER" without a separate comparator
// argument.
const GATE_RANK: Record<Gate, number> = { red: 0, amber: 1, green: 2 };

// Debounces a Gate against transient single-reading noise — a blink, a
// momentary shadow, one off frame from the detector — without adding a real
// hook library. `raw` is the INSTANTANEOUS value computed fresh every render
// exactly as before (nothing about how positionGate/angleGate/lightingGate
// are computed changes); this only decides how many consecutive times in a
// row a NEW raw value has to show up before it's trusted enough to actually
// update what's displayed.
//
// Asymmetric on purpose (2026-08-31 retune, was a flat symmetric count for
// both directions): a straight N-reading window on EVERY direction change
// was the reported lag — a real, sustained regression (moving out of frame,
// turning away, light dropping) sat on stale "good" status for the same
// window a marginal, hovering-right-at-the-threshold reading needs to avoid
// flicker. Those are different problems. Flicker is only a risk on the
// IMPROVING direction — a reading bouncing back and forth around a
// threshold right as it crosses into "good enough." Going WORSE has no such
// risk (a regression that reverses itself in a frame or two was never
// "ready" to begin with), and a stale-good pill is actively misleading — it
// tells the user they can shoot when they can't. framesToConfirmWorse is
// still 2, not 1: a single transient reading (the blink/shadow/off-frame
// case) is exactly the noise this exists to filter regardless of direction,
// so the WORSE side still requires the same minimal agreement, just fewer
// reads of it than the BETTER side.
function useStabilized(raw: Gate, framesToConfirmBetter: number, framesToConfirmWorse: number): Gate {
  const [stable, setStable] = useState<Gate>(raw);
  const stableRef = useRef<Gate>(raw);
  const pendingRef = useRef<{ value: Gate; count: number } | null>(null);
  useEffect(() => {
    if (raw === stableRef.current) {
      pendingRef.current = null;
      return;
    }
    if (pendingRef.current && pendingRef.current.value === raw) {
      pendingRef.current.count += 1;
    } else {
      pendingRef.current = { value: raw, count: 1 };
    }
    const isWorse = GATE_RANK[raw] < GATE_RANK[stableRef.current];
    const threshold = isWorse ? framesToConfirmWorse : framesToConfirmBetter;
    if (pendingRef.current.count >= threshold) {
      stableRef.current = raw;
      pendingRef.current = null;
      setStable(raw);
    }
  }, [raw, framesToConfirmBetter, framesToConfirmWorse]);
  return stable;
}

export function SkinScanCamera({ visible, onClose, onComplete, previousScan, parentScanId }: Props) {
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
  // qualityPrioritization: 'speed' — this app's real target for the earlier
  // v3/v4-era `photoQualityBalance` prop; vision-camera v5's Nitro rewrite
  // renamed it and moved it here, onto usePhotoOutput. Left unset before
  // this (silently defaulting to this hook's own 'balanced'), which on iOS
  // is exactly the setting that lets AVCapturePhotoOutput run its heavier
  // multi-frame fusion pipeline (Deep Fusion/Smart HDR-class processing) —
  // the same pipeline that does real-time face-detection-driven local
  // tone-mapping/smoothing on the front TrueDepth camera, confirmed baked
  // into the actual stored/analyzed JPEG bytes (not just the live preview)
  // against a real captured scan. 'speed' requests a single-frame capture
  // instead, bypassing that fusion path. Gated on
  // device.supportsSpeedQualityPrioritization (same pattern as
  // enableLowLightBoost below) — usePhotoOutput's own docs say capturePhoto
  // THROWS if the selected device doesn't support the requested
  // prioritization, so this can't just be hardcoded 'speed' unconditionally.
  const photoOutput = usePhotoOutput({
    containerFormat: 'jpeg',
    qualityPrioritization: device?.supportsSpeedQualityPrioritization ? 'speed' : undefined,
  });
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
  // Part 2 of this project's own scope report — only ever populated while
  // USE_MEDIAPIPE_LIVE_DETECTION is true (MediaPipeFaceLandmarkerSensor
  // isn't even mounted otherwise, see that flag's own comment). Its own
  // throttling already happens inside that sensor's worklet, mirroring
  // onFacesDetected's own — no second throttle needed here.
  const [mediaPipeFaces, setMediaPipeFaces] = useState<DetectedFace[]>([]);
  const [mediaPipeOutput, setMediaPipeOutput] = useState<CameraFrameOutput | null>(null);

  // Real per-frame brightness — the one framing signal the live ring
  // couldn't previously give any real answer on (see the old captureState
  // comment, now below, on why it never claimed to detect "poor light").
  // The actual worklet/useFrameOutput logic lives in LightingSensor below,
  // rendered inside an ErrorBoundary — see that component's own header
  // comment for why this needs to be a separate child, not inline here.
  const [lightingSample, setLightingSample] = useState<{ avgLuma: number; darkFraction: number; brightFraction: number } | null>(null);
  const [lightingOutput, setLightingOutput] = useState<CameraFrameOutput | null>(null);

  const [step, setStep] = useState<Step>('camera');
  const [shot, setShot] = useState<{ uri: string; base64: string; mimeType: string; faceRegion: FaceRegion | null; zoneMarkers: StoredZoneMarkers | null; skinMask: { base64: string; width: number; height: number } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which FAMILY of failure `error` belongs to — drives the reviewing-step
  // header/subtitle (see classifyScanError below). null means no submit()
  // failure happened (either nothing's wrong yet, or this is the separate
  // on-device noFaceWarning path, which never touches error/errorKind at
  // all — see shoot()).
  const [errorKind, setErrorKind] = useState<'network' | 'face' | 'server' | null>(null);
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
  // Previously maxed out UNCONDITIONALLY, regardless of actual ambient
  // light — "an overexposed-in-a-bright-room selfie is a minor cosmetic
  // issue; a preview too dark to see yourself in at all is a broken
  // feature." That was true as a one-time choice between two fixed
  // failure modes, but it's what caused a NEW, distinct symptom: a
  // preview that looked badly warped/blown-out in a normally-lit room —
  // maxExposureBias applied to an already-bright scene, not a lens or
  // mirroring bug. Now scaled by the SAME real-time avgLuma reading
  // lightingGate already computes (see LightingSensor above) instead of a
  // static per-device constant: full boost in a genuinely dark scene,
  // tapering to none once the scene is already comfortably lit, so a
  // bright room is never pushed past what it needs. DARK/LIT reuse
  // lightingGate's own thresholds (55 = its "needs light" amber/red
  // boundary, 140 picked partway to its 215 "too bright" ceiling) rather
  // than a second, separately-tuned set that could drift out of sync with
  // it. Falls back to the full boost — the exact previous behavior — only
  // while there's no real brightness reading yet (the sensor's bootstrap
  // window, or a device where its worklet never fires at all; see
  // LightingSensor's own comment): same "assume the worst, fail open"
  // choice already made for lightingGate, not a regression for the
  // genuinely-dark-room case this originally fixed.
  const exposureBias = useMemo(() => {
    if (!device?.supportsExposureBias) return 0;
    const max = device.maxExposureBias;
    const boost = (() => {
      if (lightingSample == null) return max;
      const DARK = 55;
      const LIT = 140;
      const t = Math.max(0, Math.min(1, (lightingSample.avgLuma - DARK) / (LIT - DARK)));
      const base = max * (1 - t);
      // A harshly backlit frame doesn't just need LESS positive boost, it
      // needs active NEGATIVE compensation — avgLuma alone (the t above)
      // can still land mid-range on a backlit frame (see lightingGate's own
      // comment: the blown background and dark face cancel out in the
      // mean), so on its own this function would keep applying a positive
      // bias to a scene that's already over-exposed in parts. brightFraction
      // pulls bias down toward the device's actual negative range as more
      // of the frame clips — full negative range once at least 45% of the
      // sampled frame is already blown (lightingGate's own red threshold
      // for this), scaling from 0 at 15% up to that.
      const clipT = Math.max(0, Math.min(1, (lightingSample.brightFraction - 0.15) / (0.45 - 0.15)));
      const min = device.minExposureBias;
      return base + clipT * (min - base);
    })();
    return Platform.OS === 'android' ? Math.round(boost) : boost;
  }, [device, lightingSample]);

  function reset() {
    setStep('camera');
    setShot(null);
    setCameraReady(false);
    setError(null);
    setErrorKind(null);
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
      // Locks AE/AF/AWB right before the shutter fires — real, documented
      // vision-camera v5 API (CameraController.lockCurrentFocus/
      // lockCurrentExposure/lockCurrentWhiteBalance), confirmed against the
      // installed package's own type definitions, not guessed. Directly
      // targets the earlier warm/smooth-face investigation: continuous
      // auto-exposure/auto-WB can still shift in the instant between the
      // gates reading green and the shutter actually firing — locking
      // freezes whatever the camera was already reading at that
      // already-gated-good moment instead of letting one more auto-
      // adjustment cycle run right as the photo is taken.
      //
      // iOS only — every lock method on CameraController is documented
      // `@platform iOS` with no Android equivalent in this library at all;
      // this is a real, permanent platform gap, not a "not implemented
      // yet." Wrapped in its own try/catch, never blocking capture: a
      // device that doesn't support one of the three locks (see
      // CameraDevice.supportsFocusLocking/supportsExposureLocking/
      // supportsWhiteBalanceLocking) throws, per the API's own docs — a
      // slightly-worse-exposed photo from falling back to auto is a much
      // better failure mode than the shutter not working at all.
      const controller = cameraRef.current?.controller;
      if (Platform.OS === 'ios' && controller) {
        try {
          const locks: Promise<void>[] = [];
          if (device?.supportsFocusLocking) locks.push(controller.lockCurrentFocus());
          if (device?.supportsExposureLocking) locks.push(controller.lockCurrentExposure());
          if (device?.supportsWhiteBalanceLocking) locks.push(controller.lockCurrentWhiteBalance());
          await Promise.all(locks);
        } catch (err) {
          console.warn('[SkinScanCamera] AE/AF/AWB lock failed, capturing with continuous auto instead', err instanceof Error ? err.message : err);
        }
      }
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

      // Fired here, not awaited until right before newShot is built below —
      // same "start early, await late" pattern the backend's own
      // uploadPromise/concernAnalysisPromise already use (routes/skin.js),
      // so this runs CONCURRENTLY with detectFaceRegion's synchronous ML
      // Kit pass just below rather than adding its own latency on top.
      // Never thrown past this point — a genuine miss (no person at all),
      // an unlinked/not-yet-built native module (this is genuinely new
      // code, unverified against a real device or build — see this
      // module's own file header), or any other native failure all
      // collapse to the same "no mask" outcome, which the backend's own
      // buildMasks (skinHeatmaps.js) already treats as a no-regression
      // fallback to its existing ellipse-only occlusion handling. Analysis
      // must never be blocked or degraded by this new, less-proven path.
      const segmentationPromise = SkinSegmentationModule.getSkinSegmentation(uri).catch((err) => {
        console.warn('[SkinScanCamera] getSkinSegmentation failed, falling back to ellipse-only occlusion', err instanceof Error ? err.message : err);
        return null;
      });

      setStep('reviewing');
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
      const segmentation = await segmentationPromise;
      const skinMask = segmentation?.personDetected && segmentation.maskBase64
        ? { base64: segmentation.maskBase64, width: segmentation.maskWidth, height: segmentation.maskHeight }
        : null;
      if (__DEV__) {
        console.log('[SkinScanCamera] getSkinSegmentation result', {
          personDetected: segmentation?.personDetected ?? null,
          maskWidth: segmentation?.maskWidth ?? null,
          maskHeight: segmentation?.maskHeight ?? null,
          hasFaceLandmarks: !!segmentation?.faceLandmarks,
        });
      }
      const newShot = { uri, base64: stripDataUrlPrefix(base64), mimeType: 'image/jpeg', faceRegion, zoneMarkers, skinMask };
      setShot(newShot);
      setNoFaceWarning(noFaceDetected);
      setDetectingFace(false);
      // A face WAS found on the captured still — go straight to analysis,
      // no manual "looks good?" tap required (see submit's own comment on
      // why). A miss stays on 'reviewing' and shows a clear retake prompt
      // instead — real, actionable feedback before spending an upload +
      // Gemini call on a photo likely to get rejected anyway. Deliberately
      // NOT awaited and NOT an early return — this still needs to fall
      // through to setCapturing(false) below exactly like the miss case
      // does; submit() manages the 'analyzing'/'reviewing' step transitions
      // entirely on its own from here.
      if (!noFaceDetected) submit(newShot);
    } catch (err) {
      console.error('[SkinScanCamera] shoot failed', err);
      tapWarning();
      setCaptureError('Could not capture that photo — try again.');
    } finally {
      photo?.dispose();
      // resetFocus() resets ALL THREE locked values back to continuous
      // auto in one call (per its own doc comment) — the live preview
      // should go back to normally auto-adjusting for whatever framing
      // comes next (another attempt after a retake, or the next scan
      // entirely), not stay frozen at whatever the last shot locked to.
      // Fire-and-forget: nothing downstream depends on this completing,
      // and a failure here (device doesn't support locking at all, so
      // there was nothing to reset) shouldn't surface as a capture error.
      if (Platform.OS === 'ios') {
        cameraRef.current?.controller?.resetFocus().catch(() => {});
      }
    }
    setCapturing(false);
  }

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
    'Analyzing pores, texture & dryness…',
    'Checking for redness, dark spots & blemishes…',
    'Tracing fine lines & wrinkles…',
    'Writing your personalized recommendations…',
  ];
  const [analyzingStage, setAnalyzingStage] = useState(0);
  useEffect(() => {
    if (step !== 'analyzing') { setAnalyzingStage(0); return; }
    const delays = [900, 2000, 3400, 5000, 6600, 8500]; // ms from entering this step to reaching stage i+1
    const timers = delays.map((ms, i) => setTimeout(() => setAnalyzingStage(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [step]);
  // Real elapsed seconds since entering this step — NOT a fabricated extra
  // stage (the sticky last stage above is deliberately final; there's no
  // real per-stage signal past it to attach one to, same reasoning as
  // ANALYZING_STAGES' own comment). A genuinely slow-but-still-working
  // request (Gemini's own 25s ceiling, on top of the concurrent upload/
  // reference-photo-fetch overhead — see routes/skin.js) reads as identical
  // to a hang once the last stage stops moving; ticking real elapsed time is
  // an honest "this is still going," not a fake progress claim.
  const [analyzingElapsedSec, setAnalyzingElapsedSec] = useState(0);
  useEffect(() => {
    if (step !== 'analyzing') { setAnalyzingElapsedSec(0); return; }
    const startedAt = Date.now();
    const id = setInterval(() => setAnalyzingElapsedSec(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [step]);
  // Short crossfade (~200ms) between stage labels instead of the text
  // snapping instantly — same short-motion language the rest of the app
  // uses for state changes (e.g. the framing tips above fade the same way).
  const analyzingTextFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    analyzingTextFade.setValue(0);
    Animated.timing(analyzingTextFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [analyzingStage, analyzingTextFade]);

  // Takes the just-captured shot directly rather than reading it off state —
  // called immediately from shoot() the instant on-device detection confirms
  // a face, before the setShot() that triggered it could have committed and
  // re-rendered. No quiz answers: every real reference this camera screen is
  // built against (Sephora's own Smart Skin Scan, Perfect Corp's AI Skin
  // Diagnostic) goes straight from one well-lit selfie to results in
  // seconds — no manual questionnaire gates the scan itself.
  async function submit(shotToSubmit: typeof shot) {
    if (!shotToSubmit) return;
    setStep('analyzing');
    setError(null);
    setErrorKind(null);
    try {
      const { scan, bookCategory, isNewProfile } = await apiScanSkin({
        photoBase64: shotToSubmit.base64,
        mimeType: shotToSubmit.mimeType,
        faceRegion: shotToSubmit.faceRegion || undefined,
        zoneMarkers: shotToSubmit.zoneMarkers || undefined,
        skinMask: shotToSubmit.skinMask || undefined,
        parentScanId,
      });
      reset();
      onComplete(scan, bookCategory, isNewProfile);
    } catch (err: any) {
      // The raw err.message is ALWAYS logged (for debugging/crash
      // reporting) but only ever reaches the screen through
      // classifyScanError's mapped, human copy below — never rendered
      // verbatim. This is what was leaking things like "fetch failed:
      // FetchRequestCanceledException: Fetch request has been canceled (at
      // Expo/NativeResponse.swift:63)" straight into the UI, mislabeled
      // under the on-device "couldn't see a face" copy even though it was a
      // network-layer failure with nothing to do with face detection.
      console.error('[SkinScanCamera] scan failed', err);
      const { kind, message } = classifyScanError(err);
      setErrorKind(kind);
      setError(message);
      setStep('reviewing');
    }
  }

  // client.ts already maps known transport failures (timeout, dropped/
  // canceled connection) to a clean message + a machine-readable `code`
  // ('TIMEOUT'/'NETWORK_ERROR'), and routes/skin.js attaches `code:
  // 'NO_FACE_DETECTED'` / `'LOW_IMAGE_QUALITY'` to its own genuine
  // photo-quality 400s. Branching on `code` means this never has to trust
  // (or guess at) the shape of err.message itself — an err with no
  // recognized code is treated as an opaque server/unknown failure, not
  // shown to the user verbatim, regardless of what it actually says.
  function classifyScanError(err: any): { kind: 'network' | 'face' | 'server'; message: string } {
    const code = err?.code;
    if (code === 'TIMEOUT' || code === 'NETWORK_ERROR') {
      return { kind: 'network', message: 'Connection issue — check your network and try again.' };
    }
    if (code === 'NO_FACE_DETECTED' || code === 'LOW_IMAGE_QUALITY') {
      return { kind: 'face', message: err?.message || "We couldn't clearly see a face in that photo. Try again with good lighting, centered in the oval." };
    }
    return { kind: 'server', message: "Something went wrong on our end — try again in a moment." };
  }

  // Biggest live-detected face — null when nothing's currently detected.
  // autoMode (below, on the Camera itself) is what makes `bounds` already be
  // in screen/preview coordinates instead of raw sensor-frame pixels — a
  // first hand-rolled version of this scale+rotate math (see git history)
  // assumed frame and screen shared an orientation, which real sensor
  // frames often don't; that's what put the box in the wrong place
  // on-device. autoMode hands the rotation/scaling to the plugin's native
  // side instead of guessing at it in JS.
  // Part 2 of this project's own scope report: while
  // USE_MEDIAPIPE_LIVE_DETECTION is on, mediaPipeFaces drives this instead
  // of ML Kit's liveFaces — everything downstream (positionGate/angleGate,
  // the ring, the pills) reads primaryLiveFace/pitchAngle/rollAngle/
  // yawAngle below and neither knows nor cares which detector produced
  // them, by design (see GlowFaceLandmarker.nitro.ts's own header comment
  // on why the native output shape was reduced to match LiveFace exactly).
  // The one real difference handled here: MediaPipe's bounds come back as
  // 0-1 NORMALIZED fractions of the frame (a deliberate scope reduction —
  // see HybridGlowFaceLandmarker.swift's own comment), not the
  // screen/preview PIXEL coordinates ML Kit's own autoMode already
  // provides — scaled to pixels here, once, against the same
  // winW/winH already passed to <FaceDetectCamera> below.
  const primaryLiveFace = USE_MEDIAPIPE_LIVE_DETECTION
    ? (mediaPipeFaces.length
      ? mediaPipeFaces.reduce((biggest, f) => (f.bounds.width * f.bounds.height > biggest.bounds.width * biggest.bounds.height ? f : biggest), mediaPipeFaces[0])
      : null)
    : (liveFaces.length
      ? liveFaces.reduce((biggest, f) => (f.bounds.width * f.bounds.height > biggest.bounds.width * biggest.bounds.height ? f : biggest), liveFaces[0])
      : null);
  const liveBox = primaryLiveFace
    ? (USE_MEDIAPIPE_LIVE_DETECTION
      ? { x: primaryLiveFace.bounds.x * winW, y: primaryLiveFace.bounds.y * winH, width: primaryLiveFace.bounds.width * winW, height: primaryLiveFace.bounds.height * winH }
      : primaryLiveFace.bounds)
    : null;
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
  // into the same signal as framing. (Gate itself is declared at module
  // scope above, alongside GATE_RANK/useStabilized, which need it too.)

  // --- Position: face size + centering relative to the guide oval ---
  // Same underlying signal as before (no new capability needed here), now
  // split into a real three-band read instead of a binary pass/fail so the
  // pill can show amber while genuinely close, not just flip straight from
  // red to green.
  const sizeRatio = liveBox ? liveBox.width / OVAL_W : 0;
  const centerOffsetX = liveBox ? Math.abs(liveBox.x + liveBox.width / 2 - idealCx) / OVAL_W : 1;
  const centerOffsetY = liveBox ? Math.abs(liveBox.y + liveBox.height / 2 - idealCy) / OVAL_H : 1;
  const rawPositionGate: Gate = !liveBox ? 'red'
    : (sizeRatio < 0.62 || centerOffsetX > 0.22 || centerOffsetY > 0.22) ? 'red'
    : (sizeRatio < 0.75 || centerOffsetX > 0.14 || centerOffsetY > 0.14) ? 'amber'
    : 'green';
  // Debounced against single-frame noise (a blink, a momentary shadow, one
  // off reading from the detector) — onFacesDetected fires ~10x/sec (see
  // its own throttle comment), so a run of N-in-a-row is equivalent to "N
  // of the last N agreed" and is simpler to reason about than a sliding
  // majority vote. Asymmetric (2026-08-31 retune — see useStabilized's own
  // comment for the full "why"): 4 reads (~400ms) to confirm an IMPROVED
  // reading, only 2 (~200ms) to confirm a WORSE one — down from a flat 5
  // (~500ms) both ways, which is what made a genuine regression (moving out
  // of frame, turning away) read as the pill just not updating. positionGate
  // (this stabilized value) is what every downstream consumer below —
  // positionReason's outer branch, ringColor, isReady, captureHint, the
  // pill — already reads; nothing past this line needed to change.
  const positionGate = useStabilized(rawPositionGate, 4, 2);
  // Outer branch keys off positionGate (the STABILIZED value) — not the raw
  // sizeRatio/offset thresholds directly — so the pill's status TEXT can
  // never disagree with its status COLOR. This used to re-derive its own
  // red/amber/green split straight from the live, undebounced numbers,
  // which meant the text could update instantly on every ~100ms frame while
  // the color it sits right next to stayed on the OLD stabilized value for
  // up to the full debounce window — a real, visible mismatch (and read, by
  // itself, as "the pill" lagging, since the color is the more salient
  // cue). angleReason/lightingReason already keyed off their own stabilized
  // gates; this was the one gate that didn't. The INNER choice (which of
  // two same-band phrasings — "Move closer" vs "Center your face," "A
  // little closer" vs "Almost centered") still reads the live sizeRatio:
  // both options in a given band are equally valid descriptions of that
  // band, so picking between them live can't contradict a color that's
  // already correct for that band, unlike the outer red/amber/green split.
  const positionReason = !liveBox ? 'Position your face in the frame'
    : positionGate === 'red'
      ? (sizeRatio < 0.62 ? 'Move closer' : 'Center your face')
    : positionGate === 'amber'
      ? (sizeRatio < 0.75 ? 'A little closer' : 'Almost centered')
    : 'Centered';

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
  // Tuning note (2026-08-30): the green cutoff here used to be 10° — TIGHTER
  // than PITCH_GATE_DEG=18 in skinZones.ts, the actual downstream tolerance
  // the analysis pipeline uses to decide whether forehead/chin/jawline are
  // still placeable. That mismatch meant the LIVE gate was blocking the
  // shutter on plenty of photos the backend would have handled fine (nose/
  // cheek/eye zones don't depend on pitch at all; forehead/chin/jawline
  // degrade gracefully to "not assessed" past 18°, not a scan rejection).
  // Raised to sit just under that real tolerance instead of an arbitrary
  // tighter number, so a mostly-frontal photo isn't rejected pre-capture
  // for an angle the backend would have accepted anyway.
  const rawAngleGate: Gate = maxTilt == null ? 'red' : maxTilt <= 15 ? 'green' : maxTilt <= 25 ? 'amber' : 'red';
  // Same debounce as positionGate above: 4 reads (~400ms) to confirm
  // improved, 2 (~200ms) to confirm worse.
  const angleGate = useStabilized(rawAngleGate, 4, 2);
  // Switches on angleGate itself (not a separate re-derivation of the same
  // thresholds) so text and color can't drift apart — the old version's red
  // and amber branches both existed, but green fell through to "Almost
  // straight" too, the same "green pill, non-green-sounding text" bug as
  // positionReason above.
  const angleReason = maxTilt == null ? 'Look straight at the camera'
    : angleGate === 'red' ? 'Straighten your head'
    : angleGate === 'amber' ? 'Almost straight'
    : 'Straight';

  // --- Lighting: real per-frame brightness (see LightingSensor above) ---
  // `lightingSample` starts null and only ever gets its first value once
  // the frame-output worklet has actually fired — this is new, on-device
  // native plumbing (react-native-vision-camera-worklets) that could not be
  // verified against a real device from where this was written, and stays
  // null forever both if that native module was never rebuilt into the app
  // binary (LightingSensor's ErrorBoundary catches that throw — see its own
  // comment) and if it's linked but the callback simply never fires for
  // some other reason. Rather than let either case permanently red-light
  // the shutter (bricking capture entirely over an optional lighting
  // nicety), a short grace window is given for a first sample to arrive;
  // past it with still nothing, lighting is treated as passing (not
  // blocking) rather than failing closed — the same "no verified signal"
  // outcome as before this feature existed, not a worse one. `__DEV__`
  // logging below makes that exact situation impossible to miss if it
  // happens, instead of silently masking it as "good light."
  const LIGHTING_GRACE_MS = 1200;
  const lightingGraceElapsed = Date.now() - cameraActiveSinceRef.current > LIGHTING_GRACE_MS;
  // Tuning note (2026-08-30): green used to require avgLuma in [70,205] —
  // real reported complaints on this exact screen were about being
  // rejected/blank in normal indoor light, and the severity math this
  // photo eventually feeds (skinHeatmaps.js) is SELF-RELATIVE — z-scored
  // against this photo's OWN mean/stddev, not an absolute brightness
  // baseline — so a dimmer-but-evenly-lit room has just as much usable
  // relative signal as a bright one. Loosened the green/amber bands
  // accordingly; the red floor/ceiling (genuinely too dark to see
  // anything, or blown out) is unchanged — those photos really are
  // unusable regardless of relative scoring.
  // brightFraction added after a real reported case: a harshly backlit
  // frame (bright window/sky filling the background, face underexposed in
  // front of it) averaged out to a normal-looking avgLuma — the blown
  // background and the darker face cancelled out in the mean — so this
  // gate read green ("Lighting: Good") on a frame that produced a
  // washed-out, orange-cast, unusable photo. brightFraction (what fraction
  // of the frame is already clipped near-white) catches that bimodal case
  // directly, independent of what the average says.
  const rawLightingGate: Gate = lightingSample == null
    ? (lightingGraceElapsed ? 'green' : 'red')
    : (lightingSample.avgLuma < 40 || lightingSample.avgLuma > 235 || lightingSample.darkFraction >= 0.5 || lightingSample.brightFraction >= 0.45) ? 'red'
    : (lightingSample.avgLuma < 55 || lightingSample.avgLuma > 215 || lightingSample.darkFraction >= 0.35 || lightingSample.brightFraction >= 0.25) ? 'amber'
    : 'green';
  // lightingSample itself only updates ~every 350ms (LightingSensor's own
  // throttle) — sparser than position/angle's ~100ms, but each sample is
  // already a spatial average over thousands of sampled pixels across one
  // full camera frame (see LightingSensor), not a single detector's one
  // pass/fail read, so it's inherently less prone to single-sample noise
  // than position/angle's per-frame gate. 2 reads (~700ms) to confirm
  // improved; 1 (~350ms, i.e. react on the very next sample) to confirm
  // worse — a real lighting drop (someone stepping in front of a window,
  // the phone tilting away from a lamp) is exactly the kind of change a
  // single fresh sample already reflects, and there's no flicker risk on
  // the worsening side (see useStabilized's own comment on why that side
  // doesn't need the same protection as improving does).
  const lightingGate = useStabilized(rawLightingGate, 2, 1);
  // Reads off lightingGate's OWN bands rather than a separately-hand-picked
  // set of cutoffs (45/230/0.3) that didn't actually match the gate's real
  // thresholds (40/235/0.5 red, 55/215/0.35 amber) — that mismatch meant a
  // sample could sit inside the gate's amber/red band while this text still
  // reported the good-lighting default "Even out the lighting" (or vice
  // versa), the exact "color and text disagree" bug this pill is meant to
  // fix. No sample yet during the grace window reads as "Checking…", not a
  // silent blank pill; past the grace window with still nothing, lighting
  // is treated as passing per lightingGate above, so text agrees: "Good".
  // brightFraction checked BEFORE avgLuma's own too-bright branch — a
  // backlit frame is what's actually happening whenever brightFraction is
  // what tripped the gate (avgLuma alone can look fine in that case, per
  // the gate's own comment above), so it gets its own, more accurate
  // message instead of the generic "too bright" one.
  const lightingReason = lightingSample == null
    ? (lightingGraceElapsed ? 'Good' : 'Checking…')
    : lightingGate === 'red'
      ? (lightingSample.brightFraction >= 0.45 ? 'Move light from behind you' : lightingSample.avgLuma < 40 ? 'Too dark' : lightingSample.avgLuma > 235 ? 'Too bright' : 'Avoid harsh shadows')
    : lightingGate === 'amber'
      ? (lightingSample.brightFraction >= 0.25 ? 'Backlit — face the light' : lightingSample.avgLuma < 55 ? 'A bit dark' : lightingSample.avgLuma > 215 ? 'A bit bright' : 'Some shadows')
    : 'Good';

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

  // Auto-capture: once every gate is green AND stays green for
  // AUTO_CAPTURE_HOLD_MS straight, fire the shutter with no tap needed —
  // matches how Sephora/Perfect Corp/ID-scan-style capture flows behave
  // once framing/lighting/angle are all confirmed good. The hold window
  // (not an instant fire the moment isReady flips true) is deliberate: a
  // bare "all green" instant is often a single transient frame (mid-blink
  // recovery, a brief steady moment before drifting again), and firing on
  // that gives a worse photo than the manual-tap flow ever did. Holding for
  // 1.5s straight both filters that out and gives the countdown text below
  // something real to show, rather than a silent surprise capture.
  // Manual tap (the shutter Pressable's onPress) still works at any time
  // and isn't affected by this — it just fires immediately, same as always.
  const AUTO_CAPTURE_HOLD_MS = 1500;
  const autoCaptureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoCaptureRemainingMs, setAutoCaptureRemainingMs] = useState<number | null>(null);
  useEffect(() => {
    const clear = () => {
      if (autoCaptureIntervalRef.current) { clearInterval(autoCaptureIntervalRef.current); autoCaptureIntervalRef.current = null; }
      setAutoCaptureRemainingMs(null);
    };
    if (step !== 'camera' || !visible || capturing || !isReady) { clear(); return; }
    // Already counting down from an earlier tick where isReady was also
    // true — don't restart the clock just because this effect re-ran.
    if (autoCaptureIntervalRef.current) return;
    const startedAt = Date.now();
    setAutoCaptureRemainingMs(AUTO_CAPTURE_HOLD_MS);
    autoCaptureIntervalRef.current = setInterval(() => {
      const remaining = AUTO_CAPTURE_HOLD_MS - (Date.now() - startedAt);
      if (remaining <= 0) {
        clear();
        shoot();
        return;
      }
      setAutoCaptureRemainingMs(remaining);
    }, 100);
    return clear;
  }, [isReady, step, visible, capturing]);

  const ringBox = ringGeometry(winW, winH, liveBox);
  const ringColor = positionGate === 'green' ? Colors.brand : positionGate === 'amber' ? Colors.systemOrange : 'rgba(255,255,255,0.8)';
  // Colors.systemGreen here, NOT Colors.brand (the ring's own pass color,
  // reused above) — brand (#D97A91, rose) sits too close in hue/saturation
  // to systemRed (#D96C6C) and systemOrange (#D99A6C) to read as a distinct
  // color on a small pill; all three are muted rose/terracotta tones from
  // the same part of the wheel. That's what made every pill look the same
  // color regardless of pass/fail last round: the color WAS correctly bound
  // per-gate (GATE_COLOR[lightingGate] etc., unchanged below) — the actual
  // bug was the color choice itself, not the binding. systemGreen (#3BA55D)
  // is already used elsewhere in this app for pass/success states
  // (trustGreen/onlineGreen) and is genuinely distinguishable from both.
  const GATE_COLOR: Record<Gate, string> = { red: Colors.systemRed, amber: Colors.systemOrange, green: Colors.systemGreen };
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
            — it stays mounted (paused via isActive) for as long as the sheet
            is actually open, only truly unmounting when it closes (visible
            goes false), hasPermission/device change (rare), or
            SkinScanCamera itself unmounts. Mounting it fresh on every step
            change (i.e. every single photo capture) crashed on-device in
            production: React would unmount it after each shot, and Hermes's
            GC finalized the underlying native camera session LATER, on its
            own background thread — vision-camera's Swift teardown
            (AVCaptureSession dealloc → detachFromFigCaptureSession) isn't
            safe to run there, so AVFoundation asserted and the whole
            process aborted. isActive (also tied to `visible`, so it goes
            false the instant the sheet starts closing too) is vision-
            camera's actual supported start/stop path — synchronous,
            main-thread-coordinated — instead of relying on unmount +
            eventual GC to tear down a native capture session.

            Gated on `visible` here too (not just hasPermission/device) —
            this component is mounted PERMANENTLY by both real call sites
            (MySpaceScreen's <SkinScanCamera visible={cameraOpen} .../> and
            SkinScanResultScreen's angle-capture instance), only toggling
            `visible`, never actually unmounting SkinScanCamera itself. That
            means without this gate, a real, live AVCaptureSession was being
            created and held open for as long as MySpaceScreen or any scan
            result screen was simply on screen — for the ENTIRE app session
            in practice, whether or not the user ever opened the camera —
            not just "for as long as the sheet exists" as the paragraph
            above assumes. Every extra long-lived session is more exposure
            to the exact GC-timing crash this whole file works around (see
            useCameraSession's patch in patches/), on top of just being
            wasted camera hardware/memory. Session creation is genuinely
            fast, so gating it on `visible` costs a small, one-time delay
            only the first time the sheet opens per mount — not a per-step
            cost, since `visible` doesn't flip on step changes. */}
        {/* Rendered whenever the camera itself is (not gated on step) so its
            hook runs early and lightingOutput is ready by the time the
            Camera below needs it. fallback={null}: see LightingSensor's own
            header comment — losing this is silently invisible, not a
            broken screen. */}
        {visible && hasPermission && device != null && (
          <ErrorBoundary fallback={null}>
            <LightingSensor onSample={setLightingSample} onOutputReady={setLightingOutput} />
          </ErrorBoundary>
        )}
        {/* Part 2 of this project's own scope report — only actually mounts
            while USE_MEDIAPIPE_LIVE_DETECTION is true (default false, see
            that flag's own comment). ErrorBoundary here for the exact same
            reason LightingSensor's own has one: this native module has
            never been built or run — if it isn't linked (or throws for any
            other reason), this piece alone disappears
            (mediaPipeFaces stays [], the flag's own fallback to liveFaces
            below is unaffected) rather than taking down the whole camera
            screen. */}
        {USE_MEDIAPIPE_LIVE_DETECTION && visible && hasPermission && device != null && (
          <ErrorBoundary fallback={null}>
            <MediaPipeFaceLandmarkerSensor onFacesDetected={setMediaPipeFaces} onOutputReady={setMediaPipeOutput} />
          </ErrorBoundary>
        )}
        {visible && hasPermission && device != null && (
          <FaceDetectCamera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={visible && step === 'camera'}
            outputs={[photoOutput, lightingOutput, USE_MEDIAPIPE_LIVE_DETECTION ? mediaPipeOutput : null].filter((o): o is NonNullable<typeof o> => o != null)}
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
                  position={positionGate}(raw {rawPositionGate}) size={sizeRatio.toFixed(2)} offX={centerOffsetX.toFixed(2)} offY={centerOffsetY.toFixed(2)}
                  {'\n'}angle={angleGate}(raw {rawAngleGate}) pitch={pitchAngle?.toFixed(1) ?? '—'} roll={rollAngle?.toFixed(1) ?? '—'} yaw={yawAngle?.toFixed(1) ?? '—'}
                  {'\n'}lighting={lightingGate}(raw {rawLightingGate}) avgLuma={lightingSample?.avgLuma.toFixed(1) ?? (lightingGraceElapsed ? 'NO SAMPLE — worklet not firing?' : 'sampling…')} darkFrac={lightingSample?.darkFraction.toFixed(2) ?? '—'} brightFrac={lightingSample?.brightFraction.toFixed(2) ?? '—'} exposureBias={exposureBias.toFixed(2)}
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
                <Text style={styles.pillStatusText} numberOfLines={1}>{lightingReason}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: GATE_COLOR[angleGate] }]}>
                <Text style={styles.pillText}>Look Straight</Text>
                <Text style={styles.pillStatusText} numberOfLines={1}>{angleReason}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: GATE_COLOR[positionGate] }]}>
                <Text style={styles.pillText}>Position</Text>
                <Text style={styles.pillStatusText} numberOfLines={1}>{positionReason}</Text>
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

            {/* Setup tips (remove glasses, clear your forehead, face a
                window) and the three live status pills were both trying to
                occupy the same "top of screen" attention at once — real
                clutter, not a styling nitpick. They're now mutually
                exclusive instead of always-both-visible: tips only show
                before any face is being tracked at all (positionGate ===
                'red', liveBox null) — genuinely "how do I get set up"
                advice for that moment — and disappear the instant a face is
                found, when the pills' own specific, real-time feedback
                (Lighting/Look Straight/Position) is strictly more useful
                than a generic rotating tip competing for the same space. */}
            {cameraReady && positionGate === 'red' && !!tips[tipIndex] && (
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
                  : autoCaptureRemainingMs != null ? `Hold still — capturing in ${Math.ceil(autoCaptureRemainingMs / 1000)}…`
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

        {/* No quiz step anymore — a face found on the captured still goes
            straight into submit()/'analyzing' from shoot() itself (see its
            own comment on why: every real reference this screen is built
            against skips a manual questionnaire for the scan). This step is
            genuinely visible only for a brief "Checking your photo…" beat,
            or — when on-device detection came back empty — an explicit
            retake prompt instead of silently pressing on into an upload +
            Gemini call that's very likely to get rejected anyway. */}
        {step === 'reviewing' && shot && (
          <View style={styles.reviewRoot}>
            <ScrollView
              style={styles.reviewScroll}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24, paddingHorizontal: 20 }}
            >
              <View style={styles.reviewPhotoRow}>
                <Image source={{ uri: shot.uri }} style={styles.reviewPhotoThumb} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  {/* Three genuinely different failure families, three
                      different headers — a canceled/dropped network request
                      is not a face-detection problem, and telling the user
                      "we couldn't see your face" for it sends them to fix
                      the wrong thing (repositioning/relighting won't help a
                      network issue). noFaceWarning (on-device, pre-submit)
                      and errorKind==='face' (server-side, post-submit) are
                      the only two paths that legitimately get the
                      face-detection copy. */}
                  <Text style={styles.reviewTitle}>
                    {detectingFace ? 'Checking your photo…'
                      : errorKind === 'network' ? 'Connection issue'
                      : errorKind === 'server' ? 'Something went wrong'
                      : "Let's try that again"}
                  </Text>
                  <Text style={styles.reviewSubtitle}>
                    {detectingFace ? 'One second.'
                      : errorKind === 'network' ? 'Check your network and try again.'
                      : errorKind === 'server' ? "That scan didn't go through. Try again in a moment."
                      : "We couldn't clearly see a face in this one."}
                  </Text>
                </View>
              </View>

              {/* Only shown for the face-quality family — it's the one case
                  where the mapped message carries real, specific-to-this-
                  photo guidance beyond the subtitle above (e.g. Perfect
                  Corp's own reason, or the exact retake nudge). Network/
                  server failures already say everything useful in the
                  subtitle itself; repeating it in a second banner would
                  just be noise. */}
              {!!error && errorKind === 'face' && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              )}

              {/* Real on-device face detection (not Gemini — free, instant,
                  no rate limit) came back empty for this photo — a clear
                  "we couldn't get a good reading" state instead of pressing
                  on into a results screen built on data that was never
                  confidently there, or spending an upload + Gemini call on
                  a photo the backend's own low-confidence gate is very
                  likely to reject anyway (see routes/skin.js). Retake is
                  the only action here on purpose — no "continue anyway";
                  the old escape hatch just deferred the same rejection by
                  several seconds instead of preventing it. */}
              {noFaceWarning && !detectingFace && (
                <>
                  <View style={styles.faceWarningBanner}>
                    <Text style={styles.faceWarningBannerText}>Try even, front-facing light with your whole face — including your forehead — clearly in frame.</Text>
                  </View>
                  <Pressable onPress={() => { setShot(null); setStep('camera'); }} style={styles.retakeBtnFull}>
                    <Text style={styles.retakeBtnFullText}>Retake photo</Text>
                  </Pressable>
                </>
              )}

              {/* submit() failures (any errorKind) had NO action here at all
                  before — the screen showed the header/banner and just sat
                  there. Network/server failures don't mean the photo itself
                  was bad, so those retry the SAME shot instead of discarding
                  a perfectly good photo and forcing a full retake; only the
                  face-quality family (the photo genuinely was the problem)
                  sends the user back to the camera. */}
              {!!error && !detectingFace && (
                <Pressable
                  onPress={() => {
                    if (errorKind === 'face') { setShot(null); setStep('camera'); }
                    else submit(shot);
                  }}
                  style={styles.retakeBtnFull}
                >
                  <Text style={styles.retakeBtnFullText}>{errorKind === 'face' ? 'Retake photo' : 'Try again'}</Text>
                </Pressable>
              )}
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
              <AnalyzingStepRow label="Pores, texture, redness, dark spots & fine lines checked" done={analyzingStage >= 6} active={analyzingStage >= 3 && analyzingStage < 6} />
              <AnalyzingStepRow label="Personalized recommendations" done={false} active={analyzingStage >= 6} />
            </View>
            {/* Only past the point the fixed-delay stages above stop moving
                (analyzingStage reaches its last, sticky index at 8.5s — see
                ANALYZING_STAGES' own effect) AND only once it's been long
                enough that a real user would start to wonder — a real,
                ticking number instead of a static spinner, so a genuinely
                slow-but-working request (see this effect's own comment on
                why this can legitimately run past a minute) doesn't read
                identically to a hang. */}
            {analyzingStage >= ANALYZING_STAGES.length - 1 && analyzingElapsedSec >= 12 && (
              <Text style={styles.analyzingStillWorking}>Still working — a thorough read can take up to a minute ({analyzingElapsedSec}s)…</Text>
            )}
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
  pill: {
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, minWidth: 84,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
    elevation: 3, alignItems: 'center',
  },
  pillText: { color: '#fff', fontSize: 11, fontFamily: Fonts.semibold, letterSpacing: 0.2 },
  // The actual pass/fail status per pill (e.g. "Too dark", "Move closer",
  // "Good") — previously each pill only carried its color and a static
  // category label (Lighting/Look Straight/Position) with no text
  // explaining what was wrong or how to fix it before capture.
  pillStatusText: { color: 'rgba(255,255,255,0.92)', fontSize: 9.5, fontFamily: Fonts.medium, marginTop: 1 },
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

  reviewRoot: { flex: 1, backgroundColor: Colors.systemBackground },
  // flex:1 here is required for the ScrollView's own contentContainerStyle
  // (justifyContent: 'center', set where it's used) to have a bounded
  // height to center within — see the comment there.
  reviewScroll: { flex: 1 },
  reviewPhotoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 22 },
  reviewPhotoThumb: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.brandLight },
  reviewTitle: { fontSize: 19, fontFamily: Fonts.display, color: Colors.label },
  reviewSubtitle: { fontSize: 12.5, color: Colors.secondaryLabel, fontFamily: Fonts.regular, marginTop: 3 },

  errorBanner: { backgroundColor: '#FDECEC', borderRadius: 14, padding: 12, marginBottom: 16 },
  errorBannerText: { color: Colors.systemRed, fontSize: 12.5, fontFamily: Fonts.medium },
  faceWarningBanner: { backgroundColor: Colors.brandLight, borderRadius: 14, padding: 12, marginBottom: 16 },
  faceWarningBannerText: { color: Colors.brandDark, fontSize: 12.5, fontFamily: Fonts.medium, lineHeight: 17 },

  retakeBtnFull: {
    marginTop: 4, paddingVertical: 15, borderRadius: 16,
    backgroundColor: Colors.brand, alignItems: 'center',
  },
  retakeBtnFullText: { fontSize: 15, fontFamily: Fonts.semibold, color: '#fff' },

  analyzingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.systemBackground, gap: 4 },
  analyzingText: { fontSize: 17, fontFamily: Fonts.semibold, color: Colors.label, marginTop: 16 },
  analyzingSteps: { marginTop: 26, gap: 14, alignItems: 'flex-start' },
  analyzingStillWorking: { marginTop: 22, fontSize: 12, fontFamily: Fonts.medium, color: Colors.tertiaryLabel, textAlign: 'center', paddingHorizontal: 32 },
});
