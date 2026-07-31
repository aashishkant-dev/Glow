import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiCreatePost, apiDeletePost, apiGetMyPosts, Post } from '../../api/client';
import { Colors } from '../../utils/colors';
import { CameraIcon } from '../../components/TabIcons';

// Picked-but-not-yet-posted image, staged while the caption sheet is open.
interface StagedAsset { uri: string; base64: string; mimeType: string; }

export function PostsScreen() {
  const insets = useSafeAreaInsets();
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [postCaption, setPostCaption] = useState('');
  const [stagedAsset, setStagedAsset] = useState<StagedAsset | null>(null);
  const [creatingPost, setCreatingPost] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadMyPosts() {
    try {
      const { posts } = await apiGetMyPosts();
      setMyPosts(posts);
    } catch (err) {
      console.error('Failed to load posts', err);
    }
    setLoading(false);
  }

  useEffect(() => { loadMyPosts(); }, []);

  // Step 1: pick an image, then open the caption sheet — caption is now part of
  // the "add post" step instead of sitting permanently above the grid with no
  // effect until "+ New Post" is tapped.
  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to create a post.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert('Could not read image'); return; }
    setStagedAsset({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' });
  }

  // Step 2: confirm from the caption sheet — actually uploads the post.
  async function submitPost() {
    if (!stagedAsset) return;
    setCreatingPost(true);
    try {
      await apiCreatePost({
        photoBase64: stagedAsset.base64,
        mimeType: stagedAsset.mimeType,
        caption: postCaption.trim() || undefined,
      });
      setPostCaption('');
      setStagedAsset(null);
      await loadMyPosts();
    } catch (e: any) {
      Alert.alert('Post failed', e?.message || 'Could not create post. Please try again.');
    }
    setCreatingPost(false);
  }

  function cancelStagedPost() {
    setStagedAsset(null);
    setPostCaption('');
  }

  async function deletePost(postId: string) {
    try {
      await apiDeletePost(postId);
      setMyPosts(prev => prev.filter(p => p.id !== postId));
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Could not delete post.');
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.systemBackground }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 100 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={styles.title}>Posts</Text>
        <Pressable onPress={pickImage} disabled={creatingPost} style={styles.newPostBtn}>
          {creatingPost
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.newPostBtnText}>+ New Post</Text>}
        </Pressable>
      </View>
      <View style={styles.card}>
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={Colors.brand} />
        ) : myPosts.length === 0 ? (
          <Pressable onPress={pickImage} style={styles.empty}>
            <CameraIcon size={28} color={Colors.tertiaryLabel} />
            <Text style={styles.emptyText}>Share your work to get discovered in Explore</Text>
            <Text style={styles.emptyHint}>Tap "+ New Post" to add your first one</Text>
          </Pressable>
        ) : (
          <View style={styles.grid}>
            {myPosts.map((post) => (
              <View key={post.id} style={styles.thumb}>
                <Image source={{ uri: post.photoUrl }} style={styles.thumbImg} contentFit="cover" cachePolicy="memory-disk" />
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => {
                    Alert.alert('Delete post?', 'This cannot be undone.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deletePost(post.id) },
                    ]);
                  }}
                >
                  <Text style={styles.removeBtnText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Caption sheet — shown right after an image is picked, so the caption
          field is part of the "add post" step instead of sitting permanently
          above the grid with no effect until "+ New Post" is tapped. */}
      <Modal visible={!!stagedAsset} transparent animationType="slide" onRequestClose={cancelStagedPost}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.sheetTitle}>New post</Text>
            {stagedAsset && (
              <Image source={{ uri: stagedAsset.uri }} style={styles.stagedPreview} contentFit="cover" />
            )}
            <TextInput
              style={styles.postCaptionInput}
              value={postCaption}
              onChangeText={setPostCaption}
              placeholder="Add a caption (optional)"
              placeholderTextColor={Colors.tertiaryLabel}
              multiline
              maxLength={280}
            />
            <View style={styles.sheetBtnRow}>
              <Pressable style={styles.cancelBtn} onPress={cancelStagedPost} disabled={creatingPost}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.postBtn} onPress={submitPost} disabled={creatingPost}>
                {creatingPost
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.postBtnText}>Post</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800', color: Colors.label },
  newPostBtn: { backgroundColor: Colors.brand, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  newPostBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: Colors.systemBackground, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Colors.separator },
  postCaptionInput: {
    fontSize: 14, color: Colors.label, minHeight: 44, textAlignVertical: 'top',
    backgroundColor: Colors.systemGray6, borderRadius: 14, borderWidth: 1, borderColor: Colors.brandAccent,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 14, fontWeight: '600', color: Colors.secondaryLabel, textAlign: 'center' },
  emptyHint: { fontSize: 12.5, color: Colors.tertiaryLabel },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: '31.5%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  thumbImg: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(61,35,41,0.62)', alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.systemBackground, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.label, marginBottom: 12 },
  stagedPreview: { width: '100%', aspectRatio: 4 / 5, borderRadius: 14, marginBottom: 12, backgroundColor: Colors.systemGray6 },
  sheetBtnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: Colors.systemGray6 },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: Colors.secondaryLabel },
  postBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: Colors.brand },
  postBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
