/**
 * Shared tab-bar button — CustomTabBar (customer) and ProviderCustomTabBar
 * (provider) both rendered this same shape inline before now (a plain
 * Pressable with zero press feedback), the same situation
 * GlassTabBarBackground was in before it got extracted. One definition now.
 *
 * Adds the interaction polish neither bar had: a press-down scale so tapping
 * a tab feels tactile, a selection haptic, and a brief icon "pop" when a tab
 * becomes newly active. The icon pop animates ONE already-rendered icon
 * instance's transform — it does NOT stack a second icon layer to crossfade
 * between states. That specific pattern (react-navigation's own default tab
 * bar renders every icon twice — once forced focused:true, once
 * focused:false — to crossfade) is what CustomTabBar/ProviderCustomTabBar
 * were built to replace in the first place: on this app's web build, one of
 * the two stacked layers for the active tab intermittently failed to paint
 * (a react-native-web/Chromium compositing quirk with two absolutely-
 * positioned, opacity-animated SVGs stacked exactly on top of each other).
 * See the longer comment on CustomTabBar in CustomerNavigator.tsx for the
 * full history — don't reintroduce that shape here.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { tapLight } from '../utils/haptics';

interface TabButtonProps {
  focused: boolean;
  color: string;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}

export function TabButton({ focused, color, icon, label, onPress }: TabButtonProps) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const iconScale = useRef(new Animated.Value(1)).current;
  // Tracks the PREVIOUS focused value so the pop fires only on the
  // not-focused → focused transition (a real selection), never on mount for
  // whichever tab starts active and never when a tab loses focus.
  const wasFocused = useRef(focused);

  useEffect(() => {
    if (focused && !wasFocused.current) {
      iconScale.setValue(1);
      Animated.sequence([
        Animated.timing(iconScale, { toValue: 1.08, duration: 90, useNativeDriver: true }),
        Animated.spring(iconScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      ]).start();
    }
    wasFocused.current = focused;
  }, [focused, iconScale]);

  function handlePressIn() {
    Animated.timing(pressScale, { toValue: 0.92, duration: 80, useNativeDriver: true }).start();
  }
  function handlePressOut() {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  }
  function handlePress() {
    // Gated on !focused — the same condition already guarding the real
    // navigate() call at each bar's call site — so re-tapping an
    // already-active tab doesn't buzz (or pop) for no reason.
    if (!focused) tapLight();
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.pressable}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
    >
      <Animated.View style={[styles.inner, { transform: [{ scale: pressScale }] }]}>
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>{icon}</Animated.View>
        <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** Small scale-in for a tab's unread/count badge the first time it appears. */
export function TabBadge({ children }: { children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 10 }).start();
  }, [scale]);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  pressable: { flex: 1 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 10.5, fontFamily: 'Inter_500Medium', marginTop: 2 },
});
