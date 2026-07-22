import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { addTapListener, scheduleLocal } from '../utils/notifications';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAuth } from '../context/AuthContext';
import { useChatUnread } from '../context/ChatUnreadContext';
import { useLocation } from '../context/LocationContext';
import { JobDetailScreen } from '../screens/provider/JobDetailScreen';
import { NearbyJobsScreen, pendingJobsCount } from '../screens/provider/NearbyJobsScreen';
import { MyJobsScreen } from '../screens/provider/MyJobsScreen';
import { ProviderDashboardScreen } from '../screens/provider/ProviderDashboardScreen';
import { ProviderDocumentsScreen } from '../screens/provider/ProviderDocumentsScreen';
import { ProviderOnboardingScreen } from '../screens/provider/ProviderOnboardingScreen';
import { ProviderVerifyPhoneScreen } from '../screens/provider/ProviderVerifyPhoneScreen';
import { EarningsScreen } from '../screens/provider/EarningsScreen';
import { RequestsScreen } from '../screens/provider/RequestsScreen';
import { requestsBadge } from '../utils/providerBadges';
import { HelpScreen } from '../screens/shared/HelpScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { ChatScreen } from '../screens/shared/ChatScreen';
import { NotificationsScreen } from '../screens/shared/NotificationsScreen';
import { Colors } from '../utils/colors';
import { Booking, apiNearbyJobs, apiMyJobs, apiGetRequests } from '../api/client';
import { getSocket, joinBookingRoom, joinUserRoom } from '../utils/socket';
import { HomeIcon, BriefcaseIcon, SearchJobsIcon } from '../components/TabIcons';
import { useNavigation } from '@react-navigation/native';
import { DEFAULT_REGION_NAME } from '../utils/region';

