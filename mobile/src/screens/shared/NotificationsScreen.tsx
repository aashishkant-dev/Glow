import React, { useCallback } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useChatUnread } from '../../context/ChatUnreadContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../utils/colors';
import { apiGetBooking } from '../../api/client';
import { BellIcon, NoteIcon, ShieldCheckIcon, PinIcon, ClockIcon } from '../../components/CareIcons';
import { ChatIcon, StarIcon, ArrowBackIcon, CheckCircleIcon, CloseCircleIcon, NavigateIcon } from '../../components/TabIcons';

// Map a notification type → brand CareIcon + tint (no emoji). Each entry pairs the
// SVG icon with a colour and a soft background bubble so the row reads at a glance:
//   request → bell, message → chat, rating/tip → star, approved → shield,
//   accepted → check, enroute → navigate, started → clock, cancelled → close,
//   booking → note (generic, e.g. "Booking confirmed" on creation).
const TYPE_VISUAL: Record<
  string,
  { Icon: React.ComponentType<{ size?: number; color?: string }>; color: string; bg: string }
> = {
  request:   { Icon: BellIcon,         color: Colors.brand,          bg: Colors.brandLight },
  job:       { Icon: PinIcon,          color: Colors.brand,          bg: Colors.brandLight },
  message:   { Icon: ChatIcon,         color: Colors.systemBlue,     bg: '#EAF3FA' },
  rating:    { Icon: StarIcon,         color: '#F59E0B',             bg: '#FEF6E7' },
  tip:       { Icon: StarIcon,         color: '#F59E0B',             bg: '#FEF6E7' },
  approved:  { Icon: ShieldCheckIcon,  color: Colors.trustGreen,     bg: '#E7F6EF' },
  accepted:  { Icon: CheckCircleIcon,  color: Colors.trustGreen,     bg: '#E7F6EF' },
  enroute:   { Icon: NavigateIcon,     color: Colors.systemBlue,     bg: '#EAF3FA' },
  started:   { Icon: ClockIcon,        color: Colors.brand,          bg: Colors.brandLight },
  cancelled: { Icon: CloseCircleIcon,  color: Colors.systemRed,      bg: '#FDECEC' },
  booking:   { Icon: NoteIcon,         color: Colors.secondaryLabel, bg: Colors.systemGray6 },
};

// Fallback for any unknown/legacy type → neutral bell.
const DEFAULT_VISUAL = { Icon: BellIcon, color: Colors.secondaryLabel, bg: Colors.systemGray6 };

function NotifIcon({ type }: { type?: string }) {
  const v = (type && TYPE_VISUAL[type]) || DEFAULT_VISUAL;
  const { Icon } = v;
  return (
    <View style={[styles.icon, { backgroundColor: v.bg }]}>
      {/* StarIcon defaults to filled; others are stroke icons — both take size+color. */}
      <Icon size={20} color={v.color} />
    </View>
  );
}

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const { notifications, markAllRead, refreshNotifications } = useChatUnread();
  const { user } = useAuth();
  const isProvider = user?.role === 'Provider';

  // Refetch server history every time the screen gains focus (the provider only
  // hydrates once at sign-in, so without this the list went stale), then mark read.
  useFocusEffect(useCallback(() => {
    // Note: must not return the promise — useFocusEffect treats a return value
    // as a cleanup function.
    refreshNotifications().catch(() => {}).finally(() => markAllRead());
  }, [refreshNotifications, markAllRead]));

  const handleItemPress = useCallback(async (item: any) => {
    if (item.type === 'message') {
      if (!item.bookingId) {
        // A pre-booking "message request" restored from server history has
        // no bookingId (inquiries aren't threaded by one) AND the
        // Notification row has nowhere to carry the otherUserId needed to
        // deep-link the exact thread (only a LIVE banner/push has that, off
        // the socket/push payload directly) — this used to just silently do
        // nothing when tapped. Opening the Inquiries list is a real,
        // working destination instead of a dead tap.
        nav.navigate('Inquiries');
        return;
      }
      const otherRole = isProvider ? 'CUSTOMER' : 'Provider';
      const otherName = item.senderName || (isProvider ? 'Customer' : 'Your Provider');
      // otherPhotoUrl was always undefined here — the notification payload
      // itself never carries it, so the header/message avatars fell back to
      // plain initials every time someone opened a chat from a notification
      // tap. The booking, which this bookingId can always fetch, already has
      // it (see the customer/provider selects in provider.js/customer.js).
      let otherPhotoUrl: string | undefined;
      try {
        const { booking } = await apiGetBooking(item.bookingId);
        otherPhotoUrl = isProvider ? booking.customer?.photoUrl : booking.provider?.photoUrl;
      } catch {}
      nav.navigate('Chat', {
        bookingId: item.bookingId,
        otherName,
        otherRole,
        otherPhotoUrl,
      });
      return;
    }
    // These carry no bookingId — used to fall through the bookingId-only
    // gate below and dead-end on tap, same class of bug as the message case
    // above. Mirrors the live banner's own routing (ChatUnreadContext's
    // handlePress) so a notification behaves the same whether it's tapped
    // live or later from history.
    if (item.type === 'approved') { nav.navigate(isProvider ? 'ProviderHome' : 'Home'); return; }
    if (item.type === 'request') { nav.navigate('Requests'); return; }
    if (item.type === 'job') { nav.navigate('MyJobs'); return; }
    if (!item.bookingId) return;
    try {
      const { booking } = await apiGetBooking(item.bookingId);
      const activeStatuses = ['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED'];
      if (isProvider) {
        nav.navigate('JobDetail', { job: booking });
      } else if (activeStatuses.includes(booking.status)) {
        nav.navigate('Tracking', {
          bookingId: booking._id,
          bookingLocation: booking.lat ? { lat: booking.lat, lng: booking.lng } : undefined,
        });
      } else {
        nav.navigate('BookingDetail', { booking });
      }
    } catch {}
  }, [nav, isProvider]);

  const renderItem = useCallback(({ item }: { item: any }) => (
    <Pressable
      style={[styles.item, !item.read && styles.unread]}
      onPress={() => handleItemPress(item)}
    >
      <NotifIcon type={item.type} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.time}>
          {new Date(item.createdAt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </Pressable>
  ), [nav]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            // Shared between Customer/Provider stacks — no single fallback route.
            if (nav.canGoBack()) nav.goBack();
            else nav.navigate(user?.role === 'Provider' ? 'ProviderHome' : 'Home');
          }}
          style={styles.back}
          hitSlop={8}
        >
          <ArrowBackIcon size={22} color={Colors.label} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={notifications}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={notifications.length === 0 ? styles.empty : { paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={styles.emptyInner}>
            <View style={styles.emptyIconWrap}><BellIcon size={40} color={Colors.brand} /></View>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySub}>Booking updates and messages will appear here</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.systemBackground },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.systemGray5 },
  back:        { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.label },
  item:        { flexDirection: 'row', alignItems: 'flex-start', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.systemGray6, gap: 12 },
  unread:      { backgroundColor: Colors.brandLight },
  icon:        { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  text:        { flex: 1 },
  title:       { fontSize: 15, fontWeight: '600', color: Colors.label, marginBottom: 2 },
  body:        { fontSize: 13, color: Colors.secondaryLabel, marginBottom: 4 },
  time:        { fontSize: 11, color: Colors.tertiaryLabel },
  empty:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyInner:  { alignItems: 'center', padding: 40 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.brandLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: Colors.label, marginBottom: 6 },
  emptySub:    { fontSize: 14, color: Colors.secondaryLabel, textAlign: 'center' },
});
