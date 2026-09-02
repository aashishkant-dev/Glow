/**
 * Full-screen preview + share for a branded "card" — a photo with the actual
 * details (look name/price, or a scan's AI summary/tone/type) baked into a
 * single shareable image, instead of the bare photo the old share button
 * sent. Captures the visible card (ViewShot) and hands it to the OS share
 * sheet, so what a customer sees on Instagram/iMessage is this designed
 * card — a purpose-built composition, never a screenshot of the live app
 * screen (no status bar, no nav chrome, no debug overlay ever enters it).
 *
 * Layout variants (Photo / Stat, plus Heatmap when sharing one concern and
 * Report when the scan has per-concern data), switchable before sharing,
 * so a repeat poster isn't stuck with one rigid template — same
 * ShareCardSpec data, different composition. All render at CARD_W×CARD_H
 * points on screen. Export resolution: on iOS the capture asks
 * react-native-view-shot for EXPORT_PT_W×EXPORT_PT_H points, which its
 * native side satisfies by RE-RENDERING the view hierarchy into a context
 * of that size at device scale (drawViewHierarchyInRect into the requested
 * rect — checked in its RNViewShot.mm, not assumed), so text and vector
 * edges come out genuinely sharp at 2160×2700 on a 3x phone rather than
 * upscaled. Android's implementation only Bitmap.createScaledBitmap()s the
 * screen-size capture (checked in its ViewShot.java), which would soften
 * it, so there the capture stays at native device scale (≥1080px wide on
 * any modern 3x phone at CARD_W) with no resize at all.
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
// The package's default entry (`expo-media-library`) calls
// requireNativeModule() at MODULE-EVALUATION time with no platform guard at
// all — confirmed live: it crashes the entire web bundle on load (`Cannot
// find native module 'ExpoMediaLibraryNext'`), before any of this file's
// own Platform.OS checks ever get a chance to run. `/legacy` is the same
// underlying native calls but wrapped so unavailability only throws when a
// function is actually CALLED — which this file already only does behind
// its own Platform.OS === 'web' guard below (downloadLocalFile never calls
// a real MediaLibrary.* function on web at all).
import * as MediaLibrary from 'expo-media-library/legacy';
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
  // Skin-scan cards only — the real detected face region (0–1 fractions of
  // the photo, same shape as SkinScan.faceBox) driving the soft glow accent
  // in the Photo variant. Simply omitted for Look shares (no face detection
  // there), which is what keeps the glow from ever appearing where it
  // doesn't apply — no separate "is this a scan" flag needed.
  faceBox?: { x?: number; y?: number; width?: number; height?: number };
  // Present only when sharing FROM a specific concern tab with real
  // heatmap data (not the Summary tab) — the real per-concern overlay PNG,
  // the same one already rendering on the results screen, so the Heatmap
  // variant below shows actual visual proof of the finding rather than
  // just repeating the verdict as text. Its presence is what makes the
  // Heatmap variant pill appear at all (see ShareCardModal).
  heatmap?: { url: string; label: string; verdict: string; band: 'clear' | 'mild' | 'moderate' | 'notable' };
  // Present for skin-scan shares that have per-concern data at all — every
  // concern this scan assessed (and, honestly, the ones it couldn't), so
  // the Report variant can lay the whole reading out on one card rather
  // than one concern at a time. Same records the results screen renders.
  report?: {
    date: string;
    rows: { key: string; label: string; band: 'clear' | 'mild' | 'moderate' | 'notable' | null; severityScore: number }[];
  };
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
// user's photo library without needing full library read access — but only
// if actually REQUESTED as write-only (requestPermissionsAsync's writeOnly
// param defaults to false, i.e. full read+write, unless passed `true`
// explicitly; this was silently requesting full access before).
async function downloadLocalFile(uri: string) {
  if (Platform.OS === 'web') {
    await webDownload(uri);
    return;
  }
  const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync(true);
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

// Export size in POINTS — see the file header for why this only applies on
// iOS (a real re-render there, a blurry upscale on Android). 4:5, same
// ratio as CARD_W/CARD_H, so nothing is stretched.
const EXPORT_PT_W = 720;
const EXPORT_PT_H = 900;

async function captureCard(shotRef: React.RefObject<any>): Promise<string> {
  const uri = await captureRef(shotRef, {
    format: 'png',
    quality: 1,
    ...(Platform.OS === 'ios' ? { width: EXPORT_PT_W, height: EXPORT_PT_H } : {}),
  });
  // Native returns a cache-file path already shareable as-is; web returns a
  // data: URI, which both shareLocalFile and downloadLocalFile's fetch()-to-
  // Blob paths also handle fine — same call either way.
  if (Platform.OS === 'web' || uri.startsWith('file://')) return uri;
  const dest = `${FileSystem.cacheDirectory}glow-share-${Date.now()}.png`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

// Soft radial halo around the real detected face — the one place this card
// references actual analysis geometry, deliberately NOT as debug UI (no
// bracket, no dot grid, no label). A quiet gold ring most people will read
// as "warm light," not "AI markup" — styled as a design element first,
// informative second. Same radial-gradient technique as the camera
// screen's own FillLight, so this app has one consistent "soft glow around
// a face" visual signature rather than a one-off.
function FaceGlow({ faceBox, width, height }: { faceBox?: ShareCardSpec['faceBox']; width: number; height: number }) {
  if (!faceBox?.width || !faceBox?.height) return null;
  const cx = (faceBox.x! + faceBox.width / 2) * width;
  const cy = (faceBox.y! + faceBox.height / 2) * height;
  const rx = (faceBox.width / 2) * width * 1.2;
  const ry = (faceBox.height / 2) * height * 1.12;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="shareFaceGlow" gradientUnits="userSpaceOnUse" cx={cx} cy={cy} rx={rx} ry={ry}>
          <Stop offset="0.7" stopColor={Colors.gold} stopOpacity="0" />
          <Stop offset="0.88" stopColor={Colors.gold} stopOpacity="0.24" />
          <Stop offset="1" stopColor={Colors.gold} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#shareFaceGlow)" />
    </Svg>
  );
}

// Photo-forward variant — the hero photo fills the frame, details anchored
// bottom over a gradient scrim, closest in spirit to the original design
// but with real editorial hierarchy (a genuinely large serif headline, not
// a scaled-down app label) instead of everything reading the same weight.
function PhotoCard({ card, width, height }: { card: ShareCardSpec; width: number; height: number }) {
  return (
    <View style={{ width, height, backgroundColor: Colors.brandDeep }}>
      <Image source={{ uri: card.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <FaceGlow faceBox={card.faceBox} width={width} height={height} />
      {/* Four stops, not three — holds the top half of the photo genuinely
          bright (the actual subject stays visible, not just implied under a
          flat scrim) and concentrates the darkening into the bottom third
          where the text needs it, instead of a uniform gradient dimming
          the whole frame evenly. */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(18,9,12,0.58)', 'rgba(14,7,10,0.95)']}
        locations={[0, 0.45, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={pcStyles.brandRow}>
        <GlowMark size={14} petal="rgba(255,255,255,0.88)" petalInner="rgba(255,255,255,0.42)" core={Colors.gold} />
        <Text style={pcStyles.brandText}>Glow</Text>
      </View>
      <View style={[pcStyles.content, { maxHeight: height * 0.6 }]}>
        <Text style={pcStyles.kicker}>{card.kicker}</Text>
        <Text style={pcStyles.title} numberOfLines={2}>{card.title}</Text>
        {/* A curated highlight, not the full report — capped deliberately
            tighter than what the data can actually hold (Gemini can return
            up to 6 concerns, a long summary). Confirmed by an actual
            rendered capture: at 4 chips + 3 subtitle lines this block grew
            tall enough to overlap the subject's face/eyes, a real
            compositional bug, not just a style preference. */}
        {!!card.subtitle && <Text style={pcStyles.subtitle} numberOfLines={2}>{card.subtitle}</Text>}
        {!!card.meta && <Text style={pcStyles.meta}>{card.meta}</Text>}
        {!!card.chips?.length && (
          <View style={pcStyles.chipRow}>
            {card.chips.slice(0, 3).map((c, i) => (
              <View key={i} style={pcStyles.chip}><Text style={pcStyles.chipText} numberOfLines={1}>{c}</Text></View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const pcStyles = StyleSheet.create({
  brandRow: { position: 'absolute', top: 20, left: 20, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.62 },
  brandText: { color: '#fff', fontSize: 11, fontFamily: Fonts.semibold, letterSpacing: 1.1 },
  // maxHeight (set at the call site, as a fraction of the real card height)
  // + overflow:hidden + flex-end is a hard backstop, not the primary fix —
  // the per-field caps above (2-line title/subtitle, 3 chips) are what
  // actually keep this block a predictable size; this just guarantees it
  // can never grow into the subject's face even if that budget is wrong.
  content: { position: 'absolute', left: 24, right: 24, bottom: 26, overflow: 'hidden', justifyContent: 'flex-end' },
  kicker: { color: Colors.brandAccent, fontSize: 12, fontFamily: Fonts.bold, letterSpacing: 1.8, marginBottom: 10 },
  title: { color: '#fff', fontSize: 30, fontFamily: Fonts.display, letterSpacing: -0.4, lineHeight: 34 },
  subtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontFamily: Fonts.displayItalic, marginTop: 10, lineHeight: 22 },
  meta: { color: 'rgba(255,255,255,0.78)', fontSize: 13.5, fontFamily: Fonts.semibold, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  // A soft filled pill, not a 1px stroke — a hairline border is exactly the
  // kind of fine detail that goes patchy or vanishes after a social
  // platform's own JPEG re-compression; a solid tinted fill degrades
  // gracefully instead.
  chip: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: '#fff', fontSize: 12, fontFamily: Fonts.medium },
});

const BAND_COLOR: Record<'clear' | 'mild' | 'moderate' | 'notable', string> = {
  clear: Colors.systemGreen, mild: Colors.brand, moderate: Colors.systemOrange, notable: Colors.systemRed,
};

// Heatmap variant — the actual visual proof of one concern's finding, not
// just the verdict restated as text. Stacks the SAME per-concern overlay
// PNG already rendering on the results screen (never a separate render or
// a re-derived image) on top of the base photo, same as
// ConcernHeatmapOverlay does there — this card is a different COMPOSITION
// of real data, not a different analysis. Only ever rendered when
// card.heatmap is present (see ShareCardModal's variant list).
function HeatmapCard({ card, width, height }: { card: ShareCardSpec; width: number; height: number }) {
  const heatmap = card.heatmap!;
  return (
    <View style={{ width, height, backgroundColor: Colors.brandDeep }}>
      <Image source={{ uri: card.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <Image source={{ uri: heatmap.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={['rgba(18,9,12,0.5)', 'transparent', 'transparent', 'rgba(14,7,10,0.95)']}
        locations={[0, 0.22, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={pcStyles.brandRow}>
        <GlowMark size={14} petal="rgba(255,255,255,0.88)" petalInner="rgba(255,255,255,0.42)" core={Colors.gold} />
        <Text style={pcStyles.brandText}>Glow</Text>
      </View>
      <View style={hmStyles.topBadge}>
        <View style={[hmStyles.bandDot, { backgroundColor: BAND_COLOR[heatmap.band] }]} />
        <Text style={hmStyles.topBadgeText}>{heatmap.label.toUpperCase()} READING</Text>
      </View>
      <View style={[pcStyles.content, { maxHeight: height * 0.6 }]}>
        <Text style={pcStyles.kicker}>{card.kicker}</Text>
        <Text style={pcStyles.title} numberOfLines={2}>{heatmap.label}</Text>
        <Text style={pcStyles.subtitle} numberOfLines={3}>{heatmap.verdict}</Text>
      </View>
    </View>
  );
}

const hmStyles = StyleSheet.create({
  topBadge: {
    position: 'absolute', top: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6,
  },
  bandDot: { width: 7, height: 7, borderRadius: 3.5 },
  topBadgeText: { color: '#fff', fontSize: 9.5, fontFamily: Fonts.bold, letterSpacing: 0.6 },
});

const BAND_LABEL: Record<'clear' | 'mild' | 'moderate' | 'notable', string> = {
  clear: 'Clear', mild: 'Mild', moderate: 'Moderate', notable: 'Notable',
};

// Report variant — the whole reading on one card: portrait up top, then
// one row per concern with its band and a severity bar, for someone who
// wants to save (or send a dermatologist) their entire result rather than
// brag about one metric. Renders every concern in the app's fixed order,
// including the ones this scan couldn't assess (shown as such, never
// omitted — a missing row would read as "fine" when it means "not seen").
// Bars use the same 0-100 severityScore and band colours the results
// screen does — this is the same data composed differently, not a second
// interpretation of it.
function ReportCard({ card, width, height }: { card: ShareCardSpec; width: number; height: number }) {
  const report = card.report!;
  const photoH = height * 0.44;
  return (
    <View style={{ width, height, backgroundColor: Colors.brandDeep }}>
      <LinearGradient colors={[Colors.brandDeep, '#7A3A4E']} locations={[0, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ height: photoH, overflow: 'hidden' }}>
        <Image source={{ uri: card.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient
          colors={['rgba(18,9,12,0.35)', 'transparent', 'transparent', Colors.brandDeep]}
          locations={[0, 0.25, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={pcStyles.brandRow}>
          <GlowMark size={14} petal="rgba(255,255,255,0.88)" petalInner="rgba(255,255,255,0.42)" core={Colors.gold} />
          <Text style={pcStyles.brandText}>Glow</Text>
        </View>
        <View style={rpStyles.dateBadge}><Text style={rpStyles.dateText}>{report.date}</Text></View>
      </View>
      <View style={rpStyles.body}>
        <Text style={rpStyles.kicker} numberOfLines={1}>MY SPACE · FULL SKIN REPORT</Text>
        <Text style={rpStyles.title} numberOfLines={1}>{card.title}</Text>
        <View style={rpStyles.rows}>
          {report.rows.map((r) => (
            <View key={r.key} style={rpStyles.row}>
              <Text style={rpStyles.rowLabel} numberOfLines={1}>{r.label}</Text>
              <View style={rpStyles.track}>
                {r.band && <View style={[rpStyles.fill, { width: `${Math.max(4, Math.min(100, r.severityScore))}%`, backgroundColor: BAND_COLOR[r.band] }]} />}
              </View>
              <View style={rpStyles.bandCell}>
                {r.band
                  ? <><View style={[hmStyles.bandDot, { backgroundColor: BAND_COLOR[r.band] }]} /><Text style={rpStyles.bandText}>{BAND_LABEL[r.band]}</Text></>
                  : <Text style={rpStyles.bandTextDim}>Not assessed</Text>}
              </View>
            </View>
          ))}
        </View>
        {!!card.subtitle && <Text style={rpStyles.footnote} numberOfLines={2}>{card.subtitle}</Text>}
      </View>
    </View>
  );
}

const rpStyles = StyleSheet.create({
  dateBadge: { position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6 },
  dateText: { color: '#fff', fontSize: 9.5, fontFamily: Fonts.bold, letterSpacing: 0.6 },
  body: { flex: 1, paddingHorizontal: 22, paddingTop: 6, paddingBottom: 18 },
  kicker: { color: Colors.brandAccent, fontSize: 10.5, fontFamily: Fonts.bold, letterSpacing: 1.8, marginBottom: 6 },
  title: { color: '#fff', fontSize: 21, fontFamily: Fonts.display, letterSpacing: -0.3, lineHeight: 25, marginBottom: 10 },
  rows: { gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { width: 96, color: 'rgba(255,255,255,0.92)', fontSize: 11.5, fontFamily: Fonts.semibold },
  // A soft filled track, not a hairline — survives social re-compression
  // the same way the chips' solid fills do.
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  bandCell: { width: 78, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'flex-end' },
  bandText: { color: '#fff', fontSize: 10.5, fontFamily: Fonts.semibold },
  bandTextDim: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: Fonts.medium },
  footnote: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontFamily: Fonts.displayItalic, lineHeight: 15, marginTop: 'auto' },
});

// Stat variant — a warm gradient "poster" instead of a full-bleed photo: a
// smaller circular portrait as one element among several, big centered
// serif headline as the actual focus. Reads more like a shareable
// infographic than a cropped screenshot — genuinely different structure
// from Photo, not just a recolor of the same layout, so switching between
// them doesn't feel cosmetic.
function StatCard({ card, width, height }: { card: ShareCardSpec; width: number; height: number }) {
  // Confirmed by an actual rendered capture: at the old 0.46 fraction the
  // photo alone (plus kicker/title/subtitle/meta/chips below it) genuinely
  // overflowed CARD_H and got clipped by the card's own overflow:hidden —
  // a real bug, not a hypothetical one. 0.3 leaves real margin even with a
  // two-line title and wrapped chips, verified against this same capture.
  const photoSize = width * 0.3;
  const ringSize = photoSize + 12;
  return (
    <View style={{ width, height }}>
      <LinearGradient colors={[Colors.brandDeep, Colors.brand, '#7A3A4E']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      {/* Soft ambient glow behind the portrait — a universal design element
          (not face-position-dependent like PhotoCard's FaceGlow), so it
          applies just as well to a Look photo as a skin-scan selfie. */}
      <Svg width={width} height={height * 0.62} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="shareStatGlow" gradientUnits="userSpaceOnUse" cx={width / 2} cy={height * 0.34} rx={width * 0.62} ry={width * 0.5}>
            <Stop offset="0" stopColor={Colors.gold} stopOpacity="0.35" />
            <Stop offset="1" stopColor={Colors.gold} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={width / 2} cy={height * 0.34} rx={width * 0.62} ry={width * 0.5} fill="url(#shareStatGlow)" />
      </Svg>
      <View style={scStyles.brandRow}>
        <GlowMark size={14} petal="rgba(255,255,255,0.9)" petalInner="rgba(255,255,255,0.45)" core={Colors.gold} />
        <Text style={scStyles.brandText}>Glow</Text>
      </View>
      <View style={scStyles.content}>
        <View style={[scStyles.photoRing, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}>
          <Image source={{ uri: card.photoUrl }} style={{ width: photoSize, height: photoSize, borderRadius: photoSize / 2 }} contentFit="cover" />
        </View>
        <Text style={scStyles.kicker} numberOfLines={1}>{card.kicker}</Text>
        <Text style={scStyles.title} numberOfLines={2}>{card.title}</Text>
        {!!card.subtitle && <Text style={scStyles.subtitle} numberOfLines={2}>{card.subtitle}</Text>}
        {!!card.meta && <Text style={scStyles.meta}>{card.meta}</Text>}
        {!!card.chips?.length && (
          <View style={scStyles.chipRow}>
            {card.chips.slice(0, 2).map((c, i) => (
              <View key={i} style={scStyles.chip}><Text style={scStyles.chipText} numberOfLines={1}>{c}</Text></View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const scStyles = StyleSheet.create({
  brandRow: { position: 'absolute', top: 20, left: 20, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.7 },
  brandText: { color: '#fff', fontSize: 11, fontFamily: Fonts.semibold, letterSpacing: 1.1 },
  // flex-start + a fixed paddingTop, not justifyContent:'center' — centered
  // content that turns out taller than the card (a long title, a wrapped
  // chip row) clips unpredictably top-and-bottom; top-anchored at least
  // clips in one consistent, plannable direction, and with the margin
  // budgeted in below shouldn't need to clip at all in practice.
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 26, paddingTop: 30 },
  photoRing: {
    backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 6,
  },
  kicker: { color: Colors.goldSoft, fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.8, marginBottom: 8, textAlign: 'center' },
  title: { color: '#fff', fontSize: 25, fontFamily: Fonts.display, letterSpacing: -0.3, lineHeight: 29, textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 13.5, fontFamily: Fonts.displayItalic, marginTop: 8, lineHeight: 18.5, textAlign: 'center' },
  meta: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontFamily: Fonts.semibold, marginTop: 8, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'center' },
  chip: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { color: '#fff', fontSize: 11.5, fontFamily: Fonts.medium },
});

type Variant = 'photo' | 'stat' | 'heatmap' | 'report';
const VARIANT_LABEL: Record<Variant, string> = { photo: 'Photo', stat: 'Stat', heatmap: 'Heatmap', report: 'Report' };

export function ShareCardModal({ visible, card, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const shotRef = useRef<any>(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Defaults to 'heatmap' when the card actually has one (shared from a
  // concern tab) — that's clearly the intent of sharing from there; falls
  // back to 'photo' otherwise, unchanged from before. Resets whenever a
  // different card is opened (a fresh `card` object identity each time
  // shareProgress()/openHeatmapShare() is called).
  const [variant, setVariant] = useState<Variant>(card?.heatmap ? 'heatmap' : 'photo');
  const prevCardRef = useRef(card);
  if (card !== prevCardRef.current) {
    prevCardRef.current = card;
    // Every fresh card open picks the variant that actually matches what
    // was just shared — a heatmap card defaults to showing it (that's the
    // point of sharing from a concern tab); a card with none must never
    // leave `variant` pointed at 'heatmap' from a previous open, since
    // HeatmapCard assumes card.heatmap exists.
    setVariant(card?.heatmap ? 'heatmap' : 'photo');
  }
  const busy = sharing || downloading;

  // Bigger than a bare-minimum preview — on any modern 3x-scale phone this
  // alone is enough for the default (no explicit resize) capture to land
  // at or above a real 1080px-wide export. See the file header for why no
  // resize step is deliberately involved at all.
  const CARD_W = Math.min(380, winW - 56);
  const CARD_H = CARD_W * (1350 / 1080); // 4:5 — native to both feed and Stories

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

        {/* Structurally different layouts (see PhotoCard/StatCard/
            HeatmapCard), not one rigid template — switching is instant
            since all three render from the exact same ShareCardSpec, just
            composed differently. Heatmap only ever appears as an option
            when this card actually has one (shared from a concern tab,
            not the Summary tab) — never a pill that would render nothing
            or crash. */}
        <View style={styles.variantRow}>
          {(['photo', 'stat', ...(card.heatmap ? ['heatmap'] : []), ...(card.report ? ['report'] : [])] as Variant[]).map(v => (
            <Pressable key={v} onPress={() => setVariant(v)} style={[styles.variantPill, variant === v && styles.variantPillActive]}>
              <Text style={[styles.variantPillText, variant === v && styles.variantPillTextActive]}>{VARIANT_LABEL[v]}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.cardWrap, { width: CARD_W, height: CARD_H }]}>
          {/* Native pinch-to-zoom (ScrollView's own minimumZoomScale/
              maximumZoomScale, no new dependency) — same mechanism already
              used for the full result photo. captureRef below always
              targets the ViewShot's own natural CARD_W x CARD_H layout
              regardless of the surrounding ScrollView's current zoom/pan,
              so a capture mid-zoom still comes out as the full, correctly
              framed card. */}
          <ScrollView
            style={{ width: CARD_W, height: CARD_H }}
            contentContainerStyle={{ width: CARD_W, height: CARD_H }}
            minimumZoomScale={1}
            maximumZoomScale={3}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            centerContent
          >
            <ViewShot ref={shotRef} style={{ width: CARD_W, height: CARD_H }} options={{ format: 'png', quality: 0.95 }}>
              {/* card.heatmap re-checked here (not just trusting `variant`)
                  — defensive against variant ever being stale 'heatmap'
                  for a card that doesn't have one, which would otherwise
                  crash HeatmapCard's non-null assertion. */}
              {variant === 'heatmap' && card.heatmap
                ? <HeatmapCard card={card} width={CARD_W} height={CARD_H} />
                : variant === 'report' && card.report
                ? <ReportCard card={card} width={CARD_W} height={CARD_H} />
                : variant === 'stat'
                ? <StatCard card={card} width={CARD_W} height={CARD_H} />
                : <PhotoCard card={card} width={CARD_W} height={CARD_H} />}
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,6,7,0.92)', alignItems: 'center', justifyContent: 'center' },
  closeBtn: { position: 'absolute', right: 16, zIndex: 2 },
  variantRow: { flexDirection: 'row', gap: 8, marginBottom: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 100, padding: 4 },
  variantPill: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 100 },
  variantPillActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
  variantPillText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontFamily: Fonts.semibold },
  variantPillTextActive: { color: '#fff' },
  cardWrap: {
    borderRadius: 24, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.4, shadowRadius: 30, elevation: 10,
  },
  zoomHint: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontFamily: Fonts.medium, marginTop: 10 },
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
