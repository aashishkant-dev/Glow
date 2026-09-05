import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  Animated,
  Easing,
  Linking,
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
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { StarIcon, CalendarIcon, SearchIcon, LocationIcon, ChevronDownIcon, ChatIcon } from '../../components/TabIcons';
import { GlowLogo, GlowMark } from '../../components/GlowLogo';
import {
  apiMyBookings,
  apiPublicCatalog,
  apiPublicProviders,
  apiGetInquiryThreads,
  Booking,
  PublicProviderCard,
} from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import { Colors, Fonts } from '../../utils/colors';
import { reverseGeocodeOSM } from '../../utils/reverseGeocode';
import { BellIcon, CheckDecagramIcon } from '../../components/CareIcons';
import { SparkleIcon } from '../../components/BeautyIcons';
import { GlowMatchSheet } from '../../components/GlowMatchSheet';
import { LookSheet } from '../../components/LookSheet';
import { LookTile } from '../../components/LookTile';
import { LOOKS, Look } from '../../data/looks';
import { CATEGORIES } from '../../data/categories';
import { Storage } from '../../utils/storage';
import { useChatUnread } from '../../context/ChatUnreadContext';
import { tapLight } from '../../utils/haptics';
import { humanizeQualification } from '../../utils/format';
import { getCountryCode } from '../../utils/region';

/**
 * Category-first home. Every card is a real ServiceItem grouping (see
 * ../../data/categories.ts) and lands in the booking flow with the right
 * service already chosen.
 */

const ACTIVE_STATUSES = new Set(['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED']);

// Exact photo from the real Figma Make source (see "new figma design/glow_01/src/App.tsx").
const HERO_PHOTO_URL = 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&h=320&fit=crop&auto=format';

// Short display labels for the compact services grid — CATEGORIES' full
// names (e.g. "Waxing & Hair Removal") are used for booking/analytics
// elsewhere, but wrap to two lines in a 4-column grid and break row
// alignment, so this grid shows a shorter label just for itself.
const SHORT_SERVICE_LABEL: Record<string, string> = { waxing: 'Waxing', spa: 'Spa' };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function relativeDayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diffDays = Math.round((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return formatDate(iso);
}
function monthAbbrev(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}
function dayNumber(iso: string) {
  return new Date(iso).getDate();
}

// Nominatim's `address.city`/`address.state` are official administrative
// names — e.g. Nepal municipalities come back as "Kathmandu Metropolitan
// City" / "Bagmati Province", which is accurate but far longer than the
// short "neighborhood, city" Figma-style label this pill is meant to show.
// Prefer the smallest named area available, and strip the formal suffixes.
function formatLocationName(addr: Record<string, string | undefined>): string {
  const area = addr.suburb ?? addr.neighbourhood ?? addr.city_district
    ?? addr.city ?? addr.town ?? addr.village ?? addr.county;
  const region = addr.state ?? addr.county;
  const clean = (s?: string) => s?.replace(/\s*(Metropolitan City|Sub-Metropolitan City|Municipality|Province)$/i, '').trim();
  return [clean(area), area !== region ? clean(region) : undefined].filter(Boolean).join(', ');
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

/**
 * Sparkle-burst button — pure delight, no navigation. Tapping fans out a ring
 * of small sparkle glyphs from the icon that scale/fade outward, then reset,
 * so it can be tapped again.
 */
function SparkleBurstButton() {
  const BURST_COUNT = 6;
  const anims = useRef(Array.from({ length: BURST_COUNT }, () => new Animated.Value(0))).current;
  const [bursting, setBursting] = useState(false);

  function burst() {
    if (bursting) return;
    setBursting(true);
    anims.forEach(v => v.setValue(0));
    Animated.stagger(
      30,
      anims.map(v => Animated.timing(v, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true })),
    ).start(() => setBursting(false));
  }

  return (
    <Pressable onPress={burst} hitSlop={10} style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
      <SparkleIcon size={16} color={Colors.gold} />
      {anims.map((v, i) => {
        const angle = (i / BURST_COUNT) * 2 * Math.PI;
        const distance = 22;
        const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] });
        const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * distance] });
        const scale = v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0.3] });
        const opacity = v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] });
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              transform: [{ translateX }, { translateY }, { scale }],
              opacity,
            }}
          >
            <SparkleIcon size={12} color={Colors.gold} />
          </Animated.View>
        );
      })}
    </Pressable>
  );
}

