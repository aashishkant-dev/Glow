/**
 * Explore — Two tabs: Looks (Pinterest grid) and Artists (provider grid).
 * Looks tab: masonry of complete looks with collection filters.
 * Artists tab: 2-column grid of celebrity/seed artists with specialty filter chips.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts } from '../../utils/colors';
import { LOOKS, LOOK_COLLECTIONS, Look, LookCollection } from '../../data/looks';
import { LookTile } from '../../components/LookTile';
import { LookSheet } from '../../components/LookSheet';
import { ArtistCard } from '../../components/ArtistCard';
import { apiPublicCatalog, apiPublicProviders, PublicProviderCard } from '../../api/client';
import { SparkleIcon } from '../../components/BeautyIcons';
import { tapLight } from '../../utils/haptics';
import { SEED_ARTISTS } from '../../data/seedArtists';

type LookFilter = 'All' | LookCollection;
type Tab = 'Looks' | 'Artists';
const ARTIST_SPECIALTIES = ['All', 'Bridal Makeup', 'Hair Styling', 'Facial', 'Nails', 'Mehendi', 'Massage', 'Makeup', 'Party Makeup'];

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('Looks');
  const [lookFilter, setLookFilter] = useState<LookFilter>('All');
  const [openLook, setOpenLook] = useState<Look | null>(null);
  const [catalogPrices, setCatalogPrices] = useState<Record<string, number>>({});
  const [artists, setArtists] = useState<PublicProviderCard[]>([]);
  const [artistFilter, setArtistFilter] = useState('All');

  useEffect(() => {
    apiPublicCatalog()
      .then(({ categories }) => {
        const map: Record<string, number> = {};
        categories.flatMap(c => c.services).forEach(s => { map[s.name] = s.basePrice; });
        setCatalogPrices(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiPublicProviders()
      .then(r => setArtists(r.providers))
      .catch(() => {});
  }, []);

  const looks = useMemo(
    () => (lookFilter === 'All' ? LOOKS : LOOKS.filter(l => l.collection === lookFilter)),
    [lookFilter],
  );

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

  const displayArtists = useMemo(() => {
    // Merge API artists with seed artists (dedupe by id)
    const seedOnly = SEED_ARTISTS.filter(s => !artists.find(a => a.id === s.id));
    const all = [...seedOnly, ...artists];
    return artistFilter === 'All' ? all : all.filter(a =>
      (a as any).specialty === artistFilter ||
      a.qualificationType?.replace(/_/g, ' ').toLowerCase().includes(artistFilter.toLowerCase())
    );
  }, [artists, artistFilter]);

  const artistColumns = useMemo(() => {
    const cols: PublicProviderCard[][] = [[], []];
    displayArtists.forEach((a, i) => cols[i % 2].push(a));
    return cols;
  }, [displayArtists]);

  function openArtist(artist: PublicProviderCard) {
    // Seed artists are demo data with no real backend account — booking against
    // them would 400 at checkout. Show real artists' profiles; tell users
    // plainly when a card is a demo, instead of leading them into a dead end.
    if (artist.id.startsWith('seed-')) {
      const msg = 'This is a demo artist — booking isn\'t available for them yet.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Demo Artist', msg);
      return;
    }
    nav.navigate('ProviderPublicProfile', { providerId: artist.id, providerName: artist.name });
  }

  return (
    <View style={styles.container}>
      {tab === 'Looks' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 130 }}
          stickyHeaderIndices={[2]}
        >
          <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
            <Text style={styles.eyebrow}>EXPLORE</Text>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Looks to fall{'\n'}in love with</Text>
              <SparkleIcon size={22} color={Colors.gold} />
            </View>
          </View>

          {/* Tab toggle */}
          <View style={styles.tabBar}>
            {(['Looks', 'Artists'] as Tab[]).map(t => {
              const active = tab === t;
              return (
                <Pressable key={t} style={[styles.tabPill, active && styles.tabPillActive]} onPress={() => { tapLight(); setTab(t); }}>
                  <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Collection chips */}
          <View style={styles.chipBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ width: '100%' }}>
              {(['All', ...LOOK_COLLECTIONS] as LookFilter[]).map(f => {
                const active = lookFilter === f;
                return (
                  <Pressable key={f} style={[styles.chip, active && styles.chipActive]} onPress={() => { tapLight(); setLookFilter(f); }}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.masonry}>
            <View style={styles.column}>
              {left.map(look => (
                <LookTile key={look.id} look={look} height={look.tall ? 230 : 165} price={priceOf(look)} onPress={() => setOpenLook(look)} />
              ))}
            </View>
            <View style={styles.column}>
              {right.map(look => (
                <LookTile key={look.id} look={look} height={look.tall ? 230 : 165} price={priceOf(look)} onPress={() => setOpenLook(look)} />
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        /* ── Artists tab ── */
        <View style={{ flex: 1 }}>
          <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
            <Text style={styles.eyebrow}>EXPLORE</Text>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Artists near you</Text>
              <SparkleIcon size={22} color={Colors.gold} />
            </View>
          </View>

          {/* Tab toggle */}
          <View style={styles.tabBar}>
            {(['Looks', 'Artists'] as Tab[]).map(t => {
              const active = tab === t;
              return (
                <Pressable key={t} style={[styles.tabPill, active && styles.tabPillActive]} onPress={() => { tapLight(); setTab(t); }}>
                  <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Specialty filter chips */}
          <View style={styles.chipBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ width: '100%' }}>
              {ARTIST_SPECIALTIES.map(s => {
                const active = artistFilter === s;
                return (
                  <Pressable key={s} style={[styles.chip, active && styles.chipActive]} onPress={() => { tapLight(); setArtistFilter(s); }}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* 2-column artist grid */}
          <FlatList
            data={artistColumns}
            keyExtractor={(_, i) => String(i)}
            numColumns={2}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 130, paddingTop: 10 }}
            columnWrapperStyle={{ gap: 14 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: column }) => (
              <View style={{ flex: 1 }}>
                {column.map(artist => (
                  <View key={artist.id} style={{ marginBottom: 10 }}>
                    <ArtistCard artist={artist} onPress={() => openArtist(artist)} />
                  </View>
                ))}
              </View>
            )}
          />
        </View>
      )}

      <LookSheet look={openLook} priceOverride={openLook ? priceOf(openLook) : undefined} onClose={() => setOpenLook(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemGroupedBackground },
  header: { paddingHorizontal: 24, paddingBottom: 10 },
  eyebrow: { fontSize: 11, fontFamily: Fonts.semibold, color: Colors.brandDark, letterSpacing: 1.6 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 },
  title: { fontSize: 30, lineHeight: 35, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -0.8 },

  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 8,
  },
  tabPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 100,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  tabPillActive: { backgroundColor: Colors.label, borderColor: Colors.label },
  tabPillText: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  tabPillTextActive: { color: '#fff' },

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