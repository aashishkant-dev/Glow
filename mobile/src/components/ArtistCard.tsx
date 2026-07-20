import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Fonts } from '../utils/colors';
import { Radius } from '../utils/theme';
import { PublicProviderCard } from '../api/client';

interface Props {
  artist: PublicProviderCard;
  onPress?: () => void;
}

export function ArtistCard({ artist, onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
      onPress={onPress}
    >
      <Image source={{ uri: artist.photoUrl }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" transition={150} />
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
