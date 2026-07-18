import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSocket } from '../utils/socket';
import { Storage } from '../utils/storage';
import { scheduleLocal } from '../utils/notifications';
import { apiGetNotifications, apiMarkNotificationsRead } from '../api/client';
import { BellIcon, NoteIcon } from '../components/CareIcons';
import { ChatIcon, StarIcon, CheckCircleIcon } from '../components/TabIcons';

interface StoredNotification {
  id: string;
  title: string;
  body: string;
  type?: 'message' | 'booking' | 'approved' | 'rating' | 'job' | 'request';
  bookingId?: string;
  senderName?: string; // for message rows — used by NotificationsScreen to open chat
  read: boolean;
  createdAt: string; // ISO string
}

const NOTIF_STORAGE_KEY = 'cn_notifications';
const MAX_STORED = 50;

interface BannerMsg {
  title: string;
  body: string;
  type?: 'message' | 'booking' | 'approved' | 'rating' | 'job' | 'request';
  bookingId?: string;
  senderName?: string;
}

interface ChatUnreadContextValue {
  count: number;
  increment: () => void;
  clear: () => void;
  showBanner: (title: string, body: string, options?: { type?: BannerMsg['type']; bookingId?: string; senderName?: string }) => void;
  notifications: StoredNotification[];
  markAllRead: () => void;
  addNotification: (title: string, body: string, options?: { type?: BannerMsg['type']; bookingId?: string; senderName?: string }) => void;
  refreshNotifications: () => Promise<void>;
}

const ChatUnreadContext = createContext<ChatUnreadContextValue>({
  count: 0,
  increment: () => {},
  clear: () => {},
  showBanner: () => {},
  notifications: [],
  markAllRead: () => {},
  addNotification: () => {},
  refreshNotifications: async () => {},
});

