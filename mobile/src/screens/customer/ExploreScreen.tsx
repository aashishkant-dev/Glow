/**
 * Explore — Two tabs: Looks (Pinterest grid) and Artists (specialty sections).
 * Looks tab: masonry of complete looks with collection filters.
 * Artists tab: horizontal-scroll rows of celebrity/seed + real artists,
 * one section per specialty, sorted by artist count (Bridal always last).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts } from '../../utils/colors';
import { LOOKS, LOOK_OCCASIONS, Look } from '../../data/looks';
import { LookTile } from '../../components/LookTile';
import { LookSheet } from '../../components/LookSheet';
import { ArtistCard } from '../../components/ArtistCard';
import { apiPublicCatalog, apiPublicProviders, PublicProviderCard, apiGetExplorePosts, Post } from '../../api/client';
import { SearchIcon } from '../../components/TabIcons';
import { tapLight } from '../../utils/haptics';
import { SEED_ARTISTS } from '../../data/seedArtists';
import { ExploreHeaderAvatar } from '../../components/ExploreHeaderAvatar';
import { CATEGORIES } from '../../data/categories';

type LookFilter = 'All' | typeof LOOK_OCCASIONS[number];
type Tab = 'Looks' | 'Artists' | 'Posts';
type ArtistSort = 'rating' | 'priceLow' | 'experience';
type PostSort = 'top' | 'recent';
type PostCategoryFilter = 'All' | typeof CATEGORIES[number]['id'];

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const [tab, setTab] = useState<Tab>('Looks');
  const [lookFilter, setLookFilter] = useState<LookFilter>('All');
  const [openLook, setOpenLook] = useState<Look | null>(null);
  const [catalogPrices, setCatalogPrices] = useState<Record<string, number>>({});
  const [artists, setArtists] = useState<PublicProviderCard[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const [artistSort, setArtistSort] = useState<ArtistSort>('rating');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [postSort, setPostSort] = useState<PostSort>('top');
  const [postCategory, setPostCategory] = useState<PostCategoryFilter>('All');
  const [postsCursor, setPostsCursor] = useState<string | null>(null);

  // Home's search bar navigates here with { openSearch: true } — auto-open
  // the search field so the customer lands with it already active.
  useFocusEffect(
    React.useCallback(() => {
      if (route.params?.openSearch) {
        setSearchOpen(true);
        nav.setParams({ openSearch: undefined });
      }
    }, [route.params?.openSearch]),
  );

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

  useEffect(() => {
    setPostsLoading(true);
    apiGetExplorePosts(postSort)
      .then(({ posts: data, nextCursor }) => {
        setPosts(data);
        setPostsCursor(nextCursor);
      })
      .catch(() => {})
      .finally(() => setPostsLoading(false));
  }, [postSort]);

  // Re-fetch page 1 of the current sort whenever the Posts tab regains focus,
  // so like state edited on PostDetailScreen (like count, isLikedByMe) isn't
  // stale when the customer navigates back to the grid or reopens the post.
  // Resets to page 1 on every focus — an accepted simplification, not an
  // incremental/partial update.
  useFocusEffect(
    React.useCallback(() => {
      if (tab !== 'Posts') return;
      apiGetExplorePosts(postSort)
        .then(({ posts: data, nextCursor }) => {
          setPosts(data);
          setPostsCursor(nextCursor);
        })
        .catch(() => {});
    }, [tab, postSort]),
  );

  const filteredPosts = useMemo(() => {
    if (postCategory === 'All') return posts;
    const cat = CATEGORIES.find(c => c.id === postCategory);
    if (!cat) return posts;
    return posts.filter(p => p.service?.name === cat.serviceType);
  }, [posts, postCategory]);

  const loadMorePosts = useCallback(() => {
    if (postsLoadingMore || !postsCursor) return;
    setPostsLoadingMore(true);
    apiGetExplorePosts(postSort, postsCursor)
      .then(({ posts: data, nextCursor }) => {
        setPosts(prev => [...prev, ...data]);
        setPostsCursor(nextCursor);
      })
      .catch(() => {})
      .finally(() => setPostsLoadingMore(false));
  }, [postSort, postsCursor, postsLoadingMore]);

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

  // Sections: one per specialty with ≥1 artist, ranked by artist count
  // (most-common first), with Bridal always pinned last — bridal browsing
  // is a deliberate, lower-frequency search; everyday specialties (Mehendi,
  // Nails, Hair Styling) should be immediately visible without scrolling.
  // 'Bridal Makeup' is the only specialty string real Provider data and seed
  // data use for bridal work (see SPECIALTY_OPTIONS in ProviderOnboardingScreen.tsx
  // and mobile/src/data/seedArtists.ts — no plain 'Bridal' specialty exists;
  // that string is only used for the unrelated Looks-tab LookOccasion taxonomy).
  const BRIDAL_SPECIALTIES = ['Bridal Makeup'];

  const artistSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySpecialty = new Map<string, PublicProviderCard[]>();

    allArtists.forEach(a => {
      const specs = new Set<string>();
      const seedSpecialty = (a as any).specialty as string | undefined;
      if (seedSpecialty) specs.add(seedSpecialty);
      a.specialties?.forEach(s => specs.add(s));
      specs.forEach(s => {
        if (!bySpecialty.has(s)) bySpecialty.set(s, []);
        bySpecialty.get(s)!.push(a);
      });
    });

    let sections = Array.from(bySpecialty.entries()).map(([specialty, artists]) => {
      const filtered = q
        ? artists.filter(a =>
            a.name.toLowerCase().includes(q) ||
            a.specialties?.some(s => s.toLowerCase().includes(q)) ||
            a.qualificationType?.replace(/_/g, ' ').toLowerCase().includes(q))
        : artists;
      const sorted = [...filtered].sort((a, b) => {
        if (artistSort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0) || b.ratingCount - a.ratingCount;
        if (artistSort === 'priceLow') {
          const ap = a.startingPrice ?? Infinity, bp = b.startingPrice ?? Infinity;
          return ap - bp;
        }
        return (b.experienceYears ?? 0) - (a.experienceYears ?? 0);
      });
      return { specialty, artists: sorted };
    }).filter(s => s.artists.length > 0);

    sections.sort((a, b) => {
      const aBridal = BRIDAL_SPECIALTIES.includes(a.specialty);
      const bBridal = BRIDAL_SPECIALTIES.includes(b.specialty);
      if (aBridal !== bBridal) return aBridal ? 1 : -1;
      return b.artists.length - a.artists.length;
    });

    return sections;
  }, [allArtists, artistSort, query]);

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
          <Text style={styles.igTitle}>{tab === 'Looks' ? 'Explore' : tab === 'Artists' ? 'Artists near you' : 'Posts'}</Text>
        </View>
        <Pressable onPress={() => { tapLight(); setSearchOpen(o => { if (o) setQuery(''); return !o; }); }} style={styles.headerIconBtn} hitSlop={8}>
          <SearchIcon size={20} color={Colors.label} />
        </Pressable>
      </View>

      {/* Tab toggle */}
      <View style={styles.tabBar}>
        {(['Looks', 'Artists', 'Posts'] as Tab[]).map(t => {
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
      ) : tab === 'Artists' ? (
        /* ── Artists tab ── */
        <View style={{ flex: 1 }}>
          {/* Sort control — applies within each section below */}
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
          ) : artistSections.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {query ? `No artists match "${query}".` : 'No artists match this filter yet.'}
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
              {artistSections.map(({ specialty, artists }) => (
                <View key={specialty} style={{ marginBottom: 20 }}>
                  <Text style={styles.sectionHeaderText}>{specialty}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, gap: 14 }}>
                    {artists.map(artist => (
                      <View key={artist.id} style={{ width: 160 }}>
                        <ArtistCard artist={artist} showFavorite onPress={() => openArtist(artist)} />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        /* ── Posts tab ── */
        <View style={{ flex: 1 }}>
          <View style={styles.chipBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ width: '100%' }}>
              {(['top', 'recent'] as PostSort[]).map(s => {
                const active = postSort === s;
                return (
                  <Pressable key={s} style={[styles.sortChip, active && styles.chipActive]} onPress={() => { tapLight(); setPostSort(s); }}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s === 'top' ? 'Top' : 'Recent'}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <View style={styles.chipBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ width: '100%' }}>
              {(['All', ...CATEGORIES.map(c => c.id)] as PostCategoryFilter[]).map(f => {
                const active = postCategory === f;
                const label = f === 'All' ? 'All' : CATEGORIES.find(c => c.id === f)!.name;
                return (
                  <Pressable key={f} style={[styles.chip, active && styles.chipActive]} onPress={() => { tapLight(); setPostCategory(f); }}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {postsLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={Colors.brand} />
            </View>
          ) : filteredPosts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {postCategory !== 'All' ? 'No posts in this category yet.' : 'No posts yet.'}
              </Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 130 }}
              onScroll={({ nativeEvent }) => {
                const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 400) loadMorePosts();
              }}
              scrollEventThrottle={200}
            >
              <View style={styles.postGrid}>
                {filteredPosts.map(post => (
                  <Pressable
                    key={post.id}
                    style={styles.postTile}
                    onPress={() => nav.navigate('PostDetail', { post })}
                  >
                    <Image source={{ uri: post.photoUrl }} style={styles.postTileImage} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                    <View style={styles.postTileLikeBadge}>
                      <Text style={styles.postTileLikeText}>♥ {post.likeCount}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              {postsLoadingMore && (
                <View style={{ paddingVertical: 20 }}>
                  <ActivityIndicator color={Colors.brand} />
                </View>
              )}
            </ScrollView>
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

  sectionHeaderText: {
    fontSize: 17, fontFamily: Fonts.bold, color: Colors.label,
    paddingHorizontal: 24, marginBottom: 10,
  },

  postGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 24, gap: 10, marginTop: 4,
  },
  postTile: {
    width: '47%', aspectRatio: 1,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: Colors.brandLight,
  },
  postTileImage: { width: '100%', height: '100%' },
  postTileLikeBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  postTileLikeText: { color: '#fff', fontSize: 11.5, fontFamily: Fonts.semibold },
});
