import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useEffect, useRef } from 'react';
import { addTapListener } from '../utils/notifications';
import { Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
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
// True frosted-glass tab bar background (iOS 26 "Liquid Glass" look) via
// BlurView — RN Web has no native compositor blur, so BlurView renders inert
// there; the CSS `backdropFilter` fallback below keeps web visually consistent
// with native instead of just showing a flat, unblurred tint.
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
            borderRadius: 100,
          },
        ]}
      />
    );
  }
  return (
    <BlurView
      intensity={78}
      tint="light"
      style={[StyleSheet.absoluteFill, { borderRadius: 100, overflow: 'hidden' }]}
    />
  );
}

function HomeTabs() {
  const { user } = useAuth();
  return (
    // `overflow: hidden` gives RN Web a clipping ancestor so horizontal rows
    // scroll instead of bleeding past the viewport. The floating tab bar is
    // `position: absolute` so it still renders outside this box.
    <View style={{ flex: 1, overflow: 'hidden' }}>
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10.5, fontFamily: 'Inter_500Medium', marginTop: 2 },
        tabBarBackground: GlassTabBarBackground,
        // Floating iOS-style pill bar — detached from the screen edges with a
        // soft rose shadow, like modern beauty/lifestyle apps. Background color
        // is transparent here — GlassTabBarBackground paints the actual frosted
        // fill behind the icons/labels.
        tabBarStyle: {
          position: 'absolute' as const,
          left: 16, right: 16,
          bottom: Platform.OS === 'ios' ? 24 : 14,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
          paddingHorizontal: 8,
          borderRadius: 100,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.5)',
          shadowColor: Colors.cardShadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.14,
          shadowRadius: 30,
          elevation: 12,
          overflow: 'visible',
          // Explicit low zIndex: on web, RN Navigation mounts the tab bar as a
          // later DOM sibling of screen content, so it paints over full-screen
          // overlays (LocationPrompt, GlowSheet) despite their own higher
          // zIndex — zIndex only ranks siblings within the same stacking context.
          zIndex: 5,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => (
            <HomeIcon size={24} color={focused ? ACTIVE : INACTIVE} filled={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="ExploreTab"
        component={ExploreScreen}
        options={{
          tabBarLabel: 'Explore',
          tabBarIcon: ({ focused }) => (
            <CompassIcon size={24} color={focused ? ACTIVE : INACTIVE} filled={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="SavedTab"
        component={SavedScreen}
        options={{
          tabBarLabel: 'Saved',
          tabBarIcon: ({ focused }) => (
            <HeartIcon size={24} color={focused ? ACTIVE : INACTIVE} filled={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => (
            <ProfileTabAvatar photoUrl={user?.photoUrl} color={focused ? ACTIVE : INACTIVE} focused={focused} />
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
