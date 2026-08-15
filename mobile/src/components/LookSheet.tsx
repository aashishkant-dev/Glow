/**
 * LookSheet — detail sheet for a "complete look": what it includes, duration,
 * from-price, products used, save heart, one Book CTA.
 */
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { GlowSheet } from './GlowSheet';
import { HeartIcon, CheckCircleIcon } from './TabIcons';
import { SparkleIcon } from './BeautyIcons';
import { Colors, Fonts } from '../utils/colors';
import { Look } from '../data/looks';
import { toggleSavedLook, useSavedLooks } from '../utils/savedLooks';
import { tapLight, tapSuccess } from '../utils/haptics';
import { formatCurrency } from '../utils/format';

interface LookSheetProps {
  look: Look | null;
  onClose: () => void;
  /** Live catalog price for the mapped service, when known. */
  priceOverride?: number;
}

export function LookSheet({ look, onClose, priceOverride }: LookSheetProps) {
  const nav = useNavigation<any>();
  const savedIds = useSavedLooks();
  const saved = look ? savedIds.includes(look.id) : false;
  const price = priceOverride ?? null;

  function book() {
    if (!look) return;
    tapSuccess();
    onClose();
    nav.navigate('NewBooking', { serviceType: look.serviceType, lookId: look.id, bookingMode: 'scheduled', _t: Date.now() });
  }

  return (
    <GlowSheet visible={!!look} onClose={onClose}>
      {look && (
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {/* Editorial hero — photography slot, gradient until assets land */}
          <View style={styles.hero}>
            {Platform.OS === 'web' ? (
              <View style={[StyleSheet.absoluteFill, { background: `linear-gradient(150deg, ${look.from}, ${look.to})` } as any]} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: look.from }]} />
            )}
            <View style={styles.heroGlow} />
            <View style={styles.heroTag}>
              <Text style={styles.heroTagText}>{look.collection.toUpperCase()}</Text>
            </View>
            <Pressable
              style={styles.heartBtn}
              hitSlop={10}
              onPress={() => { tapLight(); toggleSavedLook(look.id); }}
              accessibilityLabel={saved ? 'Remove from saved' : 'Save look'}
            >
              <HeartIcon size={20} color={saved ? Colors.brand : '#fff'} filled={saved} />
            </Pressable>
            <Text style={styles.heroName}>{look.name}</Text>
            <Text style={styles.heroVibe}>{look.vibe}</Text>
          </View>

          <View style={styles.body}>
            {/* Quick facts */}
            <View style={styles.factRow}>
              <View style={styles.fact}>
                <Text style={styles.factValue}>{price != null ? `From ${formatCurrency(price, { decimals: 0 })}` : 'Varies'}</Text>
                <Text style={styles.factLabel}>Complete look</Text>
              </View>
              <View style={styles.factDivider} />
              <View style={styles.fact}>
                <Text style={styles.factValue}>{look.includes.length}</Text>
                <Text style={styles.factLabel}>Included</Text>
              </View>
              <View style={styles.factDivider} />
              <View style={styles.fact}>
                <Text style={styles.factValue}>{look.products.length}</Text>
                <Text style={styles.factLabel}>Products used</Text>
              </View>
            </View>

            {/* What's included — outcomes, not services */}
            <Text style={styles.sectionLabel}>THE LOOK INCLUDES</Text>
            <View style={styles.card}>
              {look.includes.map(item => (
                <View key={item} style={styles.includeRow}>
                  <CheckCircleIcon size={17} color={Colors.brand} />
                  <Text style={styles.includeText}>{item}</Text>
                </View>
              ))}
            </View>

            {/* Products used */}
            <Text style={styles.sectionLabel}>PRODUCTS YOUR ARTIST MAY USE</Text>
            <View style={styles.brandRow}>
              {look.products.map(b => (
                <View key={b} style={styles.brandChip}>
                  <SparkleIcon size={12} color={Colors.gold} />
                  <Text style={styles.brandText}>{b}</Text>
                </View>
              ))}
            </View>

            <Pressable style={({ pressed }) => [styles.bookBtn, pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 }]} onPress={book}>
              <Text style={styles.bookBtnText}>Book this look</Text>
            </Pressable>
            <Text style={styles.bookHint}>Glow matches you with the right artist next</Text>
          </View>
        </ScrollView>
      )}
    </GlowSheet>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: 16,
    height: 210, borderRadius: 26, overflow: 'hidden',
    padding: 20, justifyContent: 'flex-end',
  },
  heroGlow: {
    position: 'absolute', top: -50, right: -40,
    width: 170, height: 170, borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heroTag: {
    position: 'absolute', top: 16, left: 18,
    backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 100,
    paddingHorizontal: 11, paddingVertical: 4,
  },
  heroTagText: { color: '#fff', fontSize: 10, fontFamily: Fonts.semibold, letterSpacing: 1.1 },
  heartBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(29,29,31,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroName: { color: '#fff', fontSize: 27, fontFamily: Fonts.bold, letterSpacing: -0.5 },
  heroVibe: { color: 'rgba(255,255,255,0.92)', fontSize: 14, marginTop: 3, fontFamily: Fonts.regular },

  body: { paddingHorizontal: 20, paddingTop: 18 },
  factRow: {
    flexDirection: 'row', backgroundColor: Colors.secondarySystemBackground,
    borderRadius: 18, paddingVertical: 14, borderWidth: 1, borderColor: Colors.separator,
  },
  fact: { flex: 1, alignItems: 'center' },
  factValue: { fontSize: 16, fontFamily: Fonts.bold, color: Colors.label },
  factLabel: { fontSize: 11, color: Colors.secondaryLabel, marginTop: 2, fontFamily: Fonts.regular },
  factDivider: { width: 1, backgroundColor: Colors.separator },

  sectionLabel: {
    fontSize: 11, fontFamily: Fonts.semibold, color: Colors.tertiaryLabel,
    letterSpacing: 1, marginTop: 20, marginBottom: 9,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.separator, gap: 11,
  },
  includeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  includeText: { fontSize: 14.5, color: Colors.label, fontFamily: Fonts.regular },

  brandRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  brandChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.goldSoft, borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  brandText: { fontSize: 12.5, fontFamily: Fonts.medium, color: Colors.label },

  bookBtn: {
    backgroundColor: Colors.brand, borderRadius: 100,
    paddingVertical: 17, alignItems: 'center', marginTop: 24,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
  },
  bookBtnText: { color: '#fff', fontSize: 16, fontFamily: Fonts.semibold },
  bookHint: { textAlign: 'center', fontSize: 12, color: Colors.tertiaryLabel, marginTop: 10, marginBottom: 6, fontFamily: Fonts.regular },
});
