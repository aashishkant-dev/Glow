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
import React, { useRef, useState } from 'react';
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
  onComplete: (scan: SkinScan, bookCategory: string) => void;
}

type Step = 'camera' | 'quiz' | 'analyzing';

export function SkinScanCamera({ visible, onClose, onComplete }: Props) {
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

  async function submit() {
    if (!shot || !allAnswered) return;
    setStep('analyzing');
    setError(null);
    try {
      const { scan, bookCategory } = await apiScanSkin({
        photoBase64: shot.base64,
        mimeType: shot.mimeType,
        quizAnswers: answers,
      });
      reset();
      onComplete(scan, bookCategory);
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
                  <Text style={styles.quizTitle}>A few quick questions</Text>
                  <Text style={styles.quizSubtitle}>This helps us read your skin type accurately.</Text>
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
            <Text style={styles.analyzingText}>Analyzing your skin…</Text>
            <Text style={styles.analyzingSub}>Reading tone, type, and a few key signals</Text>
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
  analyzingSub: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.secondaryLabel, marginTop: 4 },
});
