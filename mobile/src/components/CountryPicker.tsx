/**
 * CountryPicker — flag + dial code badge that opens a GlowSheet dropdown to
 * choose the phone country. Matches the backend's per-country OTP routing in
 * src/utils/smsProviders/index.js: Canada/USA (Twilio, North American
 * number), UK (Twilio, separate TWILIO_UK_PHONE_NUMBER sender), and Nepal
 * (routed via NepalOTP, falls back to Twilio's dev-log path if unconfigured).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { GlowSheet } from './GlowSheet';
import { Colors, Fonts } from '../utils/colors';

export interface Country {
  code: 'CA' | 'US' | 'UK' | 'NP';
  name: string;
  dialCode: string;
}

export const COUNTRIES: Country[] = [
  { code: 'CA', name: 'Canada', dialCode: '+1' },
  { code: 'US', name: 'United States', dialCode: '+1' },
  { code: 'UK', name: 'United Kingdom', dialCode: '+44' },
  { code: 'NP', name: 'Nepal',  dialCode: '+977' },
];

// Real SVG flags, not emoji — regional-indicator flag emoji (🇨🇦/🇳🇵) render as
// blank boxes on Windows and many Linux browsers (no flag glyphs in the
// default font stack), even though they work fine on iOS/Android. Drawing the
// flags ourselves renders identically on every platform, same as every other
// icon in this app.
function FlagCA({ size = 20 }: { size?: number }) {
  const h = size * 0.72;
  return (
    <Svg width={size} height={h} viewBox="0 0 20 14">
      <Rect width="20" height="14" fill="#FFFFFF" />
      <Rect width="5" height="14" fill="#D80621" />
      <Rect x="15" width="5" height="14" fill="#D80621" />
      <Path
        d="M10 3.2l.6 1.5 1.5-.7-.5 1.6 1.6.1-1.2 1.1 1 1.3-1.6-.3.1 1.6-1.2-1-.7 1.4-.7-1.4-1.2 1 .1-1.6-1.6.3 1-1.3-1.2-1.1 1.6-.1-.5-1.6 1.5.7z"
        fill="#D80621"
      />
      <Path d="M10 9.4v1.8" stroke="#D80621" strokeWidth="0.5" />
    </Svg>
  );
}
function FlagNP({ size = 20 }: { size?: number }) {
  const h = size * 0.9;
  return (
    <Svg width={size} height={h} viewBox="0 0 13 16">
      <Path d="M1 15.2V1.4l7 5.1H3.5z" fill="#DC143C" stroke="#003893" strokeWidth="0.8" strokeLinejoin="round" />
      <Path d="M1 8.8V1.4l10 8.3H3.5z" fill="#DC143C" stroke="#003893" strokeWidth="0.8" strokeLinejoin="round" />
    </Svg>
  );
}
function FlagUS({ size = 20 }: { size?: number }) {
  const h = size * 0.72;
  const stripeH = 14 / 13;
  return (
    <Svg width={size} height={h} viewBox="0 0 20 14">
      <Rect width="20" height="14" fill="#FFFFFF" />
      {[0, 2, 4, 6, 8, 10, 12].map(i => (
        <Rect key={i} x="0" y={i * stripeH} width="20" height={stripeH} fill="#B22234" />
      ))}
      <Rect width="9" height="7.5" fill="#3C3B6E" />
    </Svg>
  );
}
function FlagUK({ size = 20 }: { size?: number }) {
  const h = size * 0.72;
  return (
    <Svg width={size} height={h} viewBox="0 0 20 14">
      <Rect width="20" height="14" fill="#00247D" />
      <Path d="M0 0L20 14M20 0L0 14" stroke="#FFFFFF" strokeWidth="2.4" />
      <Path d="M0 0L20 14M20 0L0 14" stroke="#CF142B" strokeWidth="0.9" />
      <Path d="M8.5 0V14M0 5.5H20" stroke="#FFFFFF" strokeWidth="4" />
      <Path d="M8.5 0V14M0 5.5H20" stroke="#CF142B" strokeWidth="2.2" />
    </Svg>
  );
}
function CountryFlag({ code, size = 20 }: { code: Country['code']; size?: number }) {
  if (code === 'CA') return <FlagCA size={size} />;
  if (code === 'US') return <FlagUS size={size} />;
  if (code === 'UK') return <FlagUK size={size} />;
  return <FlagNP size={size} />;
}

interface CountryPickerProps {
  value: Country | null;
  onChange: (country: Country) => void;
  disabled?: boolean;
}

export function CountryPicker({ value, onChange, disabled }: CountryPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={styles.badge}
        onPress={() => { if (!disabled) { if (Platform.OS !== 'web') Haptics.selectionAsync(); setOpen(true); } }}
        disabled={disabled}
      >
        {value ? (
          <>
            <CountryFlag code={value.code} size={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.countryName} numberOfLines={1}>{value.name}</Text>
              <Text style={styles.dialCode}>{value.dialCode}</Text>
            </View>
          </>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={styles.countryName} numberOfLines={1}>Select country</Text>
          </View>
        )}
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <GlowSheet visible={open} onClose={() => setOpen(false)} maxHeightPct={0.5}>
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>Choose your country</Text>
          {COUNTRIES.map(c => (
            <Pressable
              key={c.code}
              style={[styles.row, value?.code === c.code && styles.rowSelected]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.selectionAsync();
                onChange(c);
                setOpen(false);
              }}
            >
              <CountryFlag code={c.code} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{c.name}</Text>
                <Text style={styles.rowDial}>{c.dialCode}</Text>
              </View>
              {value?.code === c.code && <Text style={styles.rowCheck}>✓</Text>}
            </Pressable>
          ))}
          <Text style={styles.moreNote}>More countries coming soon.</Text>
        </View>
      </GlowSheet>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.systemGroupedBackground, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.separator,
    minWidth: 100, maxWidth: 128, flexShrink: 0,
  },
  countryName: { fontSize: 13.5, fontFamily: Fonts.semibold, color: Colors.label },
  dialCode: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.tertiaryLabel, marginTop: 1 },
  chevron: { fontSize: 11, color: Colors.tertiaryLabel, marginLeft: -1 },

  sheetBody: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 4 },
  sheetTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.label, marginBottom: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14,
  },
  rowSelected: { backgroundColor: Colors.brandLight },
  rowName: { fontSize: 16, fontFamily: Fonts.semibold, color: Colors.label },
  rowDial: { fontSize: 13, color: Colors.secondaryLabel, fontFamily: Fonts.regular, marginTop: 1 },
  rowCheck: { fontSize: 18, color: Colors.brand, fontFamily: Fonts.bold },
  moreNote: { fontSize: 12.5, color: Colors.tertiaryLabel, textAlign: 'center', marginTop: 10, fontFamily: Fonts.regular },
});
