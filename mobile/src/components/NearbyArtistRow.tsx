/**
 * NearbyArtistRow — the "book an artist" hand-off from a My Space skin-scan
 * result. Replaces a generic "Book a facial" button with real, nearby,
 * tappable artists who actually cover the relevant specialty — a genuine
 * curated hand-off into the booking flow instead of a dead-end CTA. Falls
 * back to the generic category flow only when no nearby artist matches yet
 * (a new/thin market), so there's always SOME path forward either way.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../utils/colors';
import { apiNearbyProviders, NearbyProvider } from '../api/client';
import { useCoordsOrFallback } from '../context/LocationContext';
import { tapLight } from '../utils/haptics';

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

interface Props {
  /** Must match a value in src/utils/categories.js's CATEGORIES / a
   *  provider's ProviderProfile.specialties entries. */
  category: string;
  /** Passed through as NewBooking's preset serviceType for the generic
   *  fallback path. */
  serviceType: string;
}

export function NearbyArtistRow({ category, serviceType }: Props) {
  const nav = useNavigation<any>();
  const coords = useCoordsOrFallback();
  const [artists, setArtists] = useState<NearbyProvider[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiNearbyProviders(coords.lat, coords.lng)
      .then(({ providers }) => {
        if (cancelled) return;
        const matches = providers
          .filter(p => p.specialties?.includes(category))
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, 6);
        setArtists(matches);
      })
      .catch(() => { if (!cancelled) setArtists([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.lat, coords.lng, category]);

  function openArtist(id: string) {
    tapLight();
    nav.navigate('ProviderPublicProfile', { providerId: id });
  }

  function bookGeneric() {
    tapLight();
    nav.navigate('NewBooking', { serviceType, bookingMode: 'scheduled', _t: Date.now() });
  }

  if (artists === null) {
    return <ActivityIndicator style={{ marginVertical: 14 }} color={Colors.brand} />;
  }

  if (artists.length === 0) {
    return (
      <Pressable style={styles.genericCard} onPress={bookGeneric}>
        <Text style={styles.genericTitle}>Book a facial with a Glow artist</Text>
        <Text style={styles.genericArrow}>→</Text>
      </Pressable>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {artists.map(a => (
        <Pressable key={a.id} style={styles.card} onPress={() => openArtist(a.id)}>
          {a.photoUrl ? (
            <Image source={{ uri: a.photoUrl }} style={styles.photo} contentFit="cover" />
          ) : (
            <LinearGradient colors={[Colors.brandAccent, Colors.brandDeep]} style={styles.photo}>
              <Text style={styles.photoInitials}>{initialsOf(a.name)}</Text>
            </LinearGradient>
          )}
          <Text style={styles.name} numberOfLines={1}>{a.name}</Text>
          <Text style={styles.metaRow} numberOfLines={1}>
            ★ {a.rating?.toFixed(1) ?? '—'} · {a.distanceKm.toFixed(1)} km
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 12 },
  card: { width: 112 },
  photo: {
    width: 112, height: 112, borderRadius: 20, backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  photoInitials: { fontSize: 30, fontFamily: Fonts.bold, color: 'rgba(255,255,255,0.85)' },
  name: { fontSize: 12.5, fontFamily: Fonts.semibold, color: Colors.label, marginTop: 7 },
  metaRow: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.secondaryLabel, marginTop: 2 },
  genericCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.brandLight, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: Colors.brandAccent,
  },
  genericTitle: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label, flex: 1 },
  genericArrow: { fontSize: 20, fontFamily: Fonts.semibold, color: Colors.brandDark },
});
