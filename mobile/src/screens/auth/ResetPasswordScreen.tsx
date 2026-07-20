import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { apiResetPassword } from '../../api/client';
import { Colors, Fonts } from '../../utils/colors';
import { GlowLogo } from '../../components/GlowLogo';

/**
 * Landed on via the password-reset email link: `${PWA_BASE_URL}/reset-password?token=...`.
 * Wired up through the `linking` config in App.tsx, which maps the `reset-password`
 * path + `token` query param to this screen's route params.
 */
export function ResetPasswordScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  const token = route.params?.token as string | undefined;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const passwordTooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = !!token && newPassword.length >= 8 && newPassword === confirmPassword;

  async function submit() {
    if (!token) {
      const msg = 'This reset link is missing its token. Please request a new one.';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
      return;
    }
    if (newPassword.length < 8) {
      const msg = 'Password must be at least 8 characters.';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
      return;
    }
    if (newPassword !== confirmPassword) {
      const msg = 'Passwords do not match.';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
      return;
    }

    setLoading(true);
    try {
      await apiResetPassword({ token, newPassword });
      setDone(true);
    } catch (e: any) {
      const msg = e.message || 'This reset link is invalid or has expired.';
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Error', msg);
    }
    setLoading(false);
  }

  function backToSignIn() {
    nav.navigate('Phone');
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 28 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <GlowLogo size={44} showWordmark variant="onLight" />
            <Text style={styles.heroTitle}>Reset your{'\n'}password.</Text>
            {!done && (
              <Text style={styles.heroSub}>Choose a new password for your account.</Text>
            )}
          </View>

          <View style={styles.formCard}>
            {done ? (
              <>
                <Text style={styles.disclaimer}>Password updated. You can now log in with your new password.</Text>
                <Pressable style={[styles.ctaBtn, { marginTop: 18 }]} onPress={backToSignIn}>
                  <Text style={styles.ctaBtnText}>Back to sign in</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>New password</Text>
                  <View style={styles.phoneRow}>
                    <TextInput
                      style={[styles.textInput, { flex: 1 }]}
                      value={newPassword}
                      onChangeText={setNewPassword}
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
                  {passwordTooShort && (
                    <Text style={styles.errorText}>Password must be at least 8 characters.</Text>
                  )}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm password</Text>
                  <TextInput
                    style={styles.textInput}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter your new password"
                    placeholderTextColor={Colors.tertiaryLabel}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {mismatch && (
                    <Text style={styles.errorText}>Passwords do not match.</Text>
                  )}
                </View>

                <Pressable
                  style={[styles.ctaBtn, !canSubmit && styles.ctaBtnDisabled]}
                  onPress={submit}
                  disabled={loading || !canSubmit}
                >
                  <Text style={styles.ctaBtnText}>{loading ? 'Please wait…' : 'Reset password'}</Text>
                </Pressable>

                <Pressable style={{ marginTop: 14, alignItems: 'center' }} onPress={backToSignIn}>
                  <Text style={styles.agreeLink}>Back to sign in</Text>
                </Pressable>
              </>
            )}
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
    fontSize: 34, lineHeight: 40, fontFamily: Fonts.bold, color: Colors.label,
    letterSpacing: -1, marginTop: 26,
  },
  heroSub: { fontSize: 16, lineHeight: 23, color: Colors.secondaryLabel, marginTop: 12, maxWidth: 320, fontFamily: Fonts.regular },

  formCard: {
    backgroundColor: '#fff', borderRadius: 28, padding: 24,
    borderWidth: 1, borderColor: Colors.separator,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.07, shadowRadius: 34, elevation: 5,
  },

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
  countryCode: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label },

  errorText: { fontSize: 12, color: Colors.brandDark, marginTop: 6, fontFamily: Fonts.regular },

  agreeLink: { color: Colors.brandDark, textDecorationLine: 'underline' },

  ctaBtn: {
    borderRadius: 18, backgroundColor: Colors.brand,
    paddingVertical: 17,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 7,
  },
  ctaBtnDisabled: { backgroundColor: Colors.systemGray4, shadowOpacity: 0 },
  ctaBtnText: { color: '#fff', fontSize: 16.5, fontFamily: Fonts.semibold },

  disclaimer: { fontSize: 13.5, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 19, fontFamily: Fonts.regular },
});
