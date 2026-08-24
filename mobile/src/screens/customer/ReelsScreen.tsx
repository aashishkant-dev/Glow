/**
 * Reels — full-screen vertical, swipeable, autoplaying feed of video Posts.
 * A Post is either a photo or a short in-app-camera video (PostMedia's own
 * comment); this screen is the video-only, Instagram-Reels-style way to
 * browse that half of the catalog, opened from Explore's Posts tab.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Colors, Fonts } from '../../utils/colors';
import { formatCurrency } from '../../utils/format';
import { tapLight } from '../../utils/haptics';
import { apiGetProviderPublicProfile, apiLikePost, apiUnlikePost, Post } from '../../api/client';
import { CloseCircleIcon } from '../../components/TabIcons';
import { shareLookMedia } from '../../utils/shareLook';
import { CommentsSheetModal } from '../../components/CommentsSheetModal';

function ReelItem({ post, isActive, muted, onToggleMute, onOpenProvider, onBook, onToggleLike }: {
  post: Post;
  isActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenProvider: () => void;
  onBook: () => void;
  onToggleLike: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Reactive, not Dimensions.get('window') captured once at module scope —
  // on web, the browser viewport (and so the mobile Safari/Chrome address
  // bar showing/hiding on scroll) can change height after this module first
  // loaded, and a stale height here fed straight into getItemLayout below
  // makes the pagingEnabled FlatList land on the wrong offset — a look/reel
  // shows partially cut off, or a swipe lands mid-item instead of snapping
  // cleanly, which reads as "scrolling is broken."
  const { width: winW, height: winH } = useWindowDimensions();
  const [liked, setLiked] = useState(!!post.isLikedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [liking, setLiking] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const player = useVideoPlayer(post.videoUrl ?? null, p => {
    if (!post.videoUrl) return;
    p.loop = true;
    p.muted = muted;
  });

  React.useEffect(() => {
    if (!player) return;
    if (isActive) player.play(); else player.pause();
  }, [isActive, player]);

  React.useEffect(() => {
    if (player) player.muted = muted;
  }, [muted, player]);

  async function toggleLike() {
    if (liking) return;
    tapLight();
    onToggleLike();
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount(c => c + (nextLiked ? 1 : -1));
    setLiking(true);
    try {
      if (nextLiked) await apiLikePost(post.id);
      else await apiUnlikePost(post.id);
    } catch {
      setLiked(!nextLiked);
      setLikeCount(c => c + (nextLiked ? -1 : 1));
    } finally {
      setLiking(false);
    }
  }

  return (
    <View style={{ width: winW, height: winH, backgroundColor: '#000' }}>
      {post.videoUrl ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      ) : null}

      <Pressable style={StyleSheet.absoluteFill} onPress={onToggleMute} />

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.footerGradient} pointerEvents="none" />

      <Pressable style={[styles.muteBtn, { top: insets.top + 12 }]} onPress={onToggleMute} hitSlop={10}>
        <Text style={styles.muteBtnText}>{muted ? '🔇' : '🔊'}</Text>
      </Pressable>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <View style={{ flex: 1, gap: 10 }}>
          {!!post.provider && (
            <Pressable style={styles.providerRow} onPress={onOpenProvider} hitSlop={6}>
              {post.provider.photoUrl ? (
                <Image source={{ uri: post.provider.photoUrl }} style={styles.providerAvatar} contentFit="cover" />
              ) : (
                <View style={styles.providerAvatarFallback}>
                  <Text style={styles.providerAvatarInitial}>{post.provider.name?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
              )}
              <Text style={styles.providerName} numberOfLines={1}>{post.provider.name}</Text>
            </Pressable>
          )}
          {!!post.caption && <Text style={styles.caption} numberOfLines={3}>{post.caption}</Text>}
          {!!post.service && (
            <Pressable style={[styles.serviceChip, { maxWidth: winW - 100 }]} onPress={onBook}>
              <Text style={styles.serviceChipText} numberOfLines={1}>
                {post.service.name} · {formatCurrency(post.service.price)}
              </Text>
              <Text style={styles.serviceChipArrow}>Book →</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.actionCol}>
          <Pressable style={styles.likeCol} onPress={toggleLike} disabled={liking} hitSlop={8}>
            <Text style={styles.likeIcon}>{liked ? '♥' : '♡'}</Text>
            <Text style={styles.likeCount}>{likeCount}</Text>
          </Pressable>
          <Pressable style={styles.likeCol} onPress={() => { tapLight(); setCommentsOpen(true); }} hitSlop={8}>
            <Text style={styles.likeIcon}>💬</Text>
            <Text style={styles.likeCount}>{commentCount}</Text>
          </Pressable>
          <Pressable
            style={styles.likeCol}
            hitSlop={8}
            onPress={() => {
              if (!post.videoUrl) return;
              tapLight();
              shareLookMedia(post.videoUrl, post.caption || 'Check this out on Glow ✨', 'video');
            }}
          >
            <Text style={styles.likeIcon}>↗</Text>
            <Text style={styles.likeCount}>Share</Text>
          </Pressable>
        </View>
      </View>
      <CommentsSheetModal
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        target={{ postId: post.id }}
        onCountChange={(delta) => setCommentCount((c: number) => c + delta)}
      />
    </View>
  );
}

export function ReelsScreen() {
  const insets = useSafeAreaInsets();
  // Reactive window height for getItemLayout below — see the matching
  // comment on ReelItem's own useWindowDimensions() call.
  const { height: winH } = useWindowDimensions();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const posts: Post[] = route.params?.posts ?? [];
  const startIndex: number = route.params?.startIndex ?? 0;

  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [muted, setMuted] = useState(true);

  function closeReels() {
    if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Home');
  }

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const openProvider = useCallback((post: Post) => {
    if (!post.provider) return;
    tapLight();
    nav.navigate('ProviderPublicProfile', { providerId: post.provider.id, providerName: post.provider.name });
  }, [nav]);

  const bookThisService = useCallback(async (post: Post) => {
    if (!post.service || !post.provider) return;
    tapLight();
    let providerId = post.provider.id;
    try {
      const { provider } = await apiGetProviderPublicProfile(post.provider.id);
      providerId = provider.id;
    } catch {
      // fall through with the original id — booking still works, just without preselect
    }
    nav.navigate('NewBooking', { serviceType: post.service.name, providerId, bookingMode: 'scheduled', _t: Date.now() });
  }, [nav]);

  if (posts.length === 0) {
    return (
      <View style={styles.emptyRoot}>
        <Pressable style={[styles.closeBtn, { top: insets.top + 12 }]} onPress={closeReels} hitSlop={12}>
          <CloseCircleIcon size={30} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Text style={styles.emptyText}>No Reels yet</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        data={posts}
        keyExtractor={p => p.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        initialScrollIndex={startIndex}
        getItemLayout={(_, i) => ({ length: winH, offset: winH * i, index: i })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => (
          <ReelItem
            post={item}
            isActive={index === activeIndex}
            muted={muted}
            onToggleMute={() => setMuted(m => !m)}
            onOpenProvider={() => openProvider(item)}
            onBook={() => bookThisService(item)}
            onToggleLike={() => {}}
          />
        )}
      />
      <Pressable style={[styles.closeBtn, { top: insets.top + 12 }]} onPress={closeReels} hitSlop={12}>
        <CloseCircleIcon size={30} color="rgba(255,255,255,0.85)" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyRoot: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontFamily: Fonts.medium },
  closeBtn: {
    position: 'absolute', right: 14, zIndex: 2,
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
  },
  muteBtn: {
    position: 'absolute', right: 14, zIndex: 2,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  muteBtnText: { fontSize: 15 },
  footerGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 18, paddingTop: 40,
    flexDirection: 'row', alignItems: 'flex-end', gap: 14,
  },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  providerAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  providerAvatarFallback: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.brandAccent,
    alignItems: 'center', justifyContent: 'center',
  },
  providerAvatarInitial: { fontSize: 14, fontFamily: Fonts.semibold, color: '#fff' },
  providerName: { color: '#fff', fontSize: 14.5, fontFamily: Fonts.semibold, flexShrink: 1 },
  caption: { color: '#fff', fontSize: 13.5, fontFamily: Fonts.regular, lineHeight: 19 },
  serviceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  serviceChipText: { color: '#fff', fontSize: 12.5, fontFamily: Fonts.semibold, flexShrink: 1 },
  serviceChipArrow: { color: '#fff', fontSize: 12.5, fontFamily: Fonts.bold },
  actionCol: { alignItems: 'center', gap: 18, flexShrink: 0 },
  likeCol: { alignItems: 'center', gap: 4 },
  likeIcon: { fontSize: 30, color: '#fff' },
  likeCount: { color: '#fff', fontSize: 12.5, fontFamily: Fonts.semibold },
});
