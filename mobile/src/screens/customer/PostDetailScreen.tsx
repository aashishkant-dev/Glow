/**
 * PostDetail — a full-screen, vertically swipeable feed of Posts, in the
 * shape people already expect from Instagram/Reels: one post per screen,
 * swipe up for the next, actions (like / comment / share / book) stacked on
 * the right, provider + caption at the bottom.
 *
 * It used to render exactly ONE post (`route.params.post`) inside a
 * ScrollView, with no way to reach the next one — you tapped a thumbnail in
 * a grid, looked at that single post, and had to go back to see another.
 * Reported as "posts don't scroll". Callers that have the surrounding list
 * (Explore, Saved, an artist's public profile) now hand it over as `posts` +
 * `index`; a caller that only has one post still works, it just has a
 * one-item feed.
 *
 * Video is handled per-item rather than by PostMedia, for the same reason
 * ReelsScreen does it: PostMedia starts playing as soon as it mounts, which
 * in a paging list would mean every video in the feed playing at once.
 */
import React, { useCallback, useState } from 'react';
import { Image } from 'expo-image';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { apiGetProviderPublicProfile, apiLikePost, apiUnlikePost, Post } from '../../api/client';
import { Colors, Fonts } from '../../utils/colors';
import { tapLight } from '../../utils/haptics';
import { formatCurrency } from '../../utils/format';
import { shareLookMedia } from '../../utils/shareLook';
import { CommentsSheetModal } from '../../components/CommentsSheetModal';

// Module scope, so its identity is stable for the lifetime of the app —
// FlatList treats a changing viewabilityConfig the same way it treats a
// changing onViewableItemsChanged.
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };

function PostFeedItem({ post, isActive, muted, onToggleMute, onOpenProvider, onBook }: {
  post: Post;
  isActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenProvider: () => void;
  onBook: () => void;
}) {
  const insets = useSafeAreaInsets();
  // Reactive, not a module-scope Dimensions.get('window') — the same reason
  // ReelsScreen reads it this way: a stale height fed into getItemLayout
  // makes a pagingEnabled list land mid-item, which reads as broken
  // scrolling.
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
    if (!player || !post.videoUrl) return;
    if (isActive) player.play(); else player.pause();
  }, [isActive, player, post.videoUrl]);

  // Applied in the tap handler, not an effect: assigning to a value a hook
  // returned is exactly what react-hooks/immutability forbids, and there is
  // no reason for it to be an effect — the only thing that changes `muted`
  // IS this tap. A newly swiped-to item picks the current value up in the
  // useVideoPlayer setup above, so mute survives moving between posts.
  function handleToggleMute() {
    // expo-video's player is a mutable native handle by design
    // (`player.muted` is the documented way to mute it; VideoView has no
    // prop for it), so the rule's "move it into the hook" advice has
    // nowhere to go. This is an event handler, not render or an effect.
    // eslint-disable-next-line react-hooks/immutability
    if (player && post.videoUrl) player.muted = !muted;
    onToggleMute();
  }

  async function toggleLike() {
    if (liking) return;
    tapLight();
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c: number) => c + (nextLiked ? 1 : -1));
    setLiking(true);
    try {
      if (nextLiked) await apiLikePost(post.id);
      else await apiUnlikePost(post.id);
    } catch {
      // Revert — the optimistic update didn't stick server-side.
      setLiked(!nextLiked);
      setLikeCount((c: number) => c + (nextLiked ? -1 : 1));
    } finally {
      setLiking(false);
    }
  }

  const shareUrl = post.videoUrl || post.photoUrl;

  return (
    <View style={{ width: winW, height: winH, backgroundColor: '#000' }}>
      {post.videoUrl ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      ) : (
        // contain, not cover: posts are shot at whatever aspect the artist
        // used, and cropping someone's work to fill a phone screen is the
        // wrong trade for a portfolio. Black letterboxing is the same thing
        // Instagram does with a tall/wide photo in a full-screen view.
        <Image
          source={{ uri: post.photoUrl ?? undefined }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={150}
        />
      )}

      {/* Tapping a video toggles sound, the same gesture as Reels. On a
          photo there is nothing to mute, so it stays inert rather than
          swallowing the touch. */}
      {!!post.videoUrl && <Pressable style={StyleSheet.absoluteFill} onPress={handleToggleMute} />}

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.footerGradient} pointerEvents="none" />

      {!!post.videoUrl && (
        <Pressable style={[styles.muteBtn, { top: insets.top + 12 }]} onPress={handleToggleMute} hitSlop={10}>
          <Text style={styles.muteBtnText}>{muted ? '🔇' : '🔊'}</Text>
        </Pressable>
      )}

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
          <Pressable style={styles.actionBtn} onPress={toggleLike} disabled={liking} hitSlop={8}>
            <Text style={styles.actionIcon}>{liked ? '♥' : '♡'}</Text>
            <Text style={styles.actionLabel}>{likeCount}</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => { tapLight(); setCommentsOpen(true); }} hitSlop={8}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionLabel}>{commentCount}</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            hitSlop={8}
            onPress={() => {
              if (!shareUrl) return;
              tapLight();
              shareLookMedia(shareUrl, post.caption || 'Check this out on Glow ✨', post.videoUrl ? 'video' : 'photo');
            }}
          >
            <Text style={styles.actionIcon}>↗</Text>
            <Text style={styles.actionLabel}>Share</Text>
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

