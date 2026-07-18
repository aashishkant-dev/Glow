import React from 'react';
import { Platform, Text, View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { Colors } from '../utils/colors';

interface Props {
  size?: number;
  showWordmark?: boolean;
  /** 'onDark' = light wordmark (rose/plum bg). 'onLight' = rose wordmark (light bg). */
  variant?: 'onDark' | 'onLight' | 'green' | 'blue';
  /** Invert for dark/brand backgrounds: white petals + gold core. */
  inverted?: boolean;
}

/**
 * Glow Bloom mark — from the brand identity (Figma "Luxury Beauty Brand
 * Identity"), refined: four organic petals radiating from a champagne-gold
 * core, corner micro-dots as scattered light. Improvements over the source:
 * two-layer petals (deep rose under, soft rose inset) for depth without SVG
 * gradients (url(#id) renders blank in react-native-svg-web), a specular
 * micro-highlight on the core, and slightly rotated dot orbit so the mark
 * reads "blooming", not static.
 */
export function GlowMark({
  size = 44,
  petal,
  petalInner,
  core = Colors.gold,
}: {
  size?: number;
  petal?: string;
  petalInner?: string;
  core?: string;
}) {
  const p  = petal ?? Colors.brand;
  const pi = petalInner ?? Colors.brandAccent;
  // One petal pointing up, drawn as a teardrop; reused via rotation.
  const PETAL = 'M56 12 C46 24 42 33 42 40 C42 49 48 54 56 54 C64 54 70 49 70 40 C70 33 66 24 56 12 Z';
  const PETAL_IN = 'M56 20 C50 28 47.5 34 47.5 39 C47.5 45.5 51 49 56 49 C61 49 64.5 45.5 64.5 39 C64.5 34 62 28 56 20 Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 112 112">
      {[0, 90, 180, 270].map(r => (
        <G key={r} transform={`rotate(${r} 56 56)`}>
          <Path d={PETAL} fill={p} />
          <Path d={PETAL_IN} fill={pi} opacity={0.55} />
        </G>
      ))}
      {/* Champagne core + specular highlight */}
      <Circle cx={56} cy={56} r={9} fill={core} />
      <Circle cx={53.4} cy={53.4} r={2.6} fill="#FFFFFF" opacity={0.75} />
      {/* Scattered-light micro-dots, slightly off-axis orbit */}
      <Circle cx={92} cy={26} r={3.4} fill={core} opacity={0.9} />
      <Circle cx={22} cy={88} r={2.6} fill={p} opacity={0.75} />
      <Circle cx={96} cy={78} r={2} fill={p} opacity={0.55} />
      <Circle cx={18} cy={30} r={1.8} fill={core} opacity={0.6} />
    </Svg>
  );
}

export function GlowLogo({ size = 44, showWordmark = true, variant = 'onDark', inverted = false }: Props) {
  // Legacy values: 'green'/'blue' came from older callers; treat as onDark.
  const onLight = variant === 'onLight';
  const wordSize = Math.round(size * 0.52);
  return (
    <View style={styles.row}>
      <GlowMark
        size={size}
        petal={inverted ? '#FFFFFF' : Colors.brand}
        petalInner={inverted ? 'rgba(255,255,255,0.45)' : Colors.brandAccent}
        core={Colors.gold}
      />
      {showWordmark && (
        <Text
          style={[
            styles.wordmark,
            { fontSize: wordSize },
            onLight ? styles.neonOnLight : styles.neonOnDark,
            // Web gets a layered luminous halo; native falls back to the
            // single RN text shadow set in neonOnLight/neonOnDark.
            Platform.OS === 'web' &&
              ({ textShadow: onLight
                  ? '0 0 12px rgba(217,122,145,0.5), 0 0 30px rgba(217,122,145,0.25)'
                  : '0 0 12px rgba(255,255,255,0.55), 0 0 30px rgba(255,214,230,0.4)' } as any),
          ]}
        >
          glow
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Brand wordmark: lowercase Poppins Light, wide tracking, luminous halo —
  // per the identity spec. fontFamily only (no fontWeight): weight is baked
  // into the family name; combining both breaks rendering on Android.
  wordmark: {
    letterSpacing: 5,
    fontFamily: 'Poppins_300Light',
  },
  neonOnLight: {
    color: Colors.brandDark,
    textShadowColor: 'rgba(217,122,145,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  neonOnDark: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(255,214,230,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
});

/** Brand tagline — wide-tracked caps, per the identity's lockup. */
export function GlowTagline({ color = Colors.secondaryLabel, size = 10.5 }: { color?: string; size?: number }) {
  return (
    <Text style={{ fontSize: size, letterSpacing: 2.4, color, fontFamily: 'Poppins_500Medium', textTransform: 'uppercase' }}>
      Beauty · On Demand · Everywhere
    </Text>
  );
}
