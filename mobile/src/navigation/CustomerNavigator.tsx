import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarProps, BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import React, { useEffect, useRef } from 'react';
import { addTapListener } from '../utils/notifications';
import { Platform, Pressable, StyleSheet, View, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { InquiriesScreen } from '../screens/shared/InquiriesScreen';
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
  Inquiries: undefined;
  Tracking: { bookingId: string; bookingLocation?: { lat: number; lng: number } };
  Chat:
    | { bookingId: string; otherUserId?: undefined; otherName?: string; otherPhotoUrl?: string; otherRole?: string }
    | { bookingId?: undefined; otherUserId: string; otherName?: string; otherPhotoUrl?: string; otherRole?: string };
  ProviderPublicProfile: { providerId: string; providerName?: string; fromBooking?: boolean };
  PostDetail: { post: Post };
};

export type CustomerTabParams = {
  HomeTab: undefined;
  ExploreTab: { openSearch?: boolean } | undefined;
  SavedTab: { initialTab?: 'Looks' | 'Artists' | 'Posts' } | undefined;
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
// Tab bar background — floating rounded pill (the curved shape), noticeably
// more see-through than before, but no shadow at all — that's what used to
// render as a hard smear on real Android/web, so it's dropped entirely
// rather than just tuned. Definition against content comes from the 1px
// border on `bar` instead.
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

// Just a fixed-size hit/layout box around each icon — active state is now
// carried purely by icon/label color (see ACTIVE/INACTIVE above), matching
// ProviderNavigator's TabPill. There's deliberately no fill or indicator
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
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 14);
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

  return (
    <View
      pointerEvents="box-none"
      style={[customTabBarStyles.wrap, { bottom: bottomOffset }]}
      onLayout={e => setTabBarHeight?.(e.nativeEvent.layout.height + bottomOffset)}
    >
      <View style={customTabBarStyles.bar}>
        <GlassTabBarBackground />
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
// Floating rounded pill, off the sides and bottom — the curved shape. No
// shadow anywhere (that used to render as a hard smear on real Android/web);
// the 1px border alone gives it enough definition against content.
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
    overflow: 'hidden',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10.5, fontFamily: 'Inter_500Medium', marginTop: 2 },
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
      <Stack.Screen name="Inquiries" component={InquiriesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProviderPublicProfile" component={ProviderPublicProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
