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
import { useCameraDevice, useCameraPermission, usePhotoOutput, type CameraRef } from 'react-native-vision-camera';
import { Camera as FaceDetectCamera, useImageFaceDetector, type Face as LiveFace } from 'react-native-vision-camera-face-detector';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, Fonts } from '../utils/colors';
import { GlowMark } from './GlowLogo';
import { SparkleIcon } from './BeautyIcons';
import { SKIN_QUIZ_QUESTIONS } from '../data/skinQuiz';
import { apiScanSkin, SkinScan } from '../api/client';
import { tapLight, tapWarning } from '../utils/haptics';
import { zoneRectToPhotoFrac, ZONE_META } from '../utils/skinZones';
import { ScanBracket } from './ScanBracket';

// All 8 zones, geometry-only — this drives the live preview's sub-brackets,
// shown before any actual analysis has run (see the comment where it's
// used, below).
const LIVE_ZONE_KEYS = ZONE_META.map(z => z.key);

function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(',');
  return value.startsWith('data:') && commaIndex !== -1 ? value.slice(commaIndex + 1) : value;
}

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
function detectFaceRegion(detector: ReturnType<typeof useImageFaceDetector>, uri: string, imgWidth: number, imgHeight: number): { faceRegion: FaceRegion | null; noFaceDetected: boolean } {
  if (Platform.OS === 'web' || !imgWidth || !imgHeight) return { faceRegion: null, noFaceDetected: false };
  try {
    const faces = detector.detectFaces(uri);
    if (!faces || faces.length === 0) return { faceRegion: null, noFaceDetected: true };

    // Largest face wins — guards against a photo/poster in the background
    // being picked over the real subject.
    const face = faces.reduce((biggest, f) => (f.bounds.width * f.bounds.height > biggest.bounds.width * biggest.bounds.height ? f : biggest), faces[0]);
    const { x: left, y: top, width, height } = face.bounds;

    // ML Kit's box is tight — roughly eyebrows-to-chin — so it's expanded
    // into a fuller "beauty crop" that actually includes the forehead, full
    // jaw, and a little ear/temple margin on each side, matching what the
    // zone markers (SkinZoneOverlay) and DEFAULT_REGION fallback assume.
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
    // device to verify it against). The expansion above produces a
    // predictably portrait-ish box (~0.85 width/height ratio) for a normal
    // face — anything far outside that range, or sitting in the bottom
    // half of the photo, is far more likely a bad detection than a real
    // face shot that low in a front-camera selfie. Falling back to no
    // client-detected region (server's DEFAULT_REGION center-crop) is a
    // known-reasonable result; trusting a malformed box is not.
    const aspect = region.width / region.height;
    const plausible = aspect > 0.45 && aspect < 1.6 && region.y < 0.45 && region.width < 0.85;
    if (!plausible) {
      console.warn('[SkinScanCamera] rejected implausible face detection', region);
      return { faceRegion: null, noFaceDetected: false };
    }

    return { faceRegion: region, noFaceDetected: false };
  } catch (err) {
    // Web already returned early above, so reaching here means a native
    // build — genuinely not linked (an update from before this module was
    // added) is possible but rare; worth logging either way. This exact
    // catch block previously hid a real, now-fixed bug (see the
    // orientation comment above) behind total silence, which made it
    // indistinguishable from "not linked" with nothing to go on from a bug
    // report alone.
    console.warn('[SkinScanCamera] detectFaces threw', err instanceof Error ? err.message : err);
    return { faceRegion: null, noFaceDetected: false };
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
  const imageFaceDetector = useImageFaceDetector({ performanceMode: 'accurate' });
  const cameraRef = useRef<CameraRef>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  // Real-time face box from the live preview — pure UI feedback (see the
  // file header comment for why the actual analyzed faceRegion is computed
  // separately, from the captured photo, not from this stream).
  const [liveFaces, setLiveFaces] = useState<LiveFace[]>([]);
  // onFacesDetected has no built-in rate limit — it fires on every frame
  // the native side processes, and the plugin doesn't expose a throttle
  // option. Each call re-renders the main bracket plus all 8 zone
  // brackets; doing that at full frame rate is enough JS-thread work to
  // visibly stall the UI (the preview itself is native and keeps
  // rendering, but everything ELSE — including how responsive the screen
  // feels — can bog down badly enough to read as "frozen"). Capping
  // state updates to ~10/sec is still smooth for a slowly-moving tracking
  // box and cuts that load by roughly two-thirds to five-sixths depending
  // on the device's actual detection rate.
  const lastFaceUpdateRef = useRef(0);
  const onFacesDetected = useCallback((faces: LiveFace[]) => {
    const now = Date.now();
    if (now - lastFaceUpdateRef.current < 100) return;
    lastFaceUpdateRef.current = now;
    setLiveFaces(faces);
  }, []);
  const [step, setStep] = useState<Step>('camera');
  const [shot, setShot] = useState<{ uri: string; base64: string; mimeType: string; faceRegion: FaceRegion | null } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Real on-device detection found zero faces in the captured photo — not
  // fatal (Gemini still gets the final say server-side), just a heads-up
  // before spending an upload + API call on a photo likely to get rejected.
  const [noFaceWarning, setNoFaceWarning] = useState(false);
  const [detectingFace, setDetectingFace] = useState(false);
  const flashAnim = useRef(new Animated.Value(0)).current;

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
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flashAnim.setValue(1);
    Animated.timing(flashAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    try {
      // vision-camera v5's photo pipeline hands back an in-memory Photo, not
      // a file — saved to a temp file, then read back as base64 the same way
      // shareLook.ts/exportSkinHistory.ts already do elsewhere in this app,
      // rather than hand-rolling an ArrayBuffer→base64 encoder.
      const photo = await photoOutput.capturePhoto({ flashMode: 'off' }, {});
      const tempPath = await photo.saveToTemporaryFileAsync();
      const uri = tempPath.startsWith('file://') ? tempPath : `file://${tempPath}`;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      // photo.width/height are the SENSOR/BUFFER dimensions — vision-camera's
      // own docs say orientation is "applied lazily via EXIF flags," meaning
      // it's NOT baked into these two properties. detector.detectFaces(uri)
      // below reads the actual saved FILE, which — like every standard image
      // loader — respects that EXIF tag, so a 'left'/'right' (90°) capture
      // returns face bounds in the CORRECTED, rotated space while width/
      // height here would still be the pre-rotation, swapped pair. That
      // mismatch is exactly what an earlier comment in detectFaceRegion
      // flagged as a suspected cause without being able to verify it
      // on-device; since then the identical bug was confirmed AND fixed on
      // the server side (sharp has the same "metadata is pre-rotation"
      // behavior — see resolveCropBox in src/routes/skin.js), and a direct
      // production DB query showed 100% of recent scans landing on the
      // server's generic DEFAULT_REGION fallback — consistent with this
      // detector's plausibility check rejecting every single detection,
      // exactly what a systematic coordinate-space mismatch would cause.
      const swapsDimensions = photo.orientation === 'left' || photo.orientation === 'right';
      const imgWidth = swapsDimensions ? photo.height : photo.width;
      const imgHeight = swapsDimensions ? photo.width : photo.height;
      photo.dispose();

      setStep('quiz');
      setDetectingFace(true);
      setNoFaceWarning(false);
      const { faceRegion, noFaceDetected } = detectFaceRegion(imageFaceDetector, uri, imgWidth, imgHeight);
      setShot({ uri, base64: stripDataUrlPrefix(base64), mimeType: 'image/jpeg', faceRegion });
      setNoFaceWarning(noFaceDetected);
      setDetectingFace(false);
    } catch (err) {
      console.error('[SkinScanCamera] shoot failed', err);
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
  // progress) mirror what's genuinely happening in order: the photo really
  // is analyzed for a face before tone/type ever get read from it, that
  // sequencing is real, it's just the on-screen pacing that's simulated
  // rather than tied to actual milestones from the API.
  const [analyzingStage, setAnalyzingStage] = useState(0);
  useEffect(() => {
    if (step !== 'analyzing') { setAnalyzingStage(0); return; }
    const t1 = setTimeout(() => setAnalyzingStage(1), 1100);
    const t2 = setTimeout(() => setAnalyzingStage(2), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [step]);

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
            outputs={[photoOutput]}
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
            {/* Real-time corner-bracket tracking — the ID-scan/dermatology-
                app visual language (four L-marks, not a full outline box) —
                replaces the old fixed oval guide with the actual detected
                face for THIS frame. Pulses gently to read as "actively
                scanning." A dimmed surround still frames the scene when no
                face is found yet, same reassurance the oval gave, just
                honest about not knowing where the face actually is until
                one's detected. */}
            {liveBox ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <ScanBracket
                  style={{ left: liveBox.x, top: liveBox.y, width: liveBox.width, height: liveBox.height }}
                  color={Colors.brand}
                  size={22}
                  thickness={3}
                  pulse
                />
                {/* Same 8-zone proportions the result screen's tappable
                    markers use (see skinZones.ts) — real-time preview of
                    exactly what a finished scan will call out, not just a
                    generic face outline. This live preview always draws all
                    8 (it's a geometric guide, shown before any actual
                    analysis has run); the result screen only ever shows the
                    subset Gemini actually had something to say about for
                    THIS photo. zoneRectToPhotoFrac is unit-agnostic (pure
                    ratio math), so passing liveBox's screen-pixel
                    coordinates as the "face box" works exactly like passing
                    0–1 fractions elsewhere. */}
                {LIVE_ZONE_KEYS.map(zone => {
                  const r = zoneRectToPhotoFrac(zone, liveBox);
                  return (
                    <ScanBracket
                      key={zone}
                      style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
                      color="rgba(255,255,255,0.85)"
                      size={10}
                      thickness={1.5}
                    />
                  );
                })}
              </View>
            ) : (
              <View style={styles.guideSurround} pointerEvents="none">
                <View style={styles.guideOval} />
              </View>
            )}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flashAnim }]} />

            <View style={[styles.topBar, { top: insets.top + 10 }]}>
              <Pressable style={styles.roundBtn} onPress={handleClose} hitSlop={10}>
                <Text style={styles.roundBtnText}>✕</Text>
              </Pressable>
              <GlowMark size={22} petal="#fff" petalInner="rgba(255,255,255,0.55)" core={Colors.gold} />
              <View style={{ width: 42 }} />
            </View>

            {cameraReady && !!tips[tipIndex] && (
              <Animated.View style={[styles.tipCard, { top: insets.top + 60, opacity: tipFade }]} pointerEvents="none">
                <SparkleIcon size={12} color="#fff" />
                <Text style={styles.tipCardText}>{tips[tipIndex]}</Text>
              </Animated.View>
            )}

            <View style={[styles.bottomCluster, { paddingBottom: insets.bottom + 20 }]}>
              <Text style={styles.hint}>
                {!cameraReady ? 'Camera warming up…' : liveBox ? 'Face detected — tap to scan' : 'Center your face in frame, then tap to scan'}
              </Text>
              <View style={styles.shootRow}>
                <Pressable style={styles.shutterOuter} onPress={shoot} disabled={capturing} hitSlop={12}>
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
            <Text style={styles.analyzingText}>
              {analyzingStage === 0 ? 'Reading your photo…' : analyzingStage === 1 ? 'Analyzing your skin…' : 'Writing your results…'}
            </Text>
            <View style={styles.analyzingSteps}>
              <AnalyzingStepRow label="Face detected" done={analyzingStage >= 1} />
              <AnalyzingStepRow label="Tone, type & texture read" done={analyzingStage >= 2} />
              <AnalyzingStepRow label="Personalized recommendations" done={false} active={analyzingStage >= 2} />
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
  guideSurround: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  guideOval: {
    width: OVAL_W, height: OVAL_H, borderRadius: OVAL_W,
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.85)',
  },
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

  bottomCluster: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 14, alignItems: 'center' },
  hint: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontFamily: Fonts.medium },
  shootRow: { flexDirection: 'row', justifyContent: 'center' },
  shutterOuter: {
    width: 78, height: 78, borderRadius: 39,
    borderWidth: 4, borderColor: Colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
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