export type PROVIDERStackParams = {
  ProviderHome: undefined;
  ProviderVerifyPhone: undefined;
  ProviderOnboarding: undefined;
  JobDetail: { job: Booking };
  ProviderDocuments: undefined;
  Notifications: undefined;
  Requests: undefined;
  Earnings: undefined;
  Help: undefined;
  Profile: undefined;
  Chat: { bookingId: string; otherName?: string; otherPhotoUrl?: string; otherRole?: string };
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<PROVIDERStackParams>();

const ACTIVE = Colors.onlineGreen;
const INACTIVE = Colors.systemGray2;

// requestsBadge lives in utils/providerBadges to avoid a circular import with RequestsScreen.
function bumpRequests() { requestsBadge.current += 1; }

const tabBadgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute', top: -6, right: -10, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: '#FFFFFF',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});

// ── Global new-job notifier — runs across all Provider screens ─────────────────────
function ProviderJobNotifier() {
  const nav = useNavigation<any>();
  const knownIds  = useRef(new Set<string>());
  const notifiedReqIds = useRef(new Set<string>());  // request ids already notified (never clears this session)
  const reqSeenOnce = useRef(false);
  const seenOnce  = useRef(false);
  const mounted   = useRef(true);
  const { coords } = useLocation();
  const coordsRef = useRef(coords);
  const { increment: incrementUnread, showBanner } = useChatUnread();
  const { user, token } = useAuth();
  useEffect(() => { coordsRef.current = coords; }, [coords]);
  const origTitle = useRef(typeof document !== 'undefined' ? document.title : 'Glow');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.title = origTitle.current;
      }
    };
  }, []);

  // Join personal user room and listen for provider-rated events
  useEffect(() => {
    if (!user?.id) return;
    joinUserRoom(user.id);
    const socket = getSocket();
    // NOTE: provider-rated and provider-approved banners/bell are handled centrally in
    // ChatUnreadContext (single source). Handling them here too produced TWO
    // notifications for one event ("You've been approved!" ×2), so they're gone.
    // Direct-assign: a client picked this Provider specifically. Instead of a 30s flash
    // overlay (rideshare-style pressure), the request lands in the persistent
    // Requests inbox. We notify + raise a banner that deep-links there. No timer.
    const handleDirectAssign = async (data: { bookingId: string; serviceType: string; totalPrice: number; hours: number; address?: string; booking?: Booking }) => {
      if (!mounted.current) return;
      // ONE notification per assigned booking. Previously this handler fired a
      // local OS notification + a web Notification while ChatUnreadContext ALSO
      // raised an in-app banner, and the server sent an Expo push — Providers saw the
      // same request announced 3×. Foreground: the in-app banner (ChatUnreadContext,
      // single source) is enough. Background: the server Expo push covers it.
      // Here we only bump the Requests badge.
      bumpRequests();
    };

    const handleNearbyJob = (_data: { bookingId: string; serviceType: string; totalPrice: number; hours: number; address?: string }) => {
      // General nearby jobs are LOW priority: they should just appear in the
      // "New Jobs" list (which polls /jobs/nearby), NOT trigger a banner, push,
      // or the flash overlay. Only a client requesting THIS Provider specifically
      // (new-job-assigned → handleDirectAssign) gets the flash + notification.
      // So we intentionally do nothing here.
    };

    socket.on('new-job-assigned', handleDirectAssign);
    socket.on('new-job-nearby', handleNearbyJob);
    return () => {
      socket.off('new-job-assigned', handleDirectAssign);
      socket.off('new-job-nearby', handleNearbyJob);
    };
  }, [user?.id]);

  // Notification tap deep-link listener
  useEffect(() => {
    const sub = addTapListener('Provider');
    return () => sub.remove();
  }, []);

  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const poll = useCallback(async () => {
    if (!mounted.current || !tokenRef.current) return;
    try {
      const { bookings } = await apiNearbyJobs(coordsRef.current ?? undefined);
      if (!mounted.current) return;

      if (seenOnce.current) {
        const newJobs = bookings.filter(
          j => j.status === 'REQUESTED' && !knownIds.current.has(j._id),
        );

        if (newJobs.length > 0) {
          const j = newJobs[0];
          // Browser desktop notification
          if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'granted') {
              new Notification(`New job nearby — $${j.totalPrice}`, {
                body: `${j.serviceType} · ${j.hours}h · ${j.address || DEFAULT_REGION_NAME}`,
                icon: '/icon-192.png',
                tag: `job-${j._id}`,
              });
            } else if (Notification.permission === 'default') {
              Notification.requestPermission();
            }
          }
          // Native push notification
          scheduleLocal(
            `New job nearby — $${j.totalPrice}`,
            `${j.serviceType} · ${j.hours}h · ${j.address || DEFAULT_REGION_NAME}`,
            { type: 'job', bookingId: j._id },
          );
          // Tab title badge
          if (Platform.OS === 'web' && typeof document !== 'undefined') {
            document.title = `New Job! · Glow`;
          }
          // No overlay — nearby jobs surface in the Find Jobs list + this notification.
        } else {
          if (Platform.OS === 'web' && typeof document !== 'undefined' &&
              document.title !== origTitle.current) {
            document.title = origTitle.current;
          }
        }
      }

      knownIds.current = new Set(bookings.map(j => j._id));
      seenOnce.current = true;
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5_000);
    return () => clearInterval(t);
  }, [poll]);

  // ── Dedicated-request poller ────────────────────────────────────────────────
  // Safety net so a client's request ALWAYS reaches the chosen Provider even if the
  // realtime socket event was missed (reconnect, app backgrounded, etc.). Polls
  // the Requests inbox; on a newly-seen request it banners + pushes + badges.
  // Stable ref to showBanner so the poller effect doesn't re-run (and re-fire) on
  // every render when the context recreates the callback.
  const showBannerRef = useRef(showBanner);
  useEffect(() => { showBannerRef.current = showBanner; }, [showBanner]);

  const pollRequests = useCallback(async () => {
    if (!mounted.current || !tokenRef.current) return;
    try {
      const { requests } = await apiGetRequests();
      if (!mounted.current) return;
      requestsBadge.current = requests.length;

      // Only banner requests we've NEVER notified about (notifiedReqIds never clears
      // for the session) — prevents the "tap to review" banner looping every poll.
      const fresh = reqSeenOnce.current
        ? requests.filter(r => !notifiedReqIds.current.has(r._id))
        : [];
      for (const r of fresh) {
        notifiedReqIds.current.add(r._id);
        // ONE notification per request. This poller previously fired an in-app
        // banner + a local OS notification + a web Notification all at once, so a
        // single request showed up 3×. The in-app banner is the single source for
        // foreground; the server Expo push handles background. Just banner here.
        showBannerRef.current('New care request', `${r.serviceType} · ${r.hours}h — tap to review`, { type: 'request', bookingId: r._id });
      }
      // Seed notified set on the first load so existing requests don't all banner at once.
      if (!reqSeenOnce.current) requests.forEach(r => notifiedReqIds.current.add(r._id));
      reqSeenOnce.current = true;
    } catch {}
  }, []);

  useEffect(() => {
    pollRequests();
    const t = setInterval(pollRequests, 6_000);
    return () => clearInterval(t);
  }, [pollRequests]);

  // NOTE: chat message notifications are handled centrally in ChatUnreadContext via
  // the server's `message-notification` event (sent to the recipient only). The old
  // per-active-job `new-message` listener here caused double banners and could
  // self-notify the sender, so it was removed.

  // No flash overlay anymore — dedicated requests live in the persistent Requests
  // inbox. This component only wires socket listeners (banners/notifications).
  return null;
}

