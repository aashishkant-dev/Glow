import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CalendarSVGIcon, StarIcon, SearchIcon } from '../../components/TabIcons';
import { GlowLogo, GlowMark } from '../../components/GlowLogo';
import {
  apiMyBookings,
  apiPublicCatalog,
  apiPublicProviders,
  Booking,
  CatalogService,
  PublicProviderCard,
} from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLang, useT } from '../../context/LangContext';
import { useLocation } from '../../context/LocationContext';
import { Colors, Fonts } from '../../utils/colors';
import { ServiceIcon } from '../../components/ServiceIcon';
import { BellIcon, PinIcon, CheckDecagramIcon } from '../../components/CareIcons';
import { SparkleIcon } from '../../components/BeautyIcons';
import { BookingCard } from '../../components/BookingCard';
import { BookingCardSkeleton } from '../../components/SkeletonLoader';
import { StatusBadge } from '../../components/StatusBadge';
import { LocationPrompt } from '../../components/LocationPrompt';
import { Storage } from '../../utils/storage';
import { useChatUnread } from '../../context/ChatUnreadContext';

const SERVICES = [
  { id: '1',  en: 'Makeup',        fr: 'Maquillage' },
  { id: '2',  en: 'Bridal Makeup', fr: 'Maquillage de mariée' },
  { id: '3',  en: 'Party Makeup',  fr: 'Maquillage de soirée' },
  { id: '4',  en: 'Threading',     fr: 'Épilation au fil' },
  { id: '5',  en: 'Hair Styling',  fr: 'Coiffure' },
  { id: '6',  en: 'Hair Coloring', fr: 'Coloration' },
  { id: '7',  en: 'Facial',        fr: 'Soin du visage' },
  { id: '8',  en: 'Waxing',        fr: 'Épilation à la cire' },
  { id: '9',  en: 'Nails',         fr: 'Ongles' },
  { id: '10', en: 'Mehendi',       fr: 'Mehendi' },
  { id: '11', en: 'Massage',       fr: 'Massage' },
];

const FR_SERVICE_NAMES: Record<string, string> = Object.fromEntries(SERVICES.map(s => [s.en, s.fr]));

// Occasion-first browsing — how women actually shop beauty: by moment, not by
// service taxonomy. Each maps to the closest bookable service.
const OCCASIONS: { id: string; en: string; fr: string; subEn: string; subFr: string; service: string; tint: string }[] = [
  { id: 'wedding',  en: 'Wedding',       fr: 'Mariage',        subEn: 'Bridal glam',        subFr: 'Glam de mariée',   service: 'Bridal Makeup', tint: '#FCECEF' },
  { id: 'party',    en: 'Party night',   fr: 'Soirée',         subEn: 'Full glam look',     subFr: 'Look glamour',     service: 'Party Makeup',  tint: '#F6EBC9' },
  { id: 'date',     en: 'Date night',    fr: 'Rendez-vous',    subEn: 'Soft & radiant',     subFr: 'Douce & radieuse', service: 'Makeup',        tint: '#FCECEF' },
  { id: 'festival', en: 'Festival',      fr: 'Festival',       subEn: 'Mehendi & more',     subFr: 'Mehendi & plus',   service: 'Mehendi',       tint: '#F6EBC9' },
  { id: 'everyday', en: 'Everyday glow', fr: 'Éclat quotidien', subEn: 'Skin-first beauty', subFr: 'Peau éclatante',   service: 'Facial',        tint: '#FCECEF' },
  { id: 'metime',   en: 'Me-time',       fr: 'Moment à moi',   subEn: 'Relax & recharge',   subFr: 'Détente totale',   service: 'Massage',       tint: '#F6EBC9' },
];

