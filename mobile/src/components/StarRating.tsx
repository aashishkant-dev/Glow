import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  rating: number;
  count?: number;
  size?: number;
  interactive?: boolean;
  onRate?: (n: number) => void;
}

export function StarRating({ rating, count, size = 14, interactive = false, onRate }: Props) {
  const filled = Math.round(rating);
  if (interactive && onRate) {
    return (
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map(n => (
          <Pressable key={n} onPress={() => onRate(n)}>
            <Text style={[styles.star, { fontSize: size + 4 }, n <= filled && styles.filledStar]}>★</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={[styles.star, { fontSize: size }, n <= filled && styles.filledStar]}>★</Text>
      ))}
      {count !== undefined && (
        <Text style={[styles.count, { fontSize: size - 2 }]}>({count})</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', gap: 2 },
  star:       { color: '#E2E8F0' },
  filledStar: { color: '#F59E0B' },
  count:      { color: '#94A3B8', marginLeft: 3 },
});
