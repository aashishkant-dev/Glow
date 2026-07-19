import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { apiGetMyBookings } from '../../api/client';
import { GlowLogo } from '../../components/GlowLogo';
import { Colors } from '../../utils/colors';
import { LipstickIcon, ScissorsIcon, NailIcon, HennaIcon, FacialIcon, WaxIcon } from '../../components/BeautyIcons';
import { ShieldCheckIcon, PinIcon, CreditCardIcon, ProfileIcon } from '../../components/CareIcons';
import { FlashIcon, RadioOnIcon } from '../../components/TabIcons';

type IconComp = (p: { size?: number; color?: string }) => React.ReactElement;

const SERVICES: { Icon: IconComp; label: string; color: string }[] = [
  { Icon: LipstickIcon, label: 'Makeup',       color: '#D97A91' },
  { Icon: ScissorsIcon, label: 'Hair Styling',  color: '#8B5CF6' },
  { Icon: NailIcon,     label: 'Nails',         color: '#3B82F6' },
  { Icon: HennaIcon,    label: 'Mehendi',       color: '#F59E0B' },
  { Icon: FacialIcon,   label: 'Facial',        color: '#06B6D4' },
  { Icon: WaxIcon,      label: 'Waxing',        color: '#EC4899' },
];

const CHECKLIST = [
  'Set up your team of artists',
  'List your service menu & pricing',
  'Sync your booking calendar',
  'Go live for walk-in & appointment bookings',
];

export function HomeCareHomeScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    apiGetMyBookings({ status: 'ACCEPTED' })
      .then(r => setActiveCount((r.bookings ?? []).length))
      .catch(() => {});
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <LinearGradient colors={['#3B1520', '#5C1F2E', '#8E4257']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <GlowLogo size={44} showWordmark variant="onDark" />

        <View style={styles.greetRow}>
          <View>
            <Text style={styles.greetHi}>Hello, {firstName}</Text>
            <Text style={styles.greetSub}>Salon & Studio Dashboard</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.iconBtn} onPress={() => nav.navigate('Profile')}>
              <ProfileIcon size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Hero CTA */}
        <Pressable style={styles.heroCta} onPress={() => nav.navigate('NewBooking')}>
          <View style={styles.heroCtaLeft}>
            <Text style={styles.heroCtaTitle}>Book a Service Now</Text>
            <Text style={styles.heroCtaSub}>Verified artists · Bring the studio to your clients</Text>
          </View>
          <View style={styles.heroCtaArrow}>
            <Text style={styles.heroCtaArrowText}>→</Text>
          </View>
        </Pressable>

        {/* Stats */}
        {activeCount > 0 && (
          <Pressable style={styles.activeBanner} onPress={() => nav.navigate('CasesTab')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={{ marginRight: 6 }}><RadioOnIcon size={14} color={Colors.brand} /></View>
              <Text style={styles.activeBannerText}>{activeCount} active booking{activeCount > 1 ? 's' : ''} in progress</Text>
            </View>
            <Text style={styles.activeBannerLink}>View →</Text>
          </Pressable>
        )}
      </LinearGradient>

      {/* ── Getting Started Checklist ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Getting Started</Text>
        <View style={styles.checklistCard}>
          {CHECKLIST.map((item, i) => (
            <View key={i} style={styles.checkRow}>
              <View style={styles.checkDot} />
              <Text style={styles.checkText}>{item}</Text>
            </View>
          ))}
          <Pressable style={styles.checklistCta} onPress={() => nav.navigate('NewBooking')}>
            <Text style={styles.checklistCtaText}>Book Your First Service →</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Services ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Available Services</Text>
        <View style={styles.servicesGrid}>
          {SERVICES.map(s => (
            <Pressable key={s.label} style={styles.serviceCard} onPress={() => nav.navigate('NewBooking')}>
              <View style={[styles.serviceIconWrap, { backgroundColor: s.color + '18' }]}>
                <s.Icon size={24} color={s.color} />
              </View>
              <Text style={styles.serviceLabel} numberOfLines={2}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── Why Glow ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Why Glow?</Text>
        <View style={styles.trustGrid}>
          {([
            { Icon: ShieldCheckIcon, title: 'Verified Artists', sub: 'Background checks & credentials reviewed' },
            { Icon: PinIcon, title: 'Your City', sub: 'Local artists near your studio' },
            { Icon: FlashIcon, title: 'Fast Response', sub: 'On-demand booking within hours' },
            { Icon: CreditCardIcon, title: 'Flexible Pay', sub: 'Card or e-Transfer, per-service pricing' },
          ] as { Icon: IconComp; title: string; sub: string }[]).map(t => (
            <View key={t.title} style={styles.trustCard}>
              <View style={styles.trustIcon}><t.Icon size={26} color={Colors.brand} /></View>
              <Text style={styles.trustTitle}>{t.title}</Text>
              <Text style={styles.trustSub}>{t.sub}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Book now bottom CTA ── */}
      <View style={styles.bottomCta}>
        <Pressable
          style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.88 }]}
          onPress={() => nav.navigate('NewBooking')}
        >
          <Text style={styles.bookBtnText}>Book an Artist Now</Text>
        </Pressable>
        <Text style={styles.bookBtnSub}>Book verified beauty artists near you</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#FFF9F8' },

  // Header
  header: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  greetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 4 },
  greetHi: { color: '#fff', fontSize: 22, fontWeight: '800' },
  greetSub: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },

  heroCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  heroCtaLeft: { gap: 4 },
  heroCtaTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  heroCtaSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  heroCtaArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  heroCtaArrowText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  activeBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(217,122,145,0.22)', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: 'rgba(217,122,145,0.4)',
  },
  activeBannerText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  activeBannerLink: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Sections
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: Colors.label, marginBottom: 12 },

  // Checklist
  checklistCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brand },
  checkText: { fontSize: 14, color: '#374151', fontWeight: '500', flex: 1 },
  checklistCta: { marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0', alignItems: 'flex-end' },
  checklistCtaText: { color: Colors.brand, fontSize: 14, fontWeight: '700' },

  // Services
  servicesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  serviceCard: {
    width: '22%', minWidth: 72, backgroundColor: '#fff', borderRadius: 14, padding: 12,
    alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  serviceIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  serviceLabel: { fontSize: 10, fontWeight: '600', color: '#374151', textAlign: 'center', lineHeight: 13 },

  // Trust
  trustGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  trustCard: {
    width: '47%', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  trustIcon: { marginBottom: 4 },
  trustTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  trustSub: { fontSize: 11, color: '#6b7280', lineHeight: 15 },

  // Bottom CTA
  bottomCta: { paddingHorizontal: 16, paddingTop: 24, alignItems: 'center', gap: 8 },
  bookBtn: {
    width: '100%', backgroundColor: Colors.brand, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 8,
  },
  bookBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  bookBtnSub: { fontSize: 12, color: '#6b7280' },
});