function ProviderTabs() {
  const { count: unreadCount, clear: clearUnread } = useChatUnread();
  const { token } = useAuth();
  const [hasActiveJob, setHasActiveJob] = useState(false);
  const [nearbyBadge, setNearbyBadge] = useState(0);
  const [reqBadge, setReqBadge] = useState(0);

  // Sync badges from module-level refs (nearby = NearbyJobsScreen, requests = poller)
  useEffect(() => {
    const t = setInterval(() => {
      setNearbyBadge(prev => prev !== pendingJobsCount.current ? pendingJobsCount.current : prev);
      setReqBadge(prev => prev !== requestsBadge.current ? requestsBadge.current : prev);
    }, 2000);
    return () => clearInterval(t);
  }, []);

  // Poll for active jobs — badge only for ON_MY_WAY/STARTED (truly in-progress)
  useEffect(() => {
    if (!token) return;
    let mounted = true;
    async function check() {
      try {
        const { bookings } = await apiMyJobs();
        if (!mounted) return;
        const active = bookings.some(j => ['ON_MY_WAY', 'STARTED'].includes(j.status));
        setHasActiveJob(active);
        if (!active) clearUnread();
      } catch {}
    }
    check();
    const t = setInterval(check, 15_000);
    return () => { mounted = false; clearInterval(t); };
  }, [token, clearUnread]);
  const tabBarHeight = Platform.OS === 'ios' ? 83 : 68;

  // True frosted-glass background (matches CustomerNavigator's tab bar) — see
  // that file's GlassTabBarBackground for why web needs a CSS backdrop-filter
  // fallback instead of BlurView (no native compositor blur on RN Web).
  function GlassTabBarBackground() {
    if (Platform.OS === 'web') {
      return (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: 'rgba(255,255,255,0.72)',
              // @ts-expect-error — web-only CSS property, RN's types don't include it
              backdropFilter: 'blur(20px) saturate(180%)',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
            },
          ]}
        />
      );
    }
    return (
      <BlurView
        intensity={78}
        tint="light"
        style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}
      />
    );
  }

  return (
    <View style={{ flex: 1, overflow: 'hidden' as const }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.brand,
          tabBarInactiveTintColor: Colors.systemGray2,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: 2,
          },
          tabBarBackground: GlassTabBarBackground,
          tabBarStyle: {
            borderTopColor: 'transparent',
            borderTopWidth: 0,
            backgroundColor: 'transparent',
            height: Platform.OS === 'ios' ? 88 : 72,
            paddingTop: 10,
            paddingBottom: Platform.OS === 'ios' ? 28 : 12,
            paddingHorizontal: 0,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.06,
            shadowRadius: 10,
            elevation: 10,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            // Without this, the rounded top corners clip the center FAB
            // (marginTop: -24) that's meant to poke up above the bar.
            overflow: 'visible',
          },
        }}
      >
        {/* ── Tab 1: Dashboard / Home ── */}
        <Tab.Screen
          name="Dashboard"
          component={ProviderDashboardScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <View>
                <HomeIcon size={24} color={color} />
                {reqBadge > 0 && (
                  <View style={tabBadgeStyles.badge}>
                    <Text style={tabBadgeStyles.badgeText}>{reqBadge > 9 ? '9+' : reqBadge}</Text>
                  </View>
                )}
              </View>
            ),
            tabBarLabel: 'Home',
          }}
        />

        {/* ── Tab 2: Find Jobs (center FAB) ── */}
        <Tab.Screen
          name="NearbyJobs"
          component={NearbyJobsScreen}
          options={{
            tabBarIcon: () => (
              <View style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: Colors.brand,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: -24,
                shadowColor: Colors.brand,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.45,
                shadowRadius: 14,
                elevation: 12,
                borderWidth: 3,
                borderColor: '#fff',
              }}>
                {nearbyBadge > 0 && (
                  <View style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: '#EF4444',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                    zIndex: 1,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                      {nearbyBadge > 99 ? '99+' : nearbyBadge}
                    </Text>
                  </View>
                )}
                <SearchJobsIcon size={26} color="#fff" />
              </View>
            ),
            tabBarLabel: () => null,
          }}
        />

        {/* ── Tab 3: My Jobs ── */}
        <Tab.Screen
          name="MyJobs"
          component={MyJobsScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <View>
                <BriefcaseIcon size={24} color={color} />
                {hasActiveJob && (
                  <View style={{
                    position: 'absolute', top: -2, right: -4,
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: Colors.onlineGreen,
                    borderWidth: 1.5,
                    borderColor: '#FFFFFF',
                  }} />
                )}
              </View>
            ),
            tabBarLabel: 'My Jobs',
          }}
        />

      </Tab.Navigator>
      <ProviderJobNotifier />
    </View>
  );
}

export function ProviderNavigator() {
  const { user } = useAuth();
  // Google-signed-in Providers have no phone at all yet — verify that BEFORE
  // onboarding/dashboard, since job dispatch depends on a working number sooner
  // than a customer's first-booking verify does. Phone-signup Providers already
  // arrive with phoneVerified true (see /auth/login), so this never re-blocks them.
  const needsPhoneVerify = user?.role === 'Provider' && !user?.phoneVerified;
  const needsOnboarding = user?.role === 'Provider' && !user?.onboardingComplete;

  return (
    <Stack.Navigator
      initialRouteName={needsPhoneVerify ? 'ProviderVerifyPhone' : needsOnboarding ? 'ProviderOnboarding' : 'ProviderHome'}
      screenOptions={{
        headerTintColor: Colors.onlineGreen,
        headerBackTitle: 'Back',
        headerStyle: { backgroundColor: Colors.systemBackground },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="ProviderHome" component={ProviderTabs} options={{ headerShown: false }} />
      <Stack.Screen name="ProviderVerifyPhone" component={ProviderVerifyPhoneScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="ProviderOnboarding" component={ProviderOnboardingScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProviderDocuments" component={ProviderDocumentsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Requests" component={RequestsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Earnings" component={EarningsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
