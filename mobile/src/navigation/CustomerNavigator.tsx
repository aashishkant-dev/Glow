import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps, BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import React, { useEffect, useRef, useState } from 'react';
import { addTapListener } from '../utils/notifications';
import { Animated, Easing, Platform, Pressable, StyleSheet, View, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useAuth } from '../context/AuthContext';
import { BookingDetailScreen } from '../screens/customer/BookingDetailScreen';
import { BookingsScreen } from '../screens/customer/BookingsScreen';
import { CreateBookingScreen } from '../screens/customer/CreateBookingScreen';
import { HomeScreen } from '../screens/customer/HomeScreen';
import { ExploreScreen } from '../screens/customer/ExploreScreen';
import { SavedScreen } from '../screens/customer/SavedScreen';
import { TrackingScreen } from '../screens/customer/TrackingScreen';
import { HelpScreen } from '../screens/shared/HelpScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { ChatScreen } from '../screens/shared/ChatScreen';
import { NotificationsScreen } from '../screens/shared/NotificationsScreen';
import { ProviderPublicProfileScreen } from '../screens/customer/ProviderPublicProfileScreen';
import { PostDetailScreen } from '../screens/customer/PostDetailScreen';
import { Colors } from '../utils/colors';
import { Booking, Post } from '../api/client';
import { joinUserRoom } from '../utils/socket';
import { HomeIcon, CompassIcon, HeartIcon } from '../components/TabIcons';
import { ProfileIcon } from '../components/CareIcons';

// Profile tab shows the customer's own uploaded photo instead of a generic
// person glyph, once they have one — same treatment as the Provider tab bar.
function ProfileTabAvatar({ photoUrl, color, focused }: { photoUrl?: string | null; color: string; focused: boolean }) {
  if (!photoUrl) return <ProfileIcon size={24} color={color} />;
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

export type CustomerStackParams = {
  Home: undefined;
  NewBooking: { reassignBookingId?: string; serviceType?: string; bookingMode?: string; providerId?: string; _t?: number } | undefined;
  Bookings: undefined;
  BookingDetail: { booking: Booking };
  Help: undefined;
  Profile: undefined;
  Notifications: undefined;
  Tracking: { bookingId: string; bookingLocation?: { lat: number; lng: number } };
  Chat: { bookingId: string; otherName: string; otherPhotoUrl?: string; otherRole: string };
  ProviderPublicProfile: { providerId: string; providerName?: string; fromBooking?: boolean };
  PostDetail: { post: Post };
};

export type CustomerTabParams = {
  HomeTab: undefined;
  ExploreTab: { openSearch?: boolean } | undefined;
  SavedTab: { initialTab?: 'Looks' | 'Artists' } | undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<CustomerTabParams>();
const Stack = createNativeStackNavigator<CustomerStackParams>();

const ACTIVE = Colors.brand;
const INACTIVE = Colors.systemGray2;

// ── Listens for incoming chat messages from Provider and shows notifications ────────
function CustomerMessageListener() {
  const { user } = useAuth();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const sub = addTapListener('CUSTOMER');
    return () => sub.remove();
  }, []);

  // Join personal user room. Booking-status notifications (banner + bell list +
  // system/local notification) are handled centrally in ChatUnreadContext via the
  // global `booking-status-changed` listener — a second listener here produced
  // duplicate rows with mismatched emoji titles that also broke server-history
  // dedup in the Notifications screen.
  useEffect(() => {
    if (!user?.id) return;
    joinUserRoom(user.id);
  }, [user?.id]);

  // New-message notifications are now handled centrally in ChatUnreadContext via the
  // global `message-notification` socket event (banner + bell + system/local notif).

  return null;
}

/**
 * Concierge IA: Home · Explore · Saved · Profile. Booking is never a tab —
 * it opens from Glow Match, occasion cards, look sheets and artist profiles
 * as the full-screen `NewBooking` stack route.
 */
