import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Fonts } from '../utils/colors';
import { Radius } from '../utils/theme';
import { PublicProviderCard } from '../api/client';
import { HeartIcon } from './TabIcons';
import { useFavorites, toggleFavorite } from '../utils/favorites';
import { tapLight } from '../utils/haptics';

interface Props {
  artist: PublicProviderCard;
  onPress?: () => void;
  /** Show a heart-toggle overlay on the photo (opt-in — off by default so
      existing call sites render unchanged). */
  showFavorite?: boolean;
}

export function ArtistCard({ artist, onPress, showFavorite = false }: Props) {
  const favoriteIds = useFavorites();
  const favorited = favoriteIds.includes(artist.id);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
      onPress={onPress}
    >
      <View>
        <Image source={{ uri: artist.photoUrl }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" transition={150} />
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
          <Text style={styles.rating}>★ {artist.rating?.toFixed(1) ?? '—'}</Text>
          <Text style={styles.reviews}>({artist.ratingCount})</Text>
          {artist.startingPrice != null && artist.startingPrice > 0 && (
            <Text style={styles.price}>From ${artist.startingPrice}</Text>
          )}
        </View>
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
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.brand,
  },
});
