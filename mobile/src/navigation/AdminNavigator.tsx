import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { BookingsListScreen } from '../screens/admin/BookingsListScreen';
import { ProviderListScreen } from '../screens/admin/ProviderListScreen';
import { AdminProviderDetailScreen } from '../screens/admin/AdminProviderDetailScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { Colors } from '../utils/colors';
import { apiGetProviders, apiGetAllBookings } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MedicalBagIcon, NoteIcon, MonitorDashboardIcon } from '../components/CareIcons';

type IconComp = (p: { size?: number; color?: string }) => React.ReactElement;

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const PURPLE = '#7C3AED';
const INACTIVE = Colors.systemGray2 ?? '#8E8E93';

function TabIcon({
  Icon,
  focused,
  badge,
}: {
  Icon: IconComp;
  focused: boolean;
  badge?: number;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, position: 'relative' }}>
      <View style={{
        width: 44, height: 28, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: focused ? PURPLE + '18' : 'transparent',
      }}>
        <Icon size={20} color={focused ? PURPLE : INACTIVE} />
      </View>
      {(badge ?? 0) > 0 && (
        <View style={{
          position: 'absolute', top: 0, right: -2,
          minWidth: 16, height: 16, borderRadius: 8,
          backgroundColor: '#FF3B30',
          alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 3,
          borderWidth: 1.5, borderColor: '#fff',
        }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
            {(badge ?? 0) > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </View>
  );
}

function AdminTabs() {
  const { token } = useAuth();
  const [pendingProviders,      setPendingProviders]      = useState(0);
  const [activeBookings,   setActiveBookings]   = useState(0);

  // Poll every 30s for counts — drives tab badges
  useEffect(() => {
    if (!token) return;
    let mounted = true;

    async function refresh() {
      try {
        const [providerRes, bookingsRes] = await Promise.all([
          apiGetProviders(false),                          // pending (not approved)
          apiGetAllBookings({ status: 'REQUESTED' }), // open bookings needing attention
        ]);
        if (!mounted) return;
        setPendingProviders(providerRes.providers?.length ?? 0);
        setActiveBookings(bookingsRes.bookings?.length ?? 0);
      } catch {}
    }

    refresh();
    const t = setInterval(refresh, 30_000);
    return () => { mounted = false; clearInterval(t); };
  }, [token]);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: PURPLE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarShowLabel: true,
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="ProviderList"
        component={ProviderListScreen}
        options={{
          tabBarLabel: 'Workers',
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={MedicalBagIcon} focused={focused} badge={pendingProviders} />
          ),
        }}
      />
      <Tab.Screen
        name="AllBookings"
        component={BookingsListScreen}
        options={{
          tabBarLabel: 'Bookings',
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={NoteIcon} focused={focused} badge={activeBookings} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminProfile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={MonitorDashboardIcon} focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function AdminNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="AdminHome" component={AdminTabs} />
      <Stack.Screen name="ProviderDetail" component={AdminProviderDetailScreen} />
    </Stack.Navigator>
  );
}
