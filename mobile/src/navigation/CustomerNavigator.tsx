import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React, { useEffect, useRef } from 'react';
import { addTapListener } from '../utils/notifications';
import { Platform, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { BookingDetailScreen } from '../screens/customer/BookingDetailScreen';
import { BookingsScreen } from '../screens/customer/BookingsScreen';
import { CreateBookingScreen } from '../screens/customer/CreateBookingScreen';
import { HomeScreen } from '../screens/customer/HomeScreen';
import { TrackingScreen } from '../screens/customer/TrackingScreen';
import { HelpScreen } from '../screens/shared/HelpScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { ChatScreen } from '../screens/shared/ChatScreen';
import { NotificationsScreen } from '../screens/shared/NotificationsScreen';
import { ProviderPublicProfileScreen } from '../screens/customer/ProviderPublicProfileScreen';
import { Colors } from '../utils/colors';
import { apiMyBookings, Booking } from '../api/client';
import { joinUserRoom } from '../utils/socket';
import { HomeIcon, CalendarIcon, PlusIcon } from '../components/TabIcons';

export type CustomerStackParams = {
  Home: undefined;
  CreateBooking: { reassignBookingId?: string; serviceType?: string; _t?: number } | undefined;
  BookingDetail: { booking: Booking };
  Help: undefined;
  Profile: undefined;
  Notifications: undefined;
  Tracking: { bookingId: string; bookingLocation?: { lat: number; lng: number } };
  Chat: { bookingId: string; otherName: string; otherPhotoUrl?: string; otherRole: string };
  ProviderPublicProfile: { providerId: string; providerName?: string };
};

const Tab = createBottomTabNavigator();
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
  // Listening here too produced double banners and only worked when an active booking
  // existed — so this duplicate per-booking `new-message` listener was removed.

  return null;
}

function HomeTabs() {
  return (
    <View style={{ flex: 1, overflow: 'visible' }}>
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        // Show labels (Home / My Bookings) to match the Provider tab bar layout.
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10.5, fontFamily: 'Inter_500Medium', marginTop: 2 },
        // Floating iOS-style pill bar — detached from the screen edges with a
        // soft rose shadow, like modern beauty/lifestyle apps.
        tabBarStyle: {
          position: 'absolute' as const,
          left: 16, right: 16,
          bottom: Platform.OS === 'ios' ? 24 : 14,
          borderTopWidth: 0,
          backgroundColor: 'rgba(255,255,255,0.96)',
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
          paddingHorizontal: 8,
          borderRadius: 100,
          borderWidth: 1,
          borderColor: Colors.separator,
          shadowColor: Colors.cardShadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.14,
          shadowRadius: 30,
          elevation: 12,
          overflow: 'visible',
        },
      }}
    >
      {/* ── Tab 1: Home ── */}
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          // Match the Provider tab bar: plain icon (no pill background) so both sides
          // look identical + smooth. filled gives a subtle active-state cue.
          tabBarIcon: ({ focused }) => (
            <HomeIcon size={24} color={focused ? ACTIVE : INACTIVE} filled={focused} />
          ),
        }}
      />

      {/* ── Tab 2: New Booking FAB (centre) ── */}
      <Tab.Screen
        name="NewBooking"
        component={CreateBookingScreen}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View style={{
              width: 62, height: 62,
              borderRadius: 31,
              backgroundColor: ACTIVE,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: -28,
              marginBottom: 2,
              shadowColor: ACTIVE,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.5,
              shadowRadius: 18,
              elevation: 14,
              borderWidth: 3,
              borderColor: '#fff',
            }}>
              <PlusIcon size={28} color="#fff" />
            </View>
          ),
        }}
      />

      {/* ── Tab 3: My Bookings ── */}
      <Tab.Screen
        name="BookingsTab"
        component={BookingsScreen}
        options={{
          tabBarLabel: 'Bookings',
          tabBarIcon: ({ focused }) => (
            <CalendarIcon size={24} color={focused ? ACTIVE : INACTIVE} filled={focused} />
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
      <Stack.Screen name="CreateBooking" component={CreateBookingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Tracking" component={TrackingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ProviderPublicProfile" component={ProviderPublicProfileScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
