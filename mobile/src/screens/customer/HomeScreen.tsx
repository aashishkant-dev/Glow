import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
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
import { StarIcon, CalendarIcon, SearchIcon } from '../../components/TabIcons';
import { GlowLogo, GlowMark } from '../../components/GlowLogo';
import {
  apiMyBookings,
  apiPublicCatalog,
  apiPublicProviders,
  Booking,
  PublicProviderCard,
} from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import { Colors, Fonts } from '../../utils/colors';
import { BellIcon, CheckDecagramIcon } from '../../components/CareIcons';
import { SparkleIcon } from '../../components/BeautyIcons';
import { StatusBadge } from '../../components/StatusBadge';
import { GlowMatchSheet } from '../../components/GlowMatchSheet';
import { LookSheet } from '../../components/LookSheet';
import { LookTile } from '../../components/LookTile';
import { LOOKS, Look } from '../../data/looks';
import { CATEGORIES } from '../../data/categories';
import { Storage } from '../../utils/storage';
import { useChatUnread } from '../../context/ChatUnreadContext';
import { tapLight } from '../../utils/haptics';

/**
 * Category-first home. Every card is a real ServiceItem grouping (see
 * ../../data/categories.ts) and lands in the booking flow with the right
 * service already chosen.
 */

const ACTIVE_STATUSES = new Set(['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED']);

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
            {artist.specialties.length ? artist.specialties.slice(0, 2).join(' · ') : artist.qualificationType}
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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  const { notifications } = useChatUnread();
  const unreadCount = notifications.filter(n => !n.read).length;

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
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json`, {
        headers: { 'Accept-Language': 'en' },
      })
        .then(res => res.json())
        .then(data => {
          if (cancelled) return;
          const addr = data?.address;
          if (!addr) return;
          const name = [addr.city ?? addr.town ?? addr.village ?? addr.county, addr.state].filter(Boolean).join(', ');
          if (name) setCityName(name);
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }

    import('expo-location').then(Location =>
      Location.reverseGeocodeAsync({ latitude: coords.lat, longitude: coords.lng })
        .then(hits => {
          if (cancelled || !hits[0]) return;
          const h = hits[0];
          const name = [h.city ?? h.subregion, h.region].filter(Boolean).join(', ');
          if (name) setCityName(name);
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
    } catch {}
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Public catalog (live look prices) + artist directory — cached server-side.
  useEffect(() => {
    apiPublicCatalog()
      .then(({ categories }) => {
        const map: Record<string, number> = {};
        categories.flatMap(c => c.services).forEach(s => { map[s.name] = s.basePrice; });
        setCatalogPrices(map);
      })
      .catch(() => {});
    apiPublicProviders()
      .then(({ providers }) => setArtists(providers))
      .catch(() => {});
  }, []);

  const topArtists = React.useMemo(
    () => [...artists].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0)).slice(0, 8),
    [artists],
  );

  const trendingLooks = React.useMemo(
    () => [...LOOKS].sort((a, b) => Number(!!b.tall) - Number(!!a.tall)).slice(0, 6),
    [],
  );

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
            <View style={styles.greetingTopRow}>
              <Text style={styles.greetingEyebrow}>{greeting}, {firstName} ✨</Text>
              <Pressable
                style={({ pressed }) => [styles.locationPill, pressed && { opacity: 0.7 }]}
                onPress={handleLocationPress}
                accessibilityRole="button"
                accessibilityLabel={cityName ? `Location: ${cityName}` : 'Enable location'}
              >
                <Text style={styles.locationPillText} numberOfLines={1}>
                  {locating ? 'Locating…' : cityName ? `📍 ${cityName}` : '📍 Enable location'}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.greetingMain}>
              What are you{'\n'}looking for
              <Text style={styles.greetingDot}>?</Text>
            </Text>
            <Pressable
              style={({ pressed }) => [styles.searchBar, pressed && { opacity: 0.85 }]}
              onPress={() => { tapLight(); nav.navigate('ExploreTab', { openSearch: true }); }}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <SearchIcon size={17} color={Colors.tertiaryLabel} />
              <Text style={styles.searchBarText}>What are you looking for?</Text>
            </Pressable>
          </View>

          {/* ── Active booking ── */}
          {activeBooking && (
            <Touch style={styles.sectionPad} onPress={() => nav.navigate('Tracking', {
              bookingId: activeBooking._id,
              bookingLocation: activeBooking.lat ? { lat: activeBooking.lat, lng: activeBooking.lng } : undefined,
            })}>
              <View style={styles.activeBanner}>
                <Animated.View style={[styles.activeDot, { transform: [{ scale: pulseAnim }] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeTitle}>Active Booking</Text>
                  <Text style={styles.activeSub}>
                    {activeBooking.serviceType} · {formatDate(activeBooking.scheduledAt)} {formatTime(activeBooking.scheduledAt)}
                  </Text>
                </View>
                <StatusBadge status={activeBooking.status} />
              </View>
            </Touch>
          )}

          {/* ── Category grid — the heart of the home screen ── */}
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
          <View style={styles.occGrid}>
            {CATEGORIES.map(c => (
              <Touch key={c.id} style={styles.occWrap} onPress={() => openCategory(c)}>
                <View style={[styles.occCard, { backgroundColor: c.tint }]}>
                  <View style={styles.occIcon}>
                    <c.Icon size={26} />
                  </View>
                  <Text style={styles.occName}>{c.name}</Text>
                </View>
              </Touch>
            ))}
          </View>

          {/* ── Top rated artists ── */}
          {topArtists.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Loved by clients</Text>
                <SparkleBurstButton />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={styles.artistRow}>
                {topArtists.map(a => (
                  <ArtistCard
                    key={a.id}
                    artist={a}
                    onPress={() => nav.navigate('ProviderPublicProfile', { providerId: a.id, providerName: a.name })}
                  />
                ))}
              </ScrollView>
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
              <View key={look.id} style={{ width: 190 }}>
                <LookTile
                  look={look}
                  height={150}
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

      {/* ── Find My Glow — the one primary CTA ── */}
      <View pointerEvents="box-none" style={[styles.matchCtaWrap, { bottom: (Platform.OS === 'ios' ? 24 : 14) + 70 + 14 }]}>
        <Touch onPress={() => { tapLight(); setShowMatch(true); }}>
          <View style={styles.matchCta}>
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

  greetingBlock: { paddingHorizontal: 24, marginBottom: 24 },
  greetingTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 },
  greetingEyebrow: { fontSize: 15, color: Colors.secondaryLabel, fontFamily: Fonts.regular, flexShrink: 1 },
  greetingMain: { fontSize: 34, lineHeight: 40, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -1 },
  greetingDot: { color: Colors.gold },
  locationPill: {
    maxWidth: 150, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
  },
  locationPillText: { fontSize: 11.5, fontFamily: Fonts.medium, color: Colors.secondaryLabel },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: Colors.separator,
    paddingHorizontal: 16, paddingVertical: 13, marginTop: 18,
  },
  searchBarText: { fontSize: 14.5, fontFamily: Fonts.regular, color: Colors.tertiaryLabel },

  sectionPad: { paddingHorizontal: 24 },

  activeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: Colors.separator, marginBottom: 18,
  },
  activeDot:   { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.systemGreen },
  activeTitle: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.label },
  activeSub:   { fontSize: 12.5, color: Colors.secondaryLabel, marginTop: 2, fontFamily: Fonts.regular },

  whenToggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, marginBottom: 14 },
  whenToggle: {
    paddingHorizontal: 15, paddingVertical: 9, borderRadius: 100,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
  },
  whenToggleActive: { backgroundColor: Colors.label, borderColor: Colors.label },
  whenToggleText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.secondaryLabel },
  whenToggleTextActive: { color: '#fff' },

  // Category grid — two columns
  occGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 24, gap: 12,
  },
  occWrap: { width: '47%', flexGrow: 1 },
  occCard: {
    borderRadius: 24, padding: 16, minHeight: 100,
    justifyContent: 'flex-end', overflow: 'hidden',
    // A real border + shadow so the card reads as a distinct surface against the
    // near-white page background — the previous borderless pale-tint-on-near-white
    // card was almost impossible to make out (tint and page bg were both ~#FFF9F8).
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  occIcon: {
    width: 44, height: 44, borderRadius: 22,
    // Illustrated icons carry their own baked-in color, so the bubble is a
    // near-white surface that lifts them off the card's pastel tint.
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },

  occName: { fontSize: 15.5, fontFamily: Fonts.semibold, color: Colors.label },

  // Clamps every horizontal row to the screen width on web — without an
  // explicit style, RN Web can size a ScrollView to its content instead of
  // its container, letting the row (and the page) bleed past the viewport.
  hScroll: { width: '100%' },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, marginTop: 34, marginBottom: 16,
  },
  sectionTitle: { fontSize: 21, fontFamily: Fonts.semibold, color: Colors.label, letterSpacing: -0.4 },
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
    backgroundColor: Colors.brand,
    borderRadius: 100,
    paddingVertical: 15, paddingHorizontal: 30,
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)',
  },
  matchCtaText: { color: '#fff', fontSize: 15.5, fontFamily: Fonts.semibold, letterSpacing: 0.2 },
});
