/**
 * VerifyPhoneSheet — one-time phone verification shown at the moment a
 * customer confirms their first booking (Part 1 of the 2026-07-20 auth
 * redesign). Accounts with no phone on file yet (Google/email signups) get
 * an extra phone-entry step first; phone accounts go straight to OTP entry.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlowSheet } from './GlowSheet';
import { CountryPicker, Country } from './CountryPicker';
import { apiSendVerifyOtp, apiVerifyPhone } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Colors, Fonts } from '../utils/colors';
import { useCountdown } from '../hooks/useCountdown';

// Mirrors the backend's OTP resend cooldown (src/utils/otp.js) exactly.
const RESEND_COOLDOWN_SECONDS = 30;

const OTP_LENGTH = 6;

interface VerifyPhoneSheetProps {
  visible: boolean;
  needsPhone: boolean;
  onVerified: () => void;
  onClose: () => void;
}

export function VerifyPhoneSheet({ visible, needsPhone, onVerified, onClose }: VerifyPhoneSheetProps) {
  const { updateUser } = useAuth();
  const [stage, setStage] = useState<'phone' | 'otp'>(needsPhone ? 'phone' : 'otp');
  const [country, setCountry] = useState<Country | null>(null);
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const phoneRef = useRef<TextInput | null>(null);
  const resendCooldown = useCountdown();

  // Only a genuine FIRST open resets the flow. Re-opening after an accidental
  // dismissal used to blow away a code that had already been texted and drop
  // the user back at phone entry, with no way to type the code they were
  // holding — the reported "OTP screen arrives, I go back, and it asks for my
  // number again". The sheet is now non-dismissible while in flight (see
  // GlowSheet's `dismissible`), and this no longer discards a live OTP even
  // if it does close.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!visible) return;
    if (startedRef.current) return;   // already mid-flow — keep the sent code
    startedRef.current = true;
    setStage(needsPhone ? 'phone' : 'otp');
    setDigits(Array(OTP_LENGTH).fill(''));
    setOtpSent(false);
    if (!needsPhone) sendOtp();
  }, [visible]);

  // Reset only once the flow is genuinely over (sheet closed by success or by
  // the explicit Cancel), so the NEXT booking starts clean.
  useEffect(() => {
    if (!visible) startedRef.current = false;
  }, [visible]);

  // Focus the field the current stage actually wants. Nothing did this before,
  // so the keyboard never opened on its own and every stage began with the
  // user hunting for a target — on a sheet where a mis-tap dismissed the flow.
  // The delay lets the sheet's 320ms open animation settle; focusing mid-
  // transform is unreliable on both platforms.
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => {
      if (stage === 'phone') phoneRef.current?.focus();
      else inputRefs.current[0]?.focus();
    }, 380);
    return () => clearTimeout(id);
  }, [visible, stage]);

  function getE164() {
    const d = phone.replace(/\D/g, '');
    return `${country?.dialCode ?? ''}${d}`;
  }

  async function sendOtp() {
    setLoading(true);
    // Clear any previously-typed digits — resending invalidates the old code
    // server-side, so stale digits (or an OS autofill re-inserting them)
    // would otherwise silently burn verify attempts against the new one.
    setDigits(Array(OTP_LENGTH).fill(''));
    try {
      await apiSendVerifyOtp(needsPhone ? getE164() : undefined);
      setOtpSent(true);
      setStage('otp');
      resendCooldown.start(RESEND_COOLDOWN_SECONDS);
      setTimeout(() => inputRefs.current[0]?.focus(), 300);
    } catch (e: any) {
      const msg = e.message || 'Failed to send verification code.';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
    }
    setLoading(false);
  }

  function handleDigitChange(idx: number, val: string) {
    const clean = val.replace(/\D/g, '');
    if (clean.length === OTP_LENGTH) {
      const next = clean.split('');
      setDigits(next);
      verify(clean);
      return;
    }
    const digit = clean.slice(-1);
    const next = [...digits];
    next[idx] = digit;
    setDigits(next);
    if (digit && idx < OTP_LENGTH - 1) inputRefs.current[idx + 1]?.focus();
    if (digit && next.every(d => d)) verify(next.join(''));
  }

  async function verify(otp: string) {
    setLoading(true);
    try {
      const payload: { otp: string; phone?: string } = { otp };
      if (needsPhone) payload.phone = getE164();
      const { user } = await apiVerifyPhone(payload);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      updateUser({ phone: user.phone ?? undefined, phoneVerified: user.phoneVerified });
      onVerified();
    } catch (e: any) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = e.message || 'Incorrect code. Please try again.';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Incorrect Code', msg);
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
    setLoading(false);
  }

  return (
    // dismissible={false}: the backdrop covers the whole screen behind the
    // sheet, so with the keyboard up a mis-tap toward an input was landing on
    // it and killing the flow. There is now an explicit, visible way out
    // instead (below) — which there previously was not at all.
    <GlowSheet visible={visible} onClose={onClose} dismissible={false}>
      <View style={styles.body}>
        {/* The sheet had NO close control of any kind, so the only ways out
            were the backdrop and the Android back button — both of which
            silently destroyed the flow, and both of which are now disabled
            (dismissible={false}). Going BACK from the code step to phone entry
            is already handled by the "Change number" link further down, so
            this is deliberately just Cancel rather than a second copy of it. */}
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} disabled={loading} hitSlop={12}>
            <Text style={styles.headerAction}>Cancel</Text>
          </Pressable>
        </View>
        {stage === 'phone' ? (
          <>
            <Text style={styles.title}>Confirm your phone number</Text>
            <Text style={styles.subtitle}>We'll text you a one-time code to verify it's really you before your first booking.</Text>
            <View style={styles.phoneRow}>
              <CountryPicker value={country} onChange={c => { setCountry(c); setPhone(''); }} />
              <TextInput
                ref={phoneRef}
                style={[styles.phoneInput, styles.phoneInputFlex]}
                value={phone}
                onChangeText={setPhone}
                returnKeyType="done"
                placeholder={!country ? 'Select country first' : country.code === 'CA' || country.code === 'US' ? '705-555-0100' : country.code === 'UK' ? '7911 123456' : '98XXXXXXXX'}
                placeholderTextColor={Colors.tertiaryLabel}
                keyboardType="phone-pad"
                maxLength={12}
                editable={!!country}
              />
            </View>
            <Pressable
              style={[styles.cta, (!country || phone.replace(/\D/g, '').length !== 10) && styles.ctaDisabled]}
              onPress={sendOtp}
              disabled={loading || !country || phone.replace(/\D/g, '').length !== 10}
            >
              <Text style={styles.ctaText}>{loading ? 'Sending…' : 'Send code'}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Enter the code</Text>
            <Text style={styles.subtitle}>{otpSent ? 'We just texted you a 6-digit code.' : 'Verifying…'}</Text>
            <View style={styles.digitRow}>
              {digits.map((d, i) => (
                <TextInput
                  key={i}
                  ref={r => { inputRefs.current[i] = r; }}
                  style={[styles.digitBox, d && styles.digitBoxFilled]}
                  value={d}
                  onChangeText={v => handleDigitChange(i, v)}
                  keyboardType="number-pad"
                  maxLength={i === 0 ? OTP_LENGTH : 1}
                  textContentType="oneTimeCode"
                  autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                />
              ))}
            </View>
            {/* Fallback for iOS: QuickType autofill sometimes fills the digit
                boxes without firing the per-keystroke auto-submit check below. */}
            <Pressable
              style={[styles.cta, digits.some(d => !d) && styles.ctaDisabled]}
              onPress={() => verify(digits.join(''))}
              disabled={loading || digits.some(d => !d)}
            >
              <Text style={styles.ctaText}>{loading ? 'Verifying…' : 'Verify'}</Text>
            </Pressable>

            <Pressable style={{ marginTop: 4, alignItems: 'center' }} onPress={sendOtp} disabled={loading || resendCooldown.seconds > 0}>
              <Text style={[styles.resendLink, resendCooldown.seconds > 0 && styles.resendLinkDisabled]}>
                {loading ? 'Resending…' : resendCooldown.seconds > 0 ? `Resend code in ${resendCooldown.seconds}s` : "Didn't get a code? Resend"}
              </Text>
            </Pressable>

            {needsPhone && (
              <Pressable
                style={{ alignItems: 'center' }}
                onPress={() => { setStage('phone'); setDigits(Array(OTP_LENGTH).fill('')); }}
                disabled={loading}
              >
                <Text style={styles.resendLink}>← Change number</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </GlowSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20, gap: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  headerAction: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.brand },
  title: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.label },
  subtitle: { fontSize: 14, color: Colors.secondaryLabel, lineHeight: 20, fontFamily: Fonts.regular },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch', minWidth: 0 },
  phoneInput: {
    backgroundColor: Colors.systemGroupedBackground, borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 15, fontSize: 16, color: Colors.label,
    borderWidth: 1, borderColor: Colors.separator, fontFamily: Fonts.regular,
  },
  phoneInputFlex: { flex: 1, minWidth: 0 },
  cta: { borderRadius: 18, backgroundColor: Colors.brand, paddingVertical: 16, alignItems: 'center' },
  ctaDisabled: { backgroundColor: Colors.systemGray4 },
  ctaText: { color: '#fff', fontSize: 16, fontFamily: Fonts.semibold },
  digitRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 8 },
  digitBox: {
    width: 44, height: 54, borderRadius: 14, backgroundColor: Colors.systemGroupedBackground,
    borderWidth: 2, borderColor: Colors.systemGray5, fontSize: 22, fontFamily: Fonts.bold,
    color: Colors.label, textAlign: 'center',
  },
  digitBoxFilled: { borderColor: Colors.brand, backgroundColor: Colors.brandLight },
  resendLink: { color: Colors.brandDark, textDecorationLine: 'underline', fontFamily: Fonts.medium, fontSize: 14 },
  resendLinkDisabled: { color: Colors.tertiaryLabel, textDecorationLine: 'none' },
});
