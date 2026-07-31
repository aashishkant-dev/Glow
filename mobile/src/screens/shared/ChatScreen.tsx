import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ArrowBackIcon, ChatIcon } from '../../components/TabIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useChatUnread } from '../../context/ChatUnreadContext';
import { apiGetMessages, ChatMessage } from '../../api/client';
import { Avatar } from '../../components/Avatar';
import { Colors } from '../../utils/colors';
import { getSocket, joinBookingRoom, sendSocketMessage, emitTyping } from '../../utils/socket';

export function ChatScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { user, photoUri } = useAuth();
  const { clear: clearUnread } = useChatUnread();

  const params = route.params as {
    bookingId: string;
    otherName?: string;
    otherPhotoUrl?: string;
    otherRole?: string;
  };
  const { bookingId } = params;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Name/photo/role may be missing when chat is opened from a notification
  // deep-link (only bookingId passed). Fall back to whatever the message history
  // reveals about the other party so the header never goes blank.
  const myRoleEarly = user?.role === 'Provider' ? 'Provider' : 'CUSTOMER';
  const otherFromMessages = messages.find(m => m.senderRole && m.senderRole !== myRoleEarly && m.senderName);
  // A generic placeholder ("Your Provider"/"Client"/"Customer") passed as a param is NOT a real
  // name — prefer the actual sender name from message history over it, so the header shows
  // the person's name instead of the role label once history loads.
  const GENERIC = ['Your Provider', 'Client', 'Customer', 'User', ''];
  const paramName = params.otherName && !GENERIC.includes(params.otherName) ? params.otherName : undefined;
  const otherName     = paramName || otherFromMessages?.senderName || params.otherName || (myRoleEarly === 'Provider' ? 'Client' : 'Your Provider');
  const otherPhotoUrl = params.otherPhotoUrl;
  const otherRole     = params.otherRole || otherFromMessages?.senderRole || (myRoleEarly === 'Provider' ? 'CUSTOMER' : 'Provider');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myRole = user?.role === 'Provider' ? 'Provider' : 'CUSTOMER';

  // Clear unread badge when chat is opened
  useEffect(() => { clearUnread(); }, [clearUnread]);

  // Load history + join socket room
  useEffect(() => {
    apiGetMessages(bookingId)
      .then(r => { setMessages(r.messages); setLoading(false); })
      .catch(() => setLoading(false));

    joinBookingRoom(bookingId);
    const socket = getSocket();

    const handleNew = (msg: ChatMessage) => {
      setMessages(prev => {
        if (prev.find(m => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const handleTyping = ({ senderName, isTyping }: any) => {
      if (senderName === user?.name) return;
      setIsOtherTyping(isTyping);
      if (isTyping) {
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setIsOtherTyping(false), 3000);
      }
    };

    socket.on('new-message', handleNew);
    socket.on('typing', handleTyping);
    return () => {
      socket.off('new-message', handleNew);
      socket.off('typing', handleTyping);
    };
  }, [bookingId]);

  const handleSend = useCallback(() => {
    if (!text.trim() || !user) return;
    sendSocketMessage(bookingId, text.trim(), user.name, myRole);
    setText('');
    emitTyping(bookingId, user.name, false);
  }, [text, bookingId, user, myRole]);

  const handleTextChange = useCallback((val: string) => {
    setText(val);
    if (!user) return;
    emitTyping(bookingId, user.name, val.length > 0);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(bookingId, user!.name, false), 2000);
  }, [bookingId, user]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = item.senderId === user?.id;
    return (
      <View style={[styles.bubbleRow, isMine ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
        {!isMine && (
          <Avatar name={item.senderName} photoUrl={otherPhotoUrl} size={28} style={{ marginRight: 6, marginTop: 2 }} />
        )}
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
            {item.text}
          </Text>
          <Text style={[styles.bubbleTime, isMine ? { color: 'rgba(255,255,255,0.6)' } : { color: Colors.tertiaryLabel }]}>
            {new Date(item.createdAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
        {isMine && (
          <Avatar name={user?.name ?? '?'} photoUrl={photoUri} size={28} style={{ marginLeft: 6, marginTop: 2 }} />
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Header */}
      <LinearGradient
        colors={['#9C5560', '#B76E79']}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <Pressable onPress={() => nav.goBack()} style={styles.backBtn}>
          <ArrowBackIcon size={24} color="#fff" />
        </Pressable>
        <Avatar name={otherName} photoUrl={otherPhotoUrl} size={38} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{otherName}</Text>
          <Text style={styles.headerRole}>{otherRole === 'Provider' ? 'Beauty Artist' : 'Client'}</Text>
        </View>
      </LinearGradient>

      {/* Messages */}
      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={Colors.systemBlue} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={m => m._id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <View style={{ marginBottom: 12 }}><ChatIcon size={44} color={Colors.systemBlue} /></View>
              <Text style={styles.emptyChatText}>No messages yet.</Text>
              <Text style={styles.emptyChatSub}>Send a message to get started.</Text>
            </View>
          }
          ListFooterComponent={
            isOtherTyping ? (
              <View style={[styles.bubbleRow, styles.bubbleRowLeft, { paddingBottom: 8 }]}>
                <Avatar name={otherName} photoUrl={otherPhotoUrl} size={28} style={{ marginRight: 6 }} />
                <View style={[styles.bubble, styles.bubbleTheirs, { paddingVertical: 10 }]}>
                  <Text style={{ color: Colors.secondaryLabel, fontSize: 18, letterSpacing: 2 }}>•••</Text>
                </View>
              </View>
            ) : null
          }
        />
      )}

      {/* Input */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleTextChange}
          placeholder="Type a message…"
          placeholderTextColor={Colors.tertiaryLabel}
          multiline
          maxLength={1000}
          returnKeyType="default"
        />
        <Pressable
          style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim()}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { marginRight: 12, padding: 4 },
  backBtnText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  headerName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerRole: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 1 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '72%', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleMine: { backgroundColor: '#0A2540', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: Colors.systemBackground, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.separator },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#fff' },
  bubbleTextTheirs: { color: Colors.label },
  bubbleTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, paddingTop: 10,
    backgroundColor: Colors.systemBackground,
    borderTopWidth: 1, borderTopColor: Colors.separator,
    gap: 10,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: Colors.systemGroupedBackground,
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: Colors.label,
    borderWidth: 1, borderColor: Colors.separator,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#0A2540',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.systemGray4 },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  emptyChat: { alignItems: 'center', paddingTop: 60 },
  emptyChatIcon: { fontSize: 44, marginBottom: 12 },
  emptyChatText: { fontSize: 17, fontWeight: '700', color: Colors.label },
  emptyChatSub: { fontSize: 14, color: Colors.secondaryLabel, marginTop: 4 },
});
