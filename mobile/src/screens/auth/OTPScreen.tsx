import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { apiLogin, apiVerify } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { IOSButton } from '../../components/IOSButton';
import { Colors } from '../../utils/colors';
import { GlowLogo } from '../../components/GlowLogo';

const OTP_LENGTH = 6;

export function OTPScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const { phone, isNewUser, role } = route.params as {
    phone: string;
    isNewUser: boolean;
    role: string;
  };

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    startTimer();
    setTimeout(() => inputRefs.current[0]?.focus(), 400);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startTimer() {
    setResendTimer(30);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer(t => {
        if (t <= 1) { clearInterval(timerRef.current!); return 0; }
        return t - 1;
      });
    }, 1000);
  }

  function handleDigitChange(idx: number, val: string) {
    // Handle paste or SMS auto-fill of full OTP (e.g. "123456")
    const clean = val.replace(/\D/g, '');
    if (clean.length === OTP_LENGTH) {
      const next = clean.split('');
      setDigits(next);
      inputRefs.current[OTP_LENGTH - 1]?.focus();
      verify(clean);
      return;
    }
    const digit = clean.slice(-1);
    const next = [...digits];
    next[idx] = digit;
    setDigits(next);
    if (digit && idx < OTP_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
    // Auto-submit when all filled
    if (digit && next.every(d => d)) {
      verify(next.join(''));
    }
  }

  function handleKeyPress(idx: number, key: string) {
    if (key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  }

  async function verify(otp: string) {
    setLoading(true);
    try {
      const { token, user } = await apiVerify({ phone, otp });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // signIn triggers RootNavigator → ProviderNavigator handles onboarding routing
      await signIn(token, {
        id:   user.id,
        name: user.name,
        phone: user.phone,
        role: user.role as 'CUSTOMER' | 'Provider' | 'ADMIN' | 'SALON',
        onboardingComplete: user.onboardingComplete,
      });
    } catch (e: any) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = e.message || 'The code you entered is incorrect. Please try again.';
      if (Platform.OS === 'web') alert(msg);
      else setTimeout(() => { if (isMounted.current) Alert.alert('Incorrect Code', msg); }, 50);
      if (isMounted.current) setDigits(Array(OTP_LENGTH).fill(''));
      if (isMounted.current) setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
    if (isMounted.current) setLoading(false);
  }

  async function resend() {
    if (resendTimer > 0 || resending) return;
    setResending(true);
    try {
      await apiLogin({ phone });
      startTimer();
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      const msg = e.message || 'Failed to resend code.';
      if (Platform.OS === 'web') alert(msg);
      else setTimeout(() => { if (isMounted.current) Alert.alert('Error', msg); }, 50);
    }
    if (isMounted.current) setResending(false);
  }

  const maskedPhone = phone.slice(0, -4).replace(/\d/g, '•') + phone.slice(-4);
  const otp = digits.join('');
  const isFilled = otp.length === OTP_LENGTH;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <LinearGradient
          colors={[Colors.heroNavy, Colors.heroNavyLight]}
          style={styles.header}
        >
          <Pressable style={styles.backBtn} onPress={() => nav.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          <View style={styles.iconCircle}>
            <GlowLogo size={40} showWordmark={false} />
          </View>
          <Text style={styles.title}>Enter Code</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.phoneText}>{maskedPhone}</Text>
          </Text>
        </LinearGradient>

        <View style={styles.body}>
          {/* OTP boxes */}
          <View style={styles.digitRow}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={r => { inputRefs.current[i] = r; }}
                style={[styles.digitBox, d && styles.digitBoxFilled]}
                value={d}
                onChangeText={v => handleDigitChange(i, v)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={i === 0 ? OTP_LENGTH : 1}
                textContentType="oneTimeCode"
                autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                selectTextOnFocus
                returnKeyType="done"
              />
            ))}
          </View>

          {/* Verify button */}
          <IOSButton
            title={isFilled ? '✓  Verify Code' : 'Enter 6-digit code'}
            loading={loading}
            disabled={!isFilled}
            onPress={() => verify(otp)}
            variant={isFilled ? 'filled' : 'outline'}
            style={{ marginTop: 8 }}
          />

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive the code? </Text>
            <Pressable onPress={resend} disabled={resendTimer > 0 || resending}>
              <Text style={[styles.resendBtn, resendTimer > 0 && styles.resendBtnDisabled]}>
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
              </Text>
            </Pressable>
          </View>

          {__DEV__ && (
            <Text style={styles.devHint}>
              Check server logs for your OTP code.
            </Text>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemGroupedBackground },
  header: { paddingHorizontal: 20, paddingBottom: 36, alignItems: 'center' },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 20 },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '600' },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  iconEmoji: { fontSize: 32 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  phoneText: { color: '#fff', fontWeight: '700' },
  body: { flex: 1, padding: 24 },
  digitRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 8, marginBottom: 28 },
  digitBox: {
    width: 48, height: 58, borderRadius: 14,
    backgroundColor: Colors.systemBackground,
    borderWidth: 2, borderColor: Colors.systemGray5,
    fontSize: 24, fontWeight: '700', color: Colors.label,
    textAlign: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  digitBoxFilled: { borderColor: Colors.systemBlue, backgroundColor: '#EFF6FF' },
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  resendLabel: { fontSize: 14, color: Colors.secondaryLabel },
  resendBtn: { fontSize: 14, fontWeight: '700', color: Colors.systemBlue },
  resendBtnDisabled: { color: Colors.tertiaryLabel },
  devHint: { textAlign: 'center', fontSize: 11, color: Colors.tertiaryLabel, marginTop: 24, lineHeight: 16 },
});
