import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { apiCreatePost, apiDeletePost, apiGetMyPosts, apiGetMyLooks, apiAddLookMedia, apiUpdatePostCategory, Post, ProviderLookItem } from '../../api/client';
import { Colors, Fonts } from '../../utils/colors';
import { CameraIcon } from '../../components/TabIcons';
import { SparkleIcon } from '../../components/BeautyIcons';
import { CATEGORIES } from '../../data/categories';
import { CameraCapture } from '../../components/CameraCapture';
import { PostMedia } from '../../components/PostMedia';
import { Toast } from '../../components/Toast';
import { CommentsSheetModal } from '../../components/CommentsSheetModal';

// A post's photo/video can also be reused inside one of the artist's Looks
// (either picked at post-time via the camera's "post to a Look" destination,
// or reused afterward from the Looks "From posts" picker) — this surfaces
// that link on the thumbnail itself instead of it being invisible once posted.
function linkedLookName(post: Post, looks: ProviderLookItem[]): string | null {
  const url = post.photoUrl || post.videoUrl;
  if (!url) return null;
  const match = looks.find(l => l.media.some(m => m.url === url));
  return match?.name ?? null;
}

function PostThumb({ post, lookName, onDelete, onView }: { post: Post; lookName: string | null; onDelete: (id: string) => void; onView: (post: Post) => void }) {
  return (
    // Shadow lives on the outer wrapper (no overflow:hidden) — a shadow on
    // a clipped view renders fine on web's CSS box-shadow but gets clipped
    // away entirely on native, so the rounded/clipped media sits in an
    // inner view instead.
    <View style={styles.thumbShadowWrap}>
    <Pressable style={styles.thumb} onPress={() => onView(post)}>
      <PostMedia photoUrl={post.photoUrl} videoUrl={post.videoUrl} style={styles.thumbImg} showBadge />
      {/* Bottom scrim keeps whatever's overlaid (look tag, like count)
          legible against any photo, bright or dark, instead of a flat
          translucent chip fighting the image underneath. */}
      {(!!lookName || post.likeCount > 0) && (
        <LinearGradient pointerEvents="none" colors={['#00000000', 'rgba(0,0,0,0.55)']} style={styles.thumbScrim} />
      )}
      <View style={styles.thumbFooter} pointerEvents="none">
        {!!lookName && (
          <Text style={styles.lookTagText} numberOfLines={1}>✨ {lookName}</Text>
        )}
        {post.likeCount > 0 && (
          <Text style={styles.likeCountText}>♥ {post.likeCount}</Text>
        )}
      </View>
      <Pressable
        style={styles.removeBtn}
        hitSlop={6}
        onPress={(e) => {
          // Nested inside the thumb Pressable (which now opens the detail
          // view on tap) — without stopping propagation, web's DOM click
          // bubbling would fire onView right after this, opening the detail
          // modal over whatever just happened (the confirm dialog, or the
          // post disappearing mid-tap).
          e.stopPropagation();
          // Alert.alert with a multi-button array is a no-op on RN-Web —
          // the confirm dialog never appears, so the button looked broken.
          if (Platform.OS === 'web') {
            if (typeof window !== 'undefined' && window.confirm('Delete this post? This cannot be undone.')) {
              onDelete(post.id);
            }
            return;
          }
          Alert.alert('Delete post?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(post.id) },
          ]);
        }}
      >
        <Text style={styles.removeBtnText}>✕</Text>
      </Pressable>
    </Pressable>
    </View>
  );
}

