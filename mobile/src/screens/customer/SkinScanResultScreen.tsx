/**
 * Full detail view for one skin scan — reached right after a new scan
 * completes (`justScanned`) or by tapping a past entry in My Space's
 * progress timeline. Redesigned around what actually makes this feel like a
 * real AI reading, not a static report: the model's own written summary
 * leads (Fraunces italic — this app's existing treatment for warm,
 * editorial moments, e.g. HomeScreen's hero line), and a distinct callout
 * surfaces progressNote when Gemini had a previous scan to compare against.
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts } from '../../utils/colors';
import { apiDeleteSkinScan, SkinScan } from '../../api/client';
import { tapLight, confirmAction } from '../../utils/haptics';
import { NearbyArtistRow } from '../../components/NearbyArtistRow';
import { SkinZoneOverlay } from '../../components/SkinZoneOverlay';
import { ShareCardModal, ShareCardSpec } from '../../components/ShareCardModal';
import { SparkleIcon } from '../../components/BeautyIcons';
import { ZONE_META } from '../../utils/skinZones';

const TONE_LABELS: Record<string, string> = { FAIR: 'Fair', LIGHT: 'Light', MEDIUM: 'Medium', TAN: 'Tan', DEEP: 'Deep', RICH: 'Rich' };
const TONE_SWATCH: Record<string, string> = { FAIR: '#F5D5C0', LIGHT: '#E8B894', MEDIUM: '#C68863', TAN: '#A9673F', DEEP: '#7A4B32', RICH: '#4A2C20' };
const TYPE_LABELS: Record<string, string> = { DRY: 'Dry', OILY: 'Oily', COMBINATION: 'Combination', NORMAL: 'Normal', SENSITIVE: 'Sensitive' };
const HYDRATION_LABELS: Record<string, string> = { LOW: 'Low', MODERATE: 'Moderate', HIGH: 'High' };

// flagged: Gemini wrote a real note for this zone (tappable — has a matching
// marker on the photo above). Unflagged zones still get a row ("Clear —
// nothing notable here") instead of just vanishing from the list, so the
// report reads as a complete 8-point check rather than a partial one — real
// added detail, not invented data, since "nothing flagged here" is itself
// accurate information from the same scan.
function ZoneRow({ label, note, flagged, active, onPress }: { label: string; note: string; flagged: boolean; active?: boolean; onPress?: () => void }) {
  const row = (
    <View style={[zoneRowStyles.row, active && zoneRowStyles.rowActive]}>
      <View style={zoneRowStyles.labelRow}>
        <View style={[zoneRowStyles.statusDot, flagged ? zoneRowStyles.statusDotFlagged : zoneRowStyles.statusDotClear]} />
        <Text style={[zoneRowStyles.label, active && zoneRowStyles.labelActive]}>{label}</Text>
      </View>
      <Text style={flagged ? zoneRowStyles.note : zoneRowStyles.noteClear}>{note}</Text>
    </View>
  );
  if (!flagged) return row;
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      {row}
    </Pressable>
  );
}

const zoneRowStyles = StyleSheet.create({
  row: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, borderBottomWidth: 1, borderBottomColor: Colors.separatorSoft },
  rowActive: { backgroundColor: Colors.surfaceBlush, borderBottomColor: 'transparent' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotFlagged: { backgroundColor: Colors.brand },
  statusDotClear: { backgroundColor: Colors.systemGray4 },
  label: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.brandDark, letterSpacing: 0.5, textTransform: 'uppercase' },
  labelActive: { color: Colors.brand },
  note: { fontSize: 13.5, fontFamily: Fonts.regular, color: Colors.label, lineHeight: 19 },
  noteClear: { fontSize: 13.5, fontFamily: Fonts.regular, color: Colors.tertiaryLabel, lineHeight: 19 },
});

export function SkinScanResultScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const scan: SkinScan = route.params.scan;
  const justScanned: boolean = !!route.params.justScanned;
  const [deleting, setDeleting] = useState(false);
  const [shareCard, setShareCard] = useState<ShareCardSpec | null>(null);
  // Lifted up (not owned inside SkinZoneOverlay) so the zone list below the
  // photo and the tappable markers ON the photo are the same selection —
  // tapping either one highlights both, instead of two disconnected views
  // of the same data.
  const [activeZone, setActiveZone] = useState<string | null>(null);
  // The photo container's aspect ratio, measured from the actual loaded
  // image — NOT hardcoded. The backend stores at `resize(1080, 1350, {fit:
  // 'inside'})`, which only FITS WITHIN that box while preserving the
  // original photo's aspect ratio — it never crops, so the output is almost
  // never exactly 1080×1350 (that only happens if the source photo already
  // happened to be exactly 4:5). A hardcoded 1080/1350 here previously
  // forced the wrong box, and contentFit="cover" then cropped the real
  // image to fit it — which is exactly what desynced SkinZoneOverlay's
  // marker fractions (correct relative to the real, uncropped stored photo)
  // from what was actually visible on screen, reading as markers scattered
  // off-face. 1080/1350 is kept only as the pre-load guess so layout
  // doesn't jump from nothing to something.
  const [photoAspect, setPhotoAspect] = useState(1080 / 1350);

  function goBack() {
    if (justScanned) nav.navigate('Home', { screen: 'MySpaceTab' });
    else if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Home');
  }

  function shareProgress() {
    tapLight();
    // The old share just sent the bare photo — this bakes the actual reading
    // (tone/type/hydration, the AI's own summary, the concerns) into a
    // designed card, so what lands in a DM/Story actually says something.
    setShareCard({
      photoUrl: scan.photoUrl,
      kicker: 'MY SPACE · AI SKIN READING',
      title: `${TONE_LABELS[scan.skinTone]} tone · ${TYPE_LABELS[scan.skinType]} skin`,
      subtitle: scan.summary || undefined,
      meta: scan.hydrationLevel ? `${HYDRATION_LABELS[scan.hydrationLevel]} hydration` : undefined,
      chips: scan.concerns,
      shareCaption: `My Glow skin check-in: ${TONE_LABELS[scan.skinTone]} tone · ${TYPE_LABELS[scan.skinType]} skin ✨`,
    });
  }

  function deleteScan() {
    confirmAction({
      title: 'Delete this scan?',
      message: 'This removes it from your progress history. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        setDeleting(true);
        try {
          await apiDeleteSkinScan(scan.id);
          goBack();
        } catch (err: any) {
          setDeleting(false);
          Alert.alert('Could not delete', err?.message || 'Please try again.');
        }
      },
    });
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.photoWrap}>
          <Image
            source={{ uri: scan.photoUrl }}
            style={[styles.photo, { aspectRatio: photoAspect }]}
            contentFit="cover"
            onLoad={(e) => {
              const { width, height } = e.source;
              if (width && height) setPhotoAspect(width / height);
            }}
          />
          <SkinZoneOverlay zoneNotes={scan.zoneNotes} faceBox={scan.faceBox} active={activeZone} onSelect={setActiveZone} />
          <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent']} style={styles.photoTopGradient} pointerEvents="none" />
          <Pressable style={[styles.floatBack, { top: insets.top + 8 }]} onPress={goBack} hitSlop={12}>
            <Text style={styles.floatBackText}>‹</Text>
          </Pressable>
          <Pressable style={[styles.floatShare, { top: insets.top + 8 }]} onPress={shareProgress} hitSlop={12}>
            <Text style={styles.floatShareText}>↗</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.eyebrowRow}>
            <SparkleIcon size={13} color={Colors.brand} />
            <Text style={styles.eyebrow}>{justScanned ? 'AI READING' : 'SCAN DETAILS'}</Text>
          </View>

          {/* The model's own written line — this is what makes it read as a
              real AI looking at THIS photo, not a templated report. */}
          {!!scan.summary && <Text style={styles.summary}>{scan.summary}</Text>}

          <View style={styles.resultRow}>
            <View style={[styles.toneSwatch, { backgroundColor: TONE_SWATCH[scan.skinTone] }]} />
            <Text style={styles.resultText}>{TONE_LABELS[scan.skinTone]} tone · {TYPE_LABELS[scan.skinType]} skin</Text>
            {!!scan.hydrationLevel && (
              <View style={styles.hydrationPill}>
                <Text style={styles.hydrationPillText}>{HYDRATION_LABELS[scan.hydrationLevel]} hydration</Text>
              </View>
            )}
          </View>

          {/* Zone-by-zone read — the thing an in-person consultation does
              that one blanket "your skin is X" verdict doesn't. Gemini-only
              (empty strings from the free heuristic); only rendered when at
              least one zone actually has something worth showing. Shows ALL
              8 zones now, not just the ones with a note — an unflagged zone
              gets "Clear" instead of silently vanishing, so this reads as a
              complete 8-point check rather than a partial list; that's real
              added detail since "nothing notable here" is itself accurate
              information from the same scan, not invented. Only flagged rows
              are tappable (only they have a matching marker on the photo);
              tapping one selects the same `activeZone` the photo markers
              read from, so the row and its marker light up together. Legacy
              scans (saved before the 8-zone breakdown) only ever have the
              old tZone/cheeks/underEye trio, so those still render as their
              own 3 rows via the fallback below — kept simple/non-interactive
              since that shape is frozen and fading out. */}
          {(() => {
            const granularRows = ZONE_META.map(z => ({ ...z, note: scan.zoneNotes?.[z.key] }));
            const flaggedCount = granularRows.filter(z => !!z.note).length;
            if (flaggedCount > 0) {
              return (
                <View style={styles.zoneSection}>
                  <View style={styles.zoneSectionHeader}>
                    <Text style={styles.zoneHint}>Tap a marker on the photo, or a row below, to see it pointed out</Text>
                    <Text style={styles.zoneCount}>{flaggedCount}/{granularRows.length} flagged</Text>
                  </View>
                  {granularRows.map(z => (
                    <ZoneRow
                      key={z.key}
                      label={z.label}
                      note={z.note || 'Clear — nothing notable here'}
                      flagged={!!z.note}
                      active={activeZone === z.key}
                      onPress={() => setActiveZone(activeZone === z.key ? null : z.key)}
                    />
                  ))}
                </View>
              );
            }
            if (scan.zoneNotes?.tZone || scan.zoneNotes?.cheeks || scan.zoneNotes?.underEye) {
              return (
                <View style={styles.zoneSection}>
                  <Text style={styles.zoneHint}>Tap a marker on the photo above to see it pointed out</Text>
                  {!!scan.zoneNotes?.tZone && <ZoneRow label="T-zone" note={scan.zoneNotes.tZone} flagged />}
                  {!!scan.zoneNotes?.cheeks && <ZoneRow label="Cheeks" note={scan.zoneNotes.cheeks} flagged />}
                  {!!scan.zoneNotes?.underEye && <ZoneRow label="Under-eye" note={scan.zoneNotes.underEye} flagged />}
                </View>
              );
            }
            return null;
          })()}

          {scan.concerns.length > 0 && (
            <View style={styles.chipRow}>
              {scan.concerns.map(c => (
                <View key={c} style={styles.concernChip}><Text style={styles.concernChipText}>{c}</Text></View>
              ))}
            </View>
          )}

          {/* Progress callout — only when Gemini actually had a previous
              scan to compare against. Visually distinct (not just another
              text block) so it reads as the AI actively tracking them over
              time, the thing that makes repeat scanning worth doing. */}
          {!!scan.progressNote && (
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <SparkleIcon size={14} color="#fff" />
                <Text style={styles.progressLabel}>YOUR PROGRESS</Text>
              </View>
              <Text style={styles.progressText}>{scan.progressNote}</Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Recommended for you</Text>
          {scan.recommendations.map((r, i) => (
            <View key={i} style={styles.recCard}>
              <View style={styles.recCategoryPill}><Text style={styles.recCategoryText}>{r.category}</Text></View>
              <Text style={styles.recTitle}>{r.title}</Text>
              <Text style={styles.recNote}>{r.note}</Text>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Want a professional take?</Text>
          <NearbyArtistRow category="Facials & Skin" serviceType="Facial" />

          <Pressable style={styles.deleteBtn} onPress={deleteScan} disabled={deleting}>
            <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete this scan'}</Text>
          </Pressable>

          <Text style={styles.disclaimer}>
            Cosmetic guidance based on a photo and your answers — not a medical diagnosis. For any skin concern that worries you, see a dermatologist.
          </Text>
        </View>
      </ScrollView>

      <ShareCardModal visible={!!shareCard} card={shareCard} onClose={() => setShareCard(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemBackground },
  // overflow: 'hidden' — a zone marker's callout near the bottom of the
  // face (chin, jawline) flips above the marker when there isn't room
  // below (see SkinZoneOverlay), but this is a second, unconditional
  // guard: nothing rendered inside this wrapper — overlay markers
  // included — can ever visually spill onto the text content below the
  // photo, regardless of edge case.
  photoWrap: { overflow: 'hidden' },
  // aspectRatio is overridden inline per-scan from the real loaded image
  // (see photoAspect) — this 1080/1350 is only the pre-load placeholder.
  // It used to be forced here unconditionally, on the assumption that the
  // backend's resize(1080, 1350, {fit:'inside'}) always outputs exactly
  // that box — it doesn't: `fit:'inside'` preserves the source photo's
  // real aspect ratio and only fits it within 1080×1350, so the output is
  // almost never exactly 4:5. With contentFit="cover" locked to the wrong
  // assumed ratio, the real photo got cropped to fit it, desyncing
  // SkinZoneOverlay's marker fractions (correct relative to the real,
  // uncropped stored photo) from what was actually visible — markers
  // reading as scattered off-face.
  photo: { width: '100%', backgroundColor: Colors.brandLight },
  photoTopGradient: { position: 'absolute', left: 0, right: 0, top: 0, height: 90 },
  floatBack: {
    position: 'absolute', left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  floatBackText: { color: '#fff', fontSize: 22, fontFamily: Fonts.semibold, marginTop: -2 },
  floatShare: {
    position: 'absolute', right: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  floatShareText: { color: '#fff', fontSize: 16, fontFamily: Fonts.semibold },

  body: { padding: 20, gap: 4 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  eyebrow: { fontSize: 11, fontFamily: Fonts.semibold, color: Colors.brandDark, letterSpacing: 1.4 },

  summary: {
    fontSize: 21, fontFamily: Fonts.displayItalic, color: Colors.label,
    lineHeight: 28, marginBottom: 16,
  },

  resultRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  toneSwatch: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.separator },
  resultText: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  hydrationPill: { backgroundColor: Colors.surfaceCream, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  hydrationPillText: { fontSize: 11.5, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },

  zoneSection: {
    marginTop: 18, backgroundColor: Colors.surfaceCream, borderRadius: 16,
    paddingHorizontal: 14, paddingBottom: 4,
  },
  zoneSectionHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
    paddingTop: 12, paddingBottom: 2,
  },
  zoneHint: {
    flex: 1,
    fontSize: 10.5, fontFamily: Fonts.medium, color: Colors.tertiaryLabel,
  },
  zoneCount: {
    fontSize: 10.5, fontFamily: Fonts.bold, color: Colors.brandDark, letterSpacing: 0.2,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  concernChip: { backgroundColor: Colors.surfaceBlush, borderRadius: 100, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: Colors.brandAccent },
  concernChipText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.brandDark },

  progressCard: {
    marginTop: 20, borderRadius: 20, padding: 16,
    backgroundColor: Colors.brandDeep,
  },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  progressLabel: { fontSize: 10.5, fontFamily: Fonts.bold, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  progressText: { fontSize: 14, fontFamily: Fonts.medium, color: '#fff', lineHeight: 20 },

  sectionTitle: { fontSize: 15.5, fontFamily: Fonts.display, color: Colors.label, marginTop: 24, marginBottom: 10 },
  recCard: { backgroundColor: Colors.surfaceCream, borderRadius: 18, padding: 14, marginBottom: 10 },
  recCategoryPill: { alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 6 },
  recCategoryText: { fontSize: 10.5, fontFamily: Fonts.bold, color: Colors.brandDark, letterSpacing: 0.3, textTransform: 'uppercase' },
  recTitle: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label },
  recNote: { fontSize: 12.5, fontFamily: Fonts.regular, color: Colors.secondaryLabel, marginTop: 3, lineHeight: 18 },

  deleteBtn: { alignSelf: 'center', paddingVertical: 20 },
  deleteBtnText: { color: Colors.systemRed, fontSize: 13, fontFamily: Fonts.semibold },

  disclaimer: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.tertiaryLabel, textAlign: 'center', lineHeight: 16, marginTop: 4 },
});
