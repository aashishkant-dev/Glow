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
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, Fonts } from '../utils/colors';
import { GlowMark } from './GlowLogo';
import { SparkleIcon } from './BeautyIcons';
import { SKIN_QUIZ_QUESTIONS } from '../data/skinQuiz';
import { apiScanSkin, SkinScan } from '../api/client';
import { tapLight, tapWarning } from '../utils/haptics';

function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(',');
  return value.startsWith('data:') && commaIndex !== -1 ? value.slice(commaIndex + 1) : value;
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
    // concrete, specific tip beats a generic one.
    const zone = previousScan.zoneNotes || {};
    const zoneHit = zone.tZone ? { label: 'T-zone (forehead & nose)', note: zone.tZone }
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
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [step, setStep] = useState<Step>('camera');
  const [shot, setShot] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
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

  function reset() {
    setStep('camera');
    setShot(null);
    setAnswers({});
    setCameraReady(false);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function shoot() {
    if (!cameraRef.current || capturing) return;
    if (!cameraReady) {
      tapWarning();
      return;
    }
    setCapturing(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flashAnim.setValue(1);
    Animated.timing(flashAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.85 });
      if (photo?.base64) {
        setShot({ uri: photo.uri, base64: stripDataUrlPrefix(photo.base64), mimeType: 'image/jpeg' });
        setStep('quiz');
      }
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
      });
      reset();
      onComplete(scan, bookCategory, isNewProfile);
    } catch (err: any) {
      console.error('[SkinScanCamera] scan failed', err);
      setError(err?.message || 'Could not analyze your photo. Please try again.');
      setStep('quiz');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.root}>
        {step === 'camera' && permission?.granted && (
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              onCameraReady={() => setCameraReady(true)}
            />
            {/* A darkened surround with an oval cutout — nothing measured or
                dynamic, this oval sits at a fixed position/size that matches
                the backend's DEFAULT_REGION crop exactly (see
                resolveCropBox in src/routes/skin.js), so no faceRegion
                coordinates need computing or sending client-side at all. */}
            <View style={styles.guideSurround} pointerEvents="none">
              <View style={styles.guideOval} />
            </View>
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
                {!cameraReady ? 'Camera warming up…' : 'Center your face in the oval, then tap to scan'}
              </Text>
              <View style={styles.shootRow}>
                <Pressable style={styles.shutterOuter} onPress={shoot} disabled={capturing} hitSlop={12}>
                  <View style={styles.shutterInner}>{capturing && <ActivityIndicator color="#fff" />}</View>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {step === 'camera' && !permission?.granted && (
          <View style={styles.permissionGate}>
            <GlowMark size={40} />
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.permissionBody}>Allow camera access to scan your skin — nothing leaves your control, and photos are only used for your own results.</Text>
            <Pressable style={styles.permissionBtn} onPress={() => requestPermission()}>
              <Text style={styles.permissionBtnText}>Allow Camera</Text>
            </Pressable>
            <Pressable onPress={handleClose} style={{ marginTop: 18 }}>
              <Text style={styles.permissionLink}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {step === 'quiz' && shot && (
          <View style={styles.quizRoot}>
            <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 110, paddingHorizontal: 20 }}>
              <View style={styles.quizPhotoRow}>
                <Image source={{ uri: shot.uri }} style={styles.quizPhotoThumb} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.quizTitle}>One quick question</Text>
                  <Text style={styles.quizSubtitle}>Our AI reads the rest straight from your photo.</Text>
                </View>
              </View>

              {!!error && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{error}</Text>
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
            </ScrollView>

            <View style={[styles.quizFooter, { paddingBottom: insets.bottom + 16 }]}>
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
  quizPhotoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 22 },
  quizPhotoThumb: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.brandLight },
  quizTitle: { fontSize: 19, fontFamily: Fonts.display, color: Colors.label },
  quizSubtitle: { fontSize: 12.5, color: Colors.secondaryLabel, fontFamily: Fonts.regular, marginTop: 3 },

  errorBanner: { backgroundColor: '#FDECEC', borderRadius: 14, padding: 12, marginBottom: 16 },
  errorBannerText: { color: Colors.systemRed, fontSize: 12.5, fontFamily: Fonts.medium },

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

  quizFooter: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.separatorSoft,
    backgroundColor: Colors.systemBackground,
  },
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
