/**
 * Saved — moodboards built from hearted looks, grouped by occasion.
 * Never a dead end: warm empty state points to Explore.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts } from '../../utils/colors';
import { LOOKS, Look } from '../../data/looks';
import { LookTile } from '../../components/LookTile';
import { LookSheet } from '../../components/LookSheet';
import { GlowMark } from '../../components/GlowLogo';
import { useSavedLooks } from '../../utils/savedLooks';
import { apiGetFavorites, PublicProviderCard } from '../../api/client';
import { useFavorites } from '../../utils/favorites';
import { ArtistCard } from '../../components/ArtistCard';

export function SavedScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const savedIds = useSavedLooks();
  const [openLook, setOpenLook] = useState<Look | null>(null);
  const [board, setBoard] = useState<string | null>(null);
  const [tab, setTab] = useState<'Looks' | 'Artists'>(route.params?.initialTab ?? 'Looks');
  const [artists, setArtists] = useState<PublicProviderCard[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const favoriteIds = useFavorites();

  useEffect(() => {
    if (tab !== 'Artists') return;
    apiGetFavorites().then(r => setArtists(r.providers)).catch(() => setArtists([])).finally(() => setArtistsLoading(false));
  }, [tab, favoriteIds.length]);

  const savedLooks = useMemo(
    () => LOOKS.filter(l => savedIds.includes(l.id)),
    [savedIds],
  );

  // Moodboards derive from the occasions of what you saved — zero setup.
  const boards = useMemo(() => {
    const map = new Map<string, Look[]>();
    savedLooks.forEach(l => {
      map.set(l.occasion, [...(map.get(l.occasion) ?? []), l]);
    });
    return [...map.entries()];
  }, [savedLooks]);

  const shown = board ? savedLooks.filter(l => l.occasion === board) : savedLooks;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
          <Text style={styles.eyebrow}>SAVED</Text>
          <Text style={styles.title}>Your moodboards</Text>
        </View>

        <View style={styles.tabBar}>
          {(['Looks', 'Artists'] as const).map(t => {
            const active = tab === t;
            return (
              <Pressable key={t} style={[styles.tabPill, active && styles.tabPillActive]} onPress={() => setTab(t)}>
                <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'Looks' && (
          savedLooks.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyArt}>
                <GlowMark size={46} petal={Colors.brandAccent} core={Colors.gold} />
              </View>
              <Text style={styles.emptyTitle}>Nothing saved yet</Text>
              <Text style={styles.emptySub}>
                Heart the looks you love in Explore and they'll gather here — your wedding board, your everyday board, all of it.
              </Text>
              <Pressable style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.9 }]} onPress={() => nav.navigate('ExploreTab')}>
                <Text style={styles.emptyCtaText}>Explore looks</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Moodboard chips */}
              {boards.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%' }} contentContainerStyle={styles.boardRow}>
                  <Pressable
                    style={[styles.boardCard, board === null && styles.boardCardActive]}
                    onPress={() => setBoard(null)}
                  >
                    <Text style={[styles.boardName, board === null && styles.boardNameActive]}>All</Text>
                    <Text style={[styles.boardCount, board === null && styles.boardNameActive]}>{savedLooks.length} looks</Text>
                  </Pressable>
                  {boards.map(([name, items]) => {
                    const active = board === name;
                    return (
                      <Pressable
                        key={name}
                        style={[styles.boardCard, active && styles.boardCardActive]}
                        onPress={() => setBoard(active ? null : name)}
                      >
                        <View style={styles.boardSwatches}>
                          {items.slice(0, 3).map(l => (
                            <View key={l.id} style={[styles.swatch, { backgroundColor: l.from }]} />
                          ))}
                        </View>
                        <Text style={[styles.boardName, active && styles.boardNameActive]}>{name}</Text>
                        <Text style={[styles.boardCount, active && styles.boardNameActive]}>{items.length} {items.length === 1 ? 'look' : 'looks'}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              <View style={styles.grid}>
                {shown.map(look => (
                  <View key={look.id} style={styles.gridItem}>
                    <LookTile look={look} height={165} onPress={() => setOpenLook(look)} />
                  </View>
                ))}
              </View>
            </>
          )
        )}

        {tab === 'Artists' && (
          artistsLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={Colors.brand} />
            </View>
          ) : artists.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyArt}>
                <GlowMark size={46} petal={Colors.brandAccent} core={Colors.gold} />
              </View>
              <Text style={styles.emptyTitle}>No favorite artists yet</Text>
              <Text style={styles.emptySub}>Heart an artist's profile to save them here.</Text>
            </View>
          ) : (
            <View style={styles.artistGrid}>
              {artists.map(a => (
                <View key={a.id} style={styles.artistGridItem}>
                  <ArtistCard artist={a} showFavorite onPress={() => nav.navigate('ProviderPublicProfile', { providerId: a.id, providerName: a.name })} />
                </View>
              ))}
            </View>
          )
        )}
      </ScrollView>

      <LookSheet look={openLook} onClose={() => setOpenLook(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemGroupedBackground },
  header: { paddingHorizontal: 24, paddingBottom: 16 },
  eyebrow: { fontSize: 11, fontFamily: Fonts.semibold, color: Colors.brandDark, letterSpacing: 1.6 },
  title: { fontSize: 30, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -0.8, marginTop: 6 },

  boardRow: { paddingHorizontal: 24, gap: 10, marginBottom: 18 },
  boardCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 14, minWidth: 110,
    borderWidth: 1, borderColor: Colors.separator, justifyContent: 'flex-end',
  },
  boardCardActive: { backgroundColor: Colors.label, borderColor: Colors.label },
  boardSwatches: { flexDirection: 'row', gap: 4, marginBottom: 10 },
  swatch: { width: 16, height: 16, borderRadius: 6 },
  boardName: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.label },
  boardNameActive: { color: '#fff' },
  boardCount: { fontSize: 11.5, color: Colors.secondaryLabel, marginTop: 2, fontFamily: Fonts.regular },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, gap: 14 },
  gridItem: { width: Platform.OS === 'web' ? ('calc(50% - 7px)' as any) : '47%', flexGrow: 1 },

  tabBar: { flexDirection: 'row', paddingHorizontal: 24, gap: 8, marginBottom: 8 },
  tabPill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 100, backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator },
  tabPillActive: { backgroundColor: Colors.label, borderColor: Colors.label },
  tabPillText: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  tabPillTextActive: { color: '#fff' },
  artistGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, gap: 14 },
  artistGridItem: { width: Platform.OS === 'web' ? ('calc(50% - 7px)' as any) : '47%' },

  empty: { alignItems: 'center', paddingHorizontal: 36, paddingTop: 60 },
  emptyArt: {
    width: 92, height: 92, borderRadius: 46,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 19, fontFamily: Fonts.semibold, color: Colors.label, marginBottom: 8 },
  emptySub: { fontSize: 13.5, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 20, marginBottom: 22, fontFamily: Fonts.regular },
  emptyCta: {
    backgroundColor: Colors.brand, borderRadius: 100,
    paddingVertical: 14, paddingHorizontal: 30,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 5,
  },
  emptyCtaText: { color: '#fff', fontSize: 14.5, fontFamily: Fonts.semibold },
});