/** Editorial artist card — soft rose canvas, avatar, gold-verified. */
function ArtistCard({ artist, onPress }: { artist: PublicProviderCard; onPress: () => void }) {
  const initial = artist.name?.[0]?.toUpperCase() ?? '?';
  return (
    <Touch onPress={onPress}>
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
            {artist.specialties.length ? artist.specialties.slice(0, 2).join(' · ') : humanizeQualification(artist.qualificationType)}
          </Text>
          <View style={styles.artistMetaRow}>
            <StarIcon size={12} color={Colors.gold} filled />
            <Text style={styles.artistRatingNum}>
              {artist.rating != null ? Number(artist.rating).toFixed(1) : 'New'}
            </Text>
            {artist.ratingCount > 0 && <Text style={styles.artistRatingCount}>({artist.ratingCount})</Text>}
            <View style={styles.metaDot} />
            <Text style={styles.artistVisits}>{artist.completedVisits} visits</Text>
          </View>
        </View>
      </View>
    </Touch>
  );
}

export function HomeScreen() {
  const { user, photoUri } = useAuth();
  const { coords, requestLocation, permissionStatus } = useLocation();
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [bookings,   setBookings]   = useState<Booking[]>([]);
  const [bookingsError, setBookingsError] = useState(false);
  const [artistsError, setArtistsError]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [cityName, setCityName] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [artists, setArtists] = useState<PublicProviderCard[]>([]);
  const [catalogPrices, setCatalogPrices] = useState<Record<string, number>>({});
  const [showMatch, setShowMatch] = useState(false);
  const [openLook, setOpenLook] = useState<Look | null>(null);
  // Category grid defaults to scheduling ahead; "Now" lets a customer book
  // the tapped category for on-demand/next-available instead, without
  // needing to go through Find My Glow for the common "book right now" case.
  const [categoryWhen, setCategoryWhen] = useState<'now' | 'later'>('later');
  const fadeIn = useRef(new Animated.Value(0)).current;

  const { notifications } = useChatUnread();
  const unreadCount = notifications.filter(n => !n.read).length;
  const [unreadInquiries, setUnreadInquiries] = useState(0);
  useFocusEffect(useCallback(() => {
    apiGetInquiryThreads()
      .then(r => setUnreadInquiries(r.threads.filter(t => t.unread).length))
      .catch(() => {});
  }, []));

  const activeBooking = bookings.find(b => ACTIVE_STATUSES.has(b.status));

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  // Once real GPS coords land, resolve them to a city/region name for
  // display. No full-screen "Enable Location" sheet — just this pill,
  // tapped on demand.
  //
  // expo-location's reverseGeocodeAsync always returns [] on web (the
  // Geocoding API was removed from the web shim in Expo SDK 49) — use
  // OpenStreetMap's free Nominatim API there instead, same fallback
  // CreateBookingScreen already uses for the same reason.
  useEffect(() => {
    if (!coords) { setCityName(null); return; }
    let cancelled = false;

    if (Platform.OS === 'web') {
      reverseGeocodeOSM(coords.lat, coords.lng)
        .then(osm => {
          if (cancelled || !osm) return;
          const name = formatLocationName(osm.raw);
          if (name) setCityName(name);
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }

    // Apple's geocoder first, OSM only when it comes back with nothing
    // usable. In Kathmandu it routinely returns a null city AND a null
    // subregion, which left this pill with no name at all — the same
    // coverage gap that stopped the booking form autofilling a city, just
    // showing up somewhere quieter.
    import('expo-location').then(Location =>
      Location.reverseGeocodeAsync({ latitude: coords.lat, longitude: coords.lng })
        .then(async hits => {
          if (cancelled) return;
          const h = hits[0];
          const name = h ? [h.city ?? h.subregion, h.region].filter(Boolean).join(', ') : '';
          if (name) { setCityName(name); return; }
          const osm = await reverseGeocodeOSM(coords.lat, coords.lng);
          if (cancelled || !osm) return;
          const osmName = formatLocationName(osm.raw);
          if (osmName) setCityName(osmName);
        })
        .catch(() => {}),
    );
    return () => { cancelled = true; };
  }, [coords]);

  const handleLocationPress = async () => {
    if (locating) return;
    if (permissionStatus === 'denied' && Platform.OS !== 'web') {
      Linking.openSettings();
      return;
    }
    setLocating(true);
    await requestLocation();
    setLocating(false);
  };

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const { bookings: data } = await apiMyBookings(true);
      setBookings(data.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()));
      setBookingsError(false);
    } catch {
      // Previously silent — a network blip rendered as "no upcoming appointment"
      // with no way to tell that apart from a legitimately empty schedule.
      setBookingsError(true);
    }
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadArtists = useCallback(() => {
    apiPublicProviders()
      .then(({ providers }) => { setArtists(providers); setArtistsError(false); })
      // Same silent-failure issue as bookings above, for the "Loved by clients"
      // section — an empty result from a failed fetch looked identical to a
      // legitimately empty directory.
      .catch(() => setArtistsError(true));
  }, []);

  // Public catalog (live look prices) + artist directory — cached server-side.
  useEffect(() => {
    apiPublicCatalog()
      .then(({ categories }) => {
        const map: Record<string, number> = {};
        categories.flatMap(c => c.services).forEach(s => { map[s.name] = s.basePrice; });
        setCatalogPrices(map);
      })
      .catch(() => {});
    loadArtists();
  }, [loadArtists]);

  const topArtists = React.useMemo(
    () => [...artists].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0)).slice(0, 8),
    [artists],
  );

  // Region-specific looks (e.g. Nepal's Teej Radiance, France's Chic Chignon —
  // see data/looks.ts) rank above the universal list for a user detected in
  // that country, instead of competing on equal footing with looks written
  // for a different market. A look with no `regions` is universal and always
  // eligible; nothing is ever hidden, just reordered.
  const trendingLooks = React.useMemo(() => {
    const country = getCountryCode();
    return [...LOOKS]
      .sort((a, b) => {
        const aLocal = country && a.regions?.includes(country) ? 1 : 0;
        const bLocal = country && b.regions?.includes(country) ? 1 : 0;
        if (aLocal !== bLocal) return bLocal - aLocal;
        return Number(!!b.tall) - Number(!!a.tall);
      })
      .slice(0, 6);
    // getCountryCode() reads a plain module-level variable (region.ts), not
    // reactive state — re-keying on user?.phone (resolved async, after this
    // screen can already have mounted) forces a recompute once the real
    // country lands, instead of freezing on whatever it was at first render.
  }, [user?.phone]);

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

  function dismissIOSHint() { Storage.saveInstallDismissed(); setShowIOSHint(false); }

  function openCategory(c: typeof CATEGORIES[number]) {
    tapLight();
    nav.navigate('NewBooking', {
      serviceType: c.serviceType,
      bookingMode: categoryWhen === 'now' ? 'ondemand' : 'scheduled',
      _t: Date.now(),
    });
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  // The tab bar and Find My Glow are floating, `position: absolute` overlays
  // that paint on top of whatever's beneath them — that's the whole point of
  // a floating bar. Earlier this screen tried to prevent them ever painting
  // over content by shrinking the ScrollView's own visible frame (marginBottom
  // = tabBarHeight + …), but that traded "content invisible behind an opaque
  // bar" for "content hard-clipped mid-row at a scroll boundary that moves
  // with device/viewport height" — neither reads as intentional. The actual
  // fix: make both overlays properly translucent (real blur, not solid fill —
  // see GlassTabBarBackground and matchCta below) and let the ScrollView run
  // full height like any normal scroll view. Content scrolling underneath a
  // frosted-glass bar is the standard, deliberate pattern (iOS tab bars,
  // Instagram, etc.) — it's never fully hidden, just softly blurred through,
  // which reads as "there's a floating control here" instead of "this is
  // broken."
  const tabBarHeight = useBottomTabBarHeight();

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
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
                onPress={() => nav.navigate('Bookings')}
                accessibilityLabel="My bookings"
              >
                <CalendarIcon size={18} color={Colors.label} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
                onPress={() => nav.navigate('Inquiries')}
                accessibilityLabel="My messages"
              >
                <ChatIcon size={18} color={Colors.label} />
                {unreadInquiries > 0 && (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{unreadInquiries > 9 ? '9+' : unreadInquiries}</Text>
                  </View>
                )}
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
                onPress={() => nav.navigate('ProfileTab')}
                accessibilityLabel="Open profile"
                accessibilityRole="button"
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.avatarImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                ) : (
                  <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? '?'}</Text>
                )}
                <View style={styles.avatarDot} pointerEvents="none" />
              </Pressable>
            </View>
          </View>

          {/* ── The one question this screen answers ── */}
          <View style={styles.greetingBlock}>
            <Text style={styles.greetingEyebrow}>{greeting}, {firstName} ✨</Text>
            <Pressable
              style={({ pressed }) => [styles.searchBar, pressed && { opacity: 0.85 }]}
              onPress={() => { tapLight(); nav.navigate('ExploreTab', { openSearch: true }); }}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <SearchIcon size={17} color={Colors.tertiaryLabel} />
              <Text style={styles.searchBarText}>Search "Waxing, Facial, Nails…"</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.locationRow, pressed && { opacity: 0.7 }]}
              onPress={handleLocationPress}
              accessibilityRole="button"
              accessibilityLabel={cityName ? `Location: ${cityName}` : 'Enable location'}
            >
              <LocationIcon size={13} color={Colors.brand} />
              <Text style={styles.locationRowText} numberOfLines={1}>
                {locating ? 'Locating…' : cityName ? cityName : 'Enable location'}
              </Text>
              <ChevronDownIcon size={13} color={Colors.tertiaryLabel} />
            </Pressable>
          </View>

          {bookingsError && (
            <View style={[styles.sectionPad, { marginBottom: 16 }]}>
              <View style={styles.errorBox}>
                <Text style={styles.errorBoxText}>Something went wrong loading your bookings.</Text>
                <Pressable onPress={() => load()} hitSlop={8}>
                  <Text style={styles.errorBoxRetry}>Retry</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Hero banner ── */}
          <View style={styles.sectionPad}>
            <Touch onPress={() => { tapLight(); setShowMatch(true); }}>
              <View style={styles.heroBanner}>
                <Image
                  source={{ uri: HERO_PHOTO_URL }}
                  style={[StyleSheet.absoluteFill, { opacity: 0.6 }]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
                <LinearGradient
                  colors={['rgba(232,99,140,0.85)', 'rgba(192,65,94,0.65)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroBannerContent}>
                  <Text style={styles.heroEyebrow}>At-home beauty</Text>
                  <Text style={styles.heroTitle}>Glow from the{'\n'}comfort of home</Text>
                  <View style={styles.heroCta}>
                    <Text style={styles.heroCtaText}>Book now →</Text>
                  </View>
                </View>
              </View>
            </Touch>
          </View>

          {/* ── Services ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Services</Text>
            <Pressable onPress={() => { tapLight(); nav.navigate('ExploreTab'); }}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>
          <View style={styles.whenToggleRow}>
            {(['now', 'later'] as const).map(w => {
              const active = categoryWhen === w;
              return (
                <Pressable
                  key={w}
                  style={[styles.whenToggle, active && styles.whenToggleActive]}
                  onPress={() => { tapLight(); setCategoryWhen(w); }}
                >
                  <Text style={[styles.whenToggleText, active && styles.whenToggleTextActive]}>
                    {w === 'now' ? '⚡ Now' : '📅 Schedule'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.servicesGrid}>
            {[...CATEGORIES.slice(0, 7), CATEGORIES.find(c => c.id === 'spa')!].map(c => (
              <Touch key={c.id} style={styles.serviceWrap} onPress={() => openCategory(c)}>
                <View style={styles.serviceIcon}>
                  <c.Icon size={50} />
                </View>
                <View style={styles.serviceNameWrap}>
                  <Text style={styles.serviceName} numberOfLines={2}>{SHORT_SERVICE_LABEL[c.id] ?? c.name}</Text>
                </View>
              </Touch>
            ))}
          </View>

          {/* ── Upcoming appointment ── */}
          {activeBooking && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Upcoming Appointment</Text>
              </View>
              <Touch style={styles.sectionPad} onPress={() => nav.navigate('Tracking', {
                bookingId: activeBooking._id,
                bookingLocation: activeBooking.lat ? { lat: activeBooking.lat, lng: activeBooking.lng } : undefined,
              })}>
                <View style={styles.upcomingCard}>
                  <View style={styles.upcomingDateBadge}>
                    <Text style={styles.upcomingDateMonth}>{monthAbbrev(activeBooking.scheduledAt)}</Text>
                    <Text style={styles.upcomingDateDay}>{dayNumber(activeBooking.scheduledAt)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.upcomingTitle} numberOfLines={1}>{activeBooking.serviceType}</Text>
                    <Text style={styles.upcomingSub} numberOfLines={1}>
                      {relativeDayLabel(activeBooking.scheduledAt)} · {formatTime(activeBooking.scheduledAt)}
                      {activeBooking.provider?.name ? ` · ${activeBooking.provider.name}` : ''}
                    </Text>
                  </View>
                  <View style={styles.upcomingViewBtn}>
                    <Text style={styles.upcomingViewText}>View</Text>
                  </View>
                </View>
              </Touch>
            </>
          )}

          {/* ── Top rated artists ── */}
          {(topArtists.length > 0 || artistsError) && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Loved by clients</Text>
                {!artistsError && <SparkleBurstButton />}
              </View>
              {artistsError ? (
                <View style={styles.sectionPad}>
                  <View style={styles.errorBox}>
                    <Text style={styles.errorBoxText}>Something went wrong loading artists.</Text>
                    <Pressable onPress={loadArtists} hitSlop={8}>
                      <Text style={styles.errorBoxRetry}>Retry</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.artistRow}>
                  {topArtists.map(a => (
                    <ArtistCard
                      key={a.id}
                      artist={a}
                      onPress={() => nav.navigate('ProviderPublicProfile', { providerId: a.id, providerName: a.name })}
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}

          {/* ── Trending looks — outcomes, not services ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Trending looks</Text>
            <Pressable onPress={() => nav.navigate('ExploreTab')}>
              <Text style={styles.seeAll}>Explore all</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.lookRow}>
            {trendingLooks.map(look => (
              // 150/130 matches every other horizontal-scroll look strip in
              // the app (ProviderLooksScreen, ProviderPublicProfileScreen,
              // Explore's "From our artists") — this row was the one place
              // still using a bigger, one-off 190/150 for no functional
              // reason, so the same look rendered a different size depending
              // on which screen you saw it from.
              <View key={look.id} style={{ width: 150 }}>
                <LookTile
                  look={look}
                  height={130}
                  price={catalogPrices[look.serviceType]}
                  onPress={() => setOpenLook(look)}
                />
              </View>
            ))}
          </ScrollView>

          {/* ── Trust strip ── */}
          <View style={styles.sectionPad}>
            <View style={styles.offerCard}>
              <View style={styles.offerIcon}>
                <SparkleIcon size={18} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.offerTitle}>Glam that comes to you</Text>
                <Text style={styles.offerSub}>Every artist is identity-verified — gold badge means background checked</Text>
              </View>
            </View>
          </View>

          {showIOSHint && (
            <View style={styles.iosHint}>
              <Text style={styles.iosHintText}>
                Tap Share → "Add to Home Screen" to install
              </Text>
              <Pressable onPress={dismissIOSHint} style={{ padding: 4 }} hitSlop={12}>
                <Text style={styles.iosHintDismiss}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* ── Footer ── */}
          <View style={styles.footer}>
            <GlowMark size={26} petal={Colors.opaqueSeparator} core={Colors.opaqueSeparator} />
            <Text style={styles.footerNote}>Beauty at your doorstep</Text>
            <Text style={styles.footerCopy}>© {new Date().getFullYear()} Glow</Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* ── Find My Glow — the one primary CTA, floating just above the tab
          bar so it stays reachable while scrolling. Translucent (not solid)
          for the same reason the tab bar is: content scrolls naturally
          underneath instead of being clipped or hidden, and stays legible
          through the blur instead of vanishing behind an opaque pill. ── */}
      <View pointerEvents="box-none" style={[styles.matchCtaWrap, { bottom: tabBarHeight + 14 }]}>
        <Touch onPress={() => { tapLight(); setShowMatch(true); }}>
          <View style={styles.matchCta}>
            {Platform.OS === 'web' ? (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.matchCtaGlass]} />
            ) : (
              // Blur alone (tint="light") has no brand color at all — on iOS
              // this rendered as a plain white/frosted pill with white text
              // on top, i.e. invisible text on a "totally white" button. The
              // web path already layers a rose-tinted glass fill over the
              // blur; native needs the same second layer, not just the blur.
              <>
                <BlurView intensity={60} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: 100, overflow: 'hidden' }]} />
                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.matchCtaTint]} />
              </>
            )}
            <Text style={styles.matchCtaText}>✨ Find My Glow</Text>
          </View>
        </Touch>
      </View>

      <GlowMatchSheet visible={showMatch} onClose={() => setShowMatch(false)} />
      <LookSheet
        look={openLook}
        priceOverride={openLook ? catalogPrices[openLook.serviceType] : undefined}
        onClose={() => setOpenLook(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.systemGroupedBackground },
  // Extra bottom padding so content clears the floating pill bar + Find My Glow CTA.
  scrollContent: { paddingBottom: 185 },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, marginBottom: 26,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  avatarDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.gold,
    borderWidth: 2, borderColor: '#fff',
  },

  bgField: { position: 'absolute', top: 0, left: 0, right: 0, height: 340, overflow: 'hidden' },
  bgBlob: { position: 'absolute', borderRadius: 999 },

  greetingBlock: { paddingHorizontal: 24, marginBottom: 20 },
  greetingEyebrow: { fontSize: 15, color: Colors.secondaryLabel, fontFamily: Fonts.regular, marginBottom: 14 },
  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, alignSelf: 'flex-start', maxWidth: '100%',
  },
  locationRowText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.secondaryLabel, flexShrink: 1 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: Colors.separator,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  searchBarText: { fontSize: 14.5, fontFamily: Fonts.regular, color: Colors.tertiaryLabel },

  sectionPad: { paddingHorizontal: 24 },

  // Upcoming appointment — dark card, matches the Figma reference
  upcomingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#2C1A20', borderRadius: 20, padding: 16,
    marginBottom: 18,
  },
  upcomingDateBadge: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center',
  },
  upcomingDateMonth: { fontSize: 10, fontFamily: Fonts.semibold, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5 },
  upcomingDateDay:   { fontSize: 17, fontFamily: Fonts.bold, color: '#fff', marginTop: 1 },
  upcomingTitle: { fontSize: 14.5, fontFamily: Fonts.semibold, color: '#fff' },
  upcomingSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3, fontFamily: Fonts.regular },
  upcomingViewBtn: { backgroundColor: Colors.brand, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8 },
  upcomingViewText: { fontSize: 12.5, fontFamily: Fonts.semibold, color: '#fff' },

  whenToggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, marginBottom: 14 },
  whenToggle: {
    paddingHorizontal: 15, paddingVertical: 9, borderRadius: 100,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
  },
  whenToggleActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  whenToggleText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.secondaryLabel },
  whenToggleTextActive: { color: '#fff' },

  // Hero banner — the "top page" promo card, matching the Figma spec exactly
  // (new figma design/glow_01/src/App.tsx): fixed 160 height, vertically
  // centered content, dimmed photo (opacity 0.6) under a rose gradient.
  heroBanner: { height: 160, borderRadius: 24, marginBottom: 18, overflow: 'hidden', backgroundColor: '#F4A0BB' },
  heroBannerContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  heroEyebrow: {
    fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
    fontFamily: Fonts.medium, color: 'rgba(255,255,255,0.8)', marginBottom: 4,
  },
  heroTitle: { fontSize: 22, lineHeight: 26, fontFamily: Fonts.displayItalic, color: '#fff', marginBottom: 10 },
  heroCta: {
    alignSelf: 'flex-start', backgroundColor: '#fff',
    borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8,
  },
  heroCtaText: { fontSize: 12, fontFamily: Fonts.semibold, color: '#E8638C', letterSpacing: 0.2 },

  // Services grid — compact circular icons, four per row
  servicesGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 24, rowGap: 18,
  },
  serviceWrap: { width: '25%', alignItems: 'center', paddingHorizontal: 2 },
  // White (not pale-pink) bubble: the illustrated icon set's muted rose-brown
  // linework has too little contrast against a same-hued pink background —
  // it read as washed out/faint. White gives the strokes something to pop
  // against while the bubble still reads as "at home" on the pink page.
  serviceIcon: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  // Fixed-height wrapper (regardless of numberOfLines) so a two-line label can
  // never push its row taller than its neighbors, with the text itself
  // vertically centered inside it — otherwise a 1-line label ("Hair", "Nails")
  // sits flush at the top of the box while a 2-line label ("Brows & Lashes")
  // fills it, making the row look uneven even though the boxes line up.
  serviceNameWrap: { height: 28, justifyContent: 'center' },
  serviceName: {
    fontSize: 11.5, fontFamily: Fonts.medium, color: Colors.label,
    textAlign: 'center', lineHeight: 14,
  },

  // Clamps every horizontal row to the screen width on web — without an
  // explicit style, RN Web can size a ScrollView to its content instead of
  // its container, letting the row (and the page) bleed past the viewport.
  hScroll: { width: '100%' },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, marginTop: 34, marginBottom: 16,
  },
  sectionTitle: { fontSize: 21, fontFamily: Fonts.display, color: Colors.label, letterSpacing: -0.4 },
  seeAll: { fontSize: 13.5, fontFamily: Fonts.medium, color: Colors.brandDark },

  lookRow: { paddingHorizontal: 24, gap: 14 },

  artistRow: { paddingHorizontal: 24, gap: 14 },
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

  iosHint: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 24, marginTop: 20,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.separator,
  },
  iosHintText:    { flex: 1, fontSize: 13, color: Colors.label, lineHeight: 18, fontFamily: Fonts.regular },
  iosHintDismiss: { color: Colors.tertiaryLabel, fontSize: 14, fontFamily: Fonts.bold },

  // Inline "something failed, retry" affordance for silently-swallowed fetches —
  // distinguishes a real error from a legitimately empty section.
  errorBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    backgroundColor: '#FEF2F2', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#FCA5A5',
  },
  errorBoxText:  { flex: 1, fontSize: 13, color: '#B91C1C', fontFamily: Fonts.regular, lineHeight: 18 },
  errorBoxRetry: { fontSize: 13, fontFamily: Fonts.semibold, color: Colors.brandDark },

  footer: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  footerNote: { fontSize: 12.5, color: Colors.tertiaryLabel, fontFamily: Fonts.regular },
  footerCopy: { fontSize: 11, color: Colors.systemGray3, fontFamily: Fonts.regular },

  // Floating concierge CTA — sits above the pill tab bar, below sheets.
  matchCtaWrap: {
    position: 'absolute', left: 0, right: 0,
    alignItems: 'center',
    zIndex: 20,
    ...(Platform.OS === 'android' ? { elevation: 20 } : null),
  },
  matchCta: {
    borderRadius: 100,
    paddingVertical: 15, paddingHorizontal: 30,
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
  },
  // Translucent brand fill (not a flat opaque color) — content scrolling
  // underneath shows through softly instead of vanishing behind this button.
  matchCtaGlass: {
    backgroundColor: 'rgba(217,122,145,0.82)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  } as any,
  // Same rose tint as matchCtaGlass, layered over the native BlurView
  // instead of CSS backdrop-filter (borderRadius own copy since this sits
  // on top of, not instead of, the blur — StyleSheet.absoluteFill alone
  // doesn't carry radius).
  matchCtaTint: {
    borderRadius: 100,
    backgroundColor: 'rgba(217,122,145,0.82)',
  },
  matchCtaText: { color: '#fff', fontSize: 15.5, fontFamily: Fonts.semibold, letterSpacing: 0.2 },
});
