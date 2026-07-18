import React, { useState } from 'react';
import {
  Alert,
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
import {
  ShieldCheckIcon,
  BriefcaseAccountIcon,
  HospitalIcon,
  CreditCardIcon,
  PinIcon,
  CustomerMark,
  ProviderMark,
  PersonalCareIcon,
  MedicalBagIcon,
} from '../../components/CareIcons';
import { apiLogin } from '../../api/client';
import { Colors } from '../../utils/colors';
import { GlowLogo } from '../../components/GlowLogo';

type Role = 'CUSTOMER' | 'Provider' | 'SALON';

const MAIN_ROLES: { key: Role; label: string; sub: string; Icon: React.ComponentType<{ size?: number; color?: string }>; color: string }[] = [
  { key: 'CUSTOMER', label: 'Book beauty services', sub: 'Makeup, hair, nails, mehendi & more — at home or in the salon', Icon: PersonalCareIcon, color: Colors.brand },
  { key: 'Provider', label: "I'm a beauty artist",  sub: 'Grow your business — find clients & earn', Icon: MedicalBagIcon, color: Colors.brandAccent },
];

export function PhoneScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [isNewUser, setIsNewUser] = useState(true);
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [role,    setRole]    = useState<Role>('CUSTOMER');
  const [loading, setLoading] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  function formatPhone(raw: string) {
    const d = raw.replace(/\D/g, '');
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 10)}`;
  }

  // Reformatting the controlled value on every keystroke snaps the cursor to
  // the end, which made editing the middle of the number impossible (the whole
  // thing had to be retyped). Only auto-insert dashes when the user is
  // appending at the end; mid-string edits keep the text (and cursor) as
  // typed, then onBlur normalizes the dashes.
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

  async function sendOTP(selectedRole: Role) {
    if (!isPhoneValid()) return;
    if (isNewUser && name.trim().length < 2) {
      if (Platform.OS === 'web') alert('Please enter your full name before continuing.');
      else Alert.alert('Name Required', 'Please enter your full name before continuing.');
      return;
    }
    setLoading(true);
    try {
      await apiLogin({
        phone: getE164(),
        name:  isNewUser ? name.trim() : undefined,
        role:  isNewUser ? selectedRole : undefined,
      });
      nav.navigate('OTP', { phone: getE164(), isNewUser, role: selectedRole });
    } catch (e: any) {
      const msg = e.message || 'Failed to send verification code.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    }
    setLoading(false);
  }

  function selectRole(r: Role) {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setRole(r);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <GlowLogo size={52} showWordmark />
      </View>

      {/* ── Form ────────────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={styles.formContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Get Started</Text>
            <Text style={styles.formSub}>Enter your phone number to continue</Text>

            {/* New / Returning toggle */}
            <View style={styles.toggleRow}>
              {[{ label: 'New User', value: true }, { label: 'Returning', value: false }].map(t => (
                <Pressable
                  key={t.label}
                  style={[styles.toggleBtn, isNewUser === t.value && styles.toggleBtnActive]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.selectionAsync();
                    setIsNewUser(t.value);
                  }}
                >
                  <Text style={[styles.toggleText, isNewUser === t.value && styles.toggleTextActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Name */}
            {isNewUser && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={v => setName(formatName(v))}
                  placeholder="Enter your full name"
                  placeholderTextColor="#999"
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
            )}

            {/* Phone */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
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
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                  maxLength={12}
                  returnKeyType="done"
                  onSubmitEditing={() => sendOTP(role)}
                />
              </View>
            </View>

            {/* Role selection — Client & Provider only */}
            {isNewUser && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>I am a</Text>
                <View style={styles.roleRow}>
                  {MAIN_ROLES.map(r => {
                    const selected = role === r.key;
                    return (
                      <Pressable
                        key={r.key}
                        style={[
                          styles.roleCard,
                          selected && [styles.roleCardSelected, { borderColor: r.color }],
                        ]}
                        onPress={() => selectRole(r.key)}
                      >
                        <View style={[styles.roleIconWrap, { backgroundColor: r.color + '18' }]}>
                          <r.Icon size={22} color={r.color} />
                        </View>
                        <Text style={[styles.roleLabel, selected && { color: r.color }]}>{r.label}</Text>
                        <Text style={styles.roleSub} numberOfLines={2}>{r.sub}</Text>
                        {selected && (
                          <View style={[styles.roleCheck, { backgroundColor: r.color }]}>
                            <Text style={styles.roleCheckText}>✓</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Age confirmation (required for new signups) ── */}
            {isNewUser && (
              <Pressable
                style={[styles.checkboxRow, ageConfirmed && styles.checkboxRowChecked]}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.selectionAsync();
                  setAgeConfirmed(!ageConfirmed);
                }}
              >
                <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
                  {ageConfirmed && <Text style={styles.checkboxCheck}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>I confirm I am 18 years or older</Text>
              </Pressable>
            )}

            {/* ── Terms / Privacy agreement (shown only for new signups) ── */}
            {isNewUser && (
              <Text style={styles.agreeText}>
                By continuing, you agree to our{' '}
                <Text
                  style={styles.agreeLink}
                  onPress={() => Linking.openURL('https://ca.glow.app/terms')}
                >
                  Terms of Service
                </Text>
                {' '}and{' '}
                <Text
                  style={styles.agreeLink}
                  onPress={() => Linking.openURL('https://ca.glow.app/privacy')}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            )}

            {/* ── Main CTA — Client / Provider ──────────────────────────── */}
            <Pressable
              style={({ pressed }) => [
                styles.ctaBtn,
                !isFormValid() && styles.ctaBtnDisabled,
                pressed && isFormValid() && { opacity: 0.88, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => sendOTP(role)}
              disabled={!isFormValid() || loading}
            >
              <Text style={styles.ctaBtnText}>{loading ? 'Sending…' : 'Continue'}</Text>
              {!loading && (
                <View style={styles.ctaArrow}>
                  <Text style={styles.ctaArrowText}>→</Text>
                </View>
              )}
            </Pressable>

            <Text style={styles.disclaimer}>
              You'll receive an SMS with a verification code.{'\n'}Standard rates may apply.
            </Text>

            {/* ── Home Care — secondary option below everything ──────── */}
            {isNewUser && (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.homeCareBtn,
                    pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                  ]}
                  onPress={() => sendOTP('SALON')}
                  disabled={loading}
                >
                  <View style={styles.homeCareBtnLeft}>
                    <View style={styles.homeCareIconWrap}>
                      <HospitalIcon size={22} color="#7C3AED" />
                    </View>
                    <View style={styles.homeCareBtnText}>
                      <Text style={styles.homeCareBtnTitle}>Salon &amp; Business</Text>
                      <Text style={styles.homeCareBtnSub}>Book artists for your salon, event or team</Text>
                    </View>
                  </View>
                  <Text style={styles.homeCareBtnArrow}>→</Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Trust strip */}
          <View style={styles.trustStrip}>
            {([
              [ShieldCheckIcon,  'Verified Providers'],
              [PinIcon,          'Greater Sudbury'],
              [CreditCardIcon,   'Private Pay'],
            ] as const).map(([Icon, label]) => (
              <View key={label} style={styles.trustItem}>
                <View style={{ marginBottom: 4 }}><Icon size={16} color={Colors.brand} /></View>
                <Text style={styles.trustText}>{label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.copyright}>
            © {new Date().getFullYear()} Glow · Greater Sudbury, ON
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.brandDark },

  topBar: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
    backgroundColor: Colors.brandDark,
  },

  formContainer: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 20, backgroundColor: '#fff' },
  formCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, minHeight: 300,
  },
  formTitle: { fontSize: 26, fontWeight: '800', color: '#000', marginBottom: 6, letterSpacing: -0.5 },
  formSub: { fontSize: 14, color: '#777', marginBottom: 22 },

  toggleRow: {
    flexDirection: 'row', backgroundColor: '#f5f5f5',
    borderRadius: 12, padding: 4, marginBottom: 22,
  },
  toggleBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  toggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#888' },
  toggleTextActive: { color: '#000' },

  inputGroup: { marginBottom: 18 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 8 },
  textInput: {
    backgroundColor: '#f8f8f8', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 15,
    fontSize: 16, color: '#000', borderWidth: 1, borderColor: '#e8e8e8',
  },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  countryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f0f0f0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 15,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  countryFlag: { fontSize: 18 },
  countryCode: { fontSize: 15, fontWeight: '700', color: '#111' },
  phoneInput: {
    flex: 1, backgroundColor: '#f8f8f8', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 15,
    fontSize: 17, color: '#000', borderWidth: 1, borderColor: '#e8e8e8',
    fontWeight: '500', letterSpacing: 0.5,
  },

  roleRow: { flexDirection: 'row', gap: 8 },
  roleCard: {
    flex: 1, backgroundColor: '#fafafa', borderRadius: 16, padding: 12,
    borderWidth: 2, borderColor: 'transparent', gap: 5,
  },
  roleCardSelected: { backgroundColor: '#f0f7ff' },
  roleIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  roleIcon: { fontSize: 22 },
  roleLabel: { fontSize: 13, fontWeight: '700', color: '#000' },
  roleSub: { fontSize: 11, color: '#666', lineHeight: 15 },
  roleCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  roleCheckText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  ctaBtn: {
    marginTop: 6, borderRadius: 14, backgroundColor: Colors.brand,
    paddingVertical: 17, paddingHorizontal: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  ctaBtnDisabled: { backgroundColor: '#ccc', shadowOpacity: 0.08 },
  ctaBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  ctaArrow: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  ctaArrowText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  disclaimer: { fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 18, lineHeight: 16 },

  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14, paddingVertical: 8 },
  checkboxRowChecked: {},
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', marginTop: 2, backgroundColor: '#fff' },
  checkboxChecked: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  checkboxCheck: { color: '#fff', fontSize: 12, fontWeight: '700' },
  checkboxLabel: { flex: 1, fontSize: 13, color: '#333', lineHeight: 18, fontWeight: '500' },

  agreeText: { fontSize: 12, color: '#666', marginTop: 12, textAlign: 'center', lineHeight: 18 },
  agreeLink: { color: '#0066cc', textDecorationLine: 'underline' },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#ebebeb' },
  dividerText: { fontSize: 13, color: '#bbb', fontWeight: '600' },

  // Home Care — secondary bottom option
  homeCareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f5eeff', borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: '#d8b4fe',
  },
  homeCareBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  homeCareIconWrap: {
    width: 46, height: 46, borderRadius: 13,
    backgroundColor: '#9B59B620', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  homeCareIcon: { fontSize: 22 },
  homeCareBtnText: { flex: 1 },
  homeCareBtnTitle: { fontSize: 14, fontWeight: '700', color: '#6B21A8', marginBottom: 2 },
  homeCareBtnSub: { fontSize: 12, color: '#9333EA', lineHeight: 16 },
  homeCareBtnArrow: { fontSize: 18, color: '#9B59B6', fontWeight: '700', marginLeft: 8 },

  trustStrip: {
    flexDirection: 'row', justifyContent: 'center', gap: 28,
    paddingVertical: 20, paddingHorizontal: 24,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  trustItem: { alignItems: 'center', gap: 4 },
  trustIcon: { fontSize: 20 },
  trustText: { fontSize: 11, color: '#666', fontWeight: '500' },
  copyright: { fontSize: 11, color: '#bbb', textAlign: 'center', paddingVertical: 16, backgroundColor: '#fff' },
});
