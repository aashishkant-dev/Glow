/**
 * Comments — shared bottom sheet for both Posts and Looks (customer- and
 * artist-facing). `isOwner` is what turns on moderation: the artist who owns
 * the Post/Look this sheet is open on can delete ANY comment here, not just
 * their own, same as every other social app's "your content, your rules."
 * A commenter can always delete their own regardless of `isOwner`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { GlowSheet } from './GlowSheet';
import { Colors, Fonts } from '../utils/colors';
import { useAuth } from '../context/AuthContext';
import { apiGetComments, apiAddComment, apiDeleteComment, CommentItem } from '../api/client';
import { formatRelativeTime } from '../utils/dateTime';
import { tapLight, confirmAction } from '../utils/haptics';

const LIST_MAX_HEIGHT = Dimensions.get('window').height * 0.45;

type Target = { postId: string } | { providerLookId: string };

interface Props {
  visible: boolean;
  onClose: () => void;
  target: Target;
  isOwner?: boolean;
  onCountChange?: (delta: number) => void;
}

function targetKeyOf(target: Target): string {
  return 'postId' in target ? `post:${target.postId}` : `look:${target.providerLookId}`;
}

export function CommentsSheetModal({ visible, onClose, target, isOwner, onCountChange }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const loadedForKey = useRef<string | null>(null);
  const targetKey = targetKeyOf(target);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { comments: page, nextCursor: cursor } = await apiGetComments(target);
      setComments(page);
      setNextCursor(cursor);
    } catch {
      setComments([]);
      setNextCursor(null);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  useEffect(() => {
    if (!visible) return;
    if (loadedForKey.current === targetKey) return;
    loadedForKey.current = targetKey;
    load();
  }, [visible, targetKey, load]);

  // Drop the "already loaded" guard once the sheet fully closes, so
  // reopening it on a different target (e.g. after swiping to the next
  // Reel) fetches fresh instead of silently reusing stale comments.
  useEffect(() => {
    if (!visible) loadedForKey.current = null;
  }, [visible]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { comments: page, nextCursor: cursor } = await apiGetComments(target, nextCursor);
      setComments(prev => [...prev, ...page]);
      setNextCursor(cursor);
    } catch {}
    setLoadingMore(false);
  }

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    tapLight();
    try {
      const { comment } = await apiAddComment(target, trimmed);
      setComments(prev => [comment, ...prev]);
      setText('');
      onCountChange?.(1);
    } catch {
      // Leave the draft in the input so nothing typed is lost on failure.
    }
    setSending(false);
  }

  function canDelete(c: CommentItem): boolean {
    return !!isOwner || c.user.id === user?.id;
  }

  function remove(c: CommentItem) {
    const moderating = !!isOwner && c.user.id !== user?.id;
    confirmAction({
      title: 'Delete comment?',
      message: moderating ? 'This removes it for everyone.' : undefined,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        setComments(prev => prev.filter(x => x.id !== c.id));
        onCountChange?.(-1);
        try {
          await apiDeleteComment(c.id);
        } catch {
          load(); // fell out of sync with the server — refetch instead of leaving a wrong optimistic list
        }
      },
    });
  }

  return (
    <GlowSheet visible={visible} onClose={onClose} maxHeightPct={0.82}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Comments</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 32 }} color={Colors.brand} />
        ) : comments.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No comments yet</Text>
            <Text style={styles.emptySub}>Be the first to say something ✨</Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={c => c.id}
            style={{ maxHeight: LIST_MAX_HEIGHT }}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 12 }} color={Colors.brand} /> : null}
            renderItem={({ item }) => (
              <View style={styles.row}>
                {item.user.photoUrl ? (
                  <Image source={{ uri: item.user.photoUrl }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitial}>{item.user.name?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.name} numberOfLines={1}>{item.user.name}</Text>
                    <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.commentText}>{item.text}</Text>
                </View>
                {canDelete(item) && (
                  <Pressable onPress={() => remove(item)} hitSlop={10} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
                )}
              </View>
            )}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Add a comment…"
            placeholderTextColor={Colors.tertiaryLabel}
            multiline
            maxLength={500}
          />
          <Pressable
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!text.trim() || sending}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendBtnText}>Post</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </GlowSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 12,
  },
  headerTitle: { fontSize: 16.5, fontFamily: Fonts.display, color: Colors.label },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surfaceCream,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 12, color: Colors.secondaryLabel, fontFamily: Fonts.semibold },

  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyText: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label },
  emptySub: { fontSize: 13, color: Colors.tertiaryLabel, marginTop: 4, fontFamily: Fonts.regular },

  row: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 13, fontFamily: Fonts.semibold, color: Colors.brandDark },
  rowHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { fontSize: 13.5, fontFamily: Fonts.semibold, color: Colors.label, flexShrink: 1 },
  time: { fontSize: 11.5, color: Colors.tertiaryLabel, fontFamily: Fonts.regular },
  commentText: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.label, lineHeight: 19, marginTop: 2 },
  deleteBtn: { paddingHorizontal: 4, paddingVertical: 2, alignSelf: 'flex-start' },
  deleteBtnText: { fontSize: 11.5, fontFamily: Fonts.semibold, color: Colors.systemRed },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 18, paddingTop: 12, marginTop: 4,
    borderTopWidth: 1, borderTopColor: Colors.separatorSoft,
  },
  input: {
    flex: 1, maxHeight: 90, minHeight: 40,
    backgroundColor: Colors.surfaceCream, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, fontFamily: Fonts.regular, color: Colors.label,
  },
  sendBtn: {
    backgroundColor: Colors.brand, borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 11,
  },
  sendBtnDisabled: { backgroundColor: Colors.systemGray4 },
  sendBtnText: { color: '#fff', fontSize: 13.5, fontFamily: Fonts.semibold },
});
