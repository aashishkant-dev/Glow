import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../utils/colors';
import { Radius } from '../utils/theme';
import { PublicProviderCard } from '../api/client';
import { HeartIcon } from './TabIcons';
import { useFavorites, toggleFavorite } from '../utils/favorites';
import { tapLight } from '../utils/haptics';
import { formatCurrency } from '../utils/format';

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

interface Props {
  artist: PublicProviderCard;
  onPress?: () => void;
  /** Show a heart-toggle overlay on the photo (opt-in — off by default so
      existing call sites render unchanged). */
  showFavorite?: boolean;
  // Quick-book straight from the card — previously the only way to book an
  // artist found while browsing Explore's horizontal rows was tap the card,
  // wait for the full profile to load, then find the booking action there.
  // Optional/additive: omitted call sites (anywhere this card is reused
  // without a booking flow behind it) render exactly as before.
  onBook?: () => void;
}

export function ArtistCard({ artist, onPress, showFavorite = false, onBook }: Props) {
  const favoriteIds = useFavorites();
  const favorited = favoriteIds.includes(artist.id);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
      onPress={onPress}
    >
      <View>
        {artist.photoUrl ? (
          <Image source={{ uri: artist.photoUrl }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" transition={150} />
        ) : (
          // No photo yet — an empty gray box (the old fallback, or the lack
          // of one) read as a broken card. A branded gradient + initials, the
          // same idea Avatar uses elsewhere, at least reads as "no photo" on
          // purpose instead of "this failed to load".
          <LinearGradient colors={[Colors.brandAccent, Colors.brandDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.photo}>
            <View style={styles.photoFallbackCenter}>
              <Text style={styles.photoFallbackInitials}>{initialsOf(artist.name)}</Text>
            </View>
          </LinearGradient>
        )}
        {showFavorite && (
          <Pressable
            style={styles.heart}
            hitSlop={8}
            onPress={() => { tapLight(); toggleFavorite(artist.id); }}
            accessibilityLabel={favorited ? 'Remove from favorites' : 'Favorite artist'}
          >
            <HeartIcon size={16} color={favorited ? Colors.brand : '#fff'} filled={favorited} />
          </Pressable>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{artist.name}</Text>
        <Text style={styles.specialty} numberOfLines={1}>{artist.qualificationType?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}</Text>
        <View style={styles.ratingRow}>
          <Text style={styles.rating} numberOfLines={1}>★ {artist.rating?.toFixed(1) ?? '—'}</Text>
          <Text style={styles.reviews} numberOfLines={1}>({artist.ratingCount})</Text>
          {artist.startingPrice != null && artist.startingPrice > 0 && (
            <Text style={styles.price} numberOfLines={1} ellipsizeMode="tail">From {formatCurrency(artist.startingPrice)}</Text>
          )}
        </View>
        {!!onBook && (
          <Pressable
            style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.85 }]}
            // Nested inside the card's own Pressable — RN's gesture
            // responder lets this inner one claim the touch on its own, so
            // tapping it books directly instead of also opening the full
            // profile behind it.
            onPress={onBook}
            hitSlop={4}
          >
            <Text style={styles.bookBtnText}>Book</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.systemBackground,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    marginBottom: 10,
  },
  photo: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.systemGray5,
  },
  photoFallbackCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoFallbackInitials: { fontSize: 40, fontFamily: Fonts.bold, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  heart: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  info: {
    padding: 12,
  },
  name: {
    fontSize: 15,
    fontFamily: Fonts.semibold,
    color: Colors.label,
  },
  specialty: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.secondaryLabel,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  rating: {
    fontSize: 13,
    fontFamily: Fonts.semibold,
    color: Colors.gold,
  },
  reviews: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.tertiaryLabel,
  },
  price: {
    marginLeft: 'auto',
    flexShrink: 1,
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.brand,
  },
  bookBtn: {
    marginTop: 10,
    alignItems: 'center',
    borderRadius: 100,
    paddingVertical: 8,
    backgroundColor: Colors.brand,
  },
  bookBtnText: {
    fontSize: 12.5,
    fontFamily: Fonts.semibold,
    color: '#fff',
  },
});