// Editorial inspiration tiles — designer photography drops in here later
// (see brand asset list); until then soft duotone canvases.
const INSPO: { id: string; en: string; fr: string; tagEn: string; tagFr: string; service: string; from: string; to: string }[] = [
  { id: 'softglam', en: 'Soft glam is in',        fr: 'Le soft glam',          tagEn: 'TREND',  tagFr: 'TENDANCE', service: 'Makeup',        from: '#E9A0B1', to: '#A34D63' },
  { id: 'bridal',   en: 'Wedding season looks',   fr: 'Looks de mariage',      tagEn: 'EDIT',   tagFr: 'ÉDITO',    service: 'Bridal Makeup', from: '#D4AF37', to: '#A3812A' },
  { id: 'nails',    en: 'Nail art we love',       fr: "Nail art qu'on adore",  tagEn: 'LOVED',  tagFr: 'COUP DE ♥', service: 'Nails',        from: '#D97A91', to: '#7E3B4D' },
  { id: 'hair',     en: 'Effortless waves',       fr: 'Ondulations naturelles', tagEn: 'HOW-TO', tagFr: 'TUTO',    service: 'Hair Styling',  from: '#C4667E', to: '#8E4257' },
];

const ACTIVE_STATUSES = new Set(['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED']);

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Press-scale wrapper — every touch feels alive. */
function Touch({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: any }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start()}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** Editorial artist card — soft rose canvas, avatar, gold-verified. */
function ArtistCard({ artist, locale, onPress }: { artist: PublicProviderCard; locale: string; onPress: () => void }) {
  const initial = artist.name?.[0]?.toUpperCase() ?? '?';
  return (
    <Touch onPress={onPress} style={styles.artistCardWrap}>
      <View style={styles.artistCard}>
        <View style={styles.artistCanvas}>
          {artist.photoUrl ? (
            <Image source={{ uri: artist.photoUrl }} style={styles.artistPhoto} contentFit="cover" cachePolicy="memory-disk" transition={200} />
          ) : (
            <View style={styles.artistPhotoFallback}>
              <Text style={styles.artistInitial}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={styles.artistBody}>
          <View style={styles.artistNameRow}>
            <Text style={styles.artistName} numberOfLines={1}>{artist.name}</Text>
            {artist.policeCheckCleared && <CheckDecagramIcon size={14} color={Colors.gold} />}
          </View>
          <Text style={styles.artistRole} numberOfLines={1}>
            {artist.specialties.length ? artist.specialties.slice(0, 2).join(' · ') : artist.qualificationType}
          </Text>
          <View style={styles.artistMetaRow}>
            <StarIcon size={12} color={Colors.gold} filled />
            <Text style={styles.artistRatingNum}>
              {artist.rating != null ? Number(artist.rating).toFixed(1) : (locale.startsWith('fr') ? 'Nouveau' : 'New')}
            </Text>
            {artist.ratingCount > 0 && <Text style={styles.artistRatingCount}>({artist.ratingCount})</Text>}
            <View style={styles.metaDot} />
            <Text style={styles.artistVisits}>
              {artist.completedVisits} {locale.startsWith('fr') ? 'visites' : 'visits'}
            </Text>
          </View>
        </View>
      </View>
    </Touch>
  );
}

export function HomeScreen() {
  const { user, photoUri } = useAuth();
  const { requestLocation, permissionStatus } = useLocation();
  const nav       = useNavigation<any>();
  const insets    = useSafeAreaInsets();
  const { lang, setLang } = useLang();
  const [bookings,      setBookings]      = useState<Booking[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [locationPromptedBefore, setLocationPromptedBefore] = useState(true);
  const [popularServices, setPopularServices] = useState<CatalogService[]>([]);
  const [artists, setArtists] = useState<PublicProviderCard[]>([]);
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('All');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  const { notifications } = useChatUnread();
  const unreadCount = notifications.filter(n => !n.read).length;

  const t              = useT('home');
  const activeBooking  = bookings.find(b => ACTIVE_STATUSES.has(b.status));
  const recentBookings = bookings.filter(b => !ACTIVE_STATUSES.has(b.status)).slice(0, 3);

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    Storage.getLocationPrompted().then(v => setLocationPromptedBefore(v));
  }, []);

  useEffect(() => {
    if (locationPromptedBefore) return;
    if (permissionStatus === 'denied' || permissionStatus === 'unavailable') {
      const t = setTimeout(() => setShowLocationPrompt(true), 800);
      return () => clearTimeout(t);
    }
  }, [permissionStatus, locationPromptedBefore]);

  // Auto-dismiss once permission granted (e.g. user enabled in Settings).
  useEffect(() => {
    if (permissionStatus === 'granted' && showLocationPrompt) {
      setShowLocationPrompt(false);
      Storage.saveLocationPrompted();
      setLocationPromptedBefore(true);
    }
  }, [permissionStatus, showLocationPrompt]);

  const handleLocationRequest = async () => {
    await requestLocation();
    setShowLocationPrompt(false);
    Storage.saveLocationPrompted();
    setLocationPromptedBefore(true);
  };

  const handleLocationSkip = () => {
    setShowLocationPrompt(false);
    Storage.saveLocationPrompted();
    setLocationPromptedBefore(true);
  };

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { bookings: data } = await apiMyBookings(true);
      setBookings(data.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()));
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Public catalog + artist directory — cached server-side.
  useEffect(() => {
    apiPublicCatalog()
      .then(({ categories }) => {
        const all = categories.flatMap(c => c.services);
        const popular = all.filter(s => s.popular);
        setPopularServices((popular.length ? popular : all).slice(0, 8));
      })
      .catch(() => {});
    apiPublicProviders()
      .then(({ providers }) => setArtists(providers))
      .catch(() => {});
  }, []);

  // Browse artists by their niche: chips from the specialties artists actually
  // have, list re-ordered by rating within the chosen specialty.
  const specialtyChips = React.useMemo(() => {
    const counts = new Map<string, number>();
    artists.forEach(a => a.specialties.forEach(s => counts.set(s, (counts.get(s) ?? 0) + 1)));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);
    return ['All', ...top];
  }, [artists]);

  const filteredArtists = React.useMemo(() => {
    const pool = specialtyFilter === 'All'
      ? artists
      : artists.filter(a => a.specialties.includes(specialtyFilter));
    return [...pool].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0)).slice(0, 8);
  }, [artists, specialtyFilter]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;
    const ua = navigator.userAgent;
    const isIOS = (/iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
      !(window as any).MSStream;
    if (!isIOS) return;
    Storage.getInstallDismissed().then(dismissed => { if (!dismissed) setShowIOSHint(true); });
  }, []);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  function dismissIOSHint() { Storage.saveInstallDismissed(); setShowIOSHint(false); }

  const locale    = lang === 'fr' ? 'fr-CA' : 'en-CA';
  const firstName = user?.name?.split(' ')[0] ?? (lang === 'fr' ? 'là' : 'there');
  const hour      = new Date().getHours();
  const greeting  = t.greeting(hour);

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.brand} />
        }
      >
        <Animated.View style={{ opacity: fadeIn }}>
          {/* Decorative glow field behind the header — quiet, editorial */}
          <View pointerEvents="none" style={styles.bgField}>
            <View style={[styles.bgBlob, { top: -60, right: -70, width: 220, height: 220, backgroundColor: Colors.brandLight }]} />
            <View style={[styles.bgBlob, { top: 90, left: -80, width: 170, height: 170, backgroundColor: Colors.goldSoft }]} />
            <View style={[styles.bgBlob, { top: 30, right: 90, width: 14, height: 14, backgroundColor: Colors.brandAccent, opacity: 0.6 }]} />
          </View>

          {/* ── Top bar — minimal ── */}
          <View style={[styles.topBar, { paddingTop: insets.top + 14 }]}>
            <GlowLogo size={34} showWordmark variant="onLight" />
            <View style={styles.topActions}>
              <Pressable style={({ pressed }) => [styles.pillBtn, pressed && { opacity: 0.7 }]} onPress={() => setLang(lang === 'en' ? 'fr' : 'en')}>
                <Text style={styles.pillBtnText}>{lang === 'en' ? 'FR' : 'EN'}</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]} onPress={() => nav.navigate('Notifications')}>
                <BellIcon size={18} color={Colors.label} />
                {unreadCount > 0 && (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.avatarBtn, pressed && { opacity: 0.88, transform: [{ scale: 0.96 }] }]}
                onPress={() => nav.navigate('Profile')}
                accessibilityLabel="Open profile"
                accessibilityRole="button"
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.avatarImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                ) : (
                  <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? '?'}</Text>
                )}
                {/* Soft rose ring + gold dot make the profile entry obvious */}
                <View style={styles.avatarRing} pointerEvents="none" />
                <View style={styles.avatarDot} pointerEvents="none" />
              </Pressable>
            </View>
          </View>

          {/* ── Greeting — editorial two-tone with gold period ── */}
          <View style={styles.greetingBlock}>
            <Text style={styles.greetingEyebrow}>{greeting}</Text>
            <Text style={styles.greetingMain}>
              {firstName}
              <Text style={styles.greetingDot}>.</Text>
            </Text>
            <Text style={styles.greetingSub}>{t.readySub}</Text>
          </View>

          {/* ── Search ── */}
          <Touch style={styles.searchWrap} onPress={() => nav.navigate('NewBooking', { bookingMode: 'scheduled', _t: Date.now() })}>
            <View style={styles.searchBar}>
              <SearchIcon size={17} color={Colors.tertiaryLabel} />
              <Text style={styles.searchText}>{t.searchPlaceholder}</Text>
            </View>
          </Touch>

          {/* ── Occasions — browse by moment ── */}
          <View style={[styles.sectionHeader, { marginTop: 8 }]}>
            <Text style={styles.sectionTitle}>{t.occasionTitle}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.occRow}>
            {OCCASIONS.map(o => (
              <Touch key={o.id} onPress={() => nav.navigate('NewBooking', { serviceType: o.service, bookingMode: 'scheduled', _t: Date.now() })}>
                <View style={[styles.occCard, { backgroundColor: o.tint }]}>
                  <View style={styles.occIcon}>
                    <ServiceIcon serviceType={o.service} size={20} color={Colors.brandDeep} bubble={false} />
                  </View>
                  <Text style={styles.occName}>{lang === 'fr' ? o.fr : o.en}</Text>
                  <Text style={styles.occSub}>{lang === 'fr' ? o.subFr : o.subEn}</Text>
                </View>
              </Touch>
            ))}
          </ScrollView>

          {/* ── Hero banner — book now ── */}
          <Touch style={styles.heroWrap} onPress={() => nav.navigate('NewBooking', { bookingMode: 'ondemand', _t: Date.now() })}>
            <View style={styles.heroBanner}>
              {Platform.OS === 'web' && (
                <View style={[StyleSheet.absoluteFill, { borderRadius: 28, background: 'linear-gradient(120deg, #E9A0B1 0%, #D97A91 55%, #A34D63 130%)' } as any]} />
              )}
              <View style={styles.heroGlow} />
              <Text style={styles.heroKicker}>{lang === 'fr' ? "C'EST L'HEURE DE BRILLER" : "IT'S GLOW O'CLOCK"}</Text>
              <Text style={styles.heroTitle}>{lang === 'fr' ? 'Sublime,\ndès ce soir.' : 'Stunning,\nby tonight.'}</Text>
              <Text style={styles.heroSub}>{t.onDemandSub}</Text>
              <View style={styles.heroCtaRow}>
                <View style={styles.heroCta}>
                  <Text style={styles.heroCtaText}>{t.bookNow}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => nav.navigate('NewBooking', { bookingMode: 'scheduled', _t: Date.now() })}>
                  <Text style={styles.heroAlt}>{t.scheduledTitle} →</Text>
                </Pressable>
              </View>
            </View>
          </Touch>

          {/* ── Active booking ── */}
          {activeBooking && (
            <Touch style={styles.sectionPad} onPress={() => nav.navigate('Tracking', {
              bookingId: activeBooking._id,
              bookingLocation: activeBooking.lat ? { lat: activeBooking.lat, lng: activeBooking.lng } : undefined,
            })}>
              <View style={styles.activeBanner}>
                <Animated.View style={[styles.activeDot, { transform: [{ scale: pulseAnim }] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeTitle}>{t.activeBooking}</Text>
                  <Text style={styles.activeSub}>
                    {activeBooking.serviceType} · {formatDate(activeBooking.scheduledAt, locale)} {formatTime(activeBooking.scheduledAt, locale)}
                  </Text>
                </View>
                <StatusBadge status={activeBooking.status} />
              </View>
            </Touch>
          )}

          {/* ── Categories ── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catRow}>
            {SERVICES.map(item => (
              <Touch key={item.id} onPress={() => nav.navigate('NewBooking', { serviceType: item.en, bookingMode: 'scheduled', _t: Date.now() })}>
                <View style={styles.catChip}>
                  <View style={styles.catCircle}>
                    <ServiceIcon serviceType={item.en} size={21} color={Colors.brandDark} bubble={false} />
                  </View>
                  <Text style={styles.catLabel} numberOfLines={1}>{lang === 'fr' ? item.fr : item.en}</Text>
                </View>
              </Touch>
            ))}
          </ScrollView>

          {/* ── Trending services ── */}
          {popularServices.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{lang === 'fr' ? 'Tout le monde réserve' : "Everyone's booking"}</Text>
                <SparkleIcon size={16} color={Colors.gold} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.trendRow}>
                {popularServices.map((svc, i) => (
                  <Touch key={svc.id} onPress={() => nav.navigate('NewBooking', { serviceType: svc.name, bookingMode: 'scheduled', _t: Date.now() })}>
                    <View style={[styles.trendCard, i % 2 === 1 && { backgroundColor: Colors.goldSoft }, i === 0 && styles.trendCardLead]}>
                      <View style={styles.trendTopRow}>
                        <View style={styles.trendIconWrap}>
                          <ServiceIcon serviceType={svc.name} size={19} color={Colors.brandDark} bubble={false} />
                        </View>
                        {svc.popular && (
                          <View style={styles.trendBadge}>
                            <Text style={styles.trendBadgeText}>{lang === 'fr' ? 'Populaire' : 'Popular'}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.trendName, i === 0 && { color: '#fff' }]} numberOfLines={2}>
                        {lang === 'fr' ? (FR_SERVICE_NAMES[svc.name] ?? svc.name) : svc.name}
                      </Text>
                      <Text style={[styles.trendMeta, i === 0 && { color: 'rgba(255,255,255,0.85)' }]}>
                        {svc.durationMin ? `${svc.durationMin} min · ` : ''}{t.from} ${Math.round(svc.basePrice)}
                      </Text>
                    </View>
                  </Touch>
                ))}
              </ScrollView>
            </>
          )}

          {/* ── Top rated artists ── */}
          {artists.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{lang === 'fr' ? 'Adorées des clientes' : 'Loved by clients'}</Text>
                <Pressable onPress={() => nav.navigate('NewBooking', { bookingMode: 'scheduled', _t: Date.now() })}>
                  <Text style={styles.seeAll}>{t.seeAll}</Text>
                </Pressable>
              </View>
              {/* Niche chips — browse artists by what they're best at */}
              {specialtyChips.length > 2 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.nicheRow}>
                  {specialtyChips.map(sp => {
                    const active = specialtyFilter === sp;
                    return (
                      <Pressable
                        key={sp}
                        style={[styles.nicheChip, active && styles.nicheChipActive]}
                        onPress={() => setSpecialtyFilter(sp)}
                      >
                        <Text style={[styles.nicheChipText, active && styles.nicheChipTextActive]}>
                          {sp === 'All' ? (lang === 'fr' ? 'Toutes' : 'All') : sp}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.artistRow}>
                {filteredArtists.map(a => (
                  <ArtistCard
                    key={a.id}
                    artist={a}
                    locale={locale}
                    onPress={() => nav.navigate('ProviderPublicProfile', { providerId: a.id, providerName: a.name })}
                  />
                ))}
              </ScrollView>
            </>
          )}

          {/* ── Beauty inspiration — editorial carousel ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.inspirationTitle}</Text>
            <SparkleIcon size={16} color={Colors.gold} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.inspoRow}>
            {INSPO.map(item => (
              <Touch key={item.id} onPress={() => nav.navigate('NewBooking', { serviceType: item.service, bookingMode: 'scheduled', _t: Date.now() })}>
                <View style={styles.inspoCard}>
                  {Platform.OS === 'web' ? (
                    <View style={[StyleSheet.absoluteFill, { background: `linear-gradient(150deg, ${item.from}, ${item.to})` } as any]} />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: item.from }]} />
                  )}
                  <View style={styles.inspoGlow} />
                  <View style={styles.inspoTag}>
                    <Text style={styles.inspoTagText}>{lang === 'fr' ? item.tagFr : item.tagEn}</Text>
                  </View>
                  <Text style={styles.inspoTitle}>{lang === 'fr' ? item.fr : item.en}</Text>
                  <Text style={styles.inspoCta}>{lang === 'fr' ? 'Réserver ce look →' : 'Book this look →'}</Text>
                </View>
              </Touch>
            ))}
          </ScrollView>

          {/* ── Offer strip ── */}
          <View style={styles.sectionPad}>
            <View style={styles.offerCard}>
              <View style={styles.offerIcon}>
                <SparkleIcon size={18} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.offerTitle}>{lang === 'fr' ? 'Le glam vient à vous' : 'Glam that comes to you'}</Text>
                <Text style={styles.offerSub}>
                  {lang === 'fr' ? 'Chaque artiste est vérifiée et assurée' : 'Every artist is verified & background checked'}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Your bookings ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.recentTitle}</Text>
            <Pressable onPress={() => nav.navigate('BookingsTab')}>
              <Text style={styles.seeAll}>{t.seeAll}</Text>
            </Pressable>
          </View>

          {loading ? (
            <><BookingCardSkeleton /><BookingCardSkeleton /></>
          ) : recentBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyArt}>
                <GlowMark size={44} petal={Colors.brandAccent} core={Colors.gold} />
              </View>
              <Text style={styles.emptyTitle}>{t.emptyTitle}</Text>
              <Text style={styles.emptySub}>{t.emptySub}</Text>
              <Touch onPress={() => nav.navigate('NewBooking', { _t: Date.now() })}>
                <View style={styles.emptyCta}>
                  <Text style={styles.emptyCtaText}>{t.bookFirst}</Text>
                </View>
              </Touch>
            </View>
          ) : (
            recentBookings.map(b => (
              <BookingCard key={b._id} booking={b} onPress={() => nav.navigate('BookingDetail', { booking: b })} />
            ))
          )}

          {showIOSHint && (
            <View style={styles.iosHint}>
              <Text style={styles.iosHintText}>
                {lang === 'fr'
                  ? "Appuyez sur Partager puis « Ajouter à l'écran d'accueil »"
                  : 'Tap Share → "Add to Home Screen" to install'}
              </Text>
              <Pressable onPress={dismissIOSHint} style={{ padding: 4 }} hitSlop={12}>
                <Text style={styles.iosHintDismiss}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* ── Footer ── */}
          <View style={styles.footer}>
            <GlowMark size={26} petal={Colors.opaqueSeparator} core={Colors.opaqueSeparator} />
            <Text style={styles.footerNote}>
              {lang === 'fr' ? 'Beauté à domicile · Kathmandu, Népal' : 'Beauty at your doorstep · Kathmandu, Nepal 🇳🇵'}
            </Text>
            <Text style={styles.footerCopy}>© {new Date().getFullYear()} Glow</Text>
          </View>
        </Animated.View>
      </ScrollView>
      <LocationPrompt
        visible={showLocationPrompt}
        onRequest={handleLocationRequest}
        onSkip={handleLocationSkip}
        isDenied={permissionStatus === 'denied'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.systemGroupedBackground },
  // Extra bottom padding so content clears the floating pill tab bar.
  scrollContent: { paddingBottom: 130 },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, marginBottom: 26,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pillBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: Colors.separator,
  },
  pillBtnText: { color: Colors.secondaryLabel, fontSize: 12, fontFamily: Fonts.semibold, letterSpacing: 0.4 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: 1, right: 1,
    minWidth: 15, height: 15, borderRadius: 8,
    backgroundColor: Colors.brand,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  bellBadgeText: { color: '#fff', fontSize: 9.5, fontFamily: Fonts.bold },
  avatarBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.brandAccent,
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarImg: { width: 38, height: 38, borderRadius: 19 },
  avatarText: { color: Colors.brandDark, fontSize: 16, fontFamily: Fonts.bold },
  avatarRing: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 21,
    borderWidth: 0,
  },
  avatarDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.gold,
    borderWidth: 2, borderColor: '#fff',
  },

  bgField: { position: 'absolute', top: 0, left: 0, right: 0, height: 340, overflow: 'hidden' },
  bgBlob: { position: 'absolute', borderRadius: 999 },

  greetingBlock: { paddingHorizontal: 24, marginBottom: 22 },
  greetingEyebrow: { fontSize: 15, color: Colors.secondaryLabel, fontFamily: Fonts.regular, marginBottom: 2 },
  greetingMain: { fontSize: 42, lineHeight: 48, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -1.4 },
  greetingDot: { color: Colors.gold },
  greetingSub:  { fontSize: 15, color: Colors.secondaryLabel, marginTop: 8, fontFamily: Fonts.regular },

  searchWrap: { paddingHorizontal: 24, marginBottom: 18 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: Colors.separator,
    borderRadius: 18, paddingHorizontal: 18, paddingVertical: 15,
  },
  searchText: { color: Colors.secondaryLabel, fontSize: 14.5, fontFamily: Fonts.regular },

  heroWrap: { paddingHorizontal: 24, marginBottom: 10 },
  heroBanner: {
    backgroundColor: Colors.brand, borderRadius: 28, padding: 26,
    overflow: 'hidden',
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.32, shadowRadius: 28, elevation: 8,
  },
  heroGlow: {
    position: 'absolute', top: -50, right: -30,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroKicker: { color: 'rgba(255,255,255,0.92)', fontSize: 11, fontFamily: Fonts.semibold, letterSpacing: 1.4 },
  heroTitle: { color: '#fff', fontSize: 28, lineHeight: 33, fontFamily: Fonts.bold, letterSpacing: -0.6, marginTop: 10 },
  heroSub: { color: 'rgba(255,255,255,0.95)', fontSize: 13.5, marginTop: 8, fontFamily: Fonts.regular },
  heroCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 20 },
  heroCta: {
    backgroundColor: '#fff', borderRadius: 100, paddingHorizontal: 22, paddingVertical: 12,
  },
  heroCtaText: { color: Colors.brandDeep, fontSize: 14, fontFamily: Fonts.semibold },
  heroAlt: { color: 'rgba(255,255,255,0.9)', fontSize: 13.5, fontFamily: Fonts.medium },

  sectionPad: { paddingHorizontal: 24 },

  activeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: Colors.separator, marginTop: 14,
  },
  activeDot:   { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.systemGreen },
  activeTitle: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.label },
  activeSub:   { fontSize: 12.5, color: Colors.secondaryLabel, marginTop: 2, fontFamily: Fonts.regular },

  // Occasion tiles
  occRow: { paddingHorizontal: 24, gap: 12 },
  occCard: { width: 150, borderRadius: 24, padding: 16, minHeight: 128, justifyContent: 'flex-end' },
  occIcon: {
    position: 'absolute', top: 14, left: 14,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center', justifyContent: 'center',
  },
  occName: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label },
  occSub: { fontSize: 12, color: Colors.secondaryLabel, marginTop: 2, fontFamily: Fonts.regular },

  // Inspiration tiles
  inspoRow: { paddingHorizontal: 24, gap: 12 },
  inspoCard: {
    width: 240, height: 150, borderRadius: 26, padding: 18,
    overflow: 'hidden', justifyContent: 'flex-end',
  },
  inspoGlow: {
    position: 'absolute', top: -40, right: -30,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  inspoTag: {
    position: 'absolute', top: 14, left: 16,
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  inspoTagText: { color: '#fff', fontSize: 9.5, fontFamily: Fonts.semibold, letterSpacing: 1 },
  inspoTitle: { color: '#fff', fontSize: 18, fontFamily: Fonts.semibold, letterSpacing: -0.3, lineHeight: 23 },
  inspoCta: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 5, fontFamily: Fonts.medium },

  // Clamps every horizontal row to the screen width on web — without an
  // explicit style, RN Web can size a ScrollView to its content instead of
  // its container, letting the row (and the page) bleed past the viewport.
  hScroll: { width: '100%' },
  catScroll: { width: '100%', marginTop: 24 },
  catRow: { paddingHorizontal: 24, gap: 16 },
  catChip: { alignItems: 'center', gap: 8, width: 66 },
  catCircle: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: Colors.separator,
    alignItems: 'center', justifyContent: 'center',
  },
  catLabel: { fontSize: 11.5, fontFamily: Fonts.medium, color: Colors.label },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, marginTop: 34, marginBottom: 16,
  },
  sectionTitle: { fontSize: 21, fontFamily: Fonts.semibold, color: Colors.label, letterSpacing: -0.4 },
  seeAll: { fontSize: 13.5, fontFamily: Fonts.medium, color: Colors.brandDark },

  trendRow: { paddingHorizontal: 24, gap: 12 },
  trendCard: {
    width: 168, borderRadius: 22, padding: 16,
    backgroundColor: Colors.brandLight,
  },
  trendCardLead: { width: 205, backgroundColor: Colors.brand },
  trendTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trendIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },
  trendBadge: { backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4 },
  trendBadgeText: { fontSize: 9.5, fontFamily: Fonts.semibold, color: Colors.brandDeep, letterSpacing: 0.3 },
  trendName: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label, marginTop: 14, lineHeight: 19 },
  trendMeta: { fontSize: 12.5, color: Colors.secondaryLabel, marginTop: 6, fontFamily: Fonts.regular },

  nicheRow: { paddingHorizontal: 24, gap: 8, marginBottom: 14 },
  nicheChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 100, backgroundColor: '#fff',
    borderWidth: 1, borderColor: Colors.separator,
  },
  nicheChipActive: { backgroundColor: Colors.label, borderColor: Colors.label },
  nicheChipText: { fontSize: 12.5, fontFamily: Fonts.medium, color: Colors.secondaryLabel },
  nicheChipTextActive: { color: '#fff' },

  artistRow: { paddingHorizontal: 24, gap: 14 },
  artistCardWrap: {},
  artistCard: {
    width: 200, backgroundColor: '#fff', borderRadius: 24,
    borderWidth: 1, borderColor: Colors.separator, overflow: 'hidden',
  },
  artistCanvas: { height: 120, backgroundColor: Colors.brandLight },
  artistPhoto: { width: '100%', height: '100%' },
  artistPhotoFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  artistInitial: { fontSize: 34, fontFamily: Fonts.semibold, color: Colors.brandAccent },
  artistBody: { padding: 14 },
  artistNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  artistName: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label, flexShrink: 1 },
  artistRole: { fontSize: 12, color: Colors.secondaryLabel, marginTop: 2, fontFamily: Fonts.regular },
  artistMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 9 },
  artistRatingNum: { fontSize: 12.5, fontFamily: Fonts.semibold, color: Colors.label },
  artistRatingCount: { fontSize: 11.5, color: Colors.secondaryLabel, fontFamily: Fonts.regular },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.systemGray3, marginHorizontal: 3 },
  artistVisits: { fontSize: 11.5, color: Colors.secondaryLabel, fontFamily: Fonts.regular },

  offerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.goldSoft, borderRadius: 22, padding: 18,
    marginTop: 34,
  },
  offerIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center', justifyContent: 'center',
  },
  offerTitle: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label },
  offerSub: { fontSize: 12.5, color: Colors.secondaryLabel, marginTop: 2, fontFamily: Fonts.regular, lineHeight: 17 },

  emptyState: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyArt: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  emptyTitle: { fontSize: 17, fontFamily: Fonts.semibold, color: Colors.label, marginBottom: 6 },
  emptySub:   { fontSize: 13.5, color: Colors.secondaryLabel, textAlign: 'center', marginBottom: 20, fontFamily: Fonts.regular },
  emptyCta: {
    backgroundColor: Colors.brand, borderRadius: 100,
    paddingVertical: 14, paddingHorizontal: 28,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 5,
  },
  emptyCtaText: { color: '#fff', fontSize: 14, fontFamily: Fonts.semibold },

  iosHint: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 24, marginTop: 20,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.separator,
  },
  iosHintText:    { flex: 1, fontSize: 13, color: Colors.label, lineHeight: 18, fontFamily: Fonts.regular },
  iosHintDismiss: { color: Colors.tertiaryLabel, fontSize: 14, fontFamily: Fonts.bold },

  footer: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  footerNote: { fontSize: 12.5, color: Colors.tertiaryLabel, fontFamily: Fonts.regular },
  footerCopy: { fontSize: 11, color: Colors.systemGray3, fontFamily: Fonts.regular },
});
