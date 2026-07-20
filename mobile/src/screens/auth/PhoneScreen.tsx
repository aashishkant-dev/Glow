import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { ShieldCheckIcon, CheckDecagramIcon } from '../../components/CareIcons';
import { MirrorIcon, CrownIcon } from '../../components/BeautyIcons';
import { apiLogin, apiGoogleSignIn, apiRegisterEmail, apiLoginEmail, apiForgotPassword } from '../../api/client';
import { Colors, Fonts } from '../../utils/colors';
import { GlowLogo, GlowMark, GlowTagline } from '../../components/GlowLogo';
import { DEFAULT_REGION_NAME } from '../../utils/region';
import { useAuth } from '../../context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

type Role = 'CUSTOMER' | 'Provider' | 'SALON';

/** Slow-drifting soft glow blob — pure Animated, works on web + native. */
function GlowParticle({ size, x, y, delay, color }: { size: number; x: number; y: number; delay: number; color: string }) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 5200 + delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 5200 + delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(t); loop.stop(); };
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: x, top: y,
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color,
        opacity: drift.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] }),
        transform: [
          { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
          { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) },
        ],
      }}
    />
  );
}

export function PhoneScreen() {
  const nav    = useNavigation<any>();
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [isNewUser, setIsNewUser] = useState(true);
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [role,    setRole]    = useState<Role>('CUSTOMER');
  const [loading, setLoading] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  // Customers land on Google/Email by default — phone is reachable only via the
  // "I'm an artist" link below, since Providers still onboard (and verify) by
  // phone. Customers who don't use Google/Email get their phone collected and
  // verified later, at first-booking-confirm (VerifyPhoneSheet), not at login.
  const [authMode, setAuthMode] = useState<'phone' | 'google' | 'email'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const ctaScale = useRef(new Animated.Value(1)).current;
  const heroFade = useRef(new Animated.Value(0)).current;

  // Google.useAuthRequest's internal useMemo throws synchronously (invariantClientId)
  // if the platform-relevant client ID is missing — e.g. a build without
  // EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB set. That crash previously took down this whole
  // screen on mount. The hook always falls back to `clientId` when the platform-specific
  // id is unset, so passing a non-empty placeholder there keeps the hook from throwing;
  // `googleConfigured` gates the button so the placeholder is never actually used to
  // start a real auth flow.
  const googleConfigured = Platform.OS === 'web'
    ? !!process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB
    : !!(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID);
  const [, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
    webClientId:     process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
    clientId:        'google-auth-not-configured',
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.authentication?.idToken || (googleResponse.params as any)?.id_token;
      if (idToken) googleSignIn(idToken);
    }
  }, [googleResponse]);

  useEffect(() => {
    Animated.timing(heroFade, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  function formatPhone(raw: string) {
    const d = raw.replace(/\D/g, '');
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 10)}`;
  }

  // Reformatting the controlled value on every keystroke snaps the cursor to
  // the end, which made editing the middle of the number impossible. Only
  // auto-insert dashes when appending; onBlur normalizes.
  function handlePhoneChange(next: string) {
    const cleaned = next.replace(/[^\d-]/g, '');
    const appending = cleaned.length > phone.length && cleaned.startsWith(phone);
    setPhone(appending ? formatPhone(cleaned) : cleaned);
  }

  function formatName(raw: string) {
    return raw.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 50);
  }

  function getE164() {
    const d = phone.replace(/\D/g, '');
    return d.length === 10 ? `+1${d}` : `+${d}`;
  }

  function isPhoneValid() {
    return phone.replace(/\D/g, '').length >= 7;
  }

  function isFormValid() {
    if (!isPhoneValid()) return false;
    if (isNewUser && name.trim().length < 2) return false;
    if (isNewUser && !ageConfirmed) return false;
    return true;
  }

  async function login(selectedRole: Role) {
    if (!isPhoneValid()) return;
    if (isNewUser && name.trim().length < 2) {
      if (Platform.OS === 'web') alert('Please enter your full name before continuing.');
      else Alert.alert('Name Required', 'Please enter your full name before continuing.');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await apiLogin({
        phone: getE164(),
        name:  isNewUser ? name.trim() : undefined,
        role:  isNewUser ? selectedRole : undefined,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await signIn(token, {
        id: user.id, name: user.name, phone: user.phone ?? undefined,
        role: user.role as 'CUSTOMER' | 'Provider' | 'ADMIN' | 'SALON',
        onboardingComplete: user.onboardingComplete,
      });
    } catch (e: any) {
      const msg = e.message || 'Failed to sign in. Please try again.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    }
    setLoading(false);
  }

  async function googleSignIn(idToken: string) {
    setLoading(true);
    try {
      const { token, user } = await apiGoogleSignIn({ idToken });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await signIn(token, {
        id: user.id, name: user.name, phone: user.phone ?? undefined,
        role: user.role as 'CUSTOMER' | 'Provider' | 'ADMIN' | 'SALON',
        onboardingComplete: user.onboardingComplete,
      });
    } catch (e: any) {
      const msg = e.message || 'Google sign-in failed. Please try again.';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
    }
    setLoading(false);
  }

  async function emailAuth() {
    if (!email.includes('@')) {
      if (Platform.OS === 'web') alert('Enter a valid email.'); else Alert.alert('Email Required', 'Enter a valid email.');
      return;
    }
    if (password.length < 8) {
      if (Platform.OS === 'web') alert('Password must be at least 8 characters.'); else Alert.alert('Password Too Short', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = isNewUser
        ? await apiRegisterEmail({ email: email.trim(), password, name: name.trim() || 'Glow User' })
        : await apiLoginEmail({ email: email.trim(), password });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await signIn(token, {
        id: user.id, name: user.name, phone: user.phone ?? undefined,
        role: user.role as 'CUSTOMER' | 'Provider' | 'ADMIN' | 'SALON',
        onboardingComplete: user.onboardingComplete,
      });
    } catch (e: any) {
      const msg = e.message || 'Failed to sign in. Please try again.';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
    }
    setLoading(false);
  }

  async function sendForgotPassword() {
    if (!email.includes('@')) return;
    setLoading(true);
    try {
      await apiForgotPassword({ email: email.trim() });
      setForgotSent(true);
    } catch (e: any) {
      const msg = e.message || 'Failed to send reset email.';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
    }
    setLoading(false);
  }

  function pressCta(pressed: boolean) {
    Animated.spring(ctaScale, { toValue: pressed ? 0.96 : 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  }

  return (
    <View style={styles.container}>
      {/* Floating glow field behind everything */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <GlowParticle size={220} x={-70}  y={-40}  delay={0}    color={Colors.brandLight} />
        <GlowParticle size={140} x={260}  y={60}   delay={800}  color={Colors.goldSoft} />
        <GlowParticle size={90}  x={40}   y={210}  delay={1600} color={Colors.brandLight} />
        <GlowParticle size={10}  x={120}  y={120}  delay={400}  color={Colors.brandAccent} />
        <GlowParticle size={7}   x={310}  y={190}  delay={1200} color={Colors.gold} />
        <GlowParticle size={12}  x={330}  y={40}   delay={2000} color={Colors.brandAccent} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero ── */}
          <Animated.View style={[styles.hero, { opacity: heroFade, transform: [{ translateY: heroFade.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
            <GlowLogo size={44} showWordmark variant="onLight" />
            <Text style={styles.heroTitle}>Your glow,{'\n'}on demand.</Text>
            <Text style={styles.heroSub}>Verified beauty artists, at your door or in the salon — booked in minutes.</Text>
            <View style={{ marginTop: 14 }}>
              <GlowTagline />
            </View>
          </Animated.View>

          {/* ── Form card ── */}
          <View style={styles.formCard}>
            {/* Auth mode toggle — customers pick Google or Email. Phone is reached
                only via the "I'm an artist" link, not this toggle. */}
            {authMode !== 'phone' && (
              <View style={[styles.segment, { marginBottom: 14 }]}>
                {[{ label: 'Google', value: 'google' as const }, { label: 'Email', value: 'email' as const }].map(t => (
                  <Pressable
                    key={t.label}
                    style={[styles.segmentBtn, authMode === t.value && styles.segmentBtnActive]}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.selectionAsync();
                      setAuthMode(t.value);
                      setForgotMode(false);
                      setForgotSent(false);
                    }}
                  >
                    <Text style={[styles.segmentText, authMode === t.value && styles.segmentTextActive]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {authMode === 'phone' && (
              <>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}
                  onPress={() => { setAuthMode('google'); setRole('CUSTOMER'); }}
                >
                  <Text style={{ fontSize: 14, color: Colors.brandDark }}>← Back to Google / Email</Text>
                </Pressable>

                {/* Segmented control */}
                <View style={styles.segment}>
                  {[{ label: 'New here', value: true }, { label: 'Returning', value: false }].map(t => (
                    <Pressable
                      key={t.label}
                      style={[styles.segmentBtn, isNewUser === t.value && styles.segmentBtnActive]}
                      onPress={() => {
                        if (Platform.OS !== 'web') Haptics.selectionAsync();
                        setIsNewUser(t.value);
                      }}
                    >
                      <Text style={[styles.segmentText, isNewUser === t.value && styles.segmentTextActive]}>
                        {t.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Name */}
                {isNewUser && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Full name</Text>
                    <TextInput
                      style={styles.textInput}
                      value={name}
                      onChangeText={v => setName(formatName(v))}
                      placeholder="Your name"
                      placeholderTextColor={Colors.tertiaryLabel}
                      autoCapitalize="words"
                      autoCorrect={false}
                      returnKeyType="next"
                    />
                  </View>
                )}

                {/* Phone */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Phone number</Text>
                  <View style={styles.phoneRow}>
                    <View style={styles.countryBadge}>
                      <Text style={styles.countryFlag}>🇨🇦</Text>
                      <Text style={styles.countryCode}>+1</Text>
                    </View>
                    <TextInput
                      style={[styles.textInput, styles.phoneInput]}
                      value={phone}
                      onChangeText={handlePhoneChange}
                      onBlur={() => setPhone(formatPhone(phone))}
                      placeholder="416-555-0100"
                      placeholderTextColor={Colors.tertiaryLabel}
                      keyboardType="phone-pad"
                      maxLength={12}
                      returnKeyType="done"
                      onSubmitEditing={() => login(role)}
                    />
                  </View>
                </View>

                {/* Phone signup is reached only via "I'm an artist" (role is preset to
                    Provider on entry), so there's no role picker here anymore — the
                    old Customer/Artist choice moved to the top-level Google/Email vs.
                    phone split. "Returning" phone logins still work for any existing
                    role (customer accounts created before this change included). */}
                {isNewUser && (
                  <View style={[styles.roleCard, styles.roleCardSelected, { marginBottom: 18 }]}>
                    <View style={[styles.roleIconWrap, { backgroundColor: Colors.brandLight }]}>
                      <MirrorIcon size={20} color={Colors.brand} />
                    </View>
                    <Text style={[styles.roleLabel, { color: Colors.label }]}>Signing up as an artist</Text>
                    <Text style={styles.roleSub}>Grow your business — find clients & earn</Text>
                  </View>
                )}

                {/* Age confirmation */}
                {isNewUser && (
                  <Pressable
                    style={styles.checkboxRow}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.selectionAsync();
                      setAgeConfirmed(!ageConfirmed);
                    }}
                  >
                    <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
                      {ageConfirmed && <Text style={styles.checkboxCheck}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>I confirm I'm 18 or older</Text>
                  </Pressable>
                )}

                {/* Terms */}
                {isNewUser && (
                  <Text style={styles.agreeText}>
                    By continuing you agree to our{' '}
                    <Text style={styles.agreeLink} onPress={() => Linking.openURL('https://ca.glow.app/terms')}>Terms</Text>
                    {' '}and{' '}
                    <Text style={styles.agreeLink} onPress={() => Linking.openURL('https://ca.glow.app/privacy')}>Privacy Policy</Text>.
                  </Text>
                )}

                {/* CTA */}
                <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
                  <Pressable
                    style={[styles.ctaBtn, !isFormValid() && styles.ctaBtnDisabled]}
                    onPress={() => login(role)}
                    onPressIn={() => pressCta(true)}
                    onPressOut={() => pressCta(false)}
                    disabled={!isFormValid() || loading}
                  >
                    <Text style={styles.ctaBtnText}>{loading ? 'Sending…' : 'Continue'}</Text>
                    {!loading && <Text style={styles.ctaArrowText}>→</Text>}
                  </Pressable>
                </Animated.View>

                <Text style={styles.disclaimer}>Standard message and data rates may apply.</Text>

                {/* Salon & Business — quiet secondary */}
                {isNewUser && (
                  <Pressable
                    style={({ pressed }) => [styles.salonBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => login('SALON')}
                    disabled={loading}
                  >
                    <CrownIcon size={18} color={Colors.gold} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.salonTitle}>Salon &amp; Business</Text>
                      <Text style={styles.salonSub}>Book artists for your salon, event or team</Text>
                    </View>
                    <Text style={styles.salonArrow}>→</Text>
                  </Pressable>
                )}
              </>
            )}

            {authMode === 'google' && (
              <View style={{ paddingVertical: 8 }}>
                <Pressable
                  style={[styles.ctaBtn, { backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.separator }, !googleConfigured && styles.ctaBtnDisabled]}
                  onPress={() => googleConfigured && promptGoogleAsync()}
                  disabled={loading || !googleConfigured}
                >
                  <Text style={[styles.ctaBtnText, { color: Colors.label }]}>
                    {loading ? 'Signing in…' : googleConfigured ? 'Continue with Google' : 'Google sign-in unavailable'}
                  </Text>
                </Pressable>
                <Text style={styles.disclaimer}>Google sign-in is for customers only. Artists sign up with a phone number.</Text>
              </View>
            )}

            {authMode === 'email' && !forgotMode && (
              <View>
                <View style={styles.segment}>
                  {[{ label: 'New here', value: true }, { label: 'Returning', value: false }].map(t => (
                    <Pressable
                      key={t.label}
                      style={[styles.segmentBtn, isNewUser === t.value && styles.segmentBtnActive]}
                      onPress={() => { if (Platform.OS !== 'web') Haptics.selectionAsync(); setIsNewUser(t.value); }}
                    >
                      <Text style={[styles.segmentText, isNewUser === t.value && styles.segmentTextActive]}>{t.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {isNewUser && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Full name</Text>
                    <TextInput
                      style={styles.textInput}
                      value={name}
                      onChangeText={v => setName(formatName(v))}
                      placeholder="Your name"
                      placeholderTextColor={Colors.tertiaryLabel}
                      autoCapitalize="words"
                    />
                  </View>
                )}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.textInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={Colors.tertiaryLabel}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <View style={styles.phoneRow}>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="At least 8 characters"
                      placeholderTextColor={Colors.tertiaryLabel}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable style={styles.countryBadge} onPress={() => setShowPassword(s => !s)}>
                      <Text style={styles.countryCode}>{showPassword ? 'Hide' : 'Show'}</Text>
                    </Pressable>
                  </View>
                </View>
                <Pressable style={[styles.ctaBtn, (!email.includes('@') || password.length < 8) && styles.ctaBtnDisabled]} onPress={emailAuth} disabled={loading || !email.includes('@') || password.length < 8}>
                  <Text style={styles.ctaBtnText}>{loading ? 'Please wait…' : isNewUser ? 'Create account' : 'Sign in'}</Text>
                </Pressable>
                {!isNewUser && (
                  <Pressable style={{ marginTop: 14, alignItems: 'center' }} onPress={() => setForgotMode(true)}>
                    <Text style={styles.agreeLink}>Forgot password?</Text>
                  </Pressable>
                )}
              </View>
            )}

            {authMode === 'email' && forgotMode && (
              <View>
                {forgotSent ? (
                  <Text style={styles.disclaimer}>If an account exists for that email, a reset link has been sent. Check your inbox.</Text>
                ) : (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Email</Text>
                      <TextInput
                        style={styles.textInput}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="you@example.com"
                        placeholderTextColor={Colors.tertiaryLabel}
                        autoCapitalize="none"
                        keyboardType="email-address"
                      />
                    </View>
                    <Pressable style={[styles.ctaBtn, !email.includes('@') && styles.ctaBtnDisabled]} onPress={sendForgotPassword} disabled={loading || !email.includes('@')}>
                      <Text style={styles.ctaBtnText}>{loading ? 'Sending…' : 'Send reset link'}</Text>
                    </Pressable>
                  </>
                )}
                <Pressable style={{ marginTop: 14, alignItems: 'center' }} onPress={() => { setForgotMode(false); setForgotSent(false); }}>
                  <Text style={styles.agreeLink}>Back to sign in</Text>
                </Pressable>
              </View>
            )}

            {/* Artist entry — the only door into phone signup, since Providers
                still onboard by phone (needed for SMS job dispatch). */}
            {authMode !== 'phone' && !forgotMode && (
              <Pressable
                style={({ pressed }) => [styles.salonBtn, pressed && { opacity: 0.8 }]}
                onPress={() => { setAuthMode('phone'); setIsNewUser(true); setRole('Provider'); }}
                disabled={loading}
              >
                <MirrorIcon size={18} color={Colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.salonTitle}>I'm an artist</Text>
                  <Text style={styles.salonSub}>Sign up with your phone number to grow your business</Text>
                </View>
                <Text style={styles.salonArrow}>→</Text>
              </Pressable>
            )}
          </View>

          {/* Trust row */}
          <View style={styles.trustStrip}>
            {([
              [ShieldCheckIcon,   'Verified artists'],
              [CheckDecagramIcon, 'Background checked'],
            ] as const).map(([Icon, label]) => (
              <View key={label} style={styles.trustItem}>
                <Icon size={15} color={Colors.brand} />
                <Text style={styles.trustText}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.footerMark}>
            <GlowMark size={22} petal={Colors.opaqueSeparator} core={Colors.opaqueSeparator} />
            <Text style={styles.copyright}>© {new Date().getFullYear()} Glow · {DEFAULT_REGION_NAME}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemGroupedBackground },
  scrollContent: { flexGrow: 1, paddingBottom: 28, paddingHorizontal: 24 },

  hero: { marginBottom: 28 },
  heroTitle: {
    fontSize: 40, lineHeight: 46, fontFamily: Fonts.bold, color: Colors.label,
    letterSpacing: -1.2, marginTop: 26,
  },
  heroSub: { fontSize: 16, lineHeight: 23, color: Colors.secondaryLabel, marginTop: 12, maxWidth: 320, fontFamily: Fonts.regular },

  formCard: {
    backgroundColor: '#fff', borderRadius: 28, padding: 24,
    borderWidth: 1, borderColor: Colors.separator,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.07, shadowRadius: 34, elevation: 5,
  },

  segment: {
    flexDirection: 'row', backgroundColor: Colors.systemGray5,
    borderRadius: 14, padding: 3, marginBottom: 24,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  segmentBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  segmentText: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.secondaryLabel },
  segmentTextActive: { color: Colors.label, fontFamily: Fonts.semibold },

  inputGroup: { marginBottom: 18 },
  inputLabel: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.secondaryLabel, marginBottom: 8 },
  textInput: {
    backgroundColor: Colors.systemGroupedBackground, borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 15,
    fontSize: 16, color: Colors.label, borderWidth: 1, borderColor: Colors.separator,
    fontFamily: Fonts.regular,
  },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  countryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.systemGroupedBackground, borderRadius: 16,
    paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.separator,
  },
  countryFlag: { fontSize: 17 },
  countryCode: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label },
  phoneInput: { flex: 1, fontSize: 16, letterSpacing: 0.4 },

  roleRow: { flexDirection: 'row', gap: 10 },
  roleCard: {
    flex: 1, backgroundColor: Colors.systemGroupedBackground, borderRadius: 18, padding: 14,
    borderWidth: 1.5, borderColor: Colors.separator, gap: 5,
  },
  roleCardSelected: { backgroundColor: '#fff', borderColor: Colors.brand },
  roleIconWrap: {
    width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.systemGray5, marginBottom: 3,
  },
  roleLabel: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  roleSub: { fontSize: 11.5, color: Colors.tertiaryLabel, lineHeight: 15.5, fontFamily: Fonts.regular },
  roleCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  roleCheckText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6, paddingVertical: 8 },
  checkbox: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.systemGray3,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  checkboxChecked: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  checkboxCheck: { color: '#fff', fontSize: 12, fontWeight: '700' },
  checkboxLabel: { flex: 1, fontSize: 13.5, color: Colors.label, fontFamily: Fonts.regular },

  agreeText: { fontSize: 12, color: Colors.tertiaryLabel, marginBottom: 16, lineHeight: 18, fontFamily: Fonts.regular },
  agreeLink: { color: Colors.brandDark, textDecorationLine: 'underline' },

  ctaBtn: {
    borderRadius: 18, backgroundColor: Colors.brand,
    paddingVertical: 17,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 7,
  },
  ctaBtnDisabled: { backgroundColor: Colors.systemGray4, shadowOpacity: 0 },
  ctaBtnText: { color: '#fff', fontSize: 16.5, fontFamily: Fonts.semibold },
  ctaArrowText: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontFamily: Fonts.semibold },

  disclaimer: { fontSize: 11.5, color: Colors.tertiaryLabel, textAlign: 'center', marginTop: 14, lineHeight: 16, fontFamily: Fonts.regular },

  salonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 18, paddingTop: 18,
    borderTopWidth: 1, borderTopColor: Colors.separator,
  },
  salonTitle: { fontSize: 13.5, fontFamily: Fonts.semibold, color: Colors.label },
  salonSub: { fontSize: 11.5, color: Colors.tertiaryLabel, marginTop: 1, fontFamily: Fonts.regular },
  salonArrow: { fontSize: 16, color: Colors.tertiaryLabel },

  trustStrip: { flexDirection: 'row', justifyContent: 'center', gap: 26, paddingVertical: 22 },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trustText: { fontSize: 12, color: Colors.secondaryLabel, fontFamily: Fonts.medium },

  footerMark: { alignItems: 'center', gap: 8 },
  copyright: { fontSize: 11, color: Colors.tertiaryLabel, fontFamily: Fonts.regular },
});
