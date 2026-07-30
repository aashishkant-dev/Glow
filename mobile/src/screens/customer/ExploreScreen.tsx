/**
 * Explore — Two tabs: Looks (Pinterest grid) and Artists (provider grid).
 * Looks tab: masonry of complete looks with collection filters.
 * Artists tab: 2-column grid of celebrity/seed artists with specialty filter chips.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts } from '../../utils/colors';
import { LOOKS, LOOK_OCCASIONS, Look } from '../../data/looks';
import { LookTile } from '../../components/LookTile';
import { LookSheet } from '../../components/LookSheet';
import { ArtistCard } from '../../components/ArtistCard';
import { apiPublicCatalog, apiPublicProviders, PublicProviderCard } from '../../api/client';
import { SearchIcon } from '../../components/TabIcons';
import { tapLight } from '../../utils/haptics';
import { SEED_ARTISTS } from '../../data/seedArtists';
import { ExploreHeaderAvatar } from '../../components/ExploreHeaderAvatar';

type LookFilter = 'All' | typeof LOOK_OCCASIONS[number];
type Tab = 'Looks' | 'Artists';
type ArtistSort = 'rating' | 'priceLow' | 'experience';

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('Looks');
  const [lookFilter, setLookFilter] = useState<LookFilter>('All');
  const [openLook, setOpenLook] = useState<Look | null>(null);
  const [catalogPrices, setCatalogPrices] = useState<Record<string, number>>({});
  const [artists, setArtists] = useState<PublicProviderCard[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const [artistFilter, setArtistFilter] = useState('All');
  const [artistSort, setArtistSort] = useState<ArtistSort>('rating');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

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
      .catch(() => {})
      .finally(() => setArtistsLoading(false));
  }, []);

  const looks = useMemo(
    () => (lookFilter === 'All' ? LOOKS : LOOKS.filter(l => l.occasion === lookFilter)),
    [lookFilter],
  );

  const filteredLooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return looks;
    return looks.filter(l => l.name.toLowerCase().includes(q) || l.serviceType.toLowerCase().includes(q));
  }, [looks, query]);

  const [left, right] = useMemo(() => {
    const l: Look[] = []; const r: Look[] = [];
    let lh = 0; let rh = 0;
    filteredLooks.forEach(look => {
      const h = look.tall ? 230 : 165;
      if (lh <= rh) { l.push(look); lh += h; } else { r.push(look); rh += h; }
    });
    return [l, r];
  }, [filteredLooks]);

  const priceOf = (look: Look) => catalogPrices[look.serviceType];

  const allArtists = useMemo(() => {
    // Merge API artists with seed artists (dedupe by id)
    const seedOnly = SEED_ARTISTS.filter(s => !artists.find(a => a.id === s.id));
    return [...seedOnly, ...artists];
  }, [artists]);

  // Specialty chips derived from the actual artist pool, not a hand-maintained
  // list — new specialties (real Providers, future seed additions) show up
  // automatically instead of silently having no filter for them.
  const artistSpecialties = useMemo(() => {
    const set = new Set<string>();
    allArtists.forEach(a => {
      const seedSpecialty = (a as any).specialty as string | undefined;
      if (seedSpecialty) set.add(seedSpecialty);
      a.specialties?.forEach(s => set.add(s));
    });
    return ['All', ...Array.from(set).sort()];
  }, [allArtists]);

  const displayArtists = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = allArtists.filter(a => {
      const matchesFilter = artistFilter === 'All' ||
        (a as any).specialty === artistFilter ||
        a.specialties?.includes(artistFilter) ||
        a.qualificationType?.replace(/_/g, ' ').toLowerCase().includes(artistFilter.toLowerCase());
      if (!matchesFilter) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q) ||
        a.specialties?.some(s => s.toLowerCase().includes(q)) ||
        a.qualificationType?.replace(/_/g, ' ').toLowerCase().includes(q);
    });

    list = [...list].sort((a, b) => {
      if (artistSort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0) || b.ratingCount - a.ratingCount;
      if (artistSort === 'priceLow') {
        const ap = a.startingPrice ?? Infinity, bp = b.startingPrice ?? Infinity;
        return ap - bp;
      }
      // experience
      return (b.experienceYears ?? 0) - (a.experienceYears ?? 0);
    });
    return list;
  }, [allArtists, artistFilter, artistSort, query]);

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

  const SORT_OPTIONS: { label: string; value: ArtistSort }[] = [
    { label: 'Top rated', value: 'rating' },
    { label: 'Price: low to high', value: 'priceLow' },
    { label: 'Most experienced', value: 'experience' },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <ExploreHeaderAvatar />
        <View style={styles.headerTitleGroup}>
          <Text style={styles.igTitle}>{tab === 'Looks' ? 'Explore' : 'Artists near you'}</Text>
        </View>
        <Pressable onPress={() => { tapLight(); setSearchOpen(o => { if (o) setQuery(''); return !o; }); }} style={styles.headerIconBtn} hitSlop={8}>
          <SearchIcon size={20} color={Colors.label} />
        </Pressable>
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

      {/* Search — tap-to-reveal, IG-style. Filters Looks by name/service, Artists by name/specialty */}
      {searchOpen && (
        <View style={styles.searchBar}>
          <SearchIcon size={17} color={Colors.tertiaryLabel} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={tab === 'Looks' ? 'Search looks…' : 'Search artists or specialties…'}
            placeholderTextColor={Colors.tertiaryLabel}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        </View>
      )}

      {tab === 'Looks' ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          {/* Collection chips */}
          <View style={styles.chipBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ width: '100%' }}>
              {(['All', ...LOOK_OCCASIONS] as LookFilter[]).map(f => {
                const active = lookFilter === f;
                return (
                  <Pressable key={f} style={[styles.chip, active && styles.chipActive]} onPress={() => { tapLight(); setLookFilter(f); }}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {filteredLooks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No looks match "{query}".</Text>
            </View>
          ) : (
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
          )}
        </ScrollView>
      ) : (
        /* ── Artists tab ── */
        <View style={{ flex: 1 }}>
          {/* Specialty filter chips */}
          <View style={styles.chipBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ width: '100%' }}>
              {artistSpecialties.map(s => {
                const active = artistFilter === s;
                return (
                  <Pressable key={s} style={[styles.chip, active && styles.chipActive]} onPress={() => { tapLight(); setArtistFilter(s); }}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Sort control */}
          <View style={styles.chipBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ width: '100%' }}>
              {SORT_OPTIONS.map(o => {
                const active = artistSort === o.value;
                return (
                  <Pressable key={o.value} style={[styles.sortChip, active && styles.chipActive]} onPress={() => { tapLight(); setArtistSort(o.value); }}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {artistsLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={Colors.brand} />
            </View>
          ) : displayArtists.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {query ? `No artists match "${query}".` : 'No artists match this filter yet.'}
              </Text>
            </View>
          ) : (
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
                      <ArtistCard artist={artist} showFavorite onPress={() => openArtist(artist)} />
                    </View>
                  ))}
                </View>
              )}
            />
          )}
        </View>
      )}

      <LookSheet look={openLook} priceOverride={openLook ? priceOf(openLook) : undefined} onClose={() => setOpenLook(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemGroupedBackground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12, gap: 12,
  },
  headerTitleGroup: { flex: 1 },
  igTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -0.3 },
  headerIconBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.separator, backgroundColor: Colors.systemBackground,
  },

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
  sortChip: {
    paddingHorizontal: 15, paddingVertical: 9,
    borderRadius: 100, backgroundColor: '#fff',
    borderWidth: 1, borderColor: Colors.separator,
  },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 24, marginBottom: 12, marginTop: 4,
    backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: Colors.separator,
  },
  searchInput: { flex: 1, fontSize: 14.5, fontFamily: Fonts.regular, color: Colors.label },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyStateText: { fontSize: 14, color: Colors.tertiaryLabel, fontFamily: Fonts.regular, textAlign: 'center' },

  masonry: { flexDirection: 'row', paddingHorizontal: 24, gap: 14, marginTop: 10 },
  column: { flex: 1 },
});