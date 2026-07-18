import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { Colors } from '../utils/colors';

interface State { error: Error | null }

/**
 * Last-resort catch for render/lifecycle errors. Without this, ANY uncaught
 * JS error in a release build kills the whole app ("Glow Crashed" iOS
 * dialog). With it, the user sees a friendly screen and can recover in-app.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try { Sentry.captureException(error, { extra: { componentStack: info.componentStack } }); } catch {}
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.emoji}>😕</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.sub}>
          Sorry — the app hit an unexpected error. Tap below to keep going.
        </Text>
        <Pressable style={styles.btn} onPress={() => this.setState({ error: null })}>
          <Text style={styles.btnText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: Colors.systemBackground,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.label, marginBottom: 8 },
  sub: { fontSize: 15, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn: {
    backgroundColor: Colors.brand,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
