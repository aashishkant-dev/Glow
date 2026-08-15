import { createBottomTabNavigator, BottomTabBarProps, BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { addTapListener, scheduleLocal } from '../utils/notifications';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useAuth } from '../context/AuthContext';
import { useChatUnread } from '../context/ChatUnreadContext';
import { useLocation } from '../context/LocationContext';
import { JobDetailScreen } from '../screens/provider/JobDetailScreen';
import { NearbyJobsScreen, pendingJobsCount } from '../screens/provider/NearbyJobsScreen';
import { ProviderCalendarScreen } from '../screens/provider/ProviderCalendarScreen';
import { ProviderDashboardScreen } from '../screens/provider/ProviderDashboardScreen';
import { ProviderDocumentsScreen } from '../screens/provider/ProviderDocumentsScreen';
import { ProviderOnboardingScreen } from '../screens/provider/ProviderOnboardingScreen';
import { ProviderVerifyPhoneScreen } from '../screens/provider/ProviderVerifyPhoneScreen';
import { EarningsScreen } from '../screens/provider/EarningsScreen';
import { RequestsScreen } from '../screens/provider/RequestsScreen';
import { RequestsHubScreen } from '../screens/provider/RequestsHubScreen';
import { PostsScreen } from '../screens/provider/PostsScreen';
import { ProviderLooksScreen } from '../screens/provider/ProviderLooksScreen';
import { requestsBadge } from '../utils/providerBadges';
import { HelpScreen } from '../screens/shared/HelpScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { ChatScreen } from '../screens/shared/ChatScreen';
import { InquiriesScreen } from '../screens/shared/InquiriesScreen';
import { NotificationsScreen } from '../screens/shared/NotificationsScreen';
import { Colors } from '../utils/colors';
import { Booking, apiNearbyJobs, apiMyJobs, apiGetRequests } from '../api/client';
import { getSocket, joinBookingRoom, joinUserRoom } from '../utils/socket';
import { HomeIcon, CameraIcon, PersonIcon } from '../components/TabIcons';
import { BellIcon } from '../components/CareIcons';
import { SparkleIcon } from '../components/BeautyIcons';
import { useNavigation } from '@react-navigation/native';
import { DEFAULT_REGION_NAME } from '../utils/region';
import { formatCurrency } from '../utils/format';

// Profile tab shows the artist's own uploaded photo instead of a generic
// person glyph, once they have one — matches how every competitor app (and
// the OS itself) treats a "you" tab. Falls back to PersonIcon for accounts
// that haven't uploaded a photo yet.
function ProfileTabAvatar({ photoUrl, color, focused }: { photoUrl?: string | null; color: string; focused: boolean }) {
  if (!photoUrl) return <PersonIcon size={24} color={color} filled={focused} />;
  return (
    <Image
      source={{ uri: photoUrl }}
      style={[tabAvatarStyles.avatar, focused && tabAvatarStyles.avatarFocused]}
      contentFit="cover"
    />
  );
}

const tabAvatarStyles = StyleSheet.create({
  avatar: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  avatarFocused: { borderColor: Colors.brand },
});

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
  Chat:
    | { bookingId: string; otherUserId?: undefined; otherName?: string; otherPhotoUrl?: string; otherRole?: string }
    | { bookingId?: undefined; otherUserId: string; otherName?: string; otherPhotoUrl?: string; otherRole?: string };
  Inquiries: undefined;
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<PROVIDERStackParams>();

const ACTIVE = Colors.brand;
const INACTIVE = Colors.systemGray2;

// requestsBadge lives in utils/providerBadges to avoid a circular import with RequestsScreen.
function bumpRequests() { requestsBadge.current += 1; }

