/**
 * Explore — Two tabs: Looks (Pinterest grid) and Artists (specialty sections).
 * Looks tab: masonry of complete looks with collection filters.
 * Artists tab: horizontal-scroll rows of real artists, one section per
 * specialty, sorted by artist count (Bridal always last).
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
import { LookGalleryModal } from '../../components/LookGalleryModal';
import { ArtistCard } from '../../components/ArtistCard';
import { PostMedia } from '../../components/PostMedia';
import { apiPublicCatalog, apiPublicProviders, PublicProviderCard, apiGetExplorePosts, Post, apiGetExploreLooks, ExploreLookItem } from '../../api/client';
import { SearchIcon } from '../../components/TabIcons';
import { tapLight } from '../../utils/haptics';
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
  // Self-served looks (badge/theme/gallery/video) from real artists — shown
  // above the curated catalog so that content isn't only findable behind a
  // direct visit to one specific artist's profile.
  const [exploreLooks, setExploreLooks] = useState<ExploreLookItem[]>([]);

  useEffect(() => {
    apiGetExploreLooks('recent', undefined, 16).then(({ looks }) => setExploreLooks(looks)).catch(() => {});
  }, []);

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

  // Server-side category filter (post.category, set at upload time) — the
  // filter used to run client-side against p.service?.name, which only
  // matched posts whose linked ProviderService menu item happened to share
  // the category's exact serviceType string. Most posts have no serviceId
  // at all, so that filter silently matched almost nothing.
  const postCategoryName = postCategory === 'All' ? undefined : CATEGORIES.find(c => c.id === postCategory)?.name;

  // Posts are server-paginated, so filtering them client-side only ever
  // searched the ~20 already loaded — anything further down the catalogue
  // could not be found at all, which is what made search look broken. The
  // query now goes to the backend (see GET /posts/explore), debounced so
  // typing doesn't fire a request per keystroke. The client-side narrowing
  // below is kept: it gives instant feedback during the debounce, and it is
  // what still works if the app is talking to a backend that predates the
  // `q` parameter.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    setPostsLoading(true);
    apiGetExplorePosts(postSort, undefined, 20, postCategoryName, debouncedQuery)
      .then(({ posts: data, nextCursor }) => {
        setPosts(data);
        setPostsCursor(nextCursor);
      })
      .catch(() => {})
      .finally(() => setPostsLoading(false));
  }, [postSort, postCategoryName, debouncedQuery]);

  // Re-fetch page 1 of the current sort whenever the Posts tab regains focus,
  // so like state edited on PostDetailScreen (like count, isLikedByMe) isn't
  // stale when the customer navigates back to the grid or reopens the post.
  // Resets to page 1 on every focus — an accepted simplification, not an
  // incremental/partial update.
  useFocusEffect(
    React.useCallback(() => {
      if (tab !== 'Posts') return;
      apiGetExplorePosts(postSort, undefined, 20, postCategoryName, debouncedQuery)
        .then(({ posts: data, nextCursor }) => {
          setPosts(data);
          setPostsCursor(nextCursor);
        })
        .catch(() => {});
    }, [tab, postSort, postCategoryName, debouncedQuery]),
  );

  // This was `const filteredPosts = posts` — an unfinished stub that never
  // actually filtered anything, which is exactly why the search bar looked
  // "broken" on the Posts tab: typing did nothing to what was on screen.
  // Client-side only, same as Looks/Artists above — this filters whatever
  // page(s) are already loaded, not the full unloaded backend result set
  // (Posts are server-paginated, unlike the fixed local LOOKS array or the
  // once-fetched allArtists). A real fix for that would need a search
  // query param on the posts endpoint itself; this at least makes the
  // search bar do something real instead of nothing on this tab.
  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(p =>
      p.caption?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.provider?.name?.toLowerCase().includes(q) ||
      p.service?.name?.toLowerCase().includes(q));
  }, [posts, query]);
  const reelPosts = useMemo(() => posts.filter(p => !!p.videoUrl), [posts]);

  const loadMorePosts = useCallback(() => {
    if (postsLoadingMore || !postsCursor) return;
    setPostsLoadingMore(true);
    apiGetExplorePosts(postSort, postsCursor, 20, postCategoryName, debouncedQuery)
      .then(({ posts: data, nextCursor }) => {
        setPosts(prev => [...prev, ...data]);
        setPostsCursor(nextCursor);
      })
      .catch(() => {})
      .finally(() => setPostsLoadingMore(false));
  }, [postSort, postsCursor, postsLoadingMore, postCategoryName, debouncedQuery]);

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

  // Adapts a self-served ExploreLookItem into the same Look shape the
  // curated catalog uses, so LookTile renders both identically.
  function exploreLookToLook(item: ExploreLookItem): Look {
    return {
      id: `explore-${item.id}`,
      name: item.name,
      vibe: item.vibe || '',
      collection: 'Trending',
      occasion: '',
      serviceType: item.serviceType,
      includes: item.includes,
      durationMin: item.durationMin ?? 60,
      fromPrice: item.price,
      products: [],
      from: item.themeFrom || Colors.brand,
      to: item.themeTo || Colors.brandAccent,
      photo: item.media[0]?.type === 'photo' ? item.media[0].url : undefined,
    };
  }
  // Tapping a look used to jump straight to the artist's profile — a
  // customer browsing Explore had no way to actually see the look (photos,
  // package contents, price) without leaving to a whole other screen first.
  // Now it opens the look itself; the profile is one tap away from inside
  // that view (the "by {artist}" row) for whoever wants it.
  const [galleryFor, setGalleryFor] = useState<ExploreLookItem | null>(null);
  function openExploreLook(item: ExploreLookItem) {
    tapLight();
    // A theme-only look (no photos/video yet) has nothing for the gallery to
    // show — same "skip straight to book" rule ProviderPublicProfileScreen
    // uses for its own single/theme-only looks, rather than opening a modal
    // that would just be a blank black screen.
    if (item.media.length === 0) { bookExploreLook(item); return; }
    setGalleryFor(item);
  }
  function bookExploreLook(item: ExploreLookItem) {
    tapLight();
    nav.navigate('NewBooking', {
      bookingMode: 'scheduled',
      providerId: item.provider.id,
      serviceType: item.serviceType,
      providerLookId: item.id,
      providerLookName: item.name,
      providerLookPrice: item.price,
      providerLookDurationMin: item.durationMin,
      _t: Date.now(),
    });
  }
  function viewExploreLookProvider(item: ExploreLookItem) {
    tapLight();
    setGalleryFor(null);
    nav.navigate('ProviderPublicProfile', { providerId: item.provider.id, providerName: item.provider.name });
  }

  // "Message" on a look — a question before committing to a date, distinct
  // from booking. Opens the same ChatScreen a booking's chat uses, just
  // keyed by the artist's id instead of a bookingId (see Message.bookingId's
  // schema comment) since no booking exists yet.
  function messageExploreLookArtist(item: ExploreLookItem) {
    tapLight();
    setGalleryFor(null);
    nav.navigate('Chat', { otherUserId: item.provider.id, otherName: item.provider.name, otherPhotoUrl: item.provider.photoUrl ?? undefined, otherRole: 'Provider' });
  }

  const allArtists = artists;

  // Sections: one per specialty with ≥1 artist, ranked by artist count
  // (most-common first), with Bridal always pinned last — bridal browsing
  // is a deliberate, lower-frequency search; everyday specialties (Mehendi,
  // Nails, Hair Styling) should be immediately visible without scrolling.
  // 'Bridal Makeup' is the only specialty string real Provider data uses for
  // bridal work (see SPECIALTY_OPTIONS in ProviderOnboardingScreen.tsx — no
  // plain 'Bridal' specialty exists; that string is only used for the
  // unrelated Looks-tab LookOccasion taxonomy).
  const BRIDAL_SPECIALTIES = ['Bridal Makeup'];
  // Heading for artists who have not listed a specialty yet — see
  // artistSections below for why they need one at all.
  const UNSPECIALIZED_SECTION = 'More artists';

  const artistSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySpecialty = new Map<string, PublicProviderCard[]>();

    const matchesQuery = (a: PublicProviderCard) =>
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.specialties?.some(sp => sp.toLowerCase().includes(q)) ||
      a.qualificationType?.replace(/_/g, ' ').toLowerCase().includes(q);

    // Searching returns ONE flat, de-duplicated list rather than the
    // specialty-grouped browse layout. Grouped, an artist with three
    // specialties appeared three times in their own search results, and the
    // matches were scattered under headings that had nothing to do with what
    // was typed. Someone who types a name wants that person, once.
    if (q) {
      const matches = allArtists.filter(matchesQuery);
      const sorted = [...matches].sort((a, b) => {
        if (artistSort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0) || b.ratingCount - a.ratingCount;
        if (artistSort === 'priceLow') {
          const ap = a.startingPrice ?? Infinity, bp = b.startingPrice ?? Infinity;
          return ap - bp;
        }
        return (b.experienceYears ?? 0) - (a.experienceYears ?? 0);
      });
      return sorted.length ? [{ specialty: `Results for "${query.trim()}"`, artists: sorted }] : [];
    }

    allArtists.forEach(a => {
      const specs = new Set<string>();
      const seedSpecialty = (a as any).specialty as string | undefined;
      if (seedSpecialty) specs.add(seedSpecialty);
      a.specialties?.forEach(s => specs.add(s));
      // An artist who has not listed a specialty used to land in NO bucket at
      // all, so they were absent from the Artists tab entirely and could never
      // be found by name — invisible in the app through no fault of their own.
      // They get a real section instead of being dropped on the floor.
      if (specs.size === 0) specs.add(UNSPECIALIZED_SECTION);
      specs.forEach(s => {
        if (!bySpecialty.has(s)) bySpecialty.set(s, []);
        bySpecialty.get(s)!.push(a);
      });
    });

    let sections = Array.from(bySpecialty.entries()).map(([specialty, artists]) => {
      // No per-section filtering here any more: a non-empty query returned
      // above as one flat result list, so this path only ever runs for the
      // unfiltered browse layout.
      const sorted = [...artists].sort((a, b) => {
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
      // "More artists" is a fallback, not a category — it sorts last, below
      // even the bridal sections.
      const aOther = a.specialty === UNSPECIALIZED_SECTION;
      const bOther = b.specialty === UNSPECIALIZED_SECTION;
      if (aOther !== bOther) return aOther ? 1 : -1;
      const aBridal = BRIDAL_SPECIALTIES.includes(a.specialty);
      const bBridal = BRIDAL_SPECIALTIES.includes(b.specialty);
      if (aBridal !== bBridal) return aBridal ? 1 : -1;
      return b.artists.length - a.artists.length;
    });

    return sections;
  }, [allArtists, artistSort, query]);

  // Seed artists are demo data with no real backend account — booking
  // against them would 400 at checkout. Shared by openArtist and
  // bookArtist below so the same guard covers both entry points instead
  // of only the one that existed before quick-book was added.
  function isDemoArtist(artist: PublicProviderCard): boolean {
    if (!artist.id.startsWith('seed-')) return false;
    const msg = 'This is a demo artist — booking isn\'t available for them yet.';
    if (Platform.OS === 'web') alert(msg);
    else Alert.alert('Demo Artist', msg);
    return true;
  }

  function openArtist(artist: PublicProviderCard) {
    if (isDemoArtist(artist)) return;
    nav.navigate('ProviderPublicProfile', { providerId: artist.id, providerName: artist.name });
  }

  // Quick-book straight from an ArtistCard in one of Explore's horizontal
  // rows — previously the only path was tap the card, wait for the full
  // profile to load, then find the booking action there. No preselected
  // service/look (unlike bookExploreLook below, which books a specific
  // look) — this is "book with this artist," the same starting point
  // ProviderPublicProfileScreen's own Book button uses.
  function bookArtist(artist: PublicProviderCard) {
    if (isDemoArtist(artist)) return;
    tapLight();
    nav.navigate('NewBooking', { bookingMode: 'scheduled', providerId: artist.id, _t: Date.now() });
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
            placeholder={tab === 'Looks' ? 'Search looks…' : tab === 'Posts' ? 'Search posts…' : 'Search artists or specialties…'}
            placeholderTextColor={Colors.tertiaryLabel}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        </View>
      )}

      {tab === 'Looks' ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          {/* Self-served looks from real artists — their own badges, themes,
              galleries and video clips, not just the curated catalog below. */}
          {exploreLooks.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.sectionHeading}>From our artists</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 24, alignItems: 'flex-start' }}>
                {exploreLooks.map(item => (
                  <View key={item.id} style={{ width: 150 }}>
                    {/* No fitToPhoto — see the matching comment in
                        ProviderLooksScreen.tsx; keeps every card in this
                        row the same height regardless of each photo's own
                        aspect ratio. */}
                    <LookTile
                      look={exploreLookToLook(item)}
                      price={item.price}
                      onPress={() => openExploreLook(item)}
                      height={130}
                      photoCount={item.media.length}
                      coverVideo={item.media[0]?.type === 'video' ? item.media[0].url : undefined}
                      badge={item.badge}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

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
                  <LookTile key={look.id} look={look} height={look.tall ? 230 : 165} price={priceOf(look)} onPress={() => setOpenLook(look)} coverVideo={look.coverVideo} />
                ))}
              </View>
              <View style={styles.column}>
                {right.map(look => (
                  <LookTile key={look.id} look={look} height={look.tall ? 230 : 165} price={priceOf(look)} onPress={() => setOpenLook(look)} coverVideo={look.coverVideo} />
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
                        <ArtistCard artist={artist} showFavorite onPress={() => openArtist(artist)} onBook={() => bookArtist(artist)} />
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
          <View style={[styles.chipBar, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ flex: 1 }}>
              {(['top', 'recent'] as PostSort[]).map(s => {
                const active = postSort === s;
                return (
                  <Pressable key={s} style={[styles.sortChip, active && styles.chipActive]} onPress={() => { tapLight(); setPostSort(s); }}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s === 'top' ? 'Top' : 'Recent'}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {/* Video posts, watched Reels-style (full-screen, vertical, autoplay) —
                separate from the photo grid instead of mixed into scroll-tap browsing. */}
            {reelPosts.length > 0 && (
              <Pressable
                style={styles.reelsBtn}
                onPress={() => { tapLight(); nav.navigate('Reels', { posts: reelPosts }); }}
              >
                <Text style={styles.reelsBtnText}>▶ Reels</Text>
              </Pressable>
            )}
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
                    // Every post — photo AND video — goes into the same
                    // vertical feed, in grid order, so swiping up moves to
                    // whatever is genuinely next rather than skipping half
                    // the grid. Reels stays its own video-only entry point
                    // from the Reels tab.
                    onPress={() => nav.navigate('PostDetail', { post, posts: filteredPosts, index: filteredPosts.findIndex(p => p.id === post.id) })}
                  >
                    <PostMedia photoUrl={post.photoUrl} videoUrl={post.videoUrl} style={styles.postTileImage} showBadge />
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
      <LookGalleryModal
        visible={!!galleryFor}
        media={galleryFor?.media ?? []}
        name={galleryFor?.name ?? ''}
        vibe={galleryFor?.vibe ?? undefined}
        price={galleryFor?.price}
        durationMin={galleryFor?.durationMin}
        includes={galleryFor?.includes}
        providerName={galleryFor?.provider.name}
        onViewProvider={galleryFor ? () => viewExploreLookProvider(galleryFor) : undefined}
        onMessageArtist={galleryFor ? () => messageExploreLookArtist(galleryFor) : undefined}
        onClose={() => setGalleryFor(null)}
        onBook={() => { if (galleryFor) bookExploreLook(galleryFor); setGalleryFor(null); }}
      />
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

  sectionHeading: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label, paddingHorizontal: 24, marginTop: 12, marginBottom: 10 },
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
  reelsBtn: {
    flexShrink: 0, marginRight: 20,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 100,
    backgroundColor: Colors.label,
  },
  reelsBtnText: { fontSize: 12.5, fontFamily: Fonts.semibold, color: '#fff' },

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
