import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  Animated,
  Dimensions,
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
import { CalendarSVGIcon, FlashIcon, HomeSVGIcon } from '../../components/TabIcons';
import { GlowLogo } from '../../components/GlowLogo';
import { apiMyBookings, Booking } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLang, useT } from '../../context/LangContext';
import { useLocation } from '../../context/LocationContext';
import { Colors, ServiceAccentColors } from '../../utils/colors';
import { ServiceIcon } from '../../components/ServiceIcon';
import { BellIcon, PinIcon } from '../../components/CareIcons';
import { BookingCard } from '../../components/BookingCard';
import { BookingCardSkeleton } from '../../components/SkeletonLoader';
import { StatusBadge } from '../../components/StatusBadge';
import { LocationPrompt } from '../../components/LocationPrompt';
import { Storage } from '../../utils/storage';
import { useChatUnread } from '../../context/ChatUnreadContext';

const SERVICES = [
  { id: '1',  en: 'Makeup',        fr: 'Maquillage',          accent: ServiceAccentColors['Makeup'] },
  { id: '2',  en: 'Bridal Makeup', fr: 'Maquillage de mariée', accent: ServiceAccentColors['Bridal Makeup'] },
  { id: '3',  en: 'Party Makeup',  fr: 'Maquillage de soirée', accent: ServiceAccentColors['Party Makeup'] },
  { id: '4',  en: 'Threading',     fr: 'Épilation au fil',     accent: ServiceAccentColors['Threading'] },
  { id: '5',  en: 'Hair Styling',  fr: 'Coiffure',             accent: ServiceAccentColors['Hair Styling'] },
  { id: '6',  en: 'Hair Coloring', fr: 'Coloration',           accent: ServiceAccentColors['Hair Coloring'] },
  { id: '7',  en: 'Facial',        fr: 'Soin du visage',       accent: ServiceAccentColors['Facial'] },
  { id: '8',  en: 'Waxing',        fr: 'Épilation à la cire',  accent: ServiceAccentColors['Waxing'] },
  { id: '9',  en: 'Nails',         fr: 'Ongles',               accent: ServiceAccentColors['Nails'] },
  { id: '10', en: 'Mehendi',       fr: 'Mehendi',              accent: ServiceAccentColors['Mehendi'] },
  { id: '11', en: 'Massage',       fr: 'Massage',              accent: ServiceAccentColors['Massage'] },
];

const ACTIVE_STATUSES = new Set(['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED']);

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
}

import { OSMMap } from '../../components/OSMMap';

declare global { interface Window { L: any } }

