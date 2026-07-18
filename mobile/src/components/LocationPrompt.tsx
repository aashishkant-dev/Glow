import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors } from '../utils/colors';
import { PinIcon, KeyIcon } from './CareIcons';
import { SearchIcon, NavigateIcon, CheckCircleIcon } from './TabIcons';

type IconComp = (p: { size?: number; color?: string }) => React.ReactElement;

interface LocationPromptProps {
  onRequest: () => Promise<void>;
  onSkip: () => void;
  onManualAddress?: (address: string) => void;
  visible: boolean;
  isDenied?: boolean;
}

const { width } = Dimensions.get('window');

export function LocationPrompt({ onRequest, onSkip, onManualAddress, visible, isDenied }: LocationPromptProps) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, damping: 18, stiffness: 150, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleRequest = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    await onRequest();
    setLoading(false);
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <LinearGradient
          colors={['#A34D63', '#D97A91', '#E9A0B1']}
          style={styles.header}
        >
          <View style={styles.locationIconWrap}>
            <PinIcon size={40} color="#fff" />
          </View>
          <Text style={styles.title}>Enable Location</Text>
          <Text style={styles.subtitle}>
            Glow needs your location to find artists near you and track your booking live
          </Text>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.benefits}>
            {([
              { Icon: SearchIcon, title: 'Find artists near you', desc: 'Discover verified beauty artists in your area' },
              { Icon: NavigateIcon, title: 'Real-time Tracking', desc: 'Watch your artist arrive in real time' },
              { Icon: PinIcon, title: 'Accurate Service', desc: 'Get precise directions to your service location' },
            ] as { Icon: IconComp; title: string; desc: string }[]).map((benefit, i) => (
              <View key={i} style={styles.benefitRow}>
                <View style={styles.benefitIcon}>
                  <benefit.Icon size={22} color={Colors.brand} />
                </View>
                <View style={styles.benefitContent}>
                  <Text style={styles.benefitTitle}>{benefit.title}</Text>
                  <Text style={styles.benefitDesc}>{benefit.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.privacyNote}>
            <View style={{ marginTop: 1 }}><KeyIcon size={18} color={Colors.secondaryLabel} /></View>
            <Text style={styles.privacyText}>
              Your location is only used during active bookings and is never shared with third parties.
            </Text>
          </View>

          <View style={styles.actions}>
            {isDenied ? (
              Platform.OS === 'web' ? (
                <View style={styles.deniedWebCard}>
                  <Text style={styles.deniedWebTitle}>Enable Location in Browser</Text>
                  <Text style={styles.deniedWebStep}>1. Click the <Text style={{ fontWeight: '800' }}>lock icon</Text> in your browser's address bar</Text>
                  <Text style={styles.deniedWebStep}>2. Find <Text style={{ fontWeight: '800' }}>Location</Text> and set it to <Text style={{ fontWeight: '800' }}>Allow</Text></Text>
                  <Text style={styles.deniedWebStep}>3. Refresh the page</Text>
                  <Pressable
                    style={styles.refreshBtn}
                    onPress={() => { if (typeof window !== 'undefined') window.location.reload(); }}
                  >
                    <Text style={styles.refreshBtnText}>↻  Refresh Page</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.enableBtn}
                  onPress={() => Linking.openSettings()}
                >
                  <LinearGradient
                    colors={['#EF4444', '#DC2626']}
                    style={styles.enableBtnGrad}
                  >
                    <Text style={styles.enableBtnText}>Open Settings to Enable</Text>
                  </LinearGradient>
                </Pressable>
              )
            ) : (
              <Pressable
                style={[styles.enableBtn, loading && styles.enableBtnDisabled]}
                onPress={handleRequest}
                disabled={loading}
              >
                <LinearGradient
                  colors={loading ? ['#ccc', '#aaa'] : [Colors.brand, Colors.brandDark]}
                  style={styles.enableBtnGrad}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {!loading && <CheckCircleIcon size={20} color="#fff" />}
                    <Text style={styles.enableBtnText}>
                      {loading ? 'Enabling...' : 'Enable Location'}
                    </Text>
                  </View>
                </LinearGradient>
              </Pressable>
            )}

            <Pressable style={styles.skipBtn} onPress={onSkip}>
              <Text style={styles.skipBtnText}>Skip for now</Text>
            </Pressable>

            {/* Manual address entry */}
            <Pressable onPress={() => setShowManual(v => !v)}>
              <Text style={styles.manualToggle}>
                {showManual ? '▲ Hide manual entry' : '⌨ Enter address manually'}
              </Text>
            </Pressable>
            {showManual && (
              <View style={styles.manualRow}>
                <TextInput
                  style={styles.manualInput}
                  value={manualAddress}
                  onChangeText={setManualAddress}
                  placeholder="e.g. 840 Notre Dame Ave, Sudbury, ON P3A 2T4"
                  placeholderTextColor="#aaa"
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (manualAddress.trim() && onManualAddress) {
                      onManualAddress(manualAddress.trim());
                    }
                  }}
                />
                <Pressable
                  style={[styles.manualSubmit, !manualAddress.trim() && { opacity: 0.4 }]}
                  disabled={!manualAddress.trim()}
                  onPress={() => {
                    if (manualAddress.trim() && onManualAddress) {
                      onManualAddress(manualAddress.trim());
                    }
                  }}
                >
                  <Text style={styles.manualSubmitText}>Use →</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

export function LocationPermissionBanner({ onRequest, status }: { onRequest: () => void; status: string }) {
  if (status === 'granted') return null;

  return (
    <Pressable style={styles.banner} onPress={onRequest}>
      <LinearGradient
        colors={['#FFF7ED', '#FFEDD5']}
        style={styles.bannerGrad}
      >
        <View style={styles.bannerIcon}>
          <PinIcon size={20} color="#EA580C" />
        </View>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>Enable Location</Text>
          <Text style={styles.bannerSub}>For better service & tracking</Text>
        </View>
        <View style={styles.bannerArrow}>
          <Text style={styles.bannerArrowText}>→</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    padding: 32,
    alignItems: 'center',
  },
  locationIconWrap: {
    width: 80, height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  locationIcon: { fontSize: 40 },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  content: {
    padding: 24,
  },
  benefits: {
    gap: 16,
    marginBottom: 20,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  benefitIcon: {
    width: 44, height: 44,
    borderRadius: 14,
    backgroundColor: Colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitIconText: { fontSize: 22 },
  benefitContent: { flex: 1 },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.label,
    marginBottom: 2,
  },
  benefitDesc: {
    fontSize: 13,
    color: Colors.secondaryLabel,
    lineHeight: 18,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.brandLight,
    padding: 14,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.brandAccent,
  },
  privacyIcon: { fontSize: 18 },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: Colors.secondaryLabel,
    lineHeight: 18,
  },
  actions: {
    gap: 12,
  },
  enableBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  enableBtnDisabled: {
    shadowOpacity: 0.1,
  },
  enableBtnGrad: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  enableBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  skipBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipBtnText: {
    color: Colors.secondaryLabel,
    fontSize: 15,
    fontWeight: '600',
  },
  manualToggle: {
    color: Colors.brand, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 8,
  },
  manualRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  manualInput: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: '#000', borderWidth: 1, borderColor: '#e0e0e0',
  },
  manualSubmit: {
    backgroundColor: Colors.brand, borderRadius: 10,
    paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
  },
  manualSubmitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  deniedWebCard: {
    backgroundColor: '#FFF7ED', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#FED7AA', gap: 8,
  },
  deniedWebTitle: { fontSize: 15, fontWeight: '800', color: '#92400E', marginBottom: 4 },
  deniedWebStep: { fontSize: 13, color: '#78350F', lineHeight: 20 },
  refreshBtn: {
    marginTop: 8, backgroundColor: '#0A2540', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  refreshBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  banner: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  bannerGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  bannerIcon: {
    width: 40, height: 40,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerIconText: { fontSize: 20 },
  bannerContent: { flex: 1 },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  bannerSub: {
    fontSize: 12,
    color: '#B45309',
  },
  bannerArrow: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerArrowText: {
    color: '#EA580C',
    fontSize: 16,
    fontWeight: '700',
  },
});