// Just a fixed-size hit/layout box around each icon — active state is now
// carried purely by icon/label color (see ACTIVE/INACTIVE below), matching
// CustomerNavigator's TabPill. There's deliberately no fill or indicator
// painted behind the icon here anymore — that was the translucent sliding
// pill users flagged as "the dot", on top of being the thing the shadow
// smear bug lived on.
function TabPill({ children }: { focused: boolean; children: React.ReactNode }) {
  return (
    <View style={tabPillStyles.pill}>
      <View style={{ position: 'relative' }}>{children}</View>
    </View>
  );
}
const tabPillStyles = StyleSheet.create({
  pill: {
    width: 52, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
});

// Tab bar background — matches CustomerNavigator's. Floating rounded pill
// (the curved shape), noticeably more see-through than before, but no
// shadow at all — that's what used to render as a hard smear on real
// Android/web, so it's dropped entirely rather than just tuned. Definition
// against content comes from the 1px border on `bar` instead.
function GlassTabBarBackground() {
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'rgba(255,249,248,0.7)',
            borderRadius: 100,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          } as any,
        ]}
      />
    );
  }
  return (
    <>
      <BlurView intensity={65} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: 100 }]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 100, backgroundColor: 'rgba(255,249,248,0.38)' }]} />
    </>
  );
}

const tabBadgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute', top: -6, right: -10, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: '#FFFFFF',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});