export function PostDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { height: winH } = useWindowDimensions();

  const single: Post | undefined = route.params?.post;
  const listParam: Post[] | undefined = route.params?.posts;
  // A caller that only knows about one post still gets a working screen —
  // a one-item feed — rather than an empty one.
  const feed: Post[] = listParam?.length ? listParam : single ? [single] : [];
  const startIndex = (() => {
    if (typeof route.params?.index === 'number') {
      return Math.max(0, Math.min(route.params.index, feed.length - 1));
    }
    if (!single) return 0;
    const found = feed.findIndex(p => p.id === single.id);
    return found >= 0 ? found : 0;
  })();

  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [muted, setMuted] = useState(true);

  function goBack() {
    if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Home');
  }

  // useCallback with no deps, not useRef(...).current — FlatList refuses a
  // changing onViewableItemsChanged identity, and reading a ref during
  // render is its own problem. An empty dep list gives the same stable
  // function without either.
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }, []);

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
      providerId = provider.id; // resolves to the User id NewBooking's preselect logic expects
    } catch {
      // fall through with the original id — booking still works, just without preselect
    }
    nav.navigate('NewBooking', {
      serviceType: post.service.name,
      providerId,
      bookingMode: 'scheduled',
      _t: Date.now(),
    });
  }, [nav]);

  if (feed.length === 0) {
    return (
      <View style={styles.emptyRoot}>
        <Pressable style={[styles.backBtn, { top: insets.top + 8 }]} onPress={goBack} hitSlop={12}>
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.emptyText}>This post is no longer available</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        data={feed}
        keyExtractor={p => p.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        initialScrollIndex={startIndex}
        getItemLayout={(_, i) => ({ length: winH, offset: winH * i, index: i })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        // Keeps memory sane on a long portfolio without the next swipe
        // landing on a blank screen while it mounts.
        windowSize={3}
        maxToRenderPerBatch={3}
        renderItem={({ item, index }) => (
          <PostFeedItem
            post={item}
            isActive={index === activeIndex}
            muted={muted}
            onToggleMute={() => setMuted(m => !m)}
            onOpenProvider={() => openProvider(item)}
            onBook={() => bookThisService(item)}
          />
        )}
      />
      <Pressable style={[styles.backBtn, { top: insets.top + 8 }]} onPress={goBack} hitSlop={12}>
        <Text style={styles.backBtnText}>‹</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyRoot: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontFamily: Fonts.medium },
  backBtn: {
    position: 'absolute', left: 16, zIndex: 2,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { color: '#fff', fontSize: 22, fontFamily: Fonts.semibold, marginTop: -2 },
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
  actionBtn: { alignItems: 'center', gap: 4 },
  actionIcon: { fontSize: 30, color: '#fff' },
  actionLabel: { color: '#fff', fontSize: 12.5, fontFamily: Fonts.semibold },
});