// Tapping a post used to do nothing but show the small delete "✕" — a
// portfolio the artist can't actually look back through isn't much of one.
// Full-bleed photo/video with the same info a customer would see (caption,
// category, likes, linked look) plus the delete action moved down here from
// the thumbnail, so the grid's own remove button is one less thing crowding
// each card.
function PostDetailModal({ post, lookName, onClose, onDelete, onSetCategory }: {
  post: Post | null; lookName: string | null; onClose: () => void; onDelete: (id: string) => void;
  onSetCategory: (postId: string, category: string) => void;
}) {
  const insets = useSafeAreaInsets();
  // Reset whenever a different post opens — otherwise the picker (or the
  // comment count/sheet) could stay open, or show a stale count, carrying
  // over from whichever post was viewed last.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const openPostId = useRef<string | null>(null);
  if (post && openPostId.current !== post.id) {
    openPostId.current = post.id;
    if (pickerOpen) setPickerOpen(false);
    if (commentsOpen) setCommentsOpen(false);
    const freshCount = post.commentCount ?? 0;
    if (commentCount !== freshCount) setCommentCount(freshCount);
  }
  if (!post) return null;

  function confirmDelete() {
    const doDelete = () => { onDelete(post!.id); onClose(); };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Delete this post? This cannot be undone.')) doDelete();
      return;
    }
    Alert.alert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  }

  return (
    <Modal visible={!!post} animationType="fade" onRequestClose={onClose}>
      <View style={detailStyles.root}>
        <PostMedia photoUrl={post.photoUrl} videoUrl={post.videoUrl} style={detailStyles.media} />
        <Pressable style={[detailStyles.closeBtn, { top: insets.top + 12 }]} onPress={onClose} hitSlop={10}>
          <Text style={detailStyles.closeBtnText}>✕</Text>
        </Pressable>

        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={detailStyles.footerGradient} pointerEvents="none" />
        <View style={[detailStyles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {/* Any post's category chip is tappable to re-file it — not just
              the "no category yet" case — since a miscategorized post (or one
              that predates a category existing at all) needed the exact same
              fix and there's no reason to make that a second, different flow. */}
          <View style={detailStyles.metaRow}>
            <Pressable style={[detailStyles.chip, !post.category && detailStyles.chipMissing]} onPress={() => setPickerOpen(v => !v)}>
              <Text style={[detailStyles.chipText, !post.category && detailStyles.chipMissingText]}>
                {post.category ? post.category : '+ Add category'}
              </Text>
            </Pressable>
            {!!lookName && (
              <View style={detailStyles.chip}>
                <Text style={detailStyles.chipText}>✨ {lookName}</Text>
              </View>
            )}
            {post.likeCount > 0 && (
              <View style={detailStyles.chip}>
                <Text style={detailStyles.chipText}>♥ {post.likeCount}</Text>
              </View>
            )}
            <Pressable style={detailStyles.chip} onPress={() => setCommentsOpen(true)}>
              <Text style={detailStyles.chipText}>💬 {commentCount}</Text>
            </Pressable>
          </View>
          {pickerOpen && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={detailStyles.pickerRow}>
              {CATEGORIES.map(c => (
                <Pressable
                  key={c.id}
                  style={[detailStyles.pickerChip, post.category === c.name && detailStyles.pickerChipActive]}
                  onPress={() => { onSetCategory(post!.id, c.name); setPickerOpen(false); }}
                >
                  <Text style={[detailStyles.pickerChipText, post.category === c.name && detailStyles.pickerChipTextActive]}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {!!post.caption && <Text style={detailStyles.caption}>{post.caption}</Text>}
          <Pressable style={detailStyles.deleteBtn} onPress={confirmDelete}>
            <Text style={detailStyles.deleteBtnText}>Delete post</Text>
          </Pressable>
        </View>
      </View>
      {/* isOwner: always true — this screen only ever shows the signed-in
          artist's own posts, so they can moderate (delete) any comment here. */}
      <CommentsSheetModal
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        target={{ postId: post.id }}
        isOwner
        onCountChange={(delta) => setCommentCount((c) => c + delta)}
      />
    </Modal>
  );
}

const detailStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  media: { flex: 1, width: '100%' },
  closeBtn: {
    position: 'absolute', right: 14, zIndex: 2, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  closeBtnText: { color: '#fff', fontSize: 14, fontFamily: Fonts.bold },
  footerGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 200 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 40, gap: 10 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 100,
    paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  chipText: { color: '#fff', fontSize: 12, fontFamily: Fonts.medium },
  // A dashed, brand-tinted outline instead of the plain glass chip — reads
  // as "tap to fill this in," not just another read-only meta tag.
  chipMissing: { backgroundColor: 'rgba(232,99,140,0.18)', borderColor: Colors.brand, borderStyle: 'dashed' },
  chipMissingText: { color: '#fff', fontFamily: Fonts.semibold },
  pickerRow: { gap: 8, paddingVertical: 2 },
  pickerChip: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  pickerChipActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  pickerChipText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: Fonts.medium },
  pickerChipTextActive: { color: '#fff', fontFamily: Fonts.semibold },
  caption: { color: '#fff', fontSize: 14.5, fontFamily: Fonts.regular, lineHeight: 20 },
  deleteBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  deleteBtnText: { color: Colors.systemRed, fontSize: 13.5, fontFamily: Fonts.semibold },
});

interface Props {
  // Bumped by the tab bar's tabPress listener every time the Posts tab is
  // tapped — camera-first, Snapchat/Instagram-style: tapping the tab opens
  // the camera immediately instead of landing on the grid first. A ref-
  // compared "signal" (not a boolean) so it fires again even when the value
  // doesn't logically change, e.g. tapping the tab twice in a row.
  cameraSignal?: number;
}

export function PostsScreen({ cameraSignal }: Props) {
  const insets = useSafeAreaInsets();
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [myLooks, setMyLooks] = useState<ProviderLookItem[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Set when the camera was opened from a specific category's "+" tile (or
  // the "add a photo for X" prompt) — pre-selected once the compose panel
  // (inside CameraCapture) appears.
  const [pendingCategory, setPendingCategory] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [viewingPost, setViewingPost] = useState<Post | null>(null);

  async function loadMyPosts() {
    try {
      const { posts } = await apiGetMyPosts();
      setMyPosts(posts);
    } catch (err) {
      console.error('Failed to load posts', err);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadMyPosts();
    apiGetMyLooks().then(({ looks }) => setMyLooks(looks)).catch(() => {});
  }, []);

  // Fires on every tab-bar tap of "Posts" (see ProviderNavigator's tabPress
  // listener). The baseline is a hardcoded 0, NOT `useRef(cameraSignal)` —
  // React Navigation lazy-mounts a tab's screen on its FIRST focus, which
  // happens in the same update as the tabPress listener's setState, so by
  // the time this component's first render runs, `cameraSignal` has
  // already ticked from 0 to 1. Seeding the ref from the prop would then
  // read 1 as the "starting" value and silently swallow that very first
  // press. A fixed 0 baseline with a monotonic ">" catches it regardless of
  // mount timing.
  const seenCameraSignal = useRef(0);
  useEffect(() => {
    if (cameraSignal !== undefined && cameraSignal > seenCameraSignal.current) {
      seenCameraSignal.current = cameraSignal;
      openCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraSignal]);

  // Entry point for every "add a post photo" tap — opens the full-screen,
  // camera-first capture flow (see CameraCapture) instead of an OS action
  // sheet. `presetCategory` carries through from a specific category's "+"
  // tile (or the "add a photo for X" prompt) to the resulting post.
  function openCamera(presetCategory?: string) {
    setPendingCategory(presetCategory);
    setCameraOpen(true);
  }

  // CameraCapture owns the whole compose flow (filter, caption, category,
  // "post to a Look" destination) and hands back one finished submission —
  // either uploads a normal post, or (when a look is picked as the
  // destination) appends this photo to that look's gallery instead, since a
  // shot either builds the feed or the portfolio, not both at once.
  async function handlePost(params: {
    asset?: { uri: string; base64: string; mimeType: string };
    videoBase64?: string;
    videoMimeType?: string;
    filter: string;
    caption?: string;
    category?: string;
    lookId?: string;
  }) {
    if (params.lookId) {
      const { look } = await apiAddLookMedia(
        params.lookId,
        params.asset
          ? { photoBase64: params.asset.base64 }
          : { videoBase64: params.videoBase64, videoMimeType: params.videoMimeType },
        params.filter !== 'original' ? params.filter : undefined,
      );
      setMyLooks(prev => prev.map(l => l.id === look.id ? look : l));
      setToast(`Added to "${look.name}" ✨`);
      return;
    }
    await apiCreatePost({
      photoBase64: params.asset?.base64,
      videoBase64: params.videoBase64,
      mimeType: params.asset?.mimeType ?? params.videoMimeType,
      caption: params.caption,
      category: params.category,
      filter: params.filter !== 'original' ? params.filter : undefined,
    });
    await loadMyPosts();
    setToast('Posted to your profile ✨');
  }

  async function deletePost(postId: string) {
    try {
      await apiDeletePost(postId);
      setMyPosts(prev => prev.filter(p => p.id !== postId));
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Could not delete post.');
    }
  }

  async function setPostCategory(postId: string, category: string) {
    // Optimistic — the picker already closed on tap, so the grid re-sorting
    // the tile into its new section right away reads as instant, not a
    // second async step after the fact.
    setMyPosts(prev => prev.map(p => p.id === postId ? { ...p, category } : p));
    setViewingPost(prev => prev && prev.id === postId ? { ...prev, category } : prev);
    try {
      await apiUpdatePostCategory(postId, category);
    } catch (e: any) {
      await loadMyPosts();
      Alert.alert('Couldn’t update category', e?.message || 'Please try again.');
    }
  }

  // Group by the fixed category list (same 9 used at post-creation) so
  // sections render in a stable order regardless of upload order. A post
  // whose category isn't one of the 9 (or has none — legacy posts predate
  // category tagging) falls into its own "Uncategorized" bucket rather than
  // silently vanishing from the grid.
  const postsByCategory = useMemo(() => {
    const map: Record<string, Post[]> = {};
    for (const post of myPosts) {
      if (post.category && CATEGORIES.some(c => c.name === post.category)) {
        (map[post.category] ??= []).push(post);
      }
    }
    return map;
  }, [myPosts]);
  const categoryNames = new Set<string>(CATEGORIES.map(c => c.name));
  const uncategorizedPosts = useMemo(
    () => myPosts.filter(p => !p.category || !categoryNames.has(p.category)),
    [myPosts]
  );
  const categoriesWithoutPosts = useMemo(
    () => CATEGORIES.filter(c => !postsByCategory[c.name]?.length),
    [postsByCategory]
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.secondarySystemBackground }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 100 }}>
      <LinearGradient
        colors={[Colors.brandAccent, Colors.brand, Colors.brandDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroGlow} pointerEvents="none" />
        <View>
          <Text style={styles.title}>Your Posts</Text>
          <Text style={styles.subtitle}>
            {!loading && myPosts.length > 0
              ? `${myPosts.length} ${myPosts.length === 1 ? 'post' : 'posts'} · shown in Explore`
              : 'Share your work — get discovered in Explore'}
          </Text>
        </View>
        {/* Instagram/Snapchat-style: tapping opens the full-screen camera
            immediately — no OS action sheet, no chooser in the way. Library
            is still reachable via a small icon inside the camera view. */}
        <Pressable onPress={() => openCamera()} style={({ pressed }) => [styles.newPostBtn, pressed && { transform: [{ scale: 0.96 }] }]}>
          <CameraIcon size={18} color={Colors.brand} />
          <Text style={styles.newPostBtnText}>New Post</Text>
        </Pressable>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 40 }} color={Colors.brand} />
      ) : myPosts.length === 0 ? (
        <Pressable onPress={() => openCamera()} style={styles.empty}>
          <View style={styles.emptySparkleLeft}><SparkleIcon size={16} color={Colors.brandAccent} /></View>
          <View style={styles.emptyIconWrap}><CameraIcon size={26} color={Colors.brand} /></View>
          <View style={styles.emptySparkleRight}><SparkleIcon size={12} color={Colors.brandAccent} /></View>
          <Text style={styles.emptyText}>Share your work to get discovered in Explore</Text>
          <Text style={styles.emptyHint}>Tap "New Post" to add your first one</Text>
        </Pressable>
      ) : (
        <>
          {/* Grouped by specialty — a provider tapping "Nails" in Explore/their
              storefront should see a coherent Nails set, not their whole feed
              in upload order. Categories with no posts yet don't get a section
              here (nothing to group); they show as prompts below instead. */}
          {CATEGORIES.filter(c => postsByCategory[c.name]?.length).map(c => (
            <View key={c.id} style={styles.categorySection}>
              <View style={styles.categorySectionHeader}>
                <View style={styles.categorySectionAccent} />
                <Text style={styles.categorySectionTitle}>{c.name}</Text>
                <View style={styles.categorySectionCountPill}>
                  <Text style={styles.categorySectionCount}>{postsByCategory[c.name].length}</Text>
                </View>
              </View>
              <View style={styles.grid}>
                {postsByCategory[c.name].map(post => (
                  <PostThumb key={post.id} post={post} lookName={linkedLookName(post, myLooks)} onDelete={deletePost} onView={setViewingPost} />
                ))}
                <View style={styles.thumbShadowWrap}>
                  <Pressable style={[styles.thumb, styles.addTile]} onPress={() => openCamera(c.name)}>
                    <Text style={styles.addTileText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}

          {uncategorizedPosts.length > 0 && (
            <View style={styles.categorySection}>
              <View style={styles.categorySectionHeader}>
                <View style={styles.categorySectionAccent} />
                <Text style={styles.categorySectionTitle}>Uncategorized</Text>
                <View style={styles.categorySectionCountPill}>
                  <Text style={styles.categorySectionCount}>{uncategorizedPosts.length}</Text>
                </View>
              </View>
              <View style={styles.grid}>
                {uncategorizedPosts.map(post => (
                  <PostThumb key={post.id} post={post} lookName={linkedLookName(post, myLooks)} onDelete={deletePost} onView={setViewingPost} />
                ))}
              </View>
            </View>
          )}

          {/* Specialties with zero posts yet — a client browsing your profile
              can't tell you also do these until there's a photo to show it. */}
          {categoriesWithoutPosts.length > 0 && (
            <View style={styles.promptSection}>
              <Text style={styles.promptTitle}>Add a photo for these specialties</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
                {categoriesWithoutPosts.map(c => (
                  <Pressable key={c.id} style={styles.promptChip} onPress={() => openCamera(c.name)}>
                    <Text style={styles.promptChipPlus}>+</Text>
                    <Text style={styles.promptChipText}>{c.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </>
      )}
    </ScrollView>

      <CameraCapture
        visible={cameraOpen}
        initialCategory={pendingCategory}
        myLooks={myLooks}
        onClose={() => { setCameraOpen(false); setPendingCategory(undefined); }}
        onPost={async (params) => {
          await handlePost(params);
          setCameraOpen(false);
          setPendingCategory(undefined);
        }}
      />
      <Toast message={toast} onHide={() => setToast(null)} />
      <PostDetailModal
        post={viewingPost}
        lookName={viewingPost ? linkedLookName(viewingPost, myLooks) : null}
        onClose={() => setViewingPost(null)}
        onDelete={deletePost}
        onSetCategory={setPostCategory}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 22, borderRadius: 30, padding: 20,
    overflow: 'hidden',
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 8,
  },
  heroGlow: {
    position: 'absolute', top: -50, right: -40, width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  title: { fontSize: 23, fontFamily: Fonts.display, color: '#fff', letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 4, fontFamily: Fonts.medium, maxWidth: 170 },
  newPostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 11,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  newPostBtnText: { color: Colors.brand, fontSize: 13, fontFamily: Fonts.bold },
  empty: {
    alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 6,
    marginHorizontal: 16, borderRadius: 26,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2,
    position: 'relative',
  },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptySparkleLeft: { position: 'absolute', top: 30, left: '28%', fontSize: 14, opacity: 0.7, transform: [{ rotate: '-12deg' }] },
  emptySparkleRight: { position: 'absolute', top: 44, right: '28%', fontSize: 11, opacity: 0.55, transform: [{ rotate: '14deg' }] },
  emptyText: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.secondaryLabel, textAlign: 'center' },
  emptyHint: { fontSize: 12.5, color: Colors.tertiaryLabel, fontFamily: Fonts.medium },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  // Split in two: the shadow lives on the unclipped outer wrapper, the
  // rounded/clipped media sits in `thumb` inside it — a shadow on a view
  // with overflow:hidden renders fine on web's CSS box-shadow but gets
  // clipped away entirely on native.
  thumbShadowWrap: {
    width: '31%', borderRadius: 18,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 3,
  },
  thumb: {
    flex: 1, aspectRatio: 0.82, overflow: 'hidden', position: 'relative',
    borderRadius: 18, backgroundColor: Colors.systemGray6,
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  thumbFooter: {
    position: 'absolute', left: 7, right: 7, bottom: 7,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4,
  },
  removeBtn: {
    position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(29,29,31,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: '#fff', fontSize: 11, fontFamily: Fonts.bold },
  lookTagText: { color: '#fff', fontSize: 10, fontFamily: Fonts.bold, flexShrink: 1 },
  likeCountText: { color: '#fff', fontSize: 10, fontFamily: Fonts.bold },

  categorySection: { marginBottom: 24 },
  categorySectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, marginBottom: 10,
  },
  categorySectionAccent: { width: 4, height: 16, borderRadius: 2, backgroundColor: Colors.brand },
  categorySectionTitle: { fontSize: 16.5, fontFamily: Fonts.display, color: Colors.label },
  categorySectionCountPill: {
    backgroundColor: Colors.brandLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 'auto' as any,
  },
  categorySectionCount: { fontSize: 12, color: Colors.brand, fontFamily: Fonts.bold },
  addTile: {
    alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: Colors.brandLight, borderWidth: 1.5, borderColor: Colors.brandAccent, borderStyle: 'dashed',
    shadowOpacity: 0, elevation: 0,
  },
  addTileText: { fontSize: 24, color: Colors.brand, fontFamily: Fonts.light },

  promptSection: { marginBottom: 24 },
  promptTitle: { fontSize: 13.5, fontFamily: Fonts.semibold, color: Colors.secondaryLabel, paddingHorizontal: 16, marginBottom: 10 },
  promptChip: {
    alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.brandAccent, borderStyle: 'dashed',
    minWidth: 84,
  },
  promptChipPlus: { fontSize: 18, color: Colors.brand, fontFamily: Fonts.bold },
  promptChipText: { fontSize: 11.5, fontFamily: Fonts.semibold, color: Colors.secondaryLabel, textAlign: 'center' },
});
