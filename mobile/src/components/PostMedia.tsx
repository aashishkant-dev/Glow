/** Renders a Post's photo or short video — a post is exactly one or the other. */
import React from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View, ViewStyle, StyleProp, ImageStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Fonts } from '../utils/colors';

interface Props {
  photoUrl?: string | null;
  videoUrl?: string | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain';
  /** Shows a small "Reel" badge in the corner when it's a video — off for large detail views. */
  showBadge?: boolean;
}

export function PostMedia({ photoUrl, videoUrl, style, contentFit = 'cover', showBadge }: Props) {
  const player = useVideoPlayer(videoUrl ?? null, p => {
    if (!videoUrl) return;
    p.loop = true;
    p.muted = true;
    p.play();
  });

  if (videoUrl) {
    return (
      <View style={style as StyleProp<ViewStyle>}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={contentFit} nativeControls={false} />
        {showBadge && (
          <View pointerEvents="none" style={styles.badge}>
            <Text style={styles.badgeText}>▶ Reel</Text>
          </View>
        )}
      </View>
    );
  }

  return <Image source={{ uri: photoUrl ?? undefined }} style={style} contentFit={contentFit} cachePolicy="memory-disk" transition={150} />;
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute', top: 6, right: 6,
    paddingHorizontal: 7, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9.5, fontFamily: Fonts.semibold },
});
