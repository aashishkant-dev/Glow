/**
 * GlowMatchSheet — the concierge booking flow. Four one-tap decisions
 * (occasion → where → when → budget), then exactly three recommended artists
 * with honest, data-backed reasons. Glow recommends; the user confirms.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { GlowSheet } from './GlowSheet';
import { Colors, Fonts } from '../utils/colors';
import { apiPublicProviders, PublicProviderCard } from '../api/client';
import { StarIcon, ChevronBackIcon, ChevronForwardIcon } from './TabIcons';
import { SparkleIcon } from './BeautyIcons';
import {
  HairdryerIcon, NailPolishIcon, ThreadNeedleIcon, WaxWarmerIcon, LipstickBrushIcon,
  FacialProfileIcon, BrideProfileIcon, HennaConeIcon, MassageHandsIcon,
} from './IllustratedIcons';
import { tapLight, tapSuccess } from '../utils/haptics';

type IconComp = (p: { size?: number; color?: string }) => React.ReactElement;

// Service picker — mirrors Home's CATEGORIES so Glow Match asks "what service"
// instead of the old occasion framing, using the same illustrated icon set.
const OCCASIONS: { id: string; label: string; Icon: IconComp; serviceType: string; keywords: string[] }[] = [
  { id: 'hair',    label: 'Hair',                  Icon: HairdryerIcon,     serviceType: 'Hair Styling',  keywords: ['hair', 'styling'] },
  { id: 'nails',   label: 'Nails',                 Icon: NailPolishIcon,    serviceType: 'Nails',         keywords: ['nails', 'manicure'] },
  { id: 'brows',   label: 'Brows & Lashes',        Icon: ThreadNeedleIcon,  serviceType: 'Threading',     keywords: ['threading', 'brows', 'lashes'] },
  { id: 'waxing',  label: 'Waxing',                Icon: WaxWarmerIcon,     serviceType: 'Waxing',        keywords: ['waxing'] },
  { id: 'makeup',  label: 'Makeup',                Icon: LipstickBrushIcon, serviceType: 'Makeup',        keywords: ['makeup', 'natural'] },
  { id: 'facials', label: 'Facials & Skin',        Icon: FacialProfileIcon, serviceType: 'Facial',        keywords: ['facial', 'skin'] },
  { id: 'bridal',  label: 'Bridal',                Icon: BrideProfileIcon,  serviceType: 'Bridal Makeup', keywords: ['bridal', 'wedding'] },
  { id: 'henna',   label: 'Henna',                 Icon: HennaConeIcon,     serviceType: 'Mehendi',       keywords: ['mehendi', 'henna', 'festival'] },
  { id: 'spa',     label: 'Spa & Massage',         Icon: MassageHandsIcon,  serviceType: 'Massage',       keywords: ['massage', 'spa'] },
];

const WHERE = [
  { id: 'home',  label: 'At Home',  sub: 'Artist comes to you' },
  { id: 'salon', label: 'Salon',    sub: 'Visit the artist' },
];

const WHEN = [
  { id: 'now',   label: 'Now',         sub: 'Next available', mode: 'ondemand' as const },
  { id: 'today', label: 'Today',       sub: 'Later today',    mode: 'scheduled' as const },
  { id: 'date',  label: 'Choose Date', sub: 'Pick in booking', mode: 'scheduled' as const },
];

const BUDGET = [
  { id: 'value',   label: '$',   sub: 'Great value' },
  { id: 'mid',     label: '$$',  sub: 'Sweet spot' },
  { id: 'premium', label: '$$$', sub: 'Full luxury' },
];

type Tier = { key: string; title: string; color: string; bg: string };
const TIERS: Tier[] = [
  { key: 'perfect', title: 'Perfect Match', color: '#8E6F1E', bg: Colors.goldSoft },
  { key: 'great',   title: 'Great Match',   color: Colors.brandDeep, bg: Colors.brandLight },
  { key: 'value',   title: 'Value Match',   color: '#4C5B8A', bg: '#EBEFF9' },
];

interface Match {
  tier: Tier;
  artist: PublicProviderCard;
  reasons: string[];
}

/** Honest reason chips from real profile fields only. */
function buildReasons(a: PublicProviderCard, occasionKeywords: string[], tierKey: string): string[] {
  const out: string[] = [];
  const specMatch = a.specialties.find(s => occasionKeywords.some(k => s.toLowerCase().includes(k)));
  if (specMatch) out.push(`Specializes in ${specMatch.toLowerCase()}`);
  if ((a.rating ?? 0) >= 4.8 && a.ratingCount >= 3) out.push(`Top-rated · ${Number(a.rating).toFixed(1)}★`);
  else if ((a.rating ?? 0) >= 4.5) out.push(`${Number(a.rating).toFixed(1)}★ from clients`);
  if (a.completedVisits >= 50) out.push(`${a.completedVisits}+ sessions`);
  else if (a.completedVisits >= 10) out.push(`${a.completedVisits} sessions`);
  if ((a.experienceYears ?? 0) >= 5) out.push(`${a.experienceYears} yrs experience`);
  if (a.policeCheckCleared) out.push('Background checked');
  if (a.languages?.length > 1) out.push(a.languages.slice(0, 2).join(' · '));
  if (tierKey === 'value' && a.completedVisits < 10) out.push('Rising artist — great value');
  return out.slice(0, 3);
}

