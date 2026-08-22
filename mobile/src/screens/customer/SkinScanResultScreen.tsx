/**
 * Full detail view for one skin scan — reached right after a new scan
 * completes (`justScanned`) or by tapping a past entry in My Space's
 * progress timeline. Same result data either way, just different framing
 * copy at the top.
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts } from '../../utils/colors';
import { apiDeleteSkinScan, SkinScan } from '../../api/client';
import { tapLight, confirmAction } from '../../utils/haptics';

const TONE_LABELS: Record<string, string> = { FAIR: 'Fair', LIGHT: 'Light', MEDIUM: 'Medium', TAN: 'Tan', DEEP: 'Deep', RICH: 'Rich' };
const TONE_SWATCH: Record<string, string> = { FAIR: '#F5D5C0', LIGHT: '#E8B894', MEDIUM: '#C68863', TAN: '#A9673F', DEEP: '#7A4B32', RICH: '#4A2C20' };
const TYPE_LABELS: Record<string, string> = { DRY: 'Dry', OILY: 'Oily', COMBINATION: 'Combination', NORMAL: 'Normal', SENSITIVE: 'Sensitive' };

export function SkinScanResultScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const scan: SkinScan = route.params.scan;
  const justScanned: boolean = !!route.params.justScanned;
  const [deleting, setDeleting] = useState(false);

  function goBack() {
    if (justScanned) nav.navigate('Home', { screen: 'MySpaceTab' });
    else if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Home');
  }

  function bookAnArtist() {
    tapLight();
    nav.navigate('NewBooking', { serviceType: 'Facial', bookingMode: 'scheduled', _t: Date.now() });
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
        <View>
          <Image source={{ uri: scan.photoUrl }} style={styles.photo} contentFit="cover" />
          <Pressable style={[styles.floatBack, { top: insets.top + 8 }]} onPress={goBack} hitSlop={12}>
            <Text style={styles.floatBackText}>‹</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.eyebrow}>{justScanned ? 'HERE’S WHAT WE FOUND' : 'SCAN DETAILS'}</Text>

          <View style={styles.resultRow}>
            <View style={[styles.toneSwatch, { backgroundColor: TONE_SWATCH[scan.skinTone] }]} />
            <Text style={styles.resultText}>{TONE_LABELS[scan.skinTone]} tone · {TYPE_LABELS[scan.skinType]} skin</Text>
          </View>

          {scan.concerns.length > 0 && (
            <View style={styles.chipRow}>
              {scan.concerns.map(c => (
                <View key={c} style={styles.concernChip}><Text style={styles.concernChipText}>{c}</Text></View>
              ))}
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

          <Pressable style={styles.bookBtn} onPress={bookAnArtist}>
            <Text style={styles.bookBtnText}>Book a facial with a Glow artist →</Text>
          </Pressable>

          <Pressable style={styles.deleteBtn} onPress={deleteScan} disabled={deleting}>
            <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete this scan'}</Text>
          </Pressable>

          <Text style={styles.disclaimer}>
            Cosmetic guidance based on a photo and your answers — not a medical diagnosis. For any skin concern that worries you, see a dermatologist.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemBackground },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: Colors.brandLight },
  floatBack: {
    position: 'absolute', left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  floatBackText: { color: '#fff', fontSize: 22, fontFamily: Fonts.semibold, marginTop: -2 },

  body: { padding: 20, gap: 4 },
  eyebrow: { fontSize: 11, fontFamily: Fonts.semibold, color: Colors.brandDark, letterSpacing: 1.4, marginBottom: 8 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toneSwatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.separator },
  resultText: { fontSize: 20, fontFamily: Fonts.display, color: Colors.label },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  concernChip: { backgroundColor: Colors.surfaceBlush, borderRadius: 100, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: Colors.brandAccent },
  concernChipText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.brandDark },

  sectionTitle: { fontSize: 15.5, fontFamily: Fonts.display, color: Colors.label, marginTop: 22, marginBottom: 10 },
  recCard: { backgroundColor: Colors.surfaceCream, borderRadius: 18, padding: 14, marginBottom: 10 },
  recCategoryPill: { alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 6 },
  recCategoryText: { fontSize: 10.5, fontFamily: Fonts.bold, color: Colors.brandDark, letterSpacing: 0.3, textTransform: 'uppercase' },
  recTitle: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label },
  recNote: { fontSize: 12.5, fontFamily: Fonts.regular, color: Colors.secondaryLabel, marginTop: 3, lineHeight: 18 },

  bookBtn: { backgroundColor: Colors.brand, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  bookBtnText: { color: '#fff', fontSize: 14.5, fontFamily: Fonts.semibold },

  deleteBtn: { alignSelf: 'center', paddingVertical: 14 },
  deleteBtnText: { color: Colors.systemRed, fontSize: 13, fontFamily: Fonts.semibold },

  disclaimer: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.tertiaryLabel, textAlign: 'center', lineHeight: 16, marginTop: 4 },
});
