import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../utils/colors';

interface Props {
  size?: number;
  showWordmark?: boolean;
  /** 'onDark' = white wordmark (hero/green bg). 'onLight' = brand wordmark (white bg). */
  variant?: 'onDark' | 'onLight' | 'green' | 'blue';
  /** Invert the pin for dark/green backgrounds: white pin body + green heart. */
  inverted?: boolean;
}

/**
 * Map-pin + heart mark. Solid brand fill (no SVG gradient): gradients via
 * url(#id) are fragile in react-native-svg-web/PWA and were rendering blank.
 * A flat fill is identical visually at this size and bulletproof everywhere.
 */
function PinIcon({ size, pinFill = Colors.brand, heartFill = '#FFFFFF' }: { size: number; pinFill?: string; heartFill?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 112 112">
      {/* Pin body (refined teardrop) */}
      <Path
        d="M56 6 C32 6 13 25 13 48.5 C13 66 26 80 44 97 L52.5 104.6 C54.5 106.4 57.5 106.4 59.5 104.6 L68 97 C86 80 99 66 99 48.5 C99 25 80 6 56 6 Z"
        fill={pinFill}
      />
      {/* Heart knockout */}
      <Path
        d="M56 66 C54.9 66 53.8 65.6 53 64.9 C44.4 58 38.5 51.9 38.5 44.3 C38.5 38.2 43 34 48.2 34 C51.3 34 54.1 35.5 56 38 C57.9 35.5 60.7 34 63.8 34 C69 34 73.5 38.2 73.5 44.3 C73.5 51.9 67.6 58 59 64.9 C58.2 65.6 57.1 66 56 66 Z"
        fill={heartFill}
      />
    </Svg>
  );
}

export function GlowLogo({ size = 44, showWordmark = true, variant = 'onDark', inverted = false }: Props) {
  // Legacy values: 'green'/'blue' came from older callers; treat as onDark.
  const onLight = variant === 'onLight';
  return (
    <View style={styles.row}>
      <PinIcon
        size={size}
        pinFill={inverted ? '#FFFFFF' : Colors.brand}
        heartFill={inverted ? Colors.brand : '#FFFFFF'}
      />
      {showWordmark && (
        <Text style={[styles.wordmark, { fontSize: Math.round(size * 0.41) }]}>
          <Text style={[styles.light, onLight && { color: Colors.secondaryLabel }]}>Care</Text>
          <Text style={[styles.bold, onLight && { color: Colors.label }]}>Nearby</Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { letterSpacing: -0.4 },
  // On Android, fontFamily + fontWeight together can break rendering (the weight
  // is baked into the family name; passing fontWeight makes the OS look for a
  // non-existent variant → tofu/blank). Use the weighted family name ONLY.
  light:    { color: 'rgba(255,255,255,0.7)', fontFamily: 'PlusJakartaSans_500Medium' },
  bold:     { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_800ExtraBold' },
});
