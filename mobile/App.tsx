import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { Poppins_300Light, Poppins_500Medium } from '@expo-google-fonts/poppins';
import { AuthProvider } from './src/context/AuthContext';
import { LangProvider } from './src/context/LangContext';
// Side-effect import: registers the background-location TaskManager task at the
// top level so it's defined before the OS can invoke it (incl. headless relaunch).
import './src/services/backgroundLocation';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { Colors } from './src/utils/colors';
import { navigationRef } from './src/utils/navigationRef';
import { API_BASE } from './src/api/client';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Crash reporting. No-op when the DSN isn't set (e.g. local dev without a Sentry project).
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !__DEV__,
    sendDefaultPii: false,
  });
}

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Ping backend health on app open so it's warm before first user action
    fetch(`${API_BASE}/health`).catch(() => {});

    // Load ALL icon fonts the app uses. On native, @expo/vector-icons glyphs render as
    // empty boxes until their font is loaded — previously only Ionicons was loaded, so
    // every MaterialCommunityIcons glyph (used app-wide) was broken in the native build.
    Font.loadAsync({
      ...Ionicons.font,
      ...MaterialCommunityIcons.font,
      Inter_300Light,
      Inter_400Regular,
      Inter_500Medium,
      Inter_600SemiBold,
      Inter_700Bold,
      Inter_800ExtraBold,
      Poppins_300Light,
      Poppins_500Medium,
    })
      .catch(() => {})
      .finally(() => {
        setReady(true);
        SplashScreen.hideAsync().catch(() => {});
      });
  }, []);

  if (!ready) return null;

  return (
    <ErrorBoundary>
    <SafeAreaProvider>
      <LangProvider>
        <AuthProvider>
          <NavigationContainer ref={navigationRef} documentTitle={{ formatter: () => 'Glow' }}>
            <View style={styles.root}>
              <StatusBar style="dark" />
              <RootNavigator />
            </View>
          </NavigationContainer>
        </AuthProvider>
      </LangProvider>
    </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(App);

const styles = StyleSheet.create({
  // overflow: 'hidden' clips the whole app to viewport width on web — without
  // it, any horizontal ScrollView row (occasions, categories, trending) that
  // doesn't get clipped by an ancestor bleeds past the screen edge and the
  // page itself becomes horizontally scrollable.
  root: { flex: 1, backgroundColor: Colors.systemBackground, overflow: 'hidden' as const },
});
