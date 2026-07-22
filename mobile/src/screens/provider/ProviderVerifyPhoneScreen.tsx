/**
 * ProviderVerifyPhoneScreen — mandatory phone verification for new Provider
 * accounts created via Google sign-in. Providers need a working, verified
 * number sooner than customers do (job dispatch, SMS notifications), so
 * unlike VerifyPhoneSheet (a dismissible sheet shown at first booking for
 * customers), this is a full, non-dismissible screen shown before the
 * Provider ever reaches the onboarding wizard or dashboard.
 */
import React, { useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { apiSendVerifyOtp, apiVerifyPhone } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Colors, Fonts } from '../../utils/colors';
import { GlowMark } from '../../components/GlowLogo';
import { CountryPicker, COUNTRIES, Country } from '../../components/CountryPicker';

const OTP_LENGTH = 6;

export function ProviderVerifyPhoneScreen() {
  const insets = useSafeAreaInsets();
  const { updateUser } = useAuth();
  const [stage, setStage] = useState<'phone' | 'otp'>('phone');
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  function getE164() {
    const d = phone.replace(/\D/g, '');
    return `${country.dialCode}${d}`;
  }

  async function sendOtp() {
    setLoading(true);
    try {
      await apiSendVerifyOtp(getE164());
      setOtpSent(true);
      setStage('otp');
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
      const { user } = await apiVerifyPhone({ otp, phone: getE164() });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Flips phoneVerified true — RootNavigator/ProviderNavigator re-render
      // past this screen automatically since it's gated on user.phoneVerified.
      updateUser({ phone: user.phone ?? undefined, phoneVerified: user.phoneVerified });
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
    <View style={[styles.container, { paddingTop: insets.top + 32 }]}>
      <GlowMark size={40} petal={Colors.brand} core={Colors.brand} />
      <View style={styles.body}>
        {stage === 'phone' ? (
          <>
            <Text style={styles.title}>Verify your phone number</Text>
            <Text style={styles.subtitle}>
              Clients and Glow need a working number to reach you about jobs. Add yours to continue.
            </Text>
            <View style={styles.phoneRow}>
              <CountryPicker value={country} onChange={c => { setCountry(c); setPhone(''); }} />
              <TextInput
                style={[styles.phoneInput, styles.phoneInputFlex]}
                value={phone}
                onChangeText={setPhone}
                placeholder={country.code === 'CA' ? '705-555-0100' : '98XXXXXXXX'}
                placeholderTextColor={Colors.tertiaryLabel}
                keyboardType="phone-pad"
                maxLength={12}
                autoFocus
              />
            </View>
            <Pressable
              style={[styles.cta, phone.replace(/\D/g, '').length < 7 && styles.ctaDisabled]}
              onPress={sendOtp}
              disabled={loading || phone.replace(/\D/g, '').length < 7}
            >
              <Text style={styles.ctaText}>{loading ? 'Sending…' : 'Send code'}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Enter the code</Text>
            <Text style={styles.subtitle}>{otpSent ? `We just texted a 6-digit code to ${country.dialCode} ${phone}.` : 'Verifying…'}</Text>
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
            <Pressable
              style={{ marginTop: 18, alignItems: 'center' }}
              onPress={() => { setStage('phone'); setDigits(Array(OTP_LENGTH).fill('')); }}
              disabled={loading}
            >
              <Text style={styles.changeLink}>← Change number</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemBackground, alignItems: 'center', paddingHorizontal: 24 },
  body: { width: '100%', maxWidth: 400, marginTop: 40, gap: 14 },
  title: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.label },
  subtitle: { fontSize: 14, color: Colors.secondaryLabel, lineHeight: 20, fontFamily: Fonts.regular },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  phoneInput: {
    backgroundColor: Colors.systemGroupedBackground, borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 15, fontSize: 16, color: Colors.label,
    borderWidth: 1, borderColor: Colors.separator, fontFamily: Fonts.regular,
  },
  phoneInputFlex: { flex: 1 },
  cta: { borderRadius: 18, backgroundColor: Colors.brand, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  ctaDisabled: { backgroundColor: Colors.systemGray4 },
  ctaText: { color: '#fff', fontSize: 16, fontFamily: Fonts.semibold },
  digitRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 8 },
  digitBox: {
    width: 44, height: 54, borderRadius: 14, backgroundColor: Colors.systemGroupedBackground,
    borderWidth: 2, borderColor: Colors.systemGray5, fontSize: 22, fontFamily: Fonts.bold,
    color: Colors.label, textAlign: 'center',
  },
  digitBoxFilled: { borderColor: Colors.brand, backgroundColor: Colors.brandLight },
  changeLink: { color: Colors.brandDark, textDecorationLine: 'underline', fontFamily: Fonts.medium, fontSize: 14 },
});
