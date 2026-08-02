/**
 * LookTile — Pinterest-style look card. Gradient editorial canvas (designer
 * photo drops into `look.photo` when assets land), name, meta, heart-save.
 */
import React from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts } from '../utils/colors';
import { Look } from '../data/looks';
import { HeartIcon } from './TabIcons';
import { toggleSavedLook, useSavedLooks } from '../utils/savedLooks';
import { tapLight } from '../utils/haptics';
import { formatCurrency } from '../utils/format';

interface LookTileProps {
  look: Look;
  onPress: () => void;
  /** Height of the art canvas; masonry passes varying values. */
  height?: number;
  price?: number;
}

export function LookTile({ look, onPress, height = 170, price }: LookTileProps) {
  const savedIds = useSavedLooks();
  const saved = savedIds.includes(look.id);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.canvas, { height }]}>
        {look.photo ? (
          <Image source={{ uri: look.photo }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={200} />
        ) : Platform.OS === 'web' ? (
          <View style={[StyleSheet.absoluteFill, { background: `linear-gradient(150deg, ${look.from}, ${look.to})` } as any]} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: look.from }]} />
        )}
        <View style={styles.canvasGlow} />
        <Pressable
          style={styles.heart}
          hitSlop={8}
          onPress={() => { tapLight(); toggleSavedLook(look.id); }}
          accessibilityLabel={saved ? 'Remove from saved' : 'Save look'}
        >
          <HeartIcon size={17} color={saved ? Colors.brand : '#fff'} filled={saved} />
        </Pressable>
        <Text style={styles.canvasName}>{look.name}</Text>
      </View>
      <Text style={styles.vibe} numberOfLines={1}>{look.vibe}</Text>
      <Text style={styles.meta}>
        {Math.round(look.durationMin / 60 * 10) / 10}h · From {formatCurrency(price ?? look.fromPrice, { decimals: 0 })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  canvas: {
    borderRadius: 22, overflow: 'hidden',
    padding: 14, justifyContent: 'flex-end',
  },
  canvasGlow: {
    position: 'absolute', top: -36, right: -28,
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heart: {
    position: 'absolute', top: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(29,29,31,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  canvasName: { color: '#fff', fontSize: 17, fontFamily: Fonts.semibold, letterSpacing: -0.3 },
  vibe: { fontSize: 12.5, color: Colors.label, fontFamily: Fonts.medium, marginTop: 8 },
  meta: { fontSize: 11.5, color: Colors.tertiaryLabel, fontFamily: Fonts.regular, marginTop: 2 },
});
