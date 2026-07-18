import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { ChatUnreadProvider } from '../context/ChatUnreadContext';
import { LocationProvider } from '../context/LocationContext';
import { useProviderLocationBroadcast } from '../hooks/useProviderLocationBroadcast';
import { AdminNavigator } from './AdminNavigator';
import { AuthNavigator } from './AuthNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { HomeCareNavigator } from './HomeCareNavigator';
import { ProviderNavigator } from './ProviderNavigator';

function AuthenticatedApp({ role }: { role: string }) {
  // Provider live-location broadcast runs app-wide (any screen), not just the dashboard.
  useProviderLocationBroadcast(role);

  // NOTE: do NOT auto-request location permission here. This effect previously
  // re-fired on every mount/permission change, re-prompting the user "every time
  // they open the page." Location is now requested only on explicit user intent
  // (the home location pill) or the one-time, dismissible HomeScreen prompt.

  switch (role) {
    case 'CUSTOMER':  return <CustomerNavigator />;
    case 'SALON': return <HomeCareNavigator />;
    case 'Provider':       return <ProviderNavigator />;
    case 'ADMIN':     return <AdminNavigator />;
    default:          return <AuthNavigator />;
  }
}

export function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#B76E79" />
    </View>
  );

  if (!user) return <AuthNavigator />;

  return (
    <LocationProvider>
      <ChatUnreadProvider>
        <AuthenticatedApp role={user.role} />
      </ChatUnreadProvider>
    </LocationProvider>
  );
}
