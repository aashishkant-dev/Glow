/**
 * Explore — Pinterest-inspired look discovery. Two-column masonry of complete
 * looks, collection filters, every tile saveable into moodboards.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../utils/colors';
import { LOOKS, LOOK_COLLECTIONS, Look, LookCollection } from '../../data/looks';
import { LookTile } from '../../components/LookTile';
import { LookSheet } from '../../components/LookSheet';
import { apiPublicCatalog } from '../../api/client';
import { SparkleIcon } from '../../components/BeautyIcons';
import { tapLight } from '../../utils/haptics';

type Filter = 'All' | LookCollection;

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('All');
  const [openLook, setOpenLook] = useState<Look | null>(null);
  const [catalogPrices, setCatalogPrices] = useState<Record<string, number>>({});

  // Live prices for mapped services — editorial fromPrice is the fallback.
  useEffect(() => {
    apiPublicCatalog()
      .then(({ categories }) => {
        const map: Record<string, number> = {};
        categories.flatMap(c => c.services).forEach(s => { map[s.name] = s.basePrice; });
        setCatalogPrices(map);
      })
      .catch(() => {});
  }, []);

  const looks = useMemo(
    () => (filter === 'All' ? LOOKS : LOOKS.filter(l => l.collection === filter)),
    [filter],
  );

  // Simple masonry: alternate tiles into two columns, tall tiles get taller art.
  const [left, right] = useMemo(() => {
    const l: Look[] = []; const r: Look[] = [];
    let lh = 0; let rh = 0;
    looks.forEach(look => {
      const h = look.tall ? 230 : 165;
      if (lh <= rh) { l.push(look); lh += h; } else { r.push(look); rh += h; }
    });
    return [l, r];
  }, [looks]);

  const priceOf = (look: Look) => catalogPrices[look.serviceType];

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
        stickyHeaderIndices={[1]}
      >
        <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
          <Text style={styles.eyebrow}>EXPLORE</Text>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Looks to fall{'\n'}in love with</Text>
            <SparkleIcon size={22} color={Colors.gold} />
          </View>
        </View>

        {/* Sticky collection chips */}
        <View style={styles.chipBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ width: '100%' }}>
            {(['All', ...LOOK_COLLECTIONS] as Filter[]).map(f => {
              const active = filter === f;
              return (
                <Pressable
                  key={f}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => { tapLight(); setFilter(f); }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.masonry}>
          <View style={styles.column}>
            {left.map(look => (
              <LookTile
                key={look.id}
                look={look}
                height={look.tall ? 230 : 165}
                price={priceOf(look)}
                onPress={() => setOpenLook(look)}
              />
            ))}
          </View>
          <View style={styles.column}>
            {right.map(look => (
              <LookTile
                key={look.id}
                look={look}
                height={look.tall ? 230 : 165}
                price={priceOf(look)}
                onPress={() => setOpenLook(look)}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      <LookSheet
        look={openLook}
        priceOverride={openLook ? priceOf(openLook) : undefined}
        onClose={() => setOpenLook(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemGroupedBackground },
  header: { paddingHorizontal: 24, paddingBottom: 18 },
  eyebrow: { fontSize: 11, fontFamily: Fonts.semibold, color: Colors.brandDark, letterSpacing: 1.6 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 },
  title: { fontSize: 30, lineHeight: 35, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -0.8 },

  chipBar: { backgroundColor: Colors.systemGroupedBackground, paddingVertical: 8 },
  chipRow: { paddingHorizontal: 24, gap: 8 },
  chip: {
    paddingHorizontal: 15, paddingVertical: 9,
    borderRadius: 100, backgroundColor: '#fff',
    borderWidth: 1, borderColor: Colors.separator,
  },
  chipActive: { backgroundColor: Colors.label, borderColor: Colors.label },
  chipText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.secondaryLabel },
  chipTextActive: { color: '#fff' },

  masonry: { flexDirection: 'row', paddingHorizontal: 24, gap: 14, marginTop: 10 },
  column: { flex: 1 },
});
