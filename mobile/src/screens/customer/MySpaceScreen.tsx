/**
 * My Space — the AI skin-scan home. Latest result, product recommendations,
 * a "book an artist" hand-off, a progress timeline across past scans, and a
 * daily reminder toggle. Analysis is free/on-device-style (pixel color math
 * + a short quiz — see src/utils/skinAnalysis.js on the backend), never a
 * paid vision API call — see SkinScanCamera.tsx for the capture flow itself.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../../utils/colors';
import { ScanFaceIcon } from '../../components/TabIcons';
import { SkinScanCamera } from '../../components/SkinScanCamera';
import { NearbyArtistRow } from '../../components/NearbyArtistRow';
import { apiGetLatestSkinScan, apiGetSkinScans, SkinScan } from '../../api/client';
import { Storage } from '../../utils/storage';
import { scheduleDailyReminder, cancelDailyReminder } from '../../utils/notifications';
import { formatRelativeTime } from '../../utils/dateTime';
import { tapLight } from '../../utils/haptics';

const TONE_LABELS: Record<string, string> = { FAIR: 'Fair', LIGHT: 'Light', MEDIUM: 'Medium', TAN: 'Tan', DEEP: 'Deep', RICH: 'Rich' };
const TONE_SWATCH: Record<string, string> = { FAIR: '#F5D5C0', LIGHT: '#E8B894', MEDIUM: '#C68863', TAN: '#A9673F', DEEP: '#7A4B32', RICH: '#4A2C20' };
const TYPE_LABELS: Record<string, string> = { DRY: 'Dry', OILY: 'Oily', COMBINATION: 'Combination', NORMAL: 'Normal', SENSITIVE: 'Sensitive' };
// Reminder fires at 8pm local — evening is when someone's actually near a
// mirror/bathroom counter, not mid-workday.
const REMINDER_HOUR = 20;

export function MySpaceScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState<SkinScan | null>(null);
  const [history, setHistory] = useState<SkinScan[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [reminderOn, setReminderOn] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ scan }, { scans }] = await Promise.all([apiGetLatestSkinScan(), apiGetSkinScans()]);
      setLatest(scan);
      setHistory(scans);
    } catch (err) {
      console.error('Failed to load My Space', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { Storage.getSkinReminderEnabled().then(setReminderOn); }, []);

  async function toggleReminder(next: boolean) {
    tapLight();
    setReminderOn(next);
    await Storage.saveSkinReminderEnabled(next);
    if (next) await scheduleDailyReminder(REMINDER_HOUR, 0);
    else await cancelDailyReminder();
  }

  function onScanComplete(scan: SkinScan) {
    setLatest(scan);
    setHistory(prev => [scan, ...prev]);
    setCameraOpen(false);
    nav.navigate('SkinScanResult', { scan, justScanned: true });
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.systemGroupedBackground }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 130 }}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MY SPACE</Text>
          <Text style={styles.title}>Your skin, over time</Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={Colors.brand} />
        ) : !latest ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}><ScanFaceIcon size={30} color={Colors.brand} /></View>
            <Text style={styles.emptyTitle}>Scan your skin</Text>
            <Text style={styles.emptySub}>
              A quick photo and a few questions — get your skin tone, type, and product picks. Free, and it stays here to track your progress over time.
            </Text>
            <Pressable style={styles.scanBtn} onPress={() => { tapLight(); setCameraOpen(true); }}>
              <Text style={styles.scanBtnText}>Scan now ✨</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <LinearGradient
              colors={[Colors.brandAccent, Colors.brand, Colors.brandDeep]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroGlow} pointerEvents="none" />
              <View style={styles.heroTop}>
                <Image source={{ uri: latest.photoUrl }} style={styles.heroPhoto} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroLabel}>Latest scan · {formatRelativeTime(latest.createdAt)}</Text>
                  <View style={styles.heroResultRow}>
                    <View style={[styles.toneSwatch, { backgroundColor: TONE_SWATCH[latest.skinTone] }]} />
                    <Text style={styles.heroResult}>{TONE_LABELS[latest.skinTone]} tone · {TYPE_LABELS[latest.skinType]} skin</Text>
                  </View>
                </View>
              </View>
              {/* The AI's own written line — same reason SkinScanResultScreen
                  leads with it: this is what reads as a real reading of THIS
                  photo, not a static template. */}
              {!!latest.summary && <Text style={styles.heroSummary}>“{latest.summary}”</Text>}
              <Pressable style={styles.rescanBtn} onPress={() => { tapLight(); setCameraOpen(true); }}>
                <Text style={styles.rescanBtnText}>Rescan</Text>
              </Pressable>
            </LinearGradient>

            {!!latest.progressNote && (
              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <ScanFaceIcon size={14} color="#fff" />
                  <Text style={styles.progressLabel}>YOUR PROGRESS</Text>
                </View>
                <Text style={styles.progressText}>{latest.progressNote}</Text>
              </View>
            )}

            {latest.concerns.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {latest.concerns.map(c => (
                  <View key={c} style={styles.concernChip}><Text style={styles.concernChipText}>{c}</Text></View>
                ))}
              </ScrollView>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recommended for you</Text>
              {latest.recommendations.map((r, i) => (
                <View key={i} style={styles.recCard}>
                  <View style={styles.recCategoryPill}><Text style={styles.recCategoryText}>{r.category}</Text></View>
                  <Text style={styles.recTitle}>{r.title}</Text>
                  <Text style={styles.recNote}>{r.note}</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Want a professional take?</Text>
              <NearbyArtistRow category="Facials & Skin" serviceType="Facial" />
            </View>

            {history.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your progress</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
                  {history.map(scan => (
                    <Pressable key={scan.id} style={styles.historyTile} onPress={() => { tapLight(); nav.navigate('SkinScanResult', { scan }); }}>
                      <Image source={{ uri: scan.photoUrl }} style={styles.historyTileImg} contentFit="cover" />
                      <Text style={styles.historyTileDate}>{formatRelativeTime(scan.createdAt)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.reminderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderTitle}>Daily check-in reminder</Text>
                <Text style={styles.reminderSub}>A gentle nudge to scan and track your progress</Text>
              </View>
              <Switch
                value={reminderOn}
                onValueChange={toggleReminder}
                trackColor={{ false: '#D1D5DB', true: Colors.brandAccent }}
                thumbColor={reminderOn ? Colors.brand : '#F4F4F5'}
              />
            </View>
          </>
        )}

        <Text style={styles.disclaimer}>
          My Space gives cosmetic guidance based on a photo and your answers — it's not a medical diagnosis. For any skin concern that worries you, see a dermatologist.
        </Text>
      </ScrollView>

      <SkinScanCamera visible={cameraOpen} onClose={() => setCameraOpen(false)} onComplete={onScanComplete} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingBottom: 16 },
  eyebrow: { fontSize: 11, fontFamily: Fonts.semibold, color: Colors.brandDark, letterSpacing: 1.6 },
  title: { fontSize: 28, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -0.7, marginTop: 6 },

  empty: {
    alignItems: 'center', paddingVertical: 44, paddingHorizontal: 30, gap: 8,
    marginHorizontal: 20, borderRadius: 26,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
  },
  emptyIconWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyTitle: { fontSize: 17, fontFamily: Fonts.semibold, color: Colors.label },
  emptySub: { fontSize: 13.5, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 20, fontFamily: Fonts.regular, marginBottom: 6 },
  scanBtn: {
    backgroundColor: Colors.brand, borderRadius: 100, paddingHorizontal: 28, paddingVertical: 14,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 5,
  },
  scanBtnText: { color: '#fff', fontSize: 14.5, fontFamily: Fonts.semibold },

  hero: {
    marginHorizontal: 20, marginBottom: 14, borderRadius: 28, padding: 18, overflow: 'hidden',
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 18, elevation: 7,
  },
  heroGlow: { position: 'absolute', top: -50, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.14)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroPhoto: { width: 58, height: 58, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  heroLabel: { fontSize: 11.5, color: 'rgba(255,255,255,0.8)', fontFamily: Fonts.medium },
  heroResultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  toneSwatch: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' },
  heroResult: { fontSize: 15.5, color: '#fff', fontFamily: Fonts.display },
  heroSummary: {
    fontSize: 15, fontFamily: Fonts.displayItalic, color: 'rgba(255,255,255,0.92)',
    lineHeight: 21, marginTop: 14,
  },
  rescanBtn: {
    alignSelf: 'flex-start', marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 100,
    paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  rescanBtnText: { color: '#fff', fontSize: 12.5, fontFamily: Fonts.semibold },

  progressCard: {
    marginHorizontal: 20, marginBottom: 14, borderRadius: 20, padding: 16,
    backgroundColor: Colors.brandDeep,
  },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  progressLabel: { fontSize: 10.5, fontFamily: Fonts.bold, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  progressText: { fontSize: 13.5, fontFamily: Fonts.medium, color: '#fff', lineHeight: 19 },

  chipRow: { gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  concernChip: { backgroundColor: Colors.surfaceBlush, borderRadius: 100, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: Colors.brandAccent },
  concernChipText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.brandDark },

  section: { marginTop: 18, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 15.5, fontFamily: Fonts.display, color: Colors.label, marginBottom: 10 },
  recCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.separator,
  },
  recCategoryPill: { alignSelf: 'flex-start', backgroundColor: Colors.brandLight, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 6 },
  recCategoryText: { fontSize: 10.5, fontFamily: Fonts.bold, color: Colors.brandDark, letterSpacing: 0.3, textTransform: 'uppercase' },
  recTitle: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label },
  recNote: { fontSize: 12.5, fontFamily: Fonts.regular, color: Colors.secondaryLabel, marginTop: 3, lineHeight: 18 },

  historyTile: { width: 90, gap: 6 },
  historyTileImg: { width: 90, height: 110, borderRadius: 16, backgroundColor: Colors.brandLight },
  historyTileDate: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.tertiaryLabel, textAlign: 'center' },

  reminderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginTop: 22, padding: 16, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
  },
  reminderTitle: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.label },
  reminderSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.secondaryLabel, marginTop: 2 },

  disclaimer: {
    fontSize: 11, fontFamily: Fonts.regular, color: Colors.tertiaryLabel,
    textAlign: 'center', lineHeight: 16, marginTop: 26, marginHorizontal: 32,
  },
});
