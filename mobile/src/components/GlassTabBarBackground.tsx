/**
 * Floating pill tab-bar background — shared by CustomerNavigator and
 * ProviderNavigator, which previously each carried their own byte-for-byte
 * copy of this (confirmed drifted apart once already: an iOS-specific blur
 * tune landed independently in both files). One definition now; tune once,
 * both tab bars pick it up.
 */
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

export function GlassTabBarBackground() {
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'rgba(255,249,248,0.66)',
            borderRadius: 100,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          } as any,
        ]}
      />
    );
  }
  // iOS's native blur renders noticeably lighter/more see-through than
  // Android's for the same `intensity`, so a shared 65/0.38 pairing that
  // looked right on Android read as almost no bar at all on a real iOS
  // device — iOS gets its own, higher pairing rather than raising the
  // shared value and over-darkening Android. The overlay opacity (not blur
  // intensity) is the knob that actually controls how "see-through vs.
  // legible" the bar reads as — tuned down further here for a more
  // professional, less painted-pill look.
  const intensity = Platform.OS === 'ios' ? 92 : 65;
  const overlayOpacity = Platform.OS === 'ios' ? 0.5 : 0.38;
  return (
    <>
      <BlurView intensity={intensity} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: 100 }]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 100, backgroundColor: `rgba(255,249,248,${overlayOpacity})` }]} />
      {/* A thin top highlight is what reads as "frosted glass" rather than
          "flat tinted pill" once the overlay is this see-through — the kind
          of crisp edge iOS's own native tab bars carry. Hairline only, no
          shadow (a past shadow-smear rendering bug on Android/web is why
          this bar has never used one — see the border-only definition on
          the bar itself in each navigator). */}
      <View pointerEvents="none" style={styles.topHighlight} />
    </>
  );
}

const styles = StyleSheet.create({
  topHighlight: {
    position: 'absolute', top: 0, left: 14, right: 14, height: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
