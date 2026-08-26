/**
 * Full-screen preview + share for a branded "card" — a photo with the actual
 * details (look name/price, or a scan's AI summary/tone/type) baked into a
 * single shareable image, instead of the bare photo the old share button
 * sent. Captures the visible card (ViewShot) and hands it to the OS share
 * sheet, so what a customer sees on Instagram/iMessage is this designed card,
 * not a raw file with no context.
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { Colors, Fonts } from '../utils/colors';
import { GlowMark } from './GlowLogo';
import { CloseCircleIcon } from './TabIcons';

export interface ShareCardSpec {
  photoUrl: string;
  kicker: string;
  title: string;
  subtitle?: string;
  meta?: string;
  chips?: string[];
  shareCaption: string;
}

interface Props {
  visible: boolean;
  card: ShareCardSpec | null;
  onClose: () => void;
}

async function webDownload(uri: string) {
  const res = await fetch(uri);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = 'glow-card.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

async function shareLocalFile(uri: string, dialogTitle: string) {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    // Web Share API for files only exists on a subset of mobile browsers —
    // most desktop browsers (and several mobile ones) have no nav.share at
    // all, or have it without file support. That used to just dead-end in
    // an alert with no way to actually get the card; downloading the PNG
    // directly always works everywhere, so it's the real fallback, not the
    // last resort.
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      const file = new File([blob], 'glow-card.png', { type: 'image/png' });
      if (nav?.canShare?.({ files: [file] })) {
        await nav.share({ title: dialogTitle, files: [file] });
        return;
      }
      await webDownload(uri);
    } catch (err) {
      console.error('[ShareCardModal] web share/download failed', err);
      Alert.alert('Could not share', 'Please try again.');
    }
    return;
  }
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    Alert.alert('Sharing unavailable', 'Sharing is not supported on this device.');
    return;
  }
  await Sharing.shareAsync(uri, { dialogTitle, mimeType: 'image/png' });
}

// Separate from shareLocalFile — a "Download" button should always save the
// file directly, not open a share sheet (which the Share button already
// covers, and which itself buries "Save Image" a tap or two deep on iOS).
// expo-media-library's ADD_ONLY permission (NSPhotoLibraryAddUsageDescription,
// already declared in app.json for exactly this) writes straight into the
// user's photo library without needing full library read access.
async function downloadLocalFile(uri: string) {
  if (Platform.OS === 'web') {
    await webDownload(uri);
    return;
  }
  const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    if (canAskAgain) {
      Alert.alert('Could not save', 'Photo library access was not granted.');
    } else {
      Alert.alert('Photos access needed', 'Enable photo access in Settings to save this card.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
    }
    return;
  }
  await MediaLibrary.saveToLibraryAsync(uri);
  Alert.alert('Saved', 'The card was saved to your photos.');
}

async function captureCard(shotRef: React.RefObject<any>): Promise<string> {
  const uri = await captureRef(shotRef, { format: 'png', quality: 0.95 });
  // Native returns a cache-file path already shareable as-is; web returns a
  // data: URI, which both shareLocalFile and downloadLocalFile's fetch()-to-
  // Blob paths also handle fine — same call either way.
  if (Platform.OS === 'web' || uri.startsWith('file://')) return uri;
  const dest = `${FileSystem.cacheDirectory}glow-share-${Date.now()}.png`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export function ShareCardModal({ visible, card, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const shotRef = useRef<any>(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const busy = sharing || downloading;

  async function doShare() {
    if (!card || busy) return;
    setSharing(true);
    try {
      const uri = await captureCard(shotRef);
      await shareLocalFile(uri, card.shareCaption);
    } catch (err) {
      console.error('[ShareCardModal] capture/share failed', err);
      Alert.alert('Could not share', 'Please try again.');
    }
    setSharing(false);
  }

  async function doDownload() {
    if (!card || busy) return;
    setDownloading(true);
    try {
      const uri = await captureCard(shotRef);
      await downloadLocalFile(uri);
    } catch (err) {
      console.error('[ShareCardModal] capture/download failed', err);
      Alert.alert('Could not save', 'Please try again.');
    }
    setDownloading(false);
  }

  if (!card) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <Pressable style={[styles.closeBtn, { top: insets.top + 14 }]} onPress={onClose} hitSlop={10}>
          <CloseCircleIcon size={30} color="rgba(255,255,255,0.85)" />
        </Pressable>

        <View style={styles.cardWrap}>
          {/* Native pinch-to-zoom (ScrollView's own minimumZoomScale/
              maximumZoomScale, no new dependency) — same mechanism already
              used for the full result photo. captureRef below always
              targets the ViewShot's own natural CARD_W x CARD_H layout
              regardless of the surrounding ScrollView's current zoom/pan,
              so a capture mid-zoom still comes out as the full, correctly
              framed card. */}
          <ScrollView
            style={styles.card}
            contentContainerStyle={styles.cardZoomContent}
            minimumZoomScale={1}
            maximumZoomScale={3}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            centerContent
          >
            <ViewShot ref={shotRef} style={styles.card} options={{ format: 'png', quality: 0.95 }}>
              <Image source={{ uri: card.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={['transparent', 'rgba(20,10,13,0.55)', 'rgba(20,10,13,0.94)']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />

              {/* Small watermark-style credit, not a shout — the previous
                  bold all-caps lockup was the actual complaint (a real
                  scan/look photo read as "an ad for Glow" more than a
                  personal share), so this keeps just enough presence to
                  say where the reading came from. */}
              <View style={styles.brandRow}>
                <GlowMark size={13} petal="rgba(255,255,255,0.85)" petalInner="rgba(255,255,255,0.4)" core={Colors.gold} />
                <Text style={styles.brandText}>Glow</Text>
              </View>

              <View style={styles.content}>
                <Text style={styles.kicker}>{card.kicker}</Text>
                <Text style={styles.title} numberOfLines={2}>{card.title}</Text>
                {!!card.subtitle && <Text style={styles.subtitle} numberOfLines={3}>{card.subtitle}</Text>}
                {!!card.meta && <Text style={styles.meta}>{card.meta}</Text>}
                {!!card.chips?.length && (
                  <View style={styles.chipRow}>
                    {card.chips.slice(0, 4).map((c, i) => (
                      <View key={i} style={styles.chip}><Text style={styles.chipText} numberOfLines={1}>{c}</Text></View>
                    ))}
                  </View>
                )}
              </View>
            </ViewShot>
          </ScrollView>
        </View>
        <Text style={styles.zoomHint}>Pinch to zoom in</Text>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable style={styles.secondaryBtn} onPress={doDownload} disabled={busy}>
            {downloading ? <ActivityIndicator color="#fff" /> : <Text style={styles.secondaryBtnText}>Download</Text>}
          </Pressable>
          <Pressable style={styles.shareBtn} onPress={doShare} disabled={busy}>
            {sharing ? <ActivityIndicator color="#fff" /> : <Text style={styles.shareBtnText}>Share ↗</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const CARD_W = 300;
const CARD_H = CARD_W * 1.25; // 4:5 — matches the stored scan photo's own aspect ratio

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,6,7,0.92)', alignItems: 'center', justifyContent: 'center' },
  closeBtn: { position: 'absolute', right: 16, zIndex: 2 },
  cardWrap: {
    width: CARD_W, height: CARD_H, borderRadius: 24, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.4, shadowRadius: 30, elevation: 10,
  },
  card: { width: CARD_W, height: CARD_H, backgroundColor: Colors.brandDeep },
  cardZoomContent: { width: CARD_W, height: CARD_H },
  zoomHint: {
    color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontFamily: Fonts.medium,
    marginTop: 10,
  },
  brandRow: {
    position: 'absolute', top: 14, left: 14,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    opacity: 0.6,
  },
  brandText: { color: '#fff', fontSize: 9.5, fontFamily: Fonts.semibold, letterSpacing: 1 },
  content: { position: 'absolute', left: 18, right: 18, bottom: 18 },
  kicker: { color: Colors.brandAccent, fontSize: 10.5, fontFamily: Fonts.bold, letterSpacing: 1.4, marginBottom: 6 },
  title: { color: '#fff', fontSize: 20, fontFamily: Fonts.display, letterSpacing: -0.3, lineHeight: 25 },
  subtitle: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontFamily: Fonts.displayItalic, marginTop: 6, lineHeight: 18 },
  meta: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: Fonts.semibold, marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 100,
    paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  chipText: { color: '#fff', fontSize: 10.5, fontFamily: Fonts.medium },
  footer: { paddingTop: 18, flexDirection: 'row', gap: 12 },
  shareBtn: {
    backgroundColor: Colors.brand, borderRadius: 100, paddingHorizontal: 32, paddingVertical: 15,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 6,
    minWidth: 128, alignItems: 'center',
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.semibold },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 100, paddingHorizontal: 24, paddingVertical: 15,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', minWidth: 128, alignItems: 'center',
  },
  secondaryBtnText: { color: '#fff', fontSize: 15, fontFamily: Fonts.semibold },
});
