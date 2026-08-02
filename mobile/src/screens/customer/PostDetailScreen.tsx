import React, { useState } from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { apiLikePost, apiUnlikePost } from '../../api/client';
import { Colors, Fonts } from '../../utils/colors';
import { tapLight } from '../../utils/haptics';

export function PostDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const post = route.params.post;

  const [liked, setLiked] = useState(!!post.isLikedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [liking, setLiking] = useState(false);

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
      // Revert on failure — the optimistic update didn't stick server-side.
      setLiked(!nextLiked);
      setLikeCount((c: number) => c + (nextLiked ? -1 : 1));
    } finally {
      setLiking(false);
    }
  }

  function openProvider() {
    if (!post.provider) return;
    tapLight();
    nav.navigate('ProviderPublicProfile', { providerId: post.provider.id, providerName: post.provider.name });
  }

  function bookThisService() {
    if (!post.service || !post.provider) return;
    tapLight();
    nav.navigate('NewBooking', {
      serviceType: post.service.name,
      providerId: post.provider.id,
      bookingMode: 'scheduled',
      _t: Date.now(),
    });
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View>
          <Image source={{ uri: post.photoUrl }} style={styles.photo} contentFit="cover" transition={150} />
          <Pressable style={[styles.floatBack, { top: insets.top + 8 }]} onPress={() => nav.goBack()} hitSlop={12}>
            <Text style={styles.floatBackText}>‹</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          {!!post.provider && (
            <Pressable style={styles.providerRow} onPress={openProvider}>
              {post.provider.photoUrl ? (
                <Image source={{ uri: post.provider.photoUrl }} style={styles.providerAvatar} contentFit="cover" />
              ) : (
                <View style={styles.providerAvatarFallback}>
                  <Text style={styles.providerAvatarInitial}>{post.provider.name?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
              )}
              <Text style={styles.providerName}>{post.provider.name}</Text>
              <Text style={styles.providerArrow}>›</Text>
            </Pressable>
          )}

          {!!post.caption && <Text style={styles.caption}>{post.caption}</Text>}

          <Pressable style={[styles.likeBtn, liked && styles.likeBtnActive]} onPress={toggleLike} disabled={liking}>
            <Text style={[styles.likeBtnText, liked && styles.likeBtnTextActive]}>
              {liked ? '♥' : '♡'} {likeCount}
            </Text>
          </Pressable>

          {!!post.service && (
            <Pressable style={styles.serviceChip} onPress={bookThisService}>
              <Text style={styles.serviceChipText}>{post.service.name} · ${post.service.price}</Text>
              <Text style={styles.serviceChipArrow}>Book →</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemBackground },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: Colors.brandLight },
  floatBack: {
    position: 'absolute', left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  floatBackText: { color: '#fff', fontSize: 22, fontFamily: Fonts.semibold, marginTop: -2 },

  body: { padding: 20, gap: 14 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  providerAvatar: { width: 40, height: 40, borderRadius: 20 },
  providerAvatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.brandLight, alignItems: 'center', justifyContent: 'center',
  },
  providerAvatarInitial: { fontSize: 16, fontFamily: Fonts.semibold, color: Colors.brandAccent },
  providerName: { flex: 1, fontSize: 15.5, fontFamily: Fonts.semibold, color: Colors.label },
  providerArrow: { fontSize: 20, color: Colors.tertiaryLabel },

  caption: { fontSize: 14.5, fontFamily: Fonts.regular, color: Colors.label, lineHeight: 21 },

  likeBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
  },
  likeBtnActive: { backgroundColor: Colors.brandLight, borderColor: Colors.brandAccent },
  likeBtnText: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  likeBtnTextActive: { color: Colors.brandDark },

  serviceChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.brandLight, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.brandAccent,
  },
  serviceChipText: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.label },
  serviceChipArrow: { fontSize: 13.5, fontFamily: Fonts.semibold, color: Colors.brandDark },
});
