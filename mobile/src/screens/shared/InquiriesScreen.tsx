/**
 * InquiriesScreen — an inbox of pre-booking messages, shared by both roles.
 * A client can message an artist directly from a look or profile before
 * picking a date (see Message.bookingId's schema comment for why these
 * aren't tied to a booking); this is where either side sees and replies to
 * those threads — a provider sees clients who messaged them, a customer
 * sees artists they've messaged.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ArrowBackIcon, ChatIcon } from '../../components/TabIcons';
import { Avatar } from '../../components/Avatar';
import { apiGetInquiryThreads, InquiryThread } from '../../api/client';
import { Colors, Fonts } from '../../utils/colors';
import { tapLight } from '../../utils/haptics';
import { useAuth } from '../../context/AuthContext';

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export function InquiriesScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  // Was hardcoded to 'CUSTOMER' — correct only when the viewer is a
  // Provider. A customer opening their own inbox would then hand ChatScreen
  // 'CUSTOMER' as the OTHER party's role, i.e. claim the artist they're
  // messaging is a customer — wrong role for every customer-side thread.
  // The other party's role is always the opposite of whoever's looking.
  const otherRole = user?.role === 'Provider' ? 'CUSTOMER' : 'Provider';
  const [threads, setThreads] = useState<InquiryThread[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    apiGetInquiryThreads()
      .then(r => setThreads(r.threads))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []));

  function openThread(t: InquiryThread) {
    tapLight();
    nav.navigate('Chat', { otherUserId: t.otherUserId, otherName: t.otherName, otherPhotoUrl: t.otherPhotoUrl ?? undefined, otherRole });
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={8}>
          <ArrowBackIcon size={22} color={Colors.label} />
        </Pressable>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}><ActivityIndicator color={Colors.brand} /></View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={t => t.otherUserId}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><ChatIcon size={30} color={Colors.brand} /></View>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySub}>
                {otherRole === 'CUSTOMER'
                  ? 'When a client messages you before booking, it shows up here.'
                  : 'Message an artist from their profile or a look — your conversations show up here.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openThread(item)}>
              <Avatar name={item.otherName} photoUrl={item.otherPhotoUrl ?? undefined} size={44} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[styles.rowName, item.unread && styles.rowNameUnread]} numberOfLines={1}>{item.otherName}</Text>
                  <Text style={styles.rowTime}>{fmtWhen(item.lastMessageAt)}</Text>
                </View>
                <Text style={[styles.rowMessage, item.unread && styles.rowMessageUnread]} numberOfLines={1}>{item.lastMessage}</Text>
              </View>
              {item.unread && <View style={styles.unreadDot} />}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemBackground },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.separator,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.label },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.separatorSoft,
  },
  rowName: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label },
  rowNameUnread: { fontFamily: Fonts.bold },
  rowTime: { fontSize: 12, color: Colors.tertiaryLabel, fontFamily: Fonts.regular },
  rowMessage: { fontSize: 13.5, color: Colors.secondaryLabel, marginTop: 2, fontFamily: Fonts.regular },
  rowMessageUnread: { color: Colors.label, fontFamily: Fonts.medium },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brand },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.label, marginBottom: 6 },
  emptySub: { fontSize: 14, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 20, fontFamily: Fonts.regular },
});