// Same custom tab bar as CustomerNavigator.tsx (see the comment on
// CustomTabBar there for the full "why") — bypasses react-navigation's
// built-in double-layer icon rendering (a real bug on this app's web build)
// and reports its own real height back into BottomTabBarHeightContext, since
// nothing else does that once the default bar is replaced.
function ProviderCustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 14);
  const setTabBarHeight = React.useContext(BottomTabBarHeightCallbackContext);

  return (
    <View
      pointerEvents="box-none"
      style={[providerTabBarStyles.wrap, { bottom: bottomOffset }]}
      onLayout={e => setTabBarHeight?.(e.nativeEvent.layout.height + bottomOffset)}
    >
      <View style={providerTabBarStyles.bar}>
        <GlassTabBarBackground />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          // Hidden routes (NearbyJobs/MyJobs) set tabBarButton: () => null to
          // stay registered for nav.navigate(...) deep-links without showing
          // a tab button — skip rendering them here the same way.
          if (options.tabBarButton) return null;
          const focused = state.index === index;
          const color = focused ? ACTIVE : INACTIVE;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;
          const icon = options.tabBarIcon?.({ focused, color, size: 22 });

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable key={route.key} onPress={onPress} style={providerTabBarStyles.tab} accessibilityRole="tab" accessibilityState={{ selected: focused }}>
              {icon}
              <Text style={[providerTabBarStyles.label, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
// Floating rounded pill, off the sides and bottom — the curved shape. No
// shadow anywhere (that used to render as a hard smear on real Android/web);
// the 1px border alone gives it enough definition against content.
const providerTabBarStyles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 5 },
  bar: {
    flexDirection: 'row',
    height: 70,
    paddingTop: 10,
    paddingHorizontal: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: Colors.separator,
    overflow: 'hidden',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10.5, fontFamily: 'Inter_500Medium', marginTop: 2 },
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
              new Notification(`New job nearby — ${formatCurrency(j.totalPrice)}`, {
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
            `New job nearby — ${formatCurrency(j.totalPrice)}`,
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
  const { token, user } = useAuth();
  const [hasActiveJob, setHasActiveJob] = useState(false);
  const [nearbyBadge, setNearbyBadge] = useState(0);
  const [reqBadge, setReqBadge] = useState(0);
  // Bumped on every tap of the Posts tab button (see ProviderCustomTabBar's
  // onPress, which emits 'tabPress' regardless of whether the tab was
  // already focused) so PostsScreen opens the camera immediately —
  // Instagram/Snapchat-style, camera-first, not landing on the grid first.
  const [postsCameraSignal, setPostsCameraSignal] = useState(0);

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

  // minHeight: 0 stops this flex:1 box from stretching past the real
  // viewport to fit a tall screen's scroll content — see the matching
  // comment in CustomerNavigator.tsx's HomeTabs for the full explanation.
  return (
    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' as const }}>
      <Tab.Navigator
        tabBar={props => <ProviderCustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        {/* ── Tab 1: Home ── */}
        <Tab.Screen
          name="Dashboard"
          component={ProviderDashboardScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabPill focused={focused}>
                <View>
                  <HomeIcon size={22} color={color} filled={focused} />
                  {reqBadge > 0 && (
                    <View style={tabBadgeStyles.badge}>
                      <Text style={tabBadgeStyles.badgeText}>{reqBadge > 9 ? '9+' : reqBadge}</Text>
                    </View>
                  )}
                </View>
              </TabPill>
            ),
            tabBarLabel: 'Home',
          }}
        />

        {/* ── Tab 2: Requests (folds the old FAB "Jobs" browse + "Calendar"
             upcoming-jobs tab into one screen with an internal toggle — see
             RequestsHubScreen.tsx). Route name "RequestsHub" is new; nothing
             navigated to a route by this name before, so no call sites break. ── */}
        <Tab.Screen
          name="RequestsHub"
          component={RequestsHubScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <TabPill focused={focused}>
                <View>
                  <BellIcon size={22} color={color} />
                  {(reqBadge > 0 || nearbyBadge > 0 || hasActiveJob) && (
                    <View style={tabBadgeStyles.badge}>
                      <Text style={tabBadgeStyles.badgeText}>
                        {reqBadge > 9 ? '9+' : (reqBadge || '•')}
                      </Text>
                    </View>
                  )}
                </View>
              </TabPill>
            ),
            tabBarLabel: 'Requests',
          }}
        />

        {/* ── Tab 3: Posts — camera-first: tapping the tab opens the camera
             directly (postsCameraSignal), the grid is what you land on after
             closing it, not before. ── */}
        <Tab.Screen
          name="PostsTab"
          options={{
            tabBarIcon: ({ color, focused }) => <TabPill focused={focused}><CameraIcon size={20} color={color} /></TabPill>,
            tabBarLabel: 'Posts',
          }}
          listeners={{
            tabPress: () => setPostsCameraSignal(s => s + 1),
          }}
        >
          {() => <PostsScreen cameraSignal={postsCameraSignal} />}
        </Tab.Screen>

        {/* ── Tab 4: Looks ── */}
        <Tab.Screen
          name="LooksTab"
          component={ProviderLooksScreen}
          options={{
            tabBarIcon: ({ color, focused }) => <TabPill focused={focused}><SparkleIcon size={20} color={color} /></TabPill>,
            tabBarLabel: 'Looks',
          }}
        />

        {/* ── Tab 5: Profile ── */}
        <Tab.Screen
          name="ProfileTab"
          component={ProfileScreen}
          options={{
            tabBarIcon: ({ color, focused }) => <TabPill focused={focused}><ProfileTabAvatar photoUrl={user?.photoUrl} color={color} focused={focused} /></TabPill>,
            tabBarLabel: 'Profile',
          }}
        />

        {/* ── Hidden routes: NOT shown as tab buttons (tabBarButton: () => null),
             but kept registered in the Tab.Navigator because several call sites
             navigate to them directly by name — nav.navigate('NearbyJobs'),
             nav.navigate('MyJobs'), and nav.navigate('ProviderHome', { screen:
             'MyJobs' | 'NearbyJobs' }) — from RequestsScreen.tsx,
             ProviderCalendarScreen.tsx, ProviderDashboardScreen.tsx, and
             ChatUnreadContext.tsx. Removing these Tab.Screen entries entirely
             (rather than just hiding their tab-bar button) would silently break
             those deep-links, since React Navigation resolves navigate-by-name
             against the registered route config, not just the visible tab list.
             The new RequestsHub tab is what's visible in the bar; these two
             remain reachable "behind" it for existing flows (accept → land on
             MyJobs, "Find Jobs" quick action → land on NearbyJobs, etc). ── */}
        <Tab.Screen
          name="NearbyJobs"
          component={NearbyJobsScreen}
          options={{ tabBarButton: () => null }}
        />
        <Tab.Screen
          name="MyJobs"
          component={ProviderCalendarScreen}
          options={{ tabBarButton: () => null }}
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
      <Stack.Screen name="Inquiries" component={InquiriesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
