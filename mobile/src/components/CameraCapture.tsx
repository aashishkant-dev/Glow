/**
 * Full-screen, camera-first capture flow — Snapchat/Instagram-style: live
 * viewfinder (with filters applied live, not just after the shot) → tap for
 * a photo or hold for up to 6s of video → one compose screen with caption,
 * "post to a Look" destination, and a single Post button. Replaces the old
 * "tap New Post → OS action sheet → OS picker → separate caption modal"
 * chain with something that actually feels like a camera app.
 *
 * Two variants:
 *  - `onPost` (Posts tab): full compose panel — caption, category, "post to
 *    a Look" destination, Post button. This component owns the whole flow
 *    and calls back with everything once the artist taps Post.
 *  - `onCapture` (Looks tab's photo grid): simpler — filter picker + "Use
 *    Photo", hands the raw asset back for the caller to manage (a look's
 *    filter applies once to the whole gallery, chosen separately there).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions, FlashMode, CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
// The default 'expo-file-system' export (SDK 54+) is the new File/Directory
// class API with no readAsStringAsync — calling it throws at runtime. The
// classic functional API (still needed here for a plain "read this local
// video file as base64") lives at the 'legacy' subpath. See the matching
// comment in api/client.ts, which hit this same break first.
import * as FileSystem from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Colors, Fonts } from '../utils/colors';
import { FilterPreview } from './FilterPreview';
import { PHOTO_FILTERS } from '../data/photoFilters';
import { CATEGORIES } from '../data/categories';
import { ProviderLookItem } from '../api/client';
import { GlowMark } from './GlowLogo';
import { ImageCropper } from './ImageCropper';

export interface CapturedAsset { type: 'photo' | 'video'; uri: string; base64: string; mimeType: string; }

// On web, expo-camera's takePictureAsync returns `base64` as a full
// "data:image/jpeg;base64,AAAA..." data URL rather than bare base64 (native
// returns bare base64 already). Uploading the un-stripped string corrupts
// the image server-side, so always strip the data URL prefix if present.
function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(',');
  return value.startsWith('data:') && commaIndex !== -1 ? value.slice(commaIndex + 1) : value;
}

interface PostSubmission {
  asset?: CapturedAsset;
  videoBase64?: string;
  videoMimeType?: string;
  filter: string;
  caption?: string;
  category?: string;
  lookId?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  // "quick" variant (Looks):
  onCapture?: (asset: CapturedAsset, filter: string) => void;
  // "post" variant (Posts) — this component owns caption/category/destination.
  onPost?: (params: PostSubmission) => Promise<void> | void;
  myLooks?: ProviderLookItem[];
  // Pre-selects a category (e.g. opened from a specific specialty's "+" tile)
  // — only meaningful for the "post" variant.
  initialCategory?: string;
}

const MAX_RECORD_SECONDS = 6;

type Shot =
  | { kind: 'photo'; uri: string; base64: string; mimeType: string }
  | { kind: 'video'; uri: string; mimeType: string };

export function CameraCapture({ visible, onClose, onCapture, onPost, myLooks = [], initialCategory }: Props) {
  const insets = useSafeAreaInsets();
  const isPostVariant = !!onPost;
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [filter, setFilter] = useState('original');
  const [submitting, setSubmitting] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

  // Compose panel (post variant only)
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [lookId, setLookId] = useState<string | null>(null);

  // Photo/Video mode switch — the shutter is a single tap either way
  // (shoot a photo, or start/stop up to 6s of video); no hold gesture.
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>('photo');
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const recordInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // expo-camera's recordAsync is native-only — it silently does nothing on
  // web. This wraps the CameraView so we can reach into the DOM for the
  // <video> element it renders on web (its own internal ref isn't exposed
  // through CameraView's imperative handle) and record that stream directly
  // with the browser's own MediaRecorder — without this, video simply never
  // worked at all in a browser.
  const viewfinderWrapRef = useRef<View>(null);
  const webRecorderRef = useRef<any>(null);
  const webChunksRef = useRef<any[]>([]);

  // Shutter flash (white flicker on capture) and a quick crossfade into the
  // preview screen — replaces the previous hard instant swap between
  // viewfinder and preview, which read as a glitch rather than a shutter.
  const flashAnim = useRef(new Animated.Value(0)).current;
  const previewAnim = useRef(new Animated.Value(0)).current;

  // Seed the preset category (from a specific specialty's "+" tile) as soon
  // as the camera opens, so it's already selected by the time the compose
  // panel appears rather than needing the artist to pick it again.
  React.useEffect(() => {
    if (visible) setCategory(initialCategory ?? null);
  }, [visible, initialCategory]);

  useEffect(() => {
    if (shot) {
      previewAnim.setValue(0);
      Animated.timing(previewAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [shot, previewAnim]);

  function reset() {
    setShot(null);
    setFilter('original');
    setCameraReady(false);
    setCaption('');
    setCategory(null);
    setLookId(null);
    setRecording(false);
    setRecordSecs(0);
    setCaptureMode('photo');
    if (autoStopTimer.current) { clearTimeout(autoStopTimer.current); autoStopTimer.current = null; }
    if (recordInterval.current) { clearInterval(recordInterval.current); recordInterval.current = null; }
  }

  // Native video is a real file:// URI — expo-file-system reads it fine. Web
  // video is a blob: object URL from our own MediaRecorder — expo-file-
  // system's web shim doesn't implement readAsStringAsync at all (throws),
  // so it's read directly via fetch + FileReader instead.
  async function videoUriToBase64(uri: string): Promise<string> {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return stripDataUrlPrefix(dataUrl);
    }
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  }

  async function shoot() {
    if (!cameraRef.current || !cameraReady || capturing) return;
    setCapturing(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    flashAnim.setValue(1);
    Animated.timing(flashAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.8 });
      if (photo?.base64) {
        setShot({ kind: 'photo', uri: photo.uri, base64: stripDataUrlPrefix(photo.base64), mimeType: 'image/jpeg' });
      }
    } catch (err) {
      console.error('[CameraCapture] shoot failed', err);
    }
    setCapturing(false);
  }

  // Picks the best codec this browser actually supports, in quality order —
  // MediaRecorder throws immediately if constructed with an unsupported
  // mimeType, so this has to be checked before creating one.
  function pickWebRecorderMimeType(): string {
    const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const MR: any = (globalThis as any).MediaRecorder;
    for (const c of candidates) {
      if (MR?.isTypeSupported?.(c)) return c;
    }
    return 'video/webm';
  }

  function findViewfinderVideoEl(): any {
    const node: any = viewfinderWrapRef.current;
    if (!node || typeof node.querySelector !== 'function') return null;
    return node.querySelector('video');
  }

  function startWebRecording(): boolean {
    const videoEl = findViewfinderVideoEl();
    const stream = videoEl?.srcObject;
    if (!stream) return false;
    const mimeType = pickWebRecorderMimeType();
    webChunksRef.current = [];
    const MR: any = (globalThis as any).MediaRecorder;
    const recorder = new MR(stream, { mimeType });
    recorder.ondataavailable = (e: any) => { if (e.data && e.data.size > 0) webChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(webChunksRef.current, { type: mimeType });
      const uri = URL.createObjectURL(blob);
      setShot({ kind: 'video', uri, mimeType });
    };
    webRecorderRef.current = recorder;
    recorder.start();
    return true;
  }

  function stopWebRecording() {
    try { webRecorderRef.current?.stop(); } catch {}
    webRecorderRef.current = null;
  }

  async function startRecording() {
    if (!cameraReady || recording) return;
    if (!micPermission?.granted) {
      const res = await requestMicPermission();
      if (!res.granted) return;
    }
    if (Platform.OS === 'web') {
      if (!startWebRecording()) return;
      setRecording(true);
      setRecordSecs(0);
      recordInterval.current = setInterval(() => setRecordSecs(s => Math.min(s + 1, MAX_RECORD_SECONDS)), 1000);
      autoStopTimer.current = setTimeout(() => stopRecording(), MAX_RECORD_SECONDS * 1000);
      return;
    }
    if (!cameraRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRecording(true);
    setRecordSecs(0);
    recordInterval.current = setInterval(() => {
      setRecordSecs(s => Math.min(s + 1, MAX_RECORD_SECONDS));
    }, 1000);
    try {
      // recordAsync's own maxDuration already auto-stops at 6s on native, no
      // separate timer needed here (unlike the web path above).
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_RECORD_SECONDS });
      if (video?.uri) setShot({ kind: 'video', uri: video.uri, mimeType: 'video/mp4' });
    } catch (err) {
      console.error('[CameraCapture] recordAsync failed', err);
    } finally {
      setRecording(false);
      if (recordInterval.current) clearInterval(recordInterval.current);
    }
  }

  function stopRecording() {
    if (autoStopTimer.current) { clearTimeout(autoStopTimer.current); autoStopTimer.current = null; }
    if (recordInterval.current) { clearInterval(recordInterval.current); recordInterval.current = null; }
    if (Platform.OS === 'web') {
      stopWebRecording();
      setRecording(false);
    } else {
      cameraRef.current?.stopRecording();
    }
  }

  function handleShutterPress() {
    if (captureMode === 'video') {
      if (recording) stopRecording();
      else startRecording();
    } else {
      shoot();
    }
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.8, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    const a = result.assets[0];
    setShot({ kind: 'photo', uri: a.uri, base64: a.base64!, mimeType: a.mimeType ?? 'image/jpeg' });
  }

  function handleClose() {
    reset();
    onClose();
  }

  function retake() {
    setShot(null);
    setCaption(''); setCategory(null); setLookId(null);
  }

  function applyCrop(result: { uri: string; base64: string; mimeType: string }) {
    setShot({ kind: 'photo', uri: result.uri, base64: result.base64, mimeType: result.mimeType });
    setCropOpen(false);
  }

  // "Quick" variant (Looks) — hand the raw asset back, caller manages the
  // rest. Works for either a photo or a video shot.
  async function confirmQuick() {
    if (!shot || !onCapture) return;
    const f = filter;
    if (shot.kind === 'photo') {
      const asset: CapturedAsset = { type: 'photo', uri: shot.uri, base64: shot.base64, mimeType: shot.mimeType };
      reset();
      onCapture(asset, f);
      return;
    }
    const base64 = await videoUriToBase64(shot.uri);
    const asset: CapturedAsset = { type: 'video', uri: shot.uri, base64, mimeType: shot.mimeType };
    reset();
    onCapture(asset, f);
  }

  // "Post" variant — this component owns the whole submission.
  async function submitPost() {
    if (!shot || !onPost) return;
    setSubmitting(true);
    try {
      if (shot.kind === 'photo') {
        await onPost({
          asset: { type: 'photo', uri: shot.uri, base64: shot.base64, mimeType: shot.mimeType },
          filter, caption: caption.trim() || undefined, category: category || undefined, lookId: lookId || undefined,
        });
      } else {
        const videoBase64 = await videoUriToBase64(shot.uri);
        await onPost({ videoBase64, videoMimeType: shot.mimeType, filter, caption: caption.trim() || undefined, category: category || undefined, lookId: lookId || undefined });
      }
      reset();
      onClose();
    } catch (err: any) {
      console.error('[CameraCapture] submitPost failed', err);
      Alert.alert('Post failed', err?.message || 'Could not post. Please try again.');
    }
    setSubmitting(false);
  }

  const eligibleLooks = myLooks.filter(l => l.media.length < 5);

  return (
    <>
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.root}>
        {shot ? (
          // ── Preview + filter carousel + (post variant) compose panel ────
          // Fades in (previewAnim) instead of hard-swapping from the
          // viewfinder — a beat of crossfade is what makes the shutter feel
          // like a real capture instead of a screen glitch.
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: previewAnim }]}>
            <View style={StyleSheet.absoluteFill}>
              {shot.kind === 'photo' ? (
                <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <VideoPreview uri={shot.uri} />
              )}
              {(() => {
                const active = PHOTO_FILTERS.find(f => f.id === filter);
                return active?.previewOverlay ? (
                  <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: active.previewOverlay }]} />
                ) : null;
              })()}
            </View>

            <View style={[styles.topBar, { top: insets.top + 10 }]}>
              <Pressable style={styles.roundBtn} onPress={retake} hitSlop={10}>
                <Text style={styles.roundBtnText}>✕</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {shot.kind === 'photo' && (
                  <Pressable style={styles.roundBtn} onPress={() => setCropOpen(true)} hitSlop={10}>
                    <Text style={styles.roundBtnText}>✂︎</Text>
                  </Pressable>
                )}
                {!isPostVariant && (
                  <Pressable style={[styles.roundBtn, styles.confirmBtn]} onPress={confirmQuick} hitSlop={10}>
                    <Text style={styles.confirmBtnText}>{shot.kind === 'video' ? 'Use Video' : 'Use Photo'}</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={[styles.previewBottom, { paddingBottom: insets.bottom + 14 }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
                {PHOTO_FILTERS.map(f => {
                  const active = filter === f.id;
                  return (
                    <Pressable key={f.id} onPress={() => setFilter(f.id)} style={{ alignItems: 'center', gap: 5 }}>
                      <View style={[styles.filterSwatch, active && styles.filterSwatchActive]}>
                        {shot.kind === 'photo' ? (
                          <FilterPreview uri={shot.uri} overlay={f.previewOverlay} size={52} />
                        ) : (
                          <View style={[styles.videoFilterDot, f.previewOverlay ? { backgroundColor: f.previewOverlay } : { backgroundColor: '#444' }]} />
                        )}
                      </View>
                      <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{f.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {isPostVariant && (
                <View style={styles.composePanel}>
                  <TextInput
                    style={styles.captionInput}
                    value={caption}
                    onChangeText={setCaption}
                    placeholder="Write a caption…"
                    placeholderTextColor="rgba(255,255,255,0.55)"
                    multiline
                    maxLength={280}
                  />

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
                    {CATEGORIES.map(c => {
                      const active = category === c.name;
                      return (
                        <Pressable key={c.id} style={[styles.chip, active && styles.chipActive]} onPress={() => setCategory(active ? null : c.name)}>
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* A look's gallery mixes photos and video clips now, so
                      this destination picker works the same regardless of
                      what was just shot. Each look chip carries its own
                      cover thumbnail so "linked to a Look" reads as a real
                      visual connection, not just a text label. */}
                  {eligibleLooks.length > 0 && (
                    <>
                      <Text style={styles.destinationLabel}>Post to</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 8 }}>
                        <Pressable style={[styles.chip, !lookId && styles.chipActive]} onPress={() => setLookId(null)}>
                          <Text style={[styles.chipText, !lookId && styles.chipTextActive]}>Your feed</Text>
                        </Pressable>
                        {eligibleLooks.map(l => {
                          const active = lookId === l.id;
                          const cover = l.media[0]?.url;
                          return (
                            <Pressable key={l.id} style={[styles.lookChip, active && styles.chipActive]} onPress={() => setLookId(active ? null : l.id)}>
                              {cover ? (
                                <Image source={{ uri: cover }} style={styles.lookChipThumb} contentFit="cover" />
                              ) : (
                                <View style={[styles.lookChipThumb, { backgroundColor: l.themeFrom || Colors.brandAccent }]} />
                              )}
                              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{l.name}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </>
                  )}

                  <Pressable style={styles.postBtn} onPress={submitPost} disabled={submitting}>
                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.postBtnText}>Post ✨</Text>}
                  </Pressable>
                </View>
              )}
            </View>
          </Animated.View>
        ) : permission?.granted ? (
          // ── Live viewfinder — filters apply live, Photo/Video mode switch
          //    picks what a shutter tap does. ──────────────────────────────
          <>
            <View ref={viewfinderWrapRef} style={StyleSheet.absoluteFill}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                flash={flash}
                onCameraReady={() => setCameraReady(true)}
              />
            </View>
            {(() => {
              const active = PHOTO_FILTERS.find(f => f.id === filter);
              return active?.previewOverlay ? (
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: active.previewOverlay }]} />
              ) : null;
            })()}
            {/* Shutter flash — a quick white flicker on capture, the visual
                cue a real camera gives that a photo was actually taken. */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flashAnim }]} />

            <View style={[styles.topBar, { top: insets.top + 10 }]}>
              <Pressable style={styles.roundBtn} onPress={handleClose} hitSlop={10}>
                <Text style={styles.roundBtnText}>✕</Text>
              </Pressable>
              <GlowMark size={22} petal="#fff" petalInner="rgba(255,255,255,0.55)" core={Colors.gold} />
              <Pressable style={styles.roundBtn} onPress={() => setFlash(prev => prev === 'off' ? 'on' : 'off')} hitSlop={10}>
                <Text style={styles.roundBtnText}>{flash === 'off' ? '⚡︎' : '⚡︎!'}</Text>
              </Pressable>
            </View>

            {recording && (
              <View style={[styles.recordBadge, { top: insets.top + 60 }]}>
                <View style={styles.recordDot} />
                <Text style={styles.recordText}>{recordSecs}s / {MAX_RECORD_SECONDS}s</Text>
              </View>
            )}

            {/* Live filter carousel — the same set, applied to the feed in
                real time, not just picked after the fact. */}
            <View style={[styles.liveFilterBar, { bottom: 168 }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
                {PHOTO_FILTERS.map(f => {
                  const active = filter === f.id;
                  return (
                    <Pressable key={f.id} onPress={() => setFilter(f.id)} style={[styles.liveFilterChip, active && styles.liveFilterChipActive]}>
                      <Text style={[styles.liveFilterChipText, active && styles.liveFilterChipTextActive]}>{f.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Photo/Video mode switch — a plain tap on the shutter shoots a
                photo or starts/stops up to 6s of video, whichever mode is
                selected here. Replaces the old hold-to-record gesture, which
                also never worked on web at all (recordAsync is native-only). */}
            {!recording && (
              <View style={[styles.modeSwitchRow, { bottom: 168 + 54 }]}>
                <Pressable onPress={() => setCaptureMode('photo')} style={[styles.modePill, captureMode === 'photo' && styles.modePillActive]}>
                  <Text style={[styles.modePillText, captureMode === 'photo' && styles.modePillTextActive]}>Photo</Text>
                </Pressable>
                <Pressable onPress={() => setCaptureMode('video')} style={[styles.modePill, captureMode === 'video' && styles.modePillActive]}>
                  <Text style={[styles.modePillText, captureMode === 'video' && styles.modePillTextActive]}>Video · 6s</Text>
                </Pressable>
              </View>
            )}

            <View style={[styles.shootBar, { paddingBottom: insets.bottom + 24 }]}>
              <Pressable style={styles.sideBtn} onPress={pickFromLibrary} disabled={recording}>
                <View style={styles.libraryIcon} />
                <Text style={styles.sideBtnText}>Library</Text>
              </Pressable>

              <Pressable
                style={[styles.shutterOuter, recording && styles.shutterOuterRecording]}
                onPress={handleShutterPress}
                disabled={!cameraReady || capturing}
              >
                <View style={[styles.shutterInner, recording && styles.shutterInnerRecording, captureMode === 'video' && !recording && styles.shutterInnerVideoReady]}>
                  {capturing && <ActivityIndicator color="#fff" />}
                </View>
              </Pressable>

              <Pressable style={styles.sideBtn} onPress={() => setFacing(prev => prev === 'back' ? 'front' : 'back')} disabled={recording}>
                <Text style={styles.flipGlyph}>⟲</Text>
                <Text style={styles.sideBtnText}>Flip</Text>
              </Pressable>
            </View>
            <Text style={[styles.holdHint, { bottom: insets.bottom + 132 }]}>
              {recording ? 'Tap the shutter again to stop early' : captureMode === 'video' ? 'Tap to record up to 6s' : 'Tap to shoot'}
            </Text>
          </>
        ) : (
          // ── Permission gate ─────────────────────────────────────────────
          <View style={styles.permissionGate}>
            <GlowMark size={40} />
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.permissionBody}>Allow camera access to shoot directly, Instagram-style.</Text>
            <Pressable style={styles.permissionBtn} onPress={() => requestPermission()}>
              <Text style={styles.permissionBtnText}>Allow Camera</Text>
            </Pressable>
            <Pressable onPress={pickFromLibrary} style={{ marginTop: 14 }}>
              <Text style={styles.permissionLink}>Choose from library instead</Text>
            </Pressable>
            <Pressable onPress={handleClose} style={{ marginTop: 18 }}>
              <Text style={styles.permissionLink}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
    <ImageCropper
      visible={cropOpen}
      uri={shot?.kind === 'photo' ? shot.uri : null}
      onCancel={() => setCropOpen(false)}
      onDone={applyCrop}
    />
    </>
  );
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute', left: 16, right: 16, zIndex: 2,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  roundBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  roundBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.semibold },
  confirmBtn: { width: 'auto', paddingHorizontal: 18, backgroundColor: Colors.brand },
  confirmBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.semibold },

  recordBadge: {
    position: 'absolute', alignSelf: 'center', zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5,
  },
  recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },
  recordText: { color: '#fff', fontSize: 12, fontFamily: Fonts.semibold },

  liveFilterBar: { position: 'absolute', left: 0, right: 0 },
  liveFilterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'transparent',
  },
  liveFilterChipActive: { backgroundColor: Colors.brand, borderColor: '#fff' },
  liveFilterChipText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: Fonts.medium },
  liveFilterChipTextActive: { color: '#fff', fontFamily: Fonts.semibold },

  holdHint: { position: 'absolute', alignSelf: 'center', color: 'rgba(255,255,255,0.65)', fontSize: 11.5, fontFamily: Fonts.medium },

  modeSwitchRow: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 4,
  },
  modePill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  modePillActive: { backgroundColor: Colors.brand },
  modePillText: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontFamily: Fonts.semibold },
  modePillTextActive: { color: '#fff' },

  shootBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 36, paddingTop: 20,
  },
  sideBtn: { alignItems: 'center', gap: 4, width: 56 },
  sideBtnText: { color: '#fff', fontSize: 11, fontFamily: Fonts.medium },
  libraryIcon: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  flipGlyph: { color: '#fff', fontSize: 22 },
  shutterOuter: {
    width: 78, height: 78, borderRadius: 39,
    borderWidth: 4, borderColor: Colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterOuterRecording: { borderColor: '#FF3B30' },
  shutterInner: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInnerRecording: { borderRadius: 14, backgroundColor: '#FF3B30', width: 30, height: 30 },
  shutterInnerVideoReady: { backgroundColor: '#FF3B30' },

  previewBottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  filterSwatch: { borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  filterSwatchActive: { borderColor: '#fff' },
  videoFilterDot: { width: 52, height: 52, borderRadius: 12 },
  filterLabel: { fontSize: 11, fontFamily: Fonts.medium, color: 'rgba(255,255,255,0.75)' },
  filterLabelActive: { color: '#fff', fontFamily: Fonts.semibold },

  composePanel: {
    marginTop: 14, marginHorizontal: 16, borderRadius: 20, padding: 14,
    backgroundColor: 'rgba(20,10,14,0.72)',
  },
  captionInput: {
    color: '#fff', fontSize: 14, fontFamily: Fonts.regular, minHeight: 40, maxHeight: 80,
  },
  chip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  chipActive: { backgroundColor: Colors.brand },
  chipText: { fontSize: 12.5, fontFamily: Fonts.medium, color: 'rgba(255,255,255,0.85)' },
  chipTextActive: { color: '#fff', fontFamily: Fonts.semibold },
  destinationLabel: { marginTop: 10, fontSize: 11, fontFamily: Fonts.semibold, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.4 },
  lookChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 4, paddingRight: 13, paddingVertical: 4, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)', maxWidth: 150,
  },
  lookChipThumb: { width: 26, height: 26, borderRadius: 13 },
  postBtn: {
    marginTop: 14, backgroundColor: Colors.brand, borderRadius: 16,
    paddingVertical: 13, alignItems: 'center',
  },
  postBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.semibold },

  permissionGate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 14 },
  permissionTitle: { color: '#fff', fontSize: 19, fontFamily: Fonts.semibold, textAlign: 'center' },
  permissionBody: { color: 'rgba(255,255,255,0.7)', fontSize: 13.5, textAlign: 'center', lineHeight: 19, marginTop: -8 },
  permissionBtn: { backgroundColor: Colors.brand, borderRadius: 24, paddingHorizontal: 26, paddingVertical: 13 },
  permissionBtnText: { fontSize: 15, fontFamily: Fonts.semibold, color: '#fff' },
  permissionLink: { color: 'rgba(255,255,255,0.8)', fontSize: 13.5, fontFamily: Fonts.medium },
});
