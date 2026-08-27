/**
 * Corner-bracket scan targeting — the visual language of ID-scanning and
 * professional dermatology-analysis apps (four L-shaped corner marks, not a
 * full outline box). Used by SkinScanCamera's live framing ring and status
 * pills — the same scan-indicator language whether the camera is
 * searching, poor, or ready.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

interface Props {
  // Position/size of the bracketed region — numbers (px) or percentage
  // strings both work, since this just spreads onto an absolutely
  // positioned container.
  style: ViewStyle;
  color: string;
  size?: number;
  thickness?: number;
  // Live camera overlay pulses gently to read as "actively scanning";
  // the result screen's static markers don't need the motion.
  pulse?: boolean;
  children?: React.ReactNode;
}

export function ScanBracket({ style, color, size = 16, thickness = 2.5, pulse = false, children }: Props) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, pulseAnim]);

  const opacity = pulse ? pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) : 1;
  const corner = { width: size, height: size, borderColor: color, borderRadius: 6 };

  return (
    <View style={[styles.container, style]} pointerEvents="none">
      <Animated.View style={[corner, styles.topLeft, { borderTopWidth: thickness, borderLeftWidth: thickness, opacity }]} />
      <Animated.View style={[corner, styles.topRight, { borderTopWidth: thickness, borderRightWidth: thickness, opacity }]} />
      <Animated.View style={[corner, styles.bottomLeft, { borderBottomWidth: thickness, borderLeftWidth: thickness, opacity }]} />
      <Animated.View style={[corner, styles.bottomRight, { borderBottomWidth: thickness, borderRightWidth: thickness, opacity }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  topLeft: { position: 'absolute', top: -2, left: -2 },
  topRight: { position: 'absolute', top: -2, right: -2 },
  bottomLeft: { position: 'absolute', bottom: -2, left: -2 },
  bottomRight: { position: 'absolute', bottom: -2, right: -2 },
});
