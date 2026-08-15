/**
 * Lightweight success confirmation banner — slides down from the top, holds,
 * then fades out on its own. Used wherever an action (post shared, added to
 * a Look) previously completed silently with no visible confirmation.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../utils/colors';

interface Props {
  message: string | null;
  onHide: () => void;
  duration?: number;
}

export function Toast({ message, onHide, duration = 2200 }: Props) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
    hideTimer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onHide());
    }, duration);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { top: insets.top + 8 },
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
        },
      ]}
    >
      <Text style={styles.check}>✓</Text>
      <Text style={styles.text} numberOfLines={2}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 16, right: 16, zIndex: 50,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.label, borderRadius: 16,
    paddingVertical: 12, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 8,
  },
  check: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.onlineGreen,
    color: '#fff', fontSize: 12, fontFamily: Fonts.semibold, textAlign: 'center', lineHeight: 20, overflow: 'hidden',
  },
  text: { flex: 1, color: '#fff', fontSize: 13.5, fontFamily: Fonts.medium },
});
