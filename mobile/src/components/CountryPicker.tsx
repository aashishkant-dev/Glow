/**
 * CountryPicker — flag + dial code badge that opens a GlowSheet dropdown to
 * choose the phone country. Launch countries only (matches the backend's
 * per-country OTP routing in src/utils/smsProviders/index.js): Canada (Twilio,
 * live) and Nepal (routed but falls back to Twilio's dev-log path until a
 * real Nepal SMS provider is wired up — see that file's TODO). USA shares
 * Canada's +1/Twilio route and will be added once Nepal's provider lands and
 * the full three-country list is worth exposing at once.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { GlowSheet } from './GlowSheet';
import { Colors, Fonts } from '../utils/colors';

export interface Country {
  code: 'CA' | 'NP';
  name: string;
  flag: string;
  dialCode: string;
}

export const COUNTRIES: Country[] = [
  { code: 'CA', name: 'Canada', flag: '🇨🇦', dialCode: '+1' },
  { code: 'NP', name: 'Nepal',  flag: '🇳🇵', dialCode: '+977' },
];

interface CountryPickerProps {
  value: Country;
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
        <Text style={styles.flag}>{value.flag}</Text>
        <Text style={styles.dialCode}>{value.dialCode}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <GlowSheet visible={open} onClose={() => setOpen(false)} maxHeightPct={0.5}>
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>Choose your country</Text>
          {COUNTRIES.map(c => (
            <Pressable
              key={c.code}
              style={[styles.row, value.code === c.code && styles.rowSelected]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.selectionAsync();
                onChange(c);
                setOpen(false);
              }}
            >
              <Text style={styles.rowFlag}>{c.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{c.name}</Text>
                <Text style={styles.rowDial}>{c.dialCode}</Text>
              </View>
              {value.code === c.code && <Text style={styles.rowCheck}>✓</Text>}
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
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.systemGroupedBackground, borderRadius: 16,
    paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.separator,
  },
  flag: { fontSize: 18 },
  dialCode: { fontSize: 16, fontFamily: Fonts.semibold, color: Colors.label },
  chevron: { fontSize: 11, color: Colors.tertiaryLabel, marginLeft: -1 },

  sheetBody: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 4 },
  sheetTitle: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.label, marginBottom: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14,
  },
  rowSelected: { backgroundColor: Colors.brandLight },
  rowFlag: { fontSize: 26 },
  rowName: { fontSize: 16, fontFamily: Fonts.semibold, color: Colors.label },
  rowDial: { fontSize: 13, color: Colors.secondaryLabel, fontFamily: Fonts.regular, marginTop: 1 },
  rowCheck: { fontSize: 18, color: Colors.brand, fontFamily: Fonts.bold },
  moreNote: { fontSize: 12.5, color: Colors.tertiaryLabel, textAlign: 'center', marginTop: 10, fontFamily: Fonts.regular },
});
