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
import * as AppleAuthentication from 'expo-apple-authentication';
import { ShieldCheckIcon, CheckDecagramIcon, GoogleLogoIcon } from '../../components/CareIcons';
import { MirrorIcon, CrownIcon } from '../../components/BeautyIcons';
import { apiLogin, apiGoogleSignIn, apiAppleSignIn, apiSendLoginOtp } from '../../api/client';
import { Colors, Fonts } from '../../utils/colors';
import { GlowLogo, GlowMark, GlowTagline } from '../../components/GlowLogo';
import { CountryPicker, Country } from '../../components/CountryPicker';
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
  const [country, setCountry] = useState<Country | null>(null);
  const [phone,   setPhone]   = useState('');
  const [role,    setRole]    = useState<Role>('CUSTOMER');
  const [loading, setLoading] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  // Phone login is a two-step flow: send an OTP to the entered number, then
  // verify it before a token is ever issued. `otpSent` gates which step shows;
  // `otpPhone` freezes the number the code was sent to, so editing the phone
  // field afterward doesn't silently verify a code against a different number.
  const [otpSent, setOtpSent] = useState(false);
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const ctaScale = useRef(new Animated.Value(1)).current;
  const heroFade = useRef(new Animated.Value(0)).current;
  // Only true on iOS 13+ devices signed into an Apple ID — never on Android/web,
  // where the native Apple button can't render at all. Starts false so the
  // button never flashes in on platforms that can't support it.
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

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
  // useAuthRequest (not useIdTokenAuthRequest) defaults to ResponseType.Token on
  // web — an access token, not an ID token. Our backend (verifyGoogleIdToken)
  // needs an ID token, so the sign-in silently produced nothing to send it after
  // Google granted access. useIdTokenAuthRequest requests ResponseType.IdToken on
  // web, which is what actually gets read below via googleResponse.params.id_token.
  const [, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
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

  // NANP (Canada) dash-groups as 3-3-4; other countries' numbering plans don't
  // match that shape, so only Canada gets the auto-dash formatting.
  function formatPhone(raw: string) {
    const d = raw.replace(/\D/g, '');
    if (country?.code !== 'CA') return d;
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
    return `${country?.dialCode ?? ''}${d}`;
  }

  // NANP (Canada) numbers are always exactly 10 digits; Nepal mobile numbers
  // are also 10 digits (starting with 9). A loose ">= 7" check let obviously
  // wrong numbers (e.g. 7 random digits) through to the OTP send call.
  function isPhoneValid() {
    return phone.replace(/\D/g, '').length === 10;
  }

  function isFormValid() {
    if (!country) return false;
    if (!isPhoneValid()) return false;
    if (isNewUser && name.trim().length < 2) return false;
    if (isNewUser && !ageConfirmed) return false;
    return true;
  }

  // Step 1: send the OTP. `selectedRole` is captured now (before the OTP step)
  // since the Salon & Business button skips the role picker entirely and the
  // regular CTA needs whatever `role` was chosen — both need to reach step 2.
  const pendingRoleRef = useRef<Role>('CUSTOMER');

  async function requestOtp(selectedRole: Role) {
    if (!isPhoneValid()) return;
    if (isNewUser && name.trim().length < 2) {
      if (Platform.OS === 'web') alert('Please enter your full name before continuing.');
      else Alert.alert('Name Required', 'Please enter your full name before continuing.');
      return;
    }
    pendingRoleRef.current = selectedRole;
    setSendingOtp(true);
    try {
      await apiSendLoginOtp(getE164());
      setOtpPhone(getE164());
      setOtpSent(true);
      setOtpCode('');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      const msg = e.message || 'Could not send code. Please try again.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    }
    setSendingOtp(false);
  }

  // Step 2: verify the code and actually log in. Takes the code explicitly
  // (rather than reading `otpCode` state) so the auto-submit-on-6th-digit
  // effect below can call this the instant the last digit lands, without
  // waiting for a state update to flush first.
  async function verifyOtp(codeOverride?: string) {
    const code = codeOverride ?? otpCode;
    if (code.replace(/\D/g, '').length !== 6) return;
    setLoading(true);
    try {
      const { token, user } = await apiLogin({
        phone: otpPhone,
        otp:   code.trim(),
        name:  isNewUser ? name.trim() : undefined,
        role:  isNewUser ? pendingRoleRef.current : undefined,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await signIn(token, {
        id: user.id, name: user.name, phone: user.phone ?? undefined,
        role: user.role as 'CUSTOMER' | 'Provider' | 'ADMIN' | 'SALON',
        onboardingComplete: user.onboardingComplete,
        phoneVerified: user.phoneVerified,
      });
    } catch (e: any) {
      const msg = e.message || 'Invalid code. Please try again.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    }
    setLoading(false);
  }

  async function googleSignIn(idToken: string) {
    setLoading(true);
    try {
      // Same role choice used for phone signup applies here too — Google no
      // longer implies "customer," it just means "skip the phone/OTP step for
      // login" (artists still verify their phone right after, separately).
      const { token, user } = await apiGoogleSignIn({ idToken, role: role === 'Provider' ? 'Provider' : 'CUSTOMER' });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await signIn(token, {
        id: user.id, name: user.name, phone: user.phone ?? undefined,
        role: user.role as 'CUSTOMER' | 'Provider' | 'ADMIN' | 'SALON',
        onboardingComplete: user.onboardingComplete,
        phoneVerified: user.phoneVerified,
      });
    } catch (e: any) {
      const msg = e.message || 'Google sign-in failed. Please try again.';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
    }
    setLoading(false);
  }

  // Apple only returns `fullName` on the VERY FIRST authorization ever for this
  // app+Apple-ID pair — every sign-in after that omits it entirely, so it must
  // be captured and forwarded here right when it's available, never re-asked.
  async function appleSignIn() {
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
      const name = credential.fullName
        ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ').trim()
        : undefined;
      const { token, user } = await apiAppleSignIn({
        idToken: credential.identityToken,
        role: role === 'Provider' ? 'Provider' : 'CUSTOMER',
        name: name || undefined,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await signIn(token, {
        id: user.id, name: user.name, phone: user.phone ?? undefined,
        role: user.role as 'CUSTOMER' | 'Provider' | 'ADMIN' | 'SALON',
        onboardingComplete: user.onboardingComplete,
        phoneVerified: user.phoneVerified,
      });
    } catch (e: any) {
      // User-cancelled the native sheet — not an error worth surfacing.
      if (e.code === 'ERR_REQUEST_CANCELED') { setLoading(false); return; }
      const msg = e.message || 'Apple sign-in failed. Please try again.';
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

          {/* ── Form card ──
              Google + phone are both always visible on one screen — no mode
              switch/link between them. Both customers AND artists can use
              Google now; the shared role picker above decides which. Phone
              stays available for anyone without a Google account, and is
              still the only way to reach the Salon & Business role. */}
          <View style={styles.formCard}>
            {/* Role choice — shared by Google AND phone signup. Google used to be
                hardcoded to create customer accounts only; it now just means "skip
                the phone/OTP step to log in," while artists still verify their
                phone separately right after. Returning users don't need this —
                their role is already set. */}
            {isNewUser && (
              <View style={[styles.inputGroup, { marginBottom: 14 }]}>
                <Text style={styles.inputLabel}>I'm here to</Text>
                <View style={styles.roleRow}>
                  {([
                    { key: 'CUSTOMER' as const, label: 'Book beauty', sub: 'Makeup, hair, nails & more', Icon: CrownIcon },
                    { key: 'Provider' as const, label: "I'm an artist", sub: 'Grow your business & earn', Icon: MirrorIcon },
                  ]).map(r => {
                    const selected = role === r.key;
                    return (
                      <Pressable
                        key={r.key}
                        style={[styles.roleCard, selected && styles.roleCardSelected]}
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.selectionAsync();
                          setRole(r.key);
                        }}
                      >
                        <View style={[styles.roleIconWrap, selected && { backgroundColor: Colors.brandLight }]}>
                          <r.Icon size={20} color={selected ? Colors.brand : Colors.secondaryLabel} />
                        </View>
                        <Text style={[styles.roleLabel, selected && { color: Colors.label }]}>{r.label}</Text>
                        <Text style={styles.roleSub} numberOfLines={2}>{r.sub}</Text>
                        {selected && (
                          <View style={styles.roleCheck}>
                            <Text style={styles.roleCheckText}>✓</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={18}
                style={styles.appleBtn}
                onPress={appleSignIn}
              />
            )}

            <Pressable
              style={[styles.ctaBtn, styles.googleBtn, !googleConfigured && styles.ctaBtnDisabled]}
              onPress={() => googleConfigured && promptGoogleAsync()}
              disabled={loading || !googleConfigured}
            >
              <GoogleLogoIcon size={19} />
              <Text style={[styles.ctaBtnText, { color: Colors.label }]}>
                {loading ? 'Signing in…' : googleConfigured ? 'Continue with Google' : 'Google sign-in unavailable'}
              </Text>
            </Pressable>
            {role === 'Provider' && (
              <Text style={styles.disclaimer}>You'll verify your phone right after signing in with {appleAvailable ? 'Apple or Google' : 'Google'}.</Text>
            )}

            <View style={styles.orDivider}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.orLine} />
            </View>

            {/* New here/Returning toggle — restored. A prior pass removed this
                    along with the standalone "I'm an artist" entry point, which left
                    NEW phone signups (customer AND artist) with no way to enter a
                    name or pick a role — the backend correctly demanded them, but
                    nothing in the UI could satisfy that. This is the fix. */}
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

                {!otpSent ? (
                  <>
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
                        <CountryPicker
                          value={country}
                          onChange={c => { setCountry(c); setPhone(''); }}
                        />
                        <TextInput
                          style={[styles.textInput, styles.phoneInput]}
                          value={phone}
                          onChangeText={handlePhoneChange}
                          onBlur={() => setPhone(formatPhone(phone))}
                          placeholder={!country ? 'Select country first' : country.code === 'CA' ? '705-555-0100' : '98XXXXXXXX'}
                          placeholderTextColor={Colors.tertiaryLabel}
                          keyboardType="phone-pad"
                          maxLength={12}
                          editable={!!country}
                          returnKeyType="done"
                          onSubmitEditing={() => requestOtp(role)}
                        />
                      </View>
                    </View>

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
                        <Text style={styles.agreeLink} onPress={() => Linking.openURL('https://glow-landing-five.vercel.app/terms')}>Terms</Text>
                        {' '}and{' '}
                        <Text style={styles.agreeLink} onPress={() => Linking.openURL('https://glow-landing-five.vercel.app/privacy')}>Privacy Policy</Text>.
                      </Text>
                    )}

                    {/* CTA — sends the OTP, doesn't log in yet */}
                    <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
                      <Pressable
                        style={[styles.ctaBtn, !isFormValid() && styles.ctaBtnDisabled]}
                        onPress={() => requestOtp(role)}
                        onPressIn={() => pressCta(true)}
                        onPressOut={() => pressCta(false)}
                        disabled={!isFormValid() || sendingOtp}
                      >
                        <Text style={styles.ctaBtnText}>{sendingOtp ? 'Sending code…' : 'Continue'}</Text>
                        {!sendingOtp && <Text style={styles.ctaArrowText}>→</Text>}
                      </Pressable>
                    </Animated.View>

                    <Text style={styles.disclaimer}>We'll text you a 6-digit code. Standard message and data rates may apply.</Text>

                    {/* Salon & Business — quiet secondary */}
                    {isNewUser && (
                      <Pressable
                        style={({ pressed }) => [styles.salonBtn, pressed && { opacity: 0.8 }]}
                        onPress={() => requestOtp('SALON')}
                        disabled={sendingOtp}
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
                ) : (
                  <>
                    {/* OTP verify step */}
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}
                      onPress={() => { setOtpSent(false); setOtpCode(''); }}
                      disabled={loading}
                    >
                      <Text style={{ fontSize: 14, color: Colors.brandDark }}>← Change number</Text>
                    </Pressable>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Enter the 6-digit code</Text>
                      <Text style={styles.otpSentTo}>Sent to {country?.dialCode} {phone}</Text>
                      <TextInput
                        style={[styles.textInput, styles.otpInput]}
                        value={otpCode}
                        onChangeText={v => {
                          const clean = v.replace(/\D/g, '').slice(0, 6);
                          setOtpCode(clean);
                          if (clean.length === 6) verifyOtp(clean);
                        }}
                        placeholder="123456"
                        placeholderTextColor={Colors.tertiaryLabel}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus
                        editable={!loading}
                        textContentType="oneTimeCode"
                        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                        returnKeyType="done"
                        onSubmitEditing={() => verifyOtp()}
                      />
                    </View>

                    {loading && (
                      <Text style={[styles.disclaimer, { marginTop: 4 }]}>Verifying…</Text>
                    )}

                    <Pressable
                      style={{ marginTop: 16, alignItems: 'center' }}
                      onPress={() => requestOtp(pendingRoleRef.current)}
                      disabled={sendingOtp || loading}
                    >
                      <Text style={styles.agreeLink}>{sendingOtp ? 'Resending…' : "Didn't get a code? Resend"}</Text>
                    </Pressable>
                  </>
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
  otpSentTo: { fontSize: 12.5, color: Colors.tertiaryLabel, marginTop: -4, marginBottom: 10, fontFamily: Fonts.regular },
  otpInput: { fontSize: 22, letterSpacing: 6, textAlign: 'center', fontFamily: Fonts.semibold },

  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch', minWidth: 0 },
  phoneInput: { flex: 1, minWidth: 0, fontSize: 16, letterSpacing: 0.4 },

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

  googleBtn: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.separator,
    shadowOpacity: 0.06,
  },
  appleBtn: { height: 54, marginBottom: 12 },

  orDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.separator },
  orText: { fontSize: 12.5, color: Colors.tertiaryLabel, fontFamily: Fonts.medium },

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