function scoreArtist(a: PublicProviderCard, keywords: string[]): number {
  // Weighted by COUNT of matching specialties, not a binary any-match flag —
  // an artist with 2 matching specialties should clearly outrank one with a
  // single incidental keyword hit, instead of both scoring identically.
  const matchCount = a.specialties.filter(s => keywords.some(k => s.toLowerCase().includes(k))).length;
  const spec = Math.min(matchCount * 1.5, 4.5); // caps at 3 matches so it can't dwarf rating/experience
  const rating = Number(a.rating) || 0;
  const volume = Math.log(a.ratingCount + 1) * 0.5 + Math.log(a.completedVisits + 1) * 0.3;
  const exp = Math.min(a.experienceYears ?? 0, 10) * 0.08;
  const trust = a.policeCheckCleared ? 0.4 : 0;
  return spec + rating + volume + exp + trust;
}

export function GlowMatchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const nav = useNavigation<any>();
  const [step, setStep] = useState(0);
  const [occasion, setOccasion] = useState<typeof OCCASIONS[number] | null>(null);
  const [where, setWhere] = useState<string | null>(null);
  const [when, setWhen] = useState<typeof WHEN[number] | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [artists, setArtists] = useState<PublicProviderCard[] | null>(null);

  // Reset the flow each time the sheet opens; prefetch the artist pool.
  useEffect(() => {
    if (!visible) return;
    setStep(0); setOccasion(null); setWhere(null); setWhen(null); setBudget(null);
    apiPublicProviders().then(({ providers }) => setArtists(providers)).catch(() => setArtists([]));
  }, [visible]);

  const matches: Match[] = useMemo(() => {
    if (!artists || !occasion) return [];
    const kw = occasion.keywords;
    const ranked = [...artists].sort((x, y) => scoreArtist(y, kw) - scoreArtist(x, kw));
    // Budget preference re-ranks: $ favors newer artists, $$$ favors experience.
    if (budget === 'value') ranked.sort((x, y) => (x.completedVisits - y.completedVisits) * 0.001 + (scoreArtist(y, kw) - scoreArtist(x, kw)) * 0.5);
    if (budget === 'premium') ranked.sort((x, y) => ((y.experienceYears ?? 0) - (x.experienceYears ?? 0)) * 0.2 + (scoreArtist(y, kw) - scoreArtist(x, kw)));
    const picks = ranked.slice(0, 3);
    return picks.map((artist, i) => ({
      tier: TIERS[i] ?? TIERS[2],
      artist,
      reasons: buildReasons(artist, kw, (TIERS[i] ?? TIERS[2]).key),
    }));
  }, [artists, occasion, budget]);

  function next() { setStep(s => Math.min(s + 1, 4)); }
  function back() { setStep(s => Math.max(s - 1, 0)); }

  function viewProfile(m: Match) {
    // Seed artists are demo data with no real backend account — their public
    // profile fetch 404s. Match ExploreScreen's guard instead of dead-ending
    // the user on a blank profile with no Instagram/gallery.
    if (m.artist.id.startsWith('seed-')) {
      const msg = 'This is a demo artist — their profile isn\'t available yet.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Demo Artist', msg);
      return;
    }
    onClose();
    nav.navigate('ProviderPublicProfile', { providerId: m.artist.id, providerName: m.artist.name });
  }

  function bookArtist(m: Match) {
    if (!occasion || !when) return;
    tapSuccess();
    onClose();
    nav.navigate('NewBooking', {
      serviceType: occasion.serviceType,
      bookingMode: when.mode,
      providerId: m.artist.id,
      _t: Date.now(),
    });
  }

  const stepTitles = ['What service?', 'Where?', 'When?', 'Budget?', 'Your matches'];

  return (
    <GlowSheet visible={visible} onClose={onClose}>
      {/* Header: back chevron + progress dots */}
      <View style={styles.header}>
        {step > 0 ? (
          <Pressable onPress={() => { tapLight(); back(); }} hitSlop={12} style={styles.backBtn}>
            <ChevronBackIcon size={18} color={Colors.label} />
          </Pressable>
        ) : <View style={styles.backBtn} />}
        <View style={styles.dots}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.dot, i === Math.min(step, 3) && styles.dotActive, i < step && styles.dotDone]} />
          ))}
        </View>
        <View style={styles.backBtn} />
      </View>

      <Text style={styles.kicker}>✨ GLOW MATCH</Text>
      <Text style={styles.title}>{stepTitles[step]}</Text>

      <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {step === 0 && (
          <View style={styles.grid}>
            {OCCASIONS.map(o => (
              <Pressable
                key={o.id}
                style={({ pressed }) => [styles.gridCard, pressed && styles.cardPressed]}
                onPress={() => { tapLight(); setOccasion(o); next(); }}
              >
                <View style={styles.gridIcon}><o.Icon size={30} /></View>
                <Text style={styles.gridLabel}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {step === 1 && WHERE.map(w => (
          <Pressable
            key={w.id}
            style={({ pressed }) => [styles.rowCard, pressed && styles.cardPressed]}
            onPress={() => { tapLight(); setWhere(w.id); next(); }}
          >
            <View>
              <Text style={styles.rowLabel}>{w.label}</Text>
              <Text style={styles.rowSub}>{w.sub}</Text>
            </View>
            <Text style={styles.rowArrow}>→</Text>
          </Pressable>
        ))}

        {step === 2 && WHEN.map(w => (
          <Pressable
            key={w.id}
            style={({ pressed }) => [styles.rowCard, pressed && styles.cardPressed]}
            onPress={() => { tapLight(); setWhen(w); next(); }}
          >
            <View>
              <Text style={styles.rowLabel}>{w.label}</Text>
              <Text style={styles.rowSub}>{w.sub}</Text>
            </View>
            <Text style={styles.rowArrow}>→</Text>
          </Pressable>
        ))}

        {step === 3 && (
          <View style={styles.budgetRow}>
            {BUDGET.map(b => (
              <Pressable
                key={b.id}
                style={({ pressed }) => [styles.budgetCard, pressed && styles.cardPressed]}
                onPress={() => { tapLight(); setBudget(b.id); next(); }}
              >
                <Text style={styles.budgetSign}>{b.label}</Text>
                <Text style={styles.rowSub}>{b.sub}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {step === 4 && (
          artists === null ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Colors.brand} />
              <Text style={styles.loadingText}>Finding your glow…</Text>
            </View>
          ) : matches.length === 0 ? (
            <View style={styles.loadingWrap}>
              <SparkleIcon size={26} color={Colors.brandAccent} />
              <Text style={styles.emptyTitle}>No artists just yet</Text>
              <Text style={styles.loadingText}>New artists are joining Glow — browse the booking flow meanwhile.</Text>
              <Pressable
                style={styles.emptyCta}
                onPress={() => {
                  onClose();
                  nav.navigate('NewBooking', { serviceType: occasion?.serviceType, bookingMode: when?.mode ?? 'scheduled', _t: Date.now() });
                }}
              >
                <Text style={styles.emptyCtaText}>Open booking</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.matchIntro}>
                Three artists picked for {occasion?.label.toLowerCase()}{where === 'home' ? ', at your place' : ''}. No scrolling through hundreds.
              </Text>
              {matches.map(m => (
                <View key={m.artist.id} style={styles.matchCard}>
                  <View style={[styles.tierTag, { backgroundColor: m.tier.bg }]}>
                    <Text style={[styles.tierTagText, { color: m.tier.color }]}>{m.tier.title.toUpperCase()}</Text>
                  </View>
                  <View style={styles.matchTop}>
                    {m.artist.photoUrl ? (
                      <Image source={{ uri: m.artist.photoUrl }} style={styles.matchAvatar} contentFit="cover" cachePolicy="memory-disk" />
                    ) : (
                      <View style={[styles.matchAvatar, styles.matchAvatarFallback]}>
                        <Text style={styles.matchInitial}>{m.artist.name[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matchName} numberOfLines={1}>{m.artist.name}</Text>
                      <View style={styles.matchMeta}>
                        <StarIcon size={12} color={Colors.gold} filled />
                        <Text style={styles.matchMetaText}>
                          {m.artist.rating != null ? Number(m.artist.rating).toFixed(1) : 'New'}
                          {m.artist.ratingCount > 0 ? ` (${m.artist.ratingCount})` : ''}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.profileBtn, pressed && { opacity: 0.7 }]}
                      hitSlop={8}
                      onPress={() => viewProfile(m)}
                    >
                      <Text style={styles.profileBtnText}>Profile</Text>
                      <ChevronForwardIcon size={13} color={Colors.brandDeep} />
                    </Pressable>
                  </View>
                  {m.reasons.length > 0 && (
                    <View style={styles.reasonRow}>
                      {m.reasons.map(r => (
                        <View key={r} style={styles.reasonChip}>
                          <Text style={styles.reasonText}>{r}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <Pressable
                    style={({ pressed }) => [styles.matchBook, pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] }]}
                    onPress={() => bookArtist(m)}
                  >
                    <Text style={styles.matchBookText}>Book {m.artist.name.split(' ')[0]}</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )
        )}
      </ScrollView>
    </GlowSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.systemGray4 },
  dotActive: { backgroundColor: Colors.brand, width: 20 },
  dotDone: { backgroundColor: Colors.brandAccent },

  kicker: { textAlign: 'center', fontSize: 11, fontFamily: Fonts.semibold, color: Colors.brandDark, letterSpacing: 1.6, marginTop: 4 },
  title: { textAlign: 'center', fontSize: 24, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -0.5, marginTop: 6, marginBottom: 4 },

  content: { padding: 20, paddingTop: 14 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridCard: {
    width: '47.5%',
    backgroundColor: Colors.secondarySystemBackground,
    borderWidth: 1, borderColor: Colors.separator,
    borderRadius: 20, padding: 16, alignItems: 'flex-start', gap: 10,
  },
  cardPressed: { transform: [{ scale: 0.98 }], backgroundColor: Colors.brandLight },
  gridIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff',
    borderWidth: 1, borderColor: Colors.separator,
    alignItems: 'center', justifyContent: 'center',
  },
  gridLabel: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label },

  rowCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.secondarySystemBackground,
    borderWidth: 1, borderColor: Colors.separator,
    borderRadius: 20, padding: 20, marginBottom: 12,
  },
  rowLabel: { fontSize: 17, fontFamily: Fonts.semibold, color: Colors.label },
  rowSub: { fontSize: 12.5, color: Colors.secondaryLabel, marginTop: 3, fontFamily: Fonts.regular },
  rowArrow: { fontSize: 17, color: Colors.brandDark, fontFamily: Fonts.medium },

  budgetRow: { flexDirection: 'row', gap: 12 },
  budgetCard: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: Colors.secondarySystemBackground,
    borderWidth: 1, borderColor: Colors.separator,
    borderRadius: 20, paddingVertical: 22,
  },
  budgetSign: { fontSize: 22, fontFamily: Fonts.bold, color: Colors.brandDeep },

  loadingWrap: { alignItems: 'center', paddingVertical: 30, gap: 10 },
  loadingText: { fontSize: 13.5, color: Colors.secondaryLabel, textAlign: 'center', fontFamily: Fonts.regular },
  emptyTitle: { fontSize: 16, fontFamily: Fonts.semibold, color: Colors.label },
  emptyCta: { backgroundColor: Colors.brand, borderRadius: 100, paddingVertical: 12, paddingHorizontal: 24, marginTop: 6 },
  emptyCtaText: { color: '#fff', fontSize: 14, fontFamily: Fonts.semibold },

  matchIntro: { fontSize: 13.5, color: Colors.secondaryLabel, lineHeight: 19, marginBottom: 14, fontFamily: Fonts.regular },
  matchCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.separator,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06, shadowRadius: 14, elevation: 2,
  },
  tierTag: { alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12 },
  tierTagText: { fontSize: 10, fontFamily: Fonts.semibold, letterSpacing: 0.8 },
  matchTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  matchAvatar: { width: 50, height: 50, borderRadius: 25 },
  matchAvatarFallback: { backgroundColor: Colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  matchInitial: { fontSize: 20, fontFamily: Fonts.semibold, color: Colors.brandDark },
  matchName: { fontSize: 16.5, fontFamily: Fonts.semibold, color: Colors.label },
  matchMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  matchMetaText: { fontSize: 12.5, color: Colors.secondaryLabel, fontFamily: Fonts.medium },
  profileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 100, borderWidth: 1, borderColor: Colors.separator,
    backgroundColor: Colors.secondarySystemBackground,
  },
  profileBtnText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.brandDark },

  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  reasonChip: { backgroundColor: Colors.secondarySystemBackground, borderWidth: 1, borderColor: Colors.separator, borderRadius: 100, paddingHorizontal: 11, paddingVertical: 5 },
  reasonText: { fontSize: 11.5, color: Colors.secondaryLabel, fontFamily: Fonts.medium },

  matchBook: { backgroundColor: Colors.brand, borderRadius: 100, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  matchBookText: { color: '#fff', fontSize: 14.5, fontFamily: Fonts.semibold },
});
