import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiCreatePost, apiDeletePost, apiGetMyPosts, Post } from '../../api/client';
import { Colors } from '../../utils/colors';
import { CameraIcon } from '../../components/TabIcons';

export function PostsScreen() {
  const insets = useSafeAreaInsets();
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [postCaption, setPostCaption] = useState('');
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

  async function createPost() {
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

    setCreatingPost(true);
    try {
      await apiCreatePost({
        photoBase64: asset.base64,
        mimeType: asset.mimeType ?? 'image/jpeg',
        caption: postCaption.trim() || undefined,
      });
      setPostCaption('');
      await loadMyPosts();
    } catch (e: any) {
      Alert.alert('Post failed', e?.message || 'Could not create post. Please try again.');
    }
    setCreatingPost(false);
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
        <Pressable onPress={createPost} disabled={creatingPost} style={styles.newPostBtn}>
          {creatingPost
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.newPostBtnText}>+ New Post</Text>}
        </Pressable>
      </View>
      <View style={styles.card}>
        <TextInput
          style={styles.postCaptionInput}
          value={postCaption}
          onChangeText={setPostCaption}
          placeholder="Add a caption (optional)"
          placeholderTextColor={Colors.tertiaryLabel}
          multiline
          maxLength={280}
        />
        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={Colors.brand} />
        ) : myPosts.length === 0 ? (
          <Pressable onPress={createPost} style={styles.empty}>
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
});
