import React, { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../utils/colors';
import { useAuth } from '../../context/AuthContext';
import {
  NoteIcon, ShieldCheckIcon, EarningsIcon, PinIcon,
  EmailIcon, ClockIcon, CardAccountDetailsIcon,
  BellIcon,
} from '../../components/CareIcons';
import { LipstickIcon, ScissorsIcon, NailIcon, HennaIcon, FacialIcon, WaxIcon, LotusIcon, CrownIcon, MirrorIcon } from '../../components/BeautyIcons';
import { StarIcon, CheckCircleIcon, CloseCircleIcon, CallIcon } from '../../components/TabIcons';

type IconComp = (p: { size?: number; color?: string }) => React.ReactElement;

function StepRow({ step, title, desc }: { step: number; title: string; desc: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBubble}>
        <Text style={styles.stepNum}>{step}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function InfoRow({ Icon, label, desc }: { Icon: IconComp; label: string; desc: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}><Icon size={20} color={Colors.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoDesc}>{desc}</Text>
      </View>
    </View>
  );
}

type SectionKey = 'register' | 'specialties' | 'documents' | 'earnings' | 'portfolio' | 'safety' | 'contact';

export function HelpScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<any>();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<SectionKey | null>('register');

  // Registered identically in both CustomerNavigator and ProviderNavigator —
  // pick the fallback home by role since there's no single shared route name.
  function goBack() {
    if (nav.canGoBack()) nav.goBack();
    else nav.navigate(user?.role === 'Provider' ? 'ProviderHome' : 'Home');
  }

  const toggle = (key: SectionKey) => setExpanded(prev => prev === key ? null : key);

  const sections: { key: SectionKey; Icon: IconComp; title: string; content: React.ReactNode }[] = [
    {
      key: 'register',
      Icon: NoteIcon,
      title: 'How to Join as an Artist',
      content: (
        <View style={styles.sectionBody}>
          <StepRow step={1} title="Download the App" desc="Open Glow in your browser and tap 'Add to Home Screen' to install the PWA" />
          <StepRow step={2} title="Create Your Account" desc="Enter your name, phone number, and select 'I'm an Artist'" />
          <StepRow step={3} title="Verify Your Phone" desc="Enter the 6-digit code sent via SMS to confirm your identity" />
          <StepRow step={4} title="Build Your Storefront" desc="Add your bio, specialties, and languages — this is your public profile, make it shine" />
          <StepRow step={5} title="Set Your Services & Prices" desc="List each service you offer with duration and price — clients book directly from your menu" />
          <StepRow step={6} title="Upload Your Portfolio" desc="Add photos of your best work — bridal looks, nail art, henna, whatever's your niche" />
          <StepRow step={7} title="Upload Verification Documents" desc="Police check, certification, and government ID keep clients safe and confident" />
          <StepRow step={8} title="Get Approved" desc="Our team reviews your profile within 1–2 business days and approves you to accept bookings" />
          <StepRow step={9} title="Start Booking Clients" desc="Go online in the Dashboard and start accepting requests near you" />
        </View>
      ),
    },
    {
      key: 'specialties',
      Icon: CrownIcon,
      title: 'Specialties We Feature',
      content: (
        <View style={styles.sectionBody}>
          <InfoRow Icon={LipstickIcon} label="Makeup Artists" desc="Bridal, party, HD & airbrush — showcase your signature looks" />
          <InfoRow Icon={ScissorsIcon} label="Hair Stylists" desc="Cuts, styling, and color specialists" />
          <InfoRow Icon={HennaIcon} label="Mehendi Artists" desc="Bridal and festive henna designs" />
          <InfoRow Icon={NailIcon} label="Nail Technicians" desc="Nail art, gel, and acrylic specialists" />
          <InfoRow Icon={FacialIcon} label="Skincare & Facials" desc="Facials, threading, and brow specialists" />
          <InfoRow Icon={WaxIcon} label="Waxing Specialists" desc="Full-body and precision waxing" />
          <InfoRow Icon={LotusIcon} label="Massage & Spa" desc="Relaxation and therapeutic massage" />
          <InfoRow Icon={MirrorIcon} label="Something Else?" desc="Any other verified beauty specialty — submit your credentials for review" />
        </View>
      ),
    },
    {
      key: 'documents',
      Icon: NoteIcon,
      title: 'Required Verification Documents',
      content: (
        <View style={styles.sectionBody}>
          <View style={styles.requiredNote}>
            <Text style={styles.requiredNoteText}>✱ Required documents must be uploaded before your profile can be approved</Text>
          </View>
          <InfoRow Icon={ShieldCheckIcon} label="Police Check Clearance ✱" desc="Criminal record check — must be recent (within 2 years)" />
          <InfoRow Icon={CrownIcon} label="Artist Certificate ✱" desc="Official credential from your training academy or certification body" />
          <InfoRow Icon={CardAccountDetailsIcon} label="Government-Issued ID ✱" desc="Passport, driver's licence, or provincial photo card" />
          <InfoRow Icon={CardAccountDetailsIcon} label="Driver's Licence (optional)" desc="If you drive to appointments — both sides of the card" />
          <InfoRow Icon={NoteIcon} label="Liability Insurance (optional)" desc="Professional liability policy if applicable" />
        </View>
      ),
    },
    {
      key: 'earnings',
      Icon: EarningsIcon,
      title: 'Earnings & How You Get Paid',
      content: (
        <View style={styles.sectionBody}>
          <InfoRow Icon={EarningsIcon} label="You set your own prices" desc="Every service you list has your own price — no flat platform rate" />
          <InfoRow Icon={NoteIcon} label="Price shown upfront to client" desc="Clients see your exact service price before they book — no surprises" />
          <InfoRow Icon={EarningsIcon} label="Private-pay direct to you" desc="Clients pay you directly — cash, card, or e-Transfer at time of service" />
          <InfoRow Icon={ClockIcon} label="Set your own availability" desc="Go online when you want to work, offline when you don't" />
          <InfoRow Icon={PinIcon} label="Bookings near you" desc="Accept requests within your travel radius — no long-distance travel required" />
        </View>
      ),
    },
    {
      key: 'portfolio',
      Icon: MirrorIcon,
      title: 'Build a Storefront Clients Trust',
      content: (
        <View style={styles.sectionBody}>
          <InfoRow Icon={MirrorIcon} label="Your profile is your storefront" desc="A complete profile with photos and a real bio gets booked more often" />
          <InfoRow Icon={LipstickIcon} label="Show your best work" desc="Upload a portfolio of your favourite looks — clients book based on style match" />
          <InfoRow Icon={StarIcon} label="Reviews build trust" desc="Every completed booking earns a rating — great work compounds" />
          <InfoRow Icon={ShieldCheckIcon} label="Verified badge" desc="Completed verification earns a visible trust badge on your profile" />
        </View>
      ),
    },
    {
      key: 'safety',
      Icon: ShieldCheckIcon,
      title: 'Trust & Safety',
      content: (
        <View style={styles.sectionBody}>
          <Pressable onPress={() => Linking.openURL('https://glow-landing.vercel.app/safety')}>
            <InfoRow Icon={ShieldCheckIcon} label="Police Clearance Required" desc="Criminal record background check for every Artist — tap to learn more" />
          </Pressable>
          <Pressable onPress={() => Linking.openURL('https://glow-landing.vercel.app/safety')}>
            <InfoRow Icon={CheckCircleIcon} label="Government ID Verified" desc="Photo ID confirmed by our admin team before account approval — tap to learn more" />
          </Pressable>
          <Pressable onPress={() => Linking.openURL('https://glow-landing.vercel.app/safety')}>
            <InfoRow Icon={ShieldCheckIcon} label="Manual Admin Review" desc="A real person reviews every Artist profile before they go live — tap to learn more" />
          </Pressable>
          <InfoRow Icon={StarIcon} label="Rating & Review System" desc="Clients leave 1–5 star reviews after every completed booking" />
          <InfoRow Icon={CloseCircleIcon} label="Suspension Controls" desc="Admin can suspend any account immediately if needed" />
          <InfoRow Icon={BellIcon} label="Live Booking Status" desc="Requested → Accepted → Started → Completed — always tracked" />
        </View>
      ),
    },
    {
      key: 'contact',
      Icon: EmailIcon,
      title: 'Contact & Support',
      content: (
        <View style={styles.sectionBody}>
          <Pressable
            style={styles.contactRow}
            onPress={() => Linking.openURL('mailto:support@glow.app?subject=Glow Support')}
          >
            <View style={styles.contactIcon}><EmailIcon size={20} color={Colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactLabel}>Email Us</Text>
              <Text style={styles.contactValue}>support@glow.app</Text>
            </View>
            <Text style={styles.contactArrow}>→</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={styles.contactRow}
            onPress={() => Linking.openURL('tel:+16476209243')}
          >
            <View style={styles.contactIcon}><CallIcon size={20} color={Colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactLabel}>Call Us</Text>
              <Text style={styles.contactValue}>+1 (647) 620-9243</Text>
            </View>
            <Text style={styles.contactArrow}>→</Text>
          </Pressable>
          <View style={styles.divider} />
          <View style={styles.contactRow}>
            <View style={styles.contactIcon}><ClockIcon size={20} color={Colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactLabel}>Support Hours</Text>
              <Text style={styles.contactValueDark}>24/7</Text>
            </View>
          </View>
        </View>
      ),
    },
  ];

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.backBar, { paddingTop: Platform.OS === 'web' ? 12 : insets.top + 4 }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          onPress={goBack}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.backBarTitle}>Join as an Artist</Text>
        <View style={styles.backBtnSpacer} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[Colors.brandDeep, Colors.brand, Colors.gold]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIconWrap}><MirrorIcon size={40} color="#fff" /></View>
          <Text style={styles.heroTitle}>Join as a Beauty Artist</Text>
          <Text style={styles.heroSub}>Build your storefront, set your own prices, and start earning on your terms</Text>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>Makeup</Text></View>
            <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>Hair</Text></View>
            <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>Nails</Text></View>
            <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>Mehendi</Text></View>
            <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>+ more</Text></View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {sections.map(section => (
            <View key={section.key} style={styles.card}>
              <Pressable
                style={({ pressed }) => [styles.cardHeader, pressed && { opacity: 0.85 }]}
                onPress={() => toggle(section.key)}
              >
                <View style={styles.cardIcon}><section.Icon size={22} color={Colors.brand} /></View>
                <Text style={styles.cardTitle}>{section.title}</Text>
                <Text style={styles.cardChevron}>{expanded === section.key ? '▲' : '▼'}</Text>
              </Pressable>
              {expanded === section.key && section.content}
            </View>
          ))}

          <Text style={styles.footer}>
            © {new Date().getFullYear()} Glow · Beauty, on demand{'\n'}
            All rights reserved
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: Colors.brandDeep },

  backBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: Colors.brandDeep,
  },
  backBtn: { paddingVertical: 6, paddingHorizontal: 4, minWidth: 70 },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  backBarTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backBtnSpacer: { minWidth: 70 },

  container: { flex: 1, backgroundColor: '#f5f5f5' },

  hero: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  heroIconWrap: { marginBottom: 12 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6, textAlign: 'center', letterSpacing: -0.3 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', marginBottom: 18, lineHeight: 19 },
  heroBadgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  heroBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  body: { padding: 16, gap: 10 },

  card: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  cardIcon: { width: 28, alignItems: 'center' },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#000' },
  cardChevron: { fontSize: 11, color: '#999' },

  sectionBody: { paddingHorizontal: 16, paddingBottom: 18, gap: 14 },

  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepBubble: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.brandDeep, alignItems: 'center', justifyContent: 'center',
    marginTop: 2, flexShrink: 0,
  },
  stepNum: { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepTitle: { fontSize: 14, fontWeight: '700', color: '#000', marginBottom: 2 },
  stepDesc: { fontSize: 12, color: '#666', lineHeight: 17 },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoIcon: { width: 26, alignItems: 'center', marginTop: 1 },
  infoLabel: { fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 2 },
  infoDesc: { fontSize: 12, color: '#666', lineHeight: 17 },

  requiredNote: {
    backgroundColor: '#FFF7ED', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#FCD34D',
  },
  requiredNoteText: { fontSize: 12, color: '#92400E', fontWeight: '600', lineHeight: 17 },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactIcon: { width: 24, alignItems: 'center' },
  contactLabel: { fontSize: 12, color: '#888', marginBottom: 2 },
  contactValue: { fontSize: 14, fontWeight: '600', color: Colors.brandDark },
  contactValueDark: { fontSize: 14, fontWeight: '600', color: '#000' },
  contactArrow: { fontSize: 16, color: Colors.brandDark },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 12 },

  footer: {
    textAlign: 'center', fontSize: 11, color: '#aaa',
    marginTop: 10, lineHeight: 18,
  },
});