// Tab bar background — real compositor BlurView on native (genuinely
// translucent, works). On web, CSS backdrop-filter was tried twice and
// confirmed NOT reliably rendering in practice: with only rgba(255,255,255,x)
// behind it, vivid page content (gradient cards, etc.) bled straight through
// the "glass" and made same-toned icons unreadable — confirmed via screenshot.
// Solid on web is a deliberate tradeoff: guaranteed legible over an unproven
// effect that depends on browser/GPU support we can't rely on here.
function GlassTabBarBackground() {
  if (Platform.OS === 'web') {
    // The "content bleeding through and washing out the icons" problem this
    // was chasing turned out to be the bar's own shadow rendering as a solid
    // dark smear on a real Android browser (see barShadowNative/the inline
    // web box-shadow below), not insufficient opacity — with that fixed at
    // the source, this can go back to reading as actual glass instead of
    // being pushed toward opaque to compensate for a different bug.
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'rgba(255,255,255,0.75)',
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
      <BlurView
        intensity={85}
        tint="light"
        style={[StyleSheet.absoluteFill, { borderRadius: 100, overflow: 'hidden' }]}
      />
      {/* Blur alone let vivid page content bleed through and wash out the
          icons/labels — this tint brings native in line with web's
          rgba(255,255,255,0.7) fill so the bar stays legible over anything
          scrolling behind it, while still reading as glass, not opaque. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.45)' }]} />
    </>
  );
}

// Active-tab pill — springs in behind the focused icon (scale + fade) so
// switching tabs feels alive instead of just a flat color swap.
// react-navigation's TabBarIcon renders `tabBarIcon` TWICE per tab, on top of
// each other — once forced `focused: true` (wrapped in its own opacity
// crossfade toward the active tint), once forced `focused: false` (crossfade
// toward inactive) — see TabBarIcon.js. TabPill is called from inside that
// callback, so the `focused` prop it receives is NOT "is this tab actually
// focused right now" — it's "which of the two permanently-mounted render
// slots is this." Driving a SECOND, independent Animated.spring off that value
// used to double-animate on top of react-navigation's own crossfade (each
// slot's spring settles once at mount and never revisits it, since its
// `focused` prop never subsequently changes) — the two independently-timed
// opacity animations could compound to render either layer invisible
// depending on exactly when each mounted, which is what made a specific
// icon (Explore/Compass) intermittently disappear while others happened to
// still look right. A static opacity keyed to the same forced value avoids
// a second animation system fighting the one react-navigation already runs;
// the crossfade smoothness comes entirely from react-navigation's own outer
// opacity wrapper, so nothing looks less smooth — only the pill's small
// scale-bounce flourish is gone.
// The active indicator is now the single sliding pill CustomTabBar renders
// behind the whole row (see slidingPill) — this wrapper just keeps every
// icon's hit/layout box a consistent size, it no longer paints its own
// per-tab fill (that used to be a static-opacity fade; see CustomTabBar's
// comment for why it's a slide now instead).
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
const SLIDING_PILL_WIDTH = 52;
// Must match customTabBarStyles.bar's paddingHorizontal below — barWidth (from
// onLayout) measures the bar's full border-box, but the 5 tab Pressables only
// occupy the space inside that padding. Dividing barWidth straight by tab
// count overestimates each tab's width, so the pill drifts further right than
// the real icon the further a tab sits from Home (~16px off by the last tab).
const TAB_BAR_PADDING_H = 8;

// Custom tab bar — replaces react-navigation's default `tabBarIcon`-driven
// bar entirely. The default bar (via TabBarIcon.js) renders every tab's icon
// TWICE, permanently — once forced focused:true (crossfaded in via its own
// opacity wrapper) and once forced focused:false (crossfaded out) — so it can
// animate between them. That's normally invisible plumbing, but in this app's
// web build one of the two stacked layers for whichever tab is currently
// active intermittently failed to paint (confirmed via direct DOM/computed-
// style inspection: both layers report correct non-zero size and opacity in
// isolation, yet the active tab's icon still doesn't appear on screen — a
// react-native-web/Chromium compositing quirk with two absolutely-positioned,
// opacity-animated SVGs stacked exactly on top of each other, not a bug in
// the icon components themselves). Rendering each tab's icon exactly ONCE,
// with its real focus state, sidesteps the double-layer stacking entirely
// instead of chasing the compositing bug further.
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const bottomOffset = Platform.OS === 'ios' ? 24 : 14;
  // Screens call useBottomTabBarHeight() to reserve exactly enough space to
  // clear this bar (see HomeScreen.tsx and friends) — that hook just reads
  // this context, which react-navigation's OWN default tab bar keeps current
  // via its onLayout. Replacing the default bar with this custom one means
  // nothing was reporting a real measurement back into that context anymore,
  // so every screen's reserved-space math was working off a stale/generic
  // fallback number instead of this bar's actual on-screen size — reporting
  // our own measured height (+ the gap below it, which is also space those
  // screens need to clear) fixes it at the source instead of needing every
  // consumer to special-case this custom bar.
  const setTabBarHeight = React.useContext(BottomTabBarHeightCallbackContext);

  // One shared pill slides between tab positions instead of each icon
  // fading its own static-opacity fill in/out — the fade was chosen over an
  // animated version of THAT per-icon fill specifically to dodge a
  // react-navigation double-render quirk in its *default* tab bar (see the
  // TabPill comment history). This bar is fully custom — react-navigation's
  // default TabBarIcon double-mount never runs here — so a single
  // independent sliding element behind the row doesn't touch that code path
  // at all and is safe.
  const [barWidth, setBarWidth] = useState(0);
  const slideX = useRef(new Animated.Value(0)).current;
  const visibleRoutes = state.routes.filter(r => !descriptors[r.key].options.tabBarButton);
  const focusedKey = state.routes[state.index]?.key;
  const focusedVisibleIndex = Math.max(0, visibleRoutes.findIndex(r => r.key === focusedKey));
  const tabWidth = visibleRoutes.length > 0 ? (barWidth - TAB_BAR_PADDING_H * 2) / visibleRoutes.length : 0;

  useEffect(() => {
    if (!tabWidth) return;
    // A spring here (speed:18) settled fast enough on a real phone that it
    // read as an instant jump rather than a visible slide — a spring's
    // actual on-screen duration isn't fixed, it depends on distance/mass, so
    // it's not reliable for "this should clearly look like it's sliding."
    // A fixed-duration easing curve is: same perceptible glide every time,
    // one tab over or four.
    Animated.timing(slideX, {
      toValue: TAB_BAR_PADDING_H + tabWidth * focusedVisibleIndex + (tabWidth - SLIDING_PILL_WIDTH) / 2,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focusedVisibleIndex, tabWidth, slideX]);

  return (
    <View
      pointerEvents="box-none"
      style={[customTabBarStyles.wrap, { bottom: bottomOffset }]}
      onLayout={e => setTabBarHeight?.(e.nativeEvent.layout.height + bottomOffset)}
    >
      <View
        style={[
          customTabBarStyles.bar,
          Platform.OS === 'web'
            ? { boxShadow: `0 8px 20px ${Colors.cardShadow}26` } as any
            : customTabBarStyles.barShadowNative,
        ]}
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
      >
        <GlassTabBarBackground />
        {!!tabWidth && (
          <Animated.View pointerEvents="none" style={[customTabBarStyles.slidingPill, { transform: [{ translateX: slideX }] }]} />
        )}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const color = focused ? ACTIVE : INACTIVE;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;
          const icon = options.tabBarIcon?.({ focused, color, size: 22 });

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable key={route.key} onPress={onPress} style={customTabBarStyles.tab} accessibilityRole="tab" accessibilityState={{ selected: focused }}>
              {icon}
              <Text style={[customTabBarStyles.label, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
const customTabBarStyles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 5 },
  bar: {
    flexDirection: 'row',
    height: 70,
    paddingTop: 10,
    paddingHorizontal: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: Colors.separator,
    overflow: 'visible',
  },
  // Native-only — iOS reads shadow*, Android reads elevation. On web these
  // same values (esp. shadowRadius:30 + elevation:12 together) rendered as a
  // solid dark smear instead of a soft blur on a real Android browser —
  // RN-Web appears to stack its elevation→box-shadow approximation on top of
  // the shadow* one instead of the two being alternatives, over-darkening
  // instead of blurring. barShadowWeb below replaces both on web with one
  // deliberately gentle box-shadow instead.
  barShadowNative: {
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 12,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10.5, fontFamily: 'Inter_500Medium', marginTop: 2 },
  // A soft, translucent rose (not a solid fill) — reads as glass sliding
  // under the icons rather than a flat highlight stamped on top.
  slidingPill: {
    position: 'absolute', top: 10, left: 0,
    width: SLIDING_PILL_WIDTH, height: 32, borderRadius: 16,
    backgroundColor: Colors.brand + '2E',
  },
});

function HomeTabs() {
  const { user } = useAuth();
  return (
    // `overflow: hidden` gives RN Web a clipping ancestor so horizontal rows
    // scroll instead of bleeding past the viewport. The floating tab bar is
    // `position: absolute` so it still renders outside this box.
    // `minHeight: 0` stops this flex:1 box from stretching past the real
    // viewport height to fit a tall screen's ScrollView content — without it,
    // the absolute-positioned tab bar's `bottom: Npx` resolves against that
    // oversized box, so it drifts up into the page instead of hugging the
    // true screen bottom once a screen's content is tall enough to scroll.
    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabPill focused={focused}><HomeIcon size={22} color={focused ? ACTIVE : INACTIVE} filled={focused} /></TabPill>
          ),
        }}
      />
      <Tab.Screen
        name="ExploreTab"
        component={ExploreScreen}
        options={{
          tabBarLabel: 'Explore',
          tabBarIcon: ({ focused }) => (
            <TabPill focused={focused}><CompassIcon size={22} color={focused ? ACTIVE : INACTIVE} filled={focused} /></TabPill>
          ),
        }}
      />
      <Tab.Screen
        name="SavedTab"
        component={SavedScreen}
        options={{
          tabBarLabel: 'Saved',
          tabBarIcon: ({ focused }) => (
            <TabPill focused={focused}><HeartIcon size={22} color={focused ? ACTIVE : INACTIVE} filled={focused} /></TabPill>
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabPill focused={focused}><ProfileTabAvatar photoUrl={user?.photoUrl} color={focused ? ACTIVE : INACTIVE} focused={focused} /></TabPill>
          ),
        }}
      />
    </Tab.Navigator>
    <CustomerMessageListener />
    </View>
  );
}

export function CustomerNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: Colors.systemBlue,
        headerBackTitle: 'Back',
        headerStyle: { backgroundColor: Colors.systemBackground },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Home" component={HomeTabs} options={{ headerShown: false }} />
      {/* Booking flow lives in the stack (full-screen, covers the tab bar). The
          route keeps the historical name `NewBooking` — every entry point
          (Glow Match, occasion cards, look sheets, artist profiles) targets it. */}
      <Stack.Screen name="NewBooking" component={CreateBookingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Bookings" component={BookingsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Tracking" component={TrackingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProviderPublicProfile" component={ProviderPublicProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
