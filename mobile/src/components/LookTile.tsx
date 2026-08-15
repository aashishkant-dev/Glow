/**
 * LookTile — Pinterest-style look card. Gradient editorial canvas (designer
 * photo drops into `look.photo` when assets land, or a muted looping video
 * via `coverVideo`), name, meta, heart-save.
 */
import React from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
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
  // Overrides the default local "saved looks" heart (device-only bookmark)
  // with a server-tracked like on a specific artist's look — used on artist
  // public profiles, where a like belongs to (this artist, this look), not
  // the generic catalog entry. See LookLike's schema comment.
  likeOverride?: { liked: boolean; count?: number; onToggle: () => void };
  /** >1 shows a "1/N" pill — a gallery look, not a single shot. */
  photoCount?: number;
  /** A video clip as the cover instead of look.photo — plays muted, looped. */
  coverVideo?: string;
  /** Short promo label ("Bestseller", artist's own wording) — a packaged offer. */
  badge?: string | null;
}

function CoverVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

export function LookTile({ look, onPress, height = 170, price, likeOverride, photoCount, coverVideo, badge }: LookTileProps) {
  const savedIds = useSavedLooks();
  const saved = likeOverride ? likeOverride.liked : savedIds.includes(look.id);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.canvas, { height }]}>
        {coverVideo ? (
          <CoverVideo uri={coverVideo} />
        ) : look.photo ? (
          <Image source={{ uri: look.photo }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={200} />
        ) : Platform.OS === 'web' ? (
          <View style={[StyleSheet.absoluteFill, { background: `linear-gradient(150deg, ${look.from}, ${look.to})` } as any]} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: look.from }]} />
        )}
        {/* The look's theme is a persistent style choice, not just a
            fallback for "no photo yet" — a diagonal tint of the same colors
            over a real photo/video is what makes the card read as a
            designed package instead of a plain snapshot. Skipped when
            there's no media, since the base fill IS the theme already. */}
        {(!!look.photo || !!coverVideo) && (
          <LinearGradient
            pointerEvents="none"
            colors={[`${look.from}00`, `${look.to}66`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={styles.canvasGlow} />
        {!!badge && (
          <View style={styles.badgePill} pointerEvents="none">
            <Text style={styles.badgePillText} numberOfLines={1}>{badge}</Text>
          </View>
        )}
        {!!photoCount && photoCount > 1 && (
          <View style={styles.galleryPill} pointerEvents="none">
            <Text style={styles.galleryPillText}>1/{photoCount}</Text>
          </View>
        )}
        <Pressable
          style={styles.heart}
          hitSlop={8}
          onPress={() => { tapLight(); likeOverride ? likeOverride.onToggle() : toggleSavedLook(look.id); }}
          accessibilityLabel={saved ? 'Unlike' : 'Like this look'}
        >
          <HeartIcon size={17} color={saved ? Colors.brand : '#fff'} filled={saved} />
        </Pressable>
        <Text style={styles.canvasName}>{look.name}</Text>
      </View>
      <Text style={styles.vibe} numberOfLines={1}>{look.vibe}</Text>
      {/* No duration here — a look isn't naturally "N hours" the way a
          service booking's schedule slot is; price is what a client
          actually decides on. */}
      <Text style={styles.meta}>
        {price != null ? `From ${formatCurrency(price, { decimals: 0 })}` : 'Price varies by artist'}
        {!!likeOverride?.count && `  ·  ♥ ${likeOverride.count}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Shadow lives on `wrap` (no overflow:hidden here), not `canvas` — a
  // shadow on a clipped (overflow:hidden) view renders fine on web's CSS
  // box-shadow but gets clipped away entirely on native.
  wrap: {
    marginBottom: 18, borderRadius: 26,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 6,
  },
  canvas: {
    borderRadius: 26, overflow: 'hidden',
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
  galleryPill: {
    position: 'absolute', bottom: 40, right: 10,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: 'rgba(29,29,31,0.5)',
  },
  galleryPillText: { color: '#fff', fontSize: 10.5, fontFamily: Fonts.semibold },
  badgePill: {
    position: 'absolute', top: 10, left: 10, right: 40,
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10,
    backgroundColor: Colors.gold, alignSelf: 'flex-start',
  },
  badgePillText: { color: '#fff', fontSize: 10, fontFamily: Fonts.semibold },
  // Bold display serif, not a script — clean and modern, with a soft drop
  // shadow so it stays legible sitting directly on a photo.
  canvasName: {
    color: '#fff', fontSize: 19, fontFamily: Fonts.display, letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5,
  },
  vibe: { fontSize: 12.5, color: Colors.label, fontFamily: Fonts.medium, marginTop: 8 },
  meta: { fontSize: 11.5, color: Colors.tertiaryLabel, fontFamily: Fonts.regular, marginTop: 2 },
});