export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const [banner, setBanner] = useState<BannerMsg | null>(null);
  const slideY = useRef(new Animated.Value(-100)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // Current user id — used to ignore our OWN socket echoes (e.g. don't notify
  // the sender about the message they just sent).
  const myIdRef = useRef<string | null>(null);
  // Current user role — drives role-aware notification copy (a Provider must never be
  // told to "rate your Provider"; they rate the client, and vice-versa).
  const roleRef = useRef<string | null>(null);
  useEffect(() => {
    Storage.getUser().then(u => {
      myIdRef.current = (u as any)?.id ?? (u as any)?._id ?? null;
      roleRef.current = (u as any)?.role ?? null;
    }).catch(() => {});
  }, []);

  const increment = useCallback(() => setCount(c => c + 1), []);
  const clear = useCallback(() => setCount(0), []);

  const [notifications, setNotifications] = useState<StoredNotification[]>([]);

  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const { notifications: server, unreadCount } = await apiGetNotifications();
      if (!aliveRef.current || !server?.length) return;
      setNotifications(prev => {
        // Server rows are authoritative history; keep any unsynced local rows
        // (e.g. messages, which aren't persisted server-side) that the server
        // doesn't have. Dedup by id, then — since local titles can differ from
        // server titles for the SAME event — by type+bookingId+minute bucket
        // (messages keep title in the key: several real messages can share a
        // booking and a minute).
        const dedupKey = (n: StoredNotification) =>
          n.type === 'message'
            ? `msg|${n.title}|${n.bookingId ?? ''}|${n.createdAt.slice(0, 16)}`
            : `${n.type ?? 'booking'}|${n.bookingId ?? ''}|${n.createdAt.slice(0, 16)}`;
        const mapped: StoredNotification[] = server.map(n => ({
          id: n.id,
          title: n.title,
          body: n.body,
          type: (n.type as StoredNotification['type']) ?? 'booking',
          bookingId: n.bookingId ?? undefined,
          read: n.read,
          createdAt: n.createdAt,
        }));
        const seen = new Set(mapped.map(dedupKey));
        const localOnly = prev.filter(n =>
          !mapped.some(m => m.id === n.id) && !seen.has(dedupKey(n))
        );
        const merged = [...mapped, ...localOnly]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, MAX_STORED);
        AsyncStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
        return merged;
      });
      setCount(unreadCount ?? 0);
    } catch { /* offline / not signed in — local cache still shows */ }
  }, []);

  // Load persisted cache instantly, then hydrate from the server.
  useEffect(() => {
    AsyncStorage.getItem(NOTIF_STORAGE_KEY).then(raw => {
      if (!aliveRef.current || !raw) return;
      try { setNotifications(JSON.parse(raw)); } catch {}
    });
    refreshNotifications();
  }, [refreshNotifications]);

  const addNotification = useCallback((title: string, body: string, options?: { type?: BannerMsg['type']; bookingId?: string; senderName?: string }) => {
    setNotifications(prev => {
      const cutoff = Date.now() - 30_000;
      // Dedup: same type+bookingId within 30s = skip. EXCEPT messages — every chat
      // message is a distinct event, so collapsing them on bookingId would drop real
      // incoming messages from the list (the "messages don't show up" bug).
      if (options?.bookingId && options?.type && options.type !== 'message') {
        const dupe = prev.some(n =>
          n.bookingId === options.bookingId &&
          n.type === options.type &&
          new Date(n.createdAt).getTime() > cutoff
        );
        if (dupe) return prev;
      }
      // Singleton events (approved/rating/job) carry no bookingId — a push + a socket
      // emit for the SAME event produced two near-identical rows ("You've been approved!"
      // + "You're approved!"). Dedup these on type alone within the window.
      if (!options?.bookingId && options?.type && ['approved', 'rating', 'job'].includes(options.type)) {
        const dupe = prev.some(n =>
          n.type === options.type &&
          !n.bookingId &&
          new Date(n.createdAt).getTime() > cutoff
        );
        if (dupe) return prev;
      }
      const notif: StoredNotification = {
        id: Date.now().toString(),
        title,
        body,
        type: options?.type,
        bookingId: options?.bookingId,
        senderName: options?.senderName,
        read: false,
        createdAt: new Date().toISOString(),
      };
      const next = [notif, ...prev].slice(0, MAX_STORED);
      AsyncStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      setCount(c => c + 1);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      AsyncStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    setCount(0);
    apiMarkNotificationsRead().catch(() => {});
  }, []);

  const showBanner = useCallback((title: string, body: string, options?: { type?: BannerMsg['type']; bookingId?: string; senderName?: string }) => {
    setBanner({ title, body, type: options?.type, bookingId: options?.bookingId, senderName: options?.senderName });
    addNotification(title, body, options);
  }, [addNotification]);

  // ── Global socket → notifications wiring ───────────────────────────────────
  // The backend emits these events; without this nothing ever populated the
  // notifications list (the bell + Notifications screen stayed empty).
  useEffect(() => {
    const socket = getSocket();

    const onBookingStatus = (d: any) => {
      const status = (d?.status || '').toString();
      // Role-aware copy: Providers receive these same booking-status events, so any text
      // that names the other party must flip based on who is reading it.
      const isProvider = roleRef.current === 'Provider';
      // COMPLETED: a customer rates the Provider; a Provider rates the client. Never tell a Provider
      // to "rate your Provider".
      const completedBody = isProvider
        ? 'Session complete — rate your client.'
        : 'Your session is done — tap to rate your Provider.';
      // Friendly, status-specific copy (industry-standard ride-hail style).
      // Name the Provider when the event payload carries it — "Sarah is on the way"
      // reads far better than "Your Provider is on the way" (parity with the copy the
      // old per-navigator listeners used before this was centralized).
      const who = !isProvider && d?.providerName ? String(d.providerName) : 'Your Provider';
      const MAP: Record<string, { title: string; body: string; type?: BannerMsg['type'] }> = {
        ACCEPTED:  { title: 'Provider accepted',         body: isProvider ? 'You accepted the booking.' : `${who} accepted the booking and will be on the way.` },
        ON_MY_WAY: { title: isProvider ? 'On the way' : `${who} is on the way`, body: isProvider ? 'Heading to the client now.' : 'Track their arrival in the app.' },
        STARTED:   { title: 'Care session started', body: isProvider ? 'The care session has begun.' : `${who} has begun the session.` },
        COMPLETED: { title: 'Service completed',    body: completedBody, type: 'rating' },
        CANCELLED: { title: 'Booking cancelled',   body: d?.reason === 'provider-declined' ? 'Your Provider is unavailable — please choose another.' : 'Your booking was cancelled.' },
        REQUESTED: d?.reason === 'provider-declined'
          ? { title: 'Choose another Provider', body: 'The Provider you requested is unavailable — pick another to continue.', type: 'booking' }
          : { title: 'Finding your Provider', body: 'We’re matching you with a Provider.' },
      };
      const m = MAP[status] ?? { title: 'Booking update', body: `Your booking is now ${status.replace(/_/g, ' ').toLowerCase() || 'updated'}.` };
      showBanner(m.title, m.body, { type: m.type ?? 'booking', bookingId: d?.bookingId });
      // System/local notification so status updates surface when the app/tab is
      // backgrounded (native push covers devices with a push token; web has none).
      scheduleLocal(m.title, m.body, { type: m.type ?? 'booking', bookingId: d?.bookingId ?? '' });
    };
    const onBookingCreated = (d: any) =>
      showBanner('Booking confirmed', 'Your booking request was created.', { type: 'booking', bookingId: d?.bookingId });
    const onBookingCancelled = (d: any) =>
      showBanner('Booking cancelled', d?.reason || 'A booking was cancelled.', { type: 'booking', bookingId: d?.bookingId });
    const onMessageNotification = (d: any) => {
      // Fired to the recipient's personal room (not the chat room). Sender never
      // receives this (backend only emits to the recipient), so no self-notification.
      // Belt-and-braces: if our own id is ever echoed here, ignore it.
      if (d?.senderId && myIdRef.current && String(d.senderId) === String(myIdRef.current)) return;
      const senderName = d?.senderName || 'New message';
      const body  = d?.text || 'You have a new message.';
      // showBanner already bumps the bell count via addNotification — don't double-count.
      // Persist senderName so the Notifications screen can open the chat with a header.
      showBanner(senderName, body, { type: 'message', bookingId: d?.bookingId, senderName });
      // Also fire a system/local notification so it shows even when the app/tab is
      // backgrounded — works on web (Notification API) and native (expo-notifications).
      // No emoji in the title (brand rule); the chat icon comes from the OS channel.
      scheduleLocal(senderName, body, { type: 'message', bookingId: d?.bookingId ?? '' });
      // Web: request permission lazily the first time a message arrives.
      if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    };
    const onApproved = () =>
      showBanner("You're approved!", 'Your account is verified — you can accept jobs now.', { type: 'approved' });
    const onNewJob = (d: any) =>
      showBanner('New care request', 'A client requested you — tap to review.', { type: 'request', bookingId: d?.bookingId });
    // NOTE: no 'new-job-nearby' handler here on purpose. Nearby jobs are LOW
    // priority — they surface in the Find Jobs list, and ProviderNavigator's poller
    // already fires one rich per-job OS notification ("New job nearby — $X").
    // A generic banner here duplicated that with a vaguer message.
    const onRated = (d: any) =>
      showBanner('New rating', `You received a ${d?.rating ? d.rating + '★' : 'new'} rating.`, { type: 'rating' });
    const onTip = (d: any) =>
      showBanner('You got a tip!', d?.amount ? `A client tipped you $${d.amount}.` : 'A client sent you a tip.', { type: 'rating', bookingId: d?.bookingId });

    socket.on('booking-status-changed', onBookingStatus);
    socket.on('booking-created', onBookingCreated);
    socket.on('booking-cancelled', onBookingCancelled);
    socket.on('message-notification', onMessageNotification);
    socket.on('provider-approved', onApproved);
    socket.on('new-job-assigned', onNewJob);
    socket.on('provider-rated', onRated);
    socket.on('tip-received', onTip);

    return () => {
      socket.off('booking-status-changed', onBookingStatus);
      socket.off('booking-created', onBookingCreated);
      socket.off('booking-cancelled', onBookingCancelled);
      socket.off('message-notification', onMessageNotification);
      socket.off('provider-approved', onApproved);
      socket.off('new-job-assigned', onNewJob);
      socket.off('provider-rated', onRated);
      socket.off('tip-received', onTip);
    };
  }, [showBanner]);

  // Animate banner in/out whenever it changes
  useEffect(() => {
    if (!banner) return;

    // Slide in
    Animated.spring(slideY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();

    // Auto-dismiss after 4s
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      Animated.timing(slideY, {
        toValue: -120,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setBanner(null));
    }, 4000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [banner, slideY]);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(slideY, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setBanner(null));
  }, [slideY]);

  const handlePress = useCallback(() => {
    if (!banner) return;
    
    if (banner.type === 'message' && banner.bookingId) {
      // Pass the sender name from the banner title so the chat header isn't blank
      // before message history loads. ChatScreen derives the rest as a fallback.
      nav.navigate('Chat', { bookingId: banner.bookingId, otherName: banner.title });
    } else if ((banner.type === 'booking' || banner.type === 'rating') && banner.bookingId) {
      // Completed→rating + general booking updates open the booking detail
      // (which auto-scrolls to the rating section when COMPLETED).
      nav.navigate('BookingDetail', { bookingId: banner.bookingId });
    } else if (banner.type === 'request') {
      nav.navigate('Requests');
    } else if (banner.type === 'job' && banner.bookingId) {
      nav.navigate('MyJobs');
    } else if (banner.type === 'approved') {
      nav.navigate('ProviderHome');
    }
    
    dismiss();
  }, [banner, nav, dismiss]);

  return (
    <ChatUnreadContext.Provider value={{ count, increment, clear, showBanner, notifications, markAllRead, addNotification, refreshNotifications }}>
      {children}
      {banner && (
        <Animated.View
          style={[
            styles.banner,
            { top: insets.top + 8, transform: [{ translateY: slideY }] },
          ]}
          pointerEvents="box-none"
        >
          <Pressable style={styles.bannerInner} onPress={handlePress}>
            <View style={styles.bannerIcon}>
              {banner.type === 'message' ? <ChatIcon size={20} color="#fff" />
                : banner.type === 'approved' ? <CheckCircleIcon size={20} color="#fff" />
                : banner.type === 'rating' ? <StarIcon size={20} color="#fff" />
                : banner.type === 'job' ? <NoteIcon size={20} color="#fff" />
                : <BellIcon size={20} color="#fff" />}
            </View>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle} numberOfLines={1}>{banner.title}</Text>
              <Text style={styles.bannerBody} numberOfLines={1}>{banner.body}</Text>
            </View>
            <Pressable style={styles.bannerDismiss} onPress={dismiss}>
              <Text style={styles.bannerDismissText}>✕</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      )}
    </ChatUnreadContext.Provider>
  );
}

export function useChatUnread() {
  return useContext(ChatUnreadContext);
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  bannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerIconText: {
    fontSize: 18,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  bannerBody: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  bannerDismiss: {
    padding: 4,
  },
  bannerDismissText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '700',
  },
});