function loadLeaflet(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window === 'undefined') { resolve(); return; }
    if (window.L) { resolve(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

function WebMapPreview() {
  const containerRef = useRef<any>(null);
  const mapRef       = useRef<any>(null);
  const roRef        = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const L = window.L;
      const map = L.map(containerRef.current, {
        zoomControl: false, scrollWheelZoom: false,
        dragging: false, doubleClickZoom: false,
        attributionControl: false, keyboard: false, tap: false,
      }).setView([46.4917, -80.9924], 12);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19, attribution: '© CartoDB',
      }).addTo(map);
      const style = document.createElement('style');
      style.textContent = `
        .cn-provider-pin{position:relative;width:20px;height:20px;}
        .cn-provider-pin-inner{width:20px;height:20px;background:linear-gradient(135deg,#B76E79,#B76E79);border:2.5px solid #fff;border-radius:50%;box-shadow:0 3px 10px rgba(183,110,121,.5);}
        .cn-provider-pin-pulse{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:32px;height:32px;border-radius:50%;background:rgba(183,110,121,.2);animation:pulse-map 2s ease-out infinite;}
        @keyframes pulse-map{0%{transform:translate(-50%,-50%) scale(.6);opacity:.9}100%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}
      `;
      document.head.appendChild(style);
      L.circle([46.4917, -80.9924], { radius: 15000, color: '#B76E79', fillColor: '#B76E79', fillOpacity: 0.05, weight: 1.5, dashArray: '6,4' }).addTo(map);
      [
        [46.492, -80.992], [46.506, -80.971], [46.479, -81.012],
        [46.514, -80.954], [46.476, -80.984], [46.501, -81.001],
      ].forEach(([lat, lng]) => {
        const icon = L.divIcon({ html: '<div class="cn-provider-pin"><div class="cn-provider-pin-pulse"></div><div class="cn-provider-pin-inner"></div></div>', className: '', iconAnchor: [10, 10] });
        L.marker([lat, lng], { icon }).addTo(map);
      });
      mapRef.current = map;
      // Leaflet renders white/blurry if the container had zero size when created
      // (common when the card mounts collapsed). Re-measure several times AND on
      // container resize so tiles paint once the box has real dimensions.
      const refresh = () => { if (mapRef.current) mapRef.current.invalidateSize(); };
      [50, 250, 600, 1200].forEach(t => setTimeout(() => { if (!cancelled) refresh(); }, t));
      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        const ro = new ResizeObserver(() => refresh());
        ro.observe(containerRef.current);
        roRef.current = ro;
      }
    });
    return () => {
      cancelled = true;
      if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  return <div ref={containerRef} style={{ height: 200, width: '100%', backgroundColor: '#F0F0F0', borderRadius: 16, overflow: 'hidden' }} />;
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
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Bell badge = unread notifications (matches the Notifications screen it opens).
  const { notifications } = useChatUnread();
  const unreadCount = notifications.filter(n => !n.read).length;

  const t              = useT('home');
  const activeBooking  = bookings.find(b => ACTIVE_STATUSES.has(b.status));
  const recentBookings = bookings.filter(b => !ACTIVE_STATUSES.has(b.status)).slice(0, 3);

  // Check if we've already prompted for location before
  useEffect(() => {
    Storage.getLocationPrompted().then(v => setLocationPromptedBefore(v));
  }, []);

  // Show location prompt once automatically on first time only
  useEffect(() => {
    if (locationPromptedBefore) return;
    if (permissionStatus === 'denied' || permissionStatus === 'unavailable') {
      const t = setTimeout(() => setShowLocationPrompt(true), 800);
      return () => clearTimeout(t);
    }
  }, [permissionStatus, locationPromptedBefore]);

  // Auto-dismiss the sheet once permission is granted — covers the "Open
  // Settings to Enable" path where the user grants in iOS Settings and comes
  // back (LocationContext re-checks on foreground), otherwise the sheet stuck.
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

  const handleLocationPillPress = () => {
    setShowLocationPrompt(true);
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
  const today     = new Date().toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });

  const serviceRows: typeof SERVICES[] = [];
  for (let i = 0; i < SERVICES.length; i += 2) serviceRows.push(SERVICES.slice(i, i + 2));

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={Colors.systemBlue}
          />
        }
      >
        {/* ── Hero — Dark, clean Uber-style ── */}
        <View style={[styles.hero, { paddingTop: insets.top + 20, paddingBottom: 24 }]}>
          <View style={styles.heroTop}>
            <GlowLogo size={28} showWordmark inverted />
            <View style={styles.heroActions}>
              <Pressable
                style={({ pressed }) => [styles.langToggle, pressed && { opacity: 0.75 }]}
                onPress={() => setLang(lang === 'en' ? 'fr' : 'en')}
              >
                <Text style={styles.langToggleText}>{lang === 'en' ? 'FR' : 'EN'}</Text>
              </Pressable>
              <Pressable
                onPress={() => nav.navigate('Notifications')}
                style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
              >
                <BellIcon size={20} color="#fff" />
                {unreadCount > 0 && (
                  <View style={{
                    position: 'absolute', top: 4, right: 4,
                    minWidth: 16, height: 16, borderRadius: 8,
                    backgroundColor: '#FF3B30',
                    alignItems: 'center', justifyContent: 'center',
                    paddingHorizontal: 3,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={styles.avatarBtn} onPress={() => nav.navigate('Profile')}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.avatarBtnImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                ) : (
                  <Text style={styles.avatarBtnText}>{user?.name?.[0]?.toUpperCase() ?? '?'}</Text>
                )}
              </Pressable>
            </View>
          </View>

          <Text style={styles.greetingMain}>{greeting}, {firstName}</Text>
          <Text style={styles.greetingSub}>{today}</Text>

          {/* Location pill — real status only, no Sudbury default */}
          <Pressable
            style={({ pressed }) => [styles.locationBadge, { alignSelf: 'flex-start', marginBottom: 18 }, pressed && { opacity: 0.7 }]}
            onPress={handleLocationPillPress}
          >
            <PinIcon size={14} color={permissionStatus === 'granted' ? '#34C759' : '#fff'} />
            <Text style={styles.locationText}>
              {permissionStatus === 'granted' ? 'Location on' : 'Set your location'}
            </Text>
          </Pressable>

          {/* ── Hero CTA Buttons — On Demand + Schedule ── */}
          <View style={styles.ctaRow}>
            <Pressable
              style={({ pressed }) => [styles.ctaBtn, styles.ctaBtnRed, pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] }]}
              onPress={() => nav.navigate('NewBooking', { bookingMode: 'ondemand', _t: Date.now() })}
            >
              {Platform.OS === 'web' && (
                <View style={[StyleSheet.absoluteFill, { borderRadius: 20, background: 'linear-gradient(135deg, #FF4444, #FF6B00)' } as any]} />
              )}
              <FlashIcon size={28} color="#fff" />
              <Text style={styles.ctaBtnTitle}>{t.onDemandTitle}</Text>
              <Text style={styles.ctaBtnSub}>{t.onDemandSub}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.ctaBtn, styles.ctaBtnGreen, pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] }]}
              onPress={() => nav.navigate('NewBooking', { bookingMode: 'scheduled', _t: Date.now() })}
            >
              {Platform.OS === 'web' && (
                <View style={[StyleSheet.absoluteFill, { borderRadius: 20, background: `linear-gradient(135deg, ${Colors.brandDark}, ${Colors.brand})` } as any]} />
              )}
              <CalendarSVGIcon size={28} color="#fff" />
              <Text style={styles.ctaBtnTitle}>{t.scheduledTitle}</Text>
              <Text style={styles.ctaBtnSub}>{t.scheduledSub}</Text>
            </Pressable>
          </View>

          {/* ── Map Preview — full width inside hero ── */}
          {Platform.OS === 'web' ? (
            <View style={styles.heroMapWrap}>
              <WebMapPreview />
            </View>
          ) : (
            <View style={[styles.heroMapWrap, { overflow: 'hidden', borderRadius: 16, height: 200 }]}>
              <OSMMap
                style={{ height: 200, width: '100%' }}
                center={{ lat: 46.4917, lng: -80.9924 }}
                zoom={12}
                markers={[
                  [46.492, -80.992], [46.506, -80.971], [46.479, -81.012],
                  [46.514, -80.954], [46.476, -80.984], [46.501, -81.001],
                ].map(([lat, lng]) => ({ lat, lng, color: '#B76E79' }))}
              />
            </View>
          )}
        </View>

        {/* ── Active booking banner ── */}
        {activeBooking && (
          <Pressable
            style={styles.activeBanner}
            onPress={() => nav.navigate('Tracking', {
              bookingId: activeBooking._id,
              bookingLocation: activeBooking.lat ? { lat: activeBooking.lat, lng: activeBooking.lng } : undefined,
            })}
          >
            <View style={styles.activeBannerInner}>
              <Animated.View style={[styles.activeDot, { transform: [{ scale: pulseAnim }] }]} />
              <View style={styles.activeBannerLeft}>
                <Text style={styles.activeBannerTitle}>{t.activeBooking}</Text>
                <Text style={styles.activeBannerSub}>
                  {activeBooking.serviceType} · {formatDate(activeBooking.scheduledAt, locale)} {formatTime(activeBooking.scheduledAt, locale)}
                </Text>
              </View>
              <View style={styles.activeBannerRight}>
                <StatusBadge status={activeBooking.status} />
                <Text style={styles.activeBannerChevron}>›</Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* ── Services ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t.servicesLabel}</Text>
          <Text style={styles.sectionTitle}>{t.servicesTitle}</Text>
        </View>
        <View style={styles.servicesGrid}>
          {serviceRows.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.serviceGridRow}>
              {row.map(item => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.serviceGridCard,
                    { borderColor: item.accent + '30' },
                    pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
                  ]}
                  onPress={() => nav.navigate('NewBooking', { serviceType: item.en, bookingMode: 'scheduled', _t: Date.now() })}
                >
                  <ServiceIcon serviceType={item.en} size={30} color={item.accent} bubble={false} />
                  <Text style={styles.serviceGridName} numberOfLines={2}>
                    {lang === 'fr' ? item.fr : item.en}
                  </Text>
                </Pressable>
              ))}
              {row.length === 1 && <View style={styles.serviceGridCardEmpty} />}
            </View>
          ))}
        </View>

        {/* ── Recent Bookings ── */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionLabel}>{t.recentLabel}</Text>
            <Text style={styles.sectionTitle}>{t.recentTitle}</Text>
          </View>
          <Pressable onPress={() => nav.navigate('BookingsTab')} style={styles.seeAllBtn}>
            <Text style={styles.seeAll}>{t.seeAll} →</Text>
          </Pressable>
        </View>

        {loading ? (
          <><BookingCardSkeleton /><BookingCardSkeleton /></>
        ) : recentBookings.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <CalendarSVGIcon size={40} color={Colors.tertiaryLabel} />
            </View>
            <Text style={styles.emptyTitle}>{t.emptyTitle}</Text>
            <Text style={styles.emptySub}>{t.emptySub}</Text>
            <Pressable
              style={({ pressed }) => [styles.emptyBookBtn, pressed && { opacity: 0.85 }]}
              onPress={() => nav.navigate('NewBooking', { _t: Date.now() })}
            >
              <Text style={styles.emptyBookBtnText}>{t.bookFirst} →</Text>
            </Pressable>
          </View>
        ) : (
          recentBookings.map(b => (
            <BookingCard key={b._id} booking={b} onPress={() => nav.navigate('BookingDetail', { booking: b })} />
          ))
        )}

        {/* ── Trust stats — moved to the bottom (not the first thing seen) ── */}
        <View style={styles.statsRow}>
          {([
            ['15+', t.statProvider],
            ['4.8', t.statRating],
            ['$25', t.statRate],
          ] as [string, string][]).map(([num, label], i) => (
            <React.Fragment key={label}>
              {i > 0 && <View style={styles.statDivider} />}
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{num}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {showIOSHint && (
          <View style={styles.iosHint}>
            <Text style={styles.iosHintText}>
              {lang === 'fr'
                ? "Appuyez sur Partager puis « Ajouter à l'écran d'accueil »"
                : 'Tap Share → "Add to Home Screen" to install'}
            </Text>
            <Pressable onPress={dismissIOSHint} style={styles.iosHintDismiss} hitSlop={12}>
              <Text style={styles.iosHintDismissText}>✕</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.footer}>
          <GlowLogo size={28} showWordmark variant="onLight" />
          <View style={{ height: 8 }} />
          <Text style={styles.footerSub}>Professional Provider Care · Greater Sudbury, ON</Text>
          <Text style={styles.footerNote}>© {new Date().getFullYear()} Glow · Not covered by OHIP · Private pay</Text>
        </View>
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
  scrollView:    { flex: 1 },
  scrollContent: { paddingBottom: 32, backgroundColor: Colors.systemGroupedBackground },

  hero: { backgroundColor: Colors.brandDark, paddingHorizontal: 20 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
    gap: 6,
  },
  locationIcon: { fontSize: 14, color: '#fff' },
  locationText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  langToggle: {
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
  },
  langToggleText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  avatarBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarBtnImg:  { width: 40, height: 40, borderRadius: 20 },
  avatarBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  greetingMain: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -1, marginBottom: 4 },
  greetingSub:  { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 20, fontWeight: '500' },

  // Hero CTA Buttons
  ctaRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  ctaBtn: {
    flex: 1, minHeight: 120, borderRadius: 20,
    padding: 18, alignItems: 'flex-start', justifyContent: 'flex-end',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  ctaBtnRed: { backgroundColor: '#FF4444' },
  ctaBtnGreen: { backgroundColor: Colors.brandDark },
  ctaBtnTitle: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.4 },
  ctaBtnSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },

  // Hero map
  heroMapWrap: { width: '100%' },

  // Active banner
  activeBanner: {
    marginHorizontal: 16, marginTop: 16,
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  activeBannerInner: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  activeBannerLeft:    { flex: 1 },
  activeDot:           { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.onlineGreen },
  activeBannerTitle:   { fontSize: 14, fontWeight: '700', color: Colors.label },
  activeBannerSub:     { fontSize: 12, color: Colors.secondaryLabel, marginTop: 2 },
  activeBannerRight:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeBannerChevron: { fontSize: 22, color: Colors.tertiaryLabel, fontWeight: '300' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  statItem:   { flex: 1, alignItems: 'center' },
  statNum:    { fontSize: 22, fontWeight: '900', color: Colors.label, letterSpacing: -0.5 },
  statLabel:  { fontSize: 11, color: Colors.secondaryLabel, marginTop: 3, textAlign: 'center', fontWeight: '600' },
  statDivider:{ width: 1, backgroundColor: Colors.separator, marginHorizontal: 8 },


  // Section headers
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 20, marginBottom: 12, marginTop: 28,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondaryLabel, letterSpacing: 0.8, marginBottom: 4, textTransform: 'uppercase' },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: Colors.label, letterSpacing: -0.5 },
  seeAllBtn:    { paddingBottom: 2 },
  seeAll:       { fontSize: 14, fontWeight: '600', color: Colors.systemBlue },

  // Quick
  quickRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10 },
  quickCard: {
    flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  quickCardIcon:  { fontSize: 26, fontWeight: '900', marginBottom: 2 },
  quickCardTitle: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  quickCardSub:   { fontSize: 11, color: Colors.tertiaryLabel, textAlign: 'center' },

  // Services
  servicesGrid:      { paddingHorizontal: 16, gap: 10 },
  serviceGridRow:    { flexDirection: 'row', gap: 10 },
  serviceGridCard: {
    flex: 1, minHeight: 100,
    backgroundColor: '#fff',
    borderRadius: 16, padding: 16,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  serviceGridCardEmpty: { flex: 1 },
  serviceGridIcon:  { fontSize: 28, marginBottom: 8 },
  serviceGridName:  { fontSize: 12, fontWeight: '700', color: Colors.label, textAlign: 'center' },

  // Trust
  trustGrid: {
    paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  trustCard: {
    flex: 1, minWidth: '44%',
    backgroundColor: '#fff',
    borderRadius: 16, padding: 18,
    alignItems: 'center', gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  trustCardIcon:  { fontSize: 24, fontWeight: '900', color: Colors.systemBlue },
  trustCardLabel: { fontSize: 13, fontWeight: '700', color: Colors.label, textAlign: 'center' },
  trustCardSub:   { fontSize: 11, color: Colors.secondaryLabel, textAlign: 'center' },

  // Empty state
  emptyState:   { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyIconWrap:{ width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.systemGroupedBackground, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyIcon:    { fontSize: 32, color: Colors.secondaryLabel },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: Colors.label, marginBottom: 6 },
  emptySub:     { fontSize: 14, color: Colors.secondaryLabel, textAlign: 'center', marginBottom: 20 },
  emptyBookBtn: {
    backgroundColor: Colors.brand, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyBookBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // iOS install hint
  iosHint: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.systemGroupedBackground, borderRadius: 14, padding: 14,
    gap: 10,
  },
  iosHintText:        { flex: 1, fontSize: 13, color: Colors.label, lineHeight: 18 },
  iosHintDismiss:     { padding: 4 },
  iosHintDismissText: { color: Colors.tertiaryLabel, fontSize: 14, fontWeight: '700' },

  // Footer
  footer: {
    alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24,
    marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.separator,
  },
  footerLogo: { fontSize: 18, fontWeight: '900', color: Colors.label, letterSpacing: -0.3, marginBottom: 4 },
  footerSub:  { fontSize: 13, color: Colors.secondaryLabel, textAlign: 'center', marginBottom: 6 },
  footerNote: { fontSize: 11, color: Colors.tertiaryLabel, textAlign: 'center', lineHeight: 16 },
});
