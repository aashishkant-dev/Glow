import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { HomeCareHomeScreen } from '../screens/customer/HomeCareHomeScreen';
import { CreateBookingScreen } from '../screens/customer/CreateBookingScreen';
import { BookingsScreen } from '../screens/customer/BookingsScreen';
import { BookingDetailScreen } from '../screens/customer/BookingDetailScreen';
import { HelpScreen } from '../screens/shared/HelpScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { Colors } from '../utils/colors';
import { Booking } from '../api/client';
import { NoteIcon, ProfileIcon } from '../components/CareIcons';
import { HomeIcon } from '../components/TabIcons';

type IconComp = (p: { size?: number; color?: string }) => React.ReactElement;

export type HomeCareStackParams = {
  CareHub: undefined;
  BookingDetail: { booking: Booking };
  Help: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<HomeCareStackParams>();

const BRAND = Colors.brand;

interface TabIconProps { label: string; Icon: IconComp; focused: boolean }

function TabIcon({ Icon, focused, label }: TabIconProps) {
  return (
    <View style={tabStyles.iconWrap}>
      <View style={[tabStyles.iconBubble, focused && { backgroundColor: BRAND + '18' }]}>
        <Icon size={20} color={focused ? BRAND : Colors.systemGray2} />
      </View>
      <Text style={[tabStyles.label, { color: focused ? BRAND : Colors.systemGray2 }]}>{label}</Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconWrap:   { alignItems: 'center', gap: 2, paddingTop: 6 },
  iconBubble: { width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emoji:      { fontSize: 20 },
  label:      { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
});

function HomeCareTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: Colors.systemGray2,
        tabBarStyle: {
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          backgroundColor: Colors.systemBackground,
          height: Platform.OS === 'ios' ? 92 : 72,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 20,
          elevation: 16,
        },
      }}
    >
      <Tab.Screen
        name="CareHubTab"
        component={HomeCareHomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={HomeIcon} label="Home" focused={focused} /> }}
      />
      <Tab.Screen
        name="NewCaseTab"
        component={CreateBookingScreen}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View style={{
              width: 58, height: 58, borderRadius: 29,
              backgroundColor: BRAND,
              alignItems: 'center', justifyContent: 'center',
              marginTop: -24,
              shadowColor: BRAND,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.45, shadowRadius: 14, elevation: 10,
              borderWidth: 3, borderColor: '#fff',
            }}>
              <Text style={{ fontSize: 26, color: '#fff', lineHeight: 30 }}>+</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="CasesTab"
        component={BookingsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={NoteIcon} label="Bookings" focused={focused} /> }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={ProfileIcon} label="Profile" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

export function HomeCareNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: BRAND,
        headerBackTitle: 'Back',
        headerStyle: { backgroundColor: Colors.systemBackground },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="CareHub" component={HomeCareTabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
