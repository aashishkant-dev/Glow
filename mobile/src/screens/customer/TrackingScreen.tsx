import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  Alert,
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NavigateIcon, CallIcon, ChatIcon, MapIcon, SearchIcon, HomeSVGIcon, StarIcon } from '../../components/TabIcons';
import { KeyIcon } from '../../components/CareIcons';
import { apiGetTracking, apiCancelBooking, apiRateBooking, TrackingData } from '../../api/client';
import { Colors } from '../../utils/colors';
import { confirmAction, tapSuccess } from '../../utils/haptics';
import { ServiceIcon } from '../../components/ServiceIcon';
import { StatusTimeline } from '../../components/StatusTimeline';
import { ProviderProfileCard } from '../../components/ProviderProfileCard';
import { RatingModal } from '../../components/RatingModal';

import { OSMMap, OSMMarker } from '../../components/OSMMap';
import { DEFAULT_REGION_NAME } from '../../utils/region';
import { formatCurrency } from '../../utils/format';

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

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Finding your Provider…',
  ACCEPTED:  'Provider is on the way',
  ON_MY_WAY: 'Provider is heading to you',
  STARTED:   'Care in progress',
  COMPLETED: 'Service complete',
};

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: '#FF9500',
  ACCEPTED:  '#0066FF',
  ON_MY_WAY: '#AF52DE',
  STARTED:   '#00C853',
  COMPLETED: '#8E8E93',
};

// How old (in seconds) a providerLocation.updatedAt can be before we warn the customer
// that the dot may not reflect the Provider's real position. 60s = two missed send cycles.
const STALE_LOCATION_THRESHOLD_MS = 60_000;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function calcETA(providerLat: number, providerLng: number, destLat: number, destLng: number): { minutes: number; display: string } {
  const R = 6371;
  const dLat = ((destLat - providerLat) * Math.PI) / 180;
  const dLng = ((destLng - providerLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((providerLat * Math.PI) / 180) *
      Math.cos((destLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const mins = Math.round((dist / 30) * 60);
  if (mins <= 1) return { minutes: 1, display: '< 1 min' };
  if (mins < 60) return { minutes: mins, display: `${mins} min` };
  return { minutes: mins, display: `${Math.floor(mins / 60)}h ${mins % 60}m` };
}


export function TrackingScreen() {
  const nav    = useNavigation<any>();
  const route  = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { bookingId, bookingLocation } = route.params as {
    bookingId: string;
    bookingLocation?: { lat: number; lng: number };
  };

  const [data, setData]       = useState<TrackingData | null>(null);
  const [error, setError]     = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false); // tap handle → grow sheet over the map
  // ── Post-care rating ──────────────────────────────────────────────────────
  // This is the screen the customer is actually watching while care happens, so
  // when the booking flips to COMPLETED here we must prompt for a rating right
  // away. Previously TrackingScreen did nothing on COMPLETED, so a customer who
  // sat on the live-tracking screen was never asked to rate — the core "rating
  // never comes up after care is done" bug.
  const [showRateModal, setShowRateModal] = useState(false);
  const [rated, setRated]                 = useState(false);
  const ratingPrompted = useRef(false);   // guard: only auto-pop the sheet once per mount
  // Reactive height — Dimensions.get() is captured once and goes stale on web when
  // the mobile browser URL bar collapses/expands, which broke the bottom-sheet scroll.
  const { height: screenHeight } = useWindowDimensions();
  const pulseAnim             = useRef(new Animated.Value(1)).current;
  const mapContainerRef       = useRef<any>(null);
  const leafletMapRef         = useRef<any>(null);
  const providerMarkerRef          = useRef<any>(null);
  const customerMarkerRef     = useRef<any>(null);
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await apiGetTracking(bookingId);
      setData(res);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Connection error');
    }
  }, [bookingId]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [poll]);

  // Watch the polled status: the first time it becomes COMPLETED (and the booking
  // isn't already rated) pop the rating sheet. `ratingGiven` from the backend, if
  // present, suppresses re-prompting after a rating was already left elsewhere.
  useEffect(() => {
    const alreadyRated = rated || (data as any)?.ratingGiven;
    if (data?.status === 'COMPLETED' && !alreadyRated && !ratingPrompted.current) {
      ratingPrompted.current = true;
      tapSuccess();
      // Small delay so the COMPLETED status change paints before the sheet slides up.
      const id = setTimeout(() => setShowRateModal(true), 450);
      return () => clearTimeout(id);
    }
  }, [data?.status, rated]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    loadLeaflet().then(() => {
      if (cancelled || !mapContainerRef.current || leafletMapRef.current) return;
      const L = window.L;
      // No hardcoded city fallback — if the booking has no coords we just don't
      // center on a fake location. A missing bookingLocation means there's
      // nothing real to show; the map stays at a neutral world view rather than
      // lying with a made-up pin.
      const center = bookingLocation
        ? [bookingLocation.lat, bookingLocation.lng]
        : null;
      const map = L.map(mapContainerRef.current, {
        // Working +/- zoom, placed bottom-right so it never collides with the Back
        // button / legend at the top. scrollWheel off (page scroll), pinch on.
        zoomControl: false,
        scrollWheelZoom: false,
        attributionControl: false,
      }).setView(center ?? [20, 0], center ? 14 : 2);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);
      
      if (bookingLocation) {
        // Care location = red HOUSE pin (teardrop with a white home glyph) so it
        // reads unmistakably as "the place" vs the Provider's round person marker.
        const custIcon = L.divIcon({
          html:
            `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">` +
              `<div style="width:34px;height:34px;background:#FF3B30;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 12px rgba(239,68,68,0.45);display:flex;align-items:center;justify-content:center;">` +
                // Home glyph (inline SVG, un-rotated to stay upright inside the rotated pin)
                `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" style="transform:rotate(45deg);"><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" stroke="#fff" stroke-width="2" stroke-linejoin="round" fill="none"/></svg>` +
              `</div>` +
            `</div>`,
          className: '',
          iconSize: [34, 40],
          iconAnchor: [17, 38],
        });
        customerMarkerRef.current = L.marker([bookingLocation.lat, bookingLocation.lng], { icon: custIcon })
          .addTo(map)
          .bindPopup('<b>Care location</b>');
      }
      leafletMapRef.current = map;
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !leafletMapRef.current || !data?.providerLocation) return;
    const L = window.L;
    const { lat, lng } = data.providerLocation;
    // Provider = green marker carrying the Provider's initial, with a small pointer tail so
    // it reads as a moving person/vehicle marker and is impossible to confuse
    // with the red house pin.
    const providerIcon = L.divIcon({
      html:
        `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">` +
          `<div style="width:38px;height:38px;background:linear-gradient(135deg,#00C853,#00A651);border:3px solid #fff;border-radius:50%;box-shadow:0 4px 14px rgba(0,200,83,0.5);display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;font-weight:900;">${(data.provider?.name?.[0] ?? 'P').toUpperCase()}</div>` +
          `<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid #00A651;margin-top:-2px;"></div>` +
        `</div>`,
      className: '',
      iconSize: [38, 49],
      iconAnchor: [19, 47],
    });
    if (providerMarkerRef.current) {
      providerMarkerRef.current.setLatLng([lat, lng]);
    } else {
      providerMarkerRef.current = L.marker([lat, lng], { icon: providerIcon })
        .addTo(leafletMapRef.current)
        .bindPopup(data.provider?.name || 'Your Provider');
    }

    if (bookingLocation && leafletMapRef.current) {
      const bounds = L.latLngBounds(
        [lat, lng],
        [bookingLocation.lat, bookingLocation.lng]
      );
      leafletMapRef.current.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [data?.providerLocation, bookingLocation]);

  // Leaflet renders grey/blank tiles when its container is resized after init.
  // The map height changes every time the bottom sheet expands/collapses, so we
  // must tell Leaflet to recompute its size (after the layout settles).
  useEffect(() => {
    if (Platform.OS !== 'web' || !leafletMapRef.current) return;
    const id = setTimeout(() => leafletMapRef.current?.invalidateSize(), 250);
    return () => clearTimeout(id);
  }, [sheetExpanded, screenHeight]);

  // Real care-location coords only — no city fallback. ETA/directions are only
  // meaningful when we actually know where the care location is.
  const destLat = bookingLocation?.lat ?? null;
  const destLng = bookingLocation?.lng ?? null;
  const status  = data?.status ?? 'REQUESTED';
  const provider     = data?.provider;
  const booking       = data?.booking;
  const eta = data?.providerLocation && destLat != null && destLng != null
    ? calcETA(data.providerLocation.lat, data.providerLocation.lng, destLat, destLng)
    : null;
  const canCancel = status === 'REQUESTED' || status === 'ACCEPTED';

  // True when the Provider marker position is older than the staleness threshold.
  // Recomputed on each render — `data` refreshes every 5s so this stays current.
  const locationIsStale = useMemo(() => {
    if (!data?.providerLocation?.updatedAt) return false;
    return Date.now() - new Date(data.providerLocation.updatedAt).getTime() > STALE_LOCATION_THRESHOLD_MS;
  }, [data?.providerLocation?.updatedAt]);

  async function doCancel() {
    try {
      await apiCancelBooking(bookingId);
      nav.goBack();
    } catch (e: any) {
      const msg = e?.message || 'Could not cancel booking. Please try again.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  }

  function handleCancel() {
    if (Platform.OS === 'web') {
      if (window.confirm('Cancel this booking?')) doCancel();
      return;
    }
    // iOS → native ActionSheet; Android → destructive Alert.
    confirmAction({
      title: 'Cancel Booking',
      message: 'Are you sure you want to cancel?',
      confirmLabel: 'Cancel Booking',
      cancelLabel: 'Keep',
      destructive: true,
      onConfirm: doCancel,
    });
  }

  return (
    <View style={[styles.root, Platform.OS === 'web' && { height: screenHeight }]}>
      {/* ── Map — shrinks when the sheet is expanded ── */}
      <View style={[styles.mapContainer, { height: screenHeight * (sheetExpanded ? 0.18 : 0.38) }]}>
        {Platform.OS === 'web' ? (
          <View ref={mapContainerRef} style={styles.map} />
        ) : (
          <OSMMap
            style={styles.map}
            center={
              destLat != null && destLng != null
                ? { lat: destLat, lng: destLng }
                : data?.providerLocation
                  ? { lat: data.providerLocation.lat, lng: data.providerLocation.lng }
                  : null
            }
            zoom={14}
            markers={[
              ...(bookingLocation && destLat != null && destLng != null
                ? [{ lat: destLat, lng: destLng, kind: 'care', label: 'Care location' } as OSMMarker]
                : []),
              ...(data?.providerLocation
                ? [{ lat: data.providerLocation.lat, lng: data.providerLocation.lng, kind: 'provider', label: provider?.name ?? 'Your Provider' } as OSMMarker]
                : []),
            ]}
          />
        )}

        {/* Map legend — persistent key so the customer always knows which marker
            is the care location (red) vs their Provider (green). Bottom-left so it
            never collides with the top bar or the centred wait banner. */}
        {!sheetExpanded && (bookingLocation || data?.providerLocation) && (
          <View style={styles.mapLegend} pointerEvents="none">
            <View style={styles.mapLegendRow}>
              <View style={[styles.mapLegendDot, { backgroundColor: '#FF3B30' }]} />
              <Text style={styles.mapLegendText}>Care location</Text>
            </View>
            <View style={[styles.mapLegendRow, { marginTop: 5 }]}>
              <View style={[styles.mapLegendDot, { backgroundColor: '#00C853' }]} />
              <Text style={styles.mapLegendText}>Your Provider</Text>
            </View>
          </View>
        )}

        {/* Map is live but the Provider isn't broadcasting yet → tell the customer the
            green dot is coming, so the map doesn't look broken. Hidden once we
            have a providerLocation or the job is done. */}
        {!data?.providerLocation && status !== 'COMPLETED' && !sheetExpanded && (
          <View style={styles.mapWaitBanner} pointerEvents="none">
            <Text style={styles.mapWaitText}>
              {bookingLocation ? 'Waiting for your Provider’s live location…' : 'Live map will appear once your Provider is assigned'}
            </Text>
          </View>
        )}

        {/* Back button — floating pill */}
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => nav.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>
          <View style={styles.statusPill}>
            <Animated.View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status], transform: [{ scale: pulseAnim }] }]} />
            <Text style={[styles.statusPillText, { color: STATUS_COLORS[status] }]}>
              {STATUS_LABELS[status]}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Bottom Card — Provider info, Uber-style ── */}
      <View style={[
        styles.bottomSheet,
        { paddingBottom: insets.bottom + 16 },
        // On web, ScrollView needs a bounded height to scroll. The sheet fills the
        // space the map doesn't (expanded → ~80%, collapsed → ~52%).
        Platform.OS === 'web' && { height: screenHeight * (sheetExpanded ? 0.82 : 0.62), flex: undefined as any },
      ]}>
        {/* Tap the handle to expand/collapse the sheet over the map */}
        <Pressable onPress={() => setSheetExpanded(e => !e)} hitSlop={12} style={{ alignItems: 'center', paddingVertical: 4 }}>
          <View style={styles.drawerHandle} />
          <Text style={styles.sheetExpandHint}>{sheetExpanded ? 'Collapse ▾' : 'Expand ▴'}</Text>
        </Pressable>

        {/* Always-visible Cancel — the full Cancel button lives at the bottom of the
            scroll, which is off-screen while the sheet is collapsed. This pinned
            link makes cancelling reachable without expanding/scrolling. */}
        {canCancel && (
          <Pressable onPress={handleCancel} hitSlop={8} style={styles.cancelHeaderLink}>
            <Text style={styles.cancelHeaderLinkText}>Cancel booking</Text>
          </Pressable>
        )}

        <ScrollView
          showsVerticalScrollIndicator={true}
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          bounces={true}
          nestedScrollEnabled={true}
        >
          <StatusTimeline status={status} compact />

          {/* Secure payment badge */}
          <View style={styles.secureBadge}>
            <View style={styles.secureBadgeLock}><KeyIcon size={14} color={Colors.onlineGreen} /></View>
            <Text style={styles.secureBadgeText}>Payment secured · released when care is complete</Text>
          </View>

          {/* Stale location warning — shown when updatedAt is older than 60s */}
          {locationIsStale && data?.providerLocation && (status === 'ACCEPTED' || status === 'ON_MY_WAY' || status === 'STARTED') && (
            <View style={styles.staleWarning}>
              <Text style={styles.staleWarningText}>Location may be outdated — Provider's GPS signal was lost. Last known position shown.</Text>
            </View>
          )}

          {/* ETA — shown in bottom sheet */}
          {eta && !locationIsStale && (status === 'ACCEPTED' || status === 'ON_MY_WAY') && (
            <View style={styles.etaCard}>
              <View style={styles.etaRow}>
                <View style={styles.etaIconWrap}>
                  <NavigateIcon size={22} color="#fff" />
                </View>
                <View style={styles.etaInfo}>
                  <Text style={styles.etaLabel}>Estimated arrival</Text>
                  <Text style={styles.etaTime}>{eta.display}</Text>
                </View>
                <Pressable
                  style={styles.directionsBtn}
                  onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`)}
                >
                  <Text style={styles.directionsBtnText}>Directions</Text>
                </Pressable>
              </View>
            </View>
          )}
          {provider ? (
            <View style={styles.providerSection}>
              {/* Provider Card — clean, prominent */}
              <View style={styles.providerCard}>
                {provider.photoUrl ? (
                  <Image source={{ uri: provider.photoUrl }} style={styles.providerAvatar} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                ) : (
                  <View style={[styles.providerAvatar, styles.providerAvatarPlaceholder]}>
                    <Text style={styles.providerAvatarText}>{provider.name?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                )}
                <View style={styles.providerInfo}>
                  <Text style={styles.providerName}>{provider.name}</Text>
                  <Text style={styles.providerMeta}>{booking?.serviceType}</Text>
                  {(provider.rating ?? 0) > 0 && (
                    <Text style={styles.providerRating}>★ {provider.rating?.toFixed(1)} ({provider.ratingCount} reviews)</Text>
                  )}
                </View>
                <Pressable onPress={() => setShowProfile(true)} style={styles.viewProfileBtn}>
                  <Text style={styles.viewProfileText}>Profile</Text>
                </Pressable>
              </View>

              {/* Quick actions */}
              <View style={styles.quickActions}>
                {provider.phone && (
                  <Pressable style={[styles.quickAction, styles.callAction]} onPress={() => Linking.openURL(`tel:${provider.phone}`)}>
                    <CallIcon size={20} color={Colors.systemGreen} />
                    <Text style={[styles.quickActionLabel, { color: Colors.systemGreen }]}>Call</Text>
                  </Pressable>
                )}
                <Pressable 
                  style={[styles.quickAction, styles.messageAction]}
                  onPress={() => nav.navigate('Chat', {
                    bookingId,
                    otherName: provider.name,
                    otherPhotoUrl: provider.photoUrl || undefined,
                    otherRole: 'Provider',
                  })}
                >
                  <ChatIcon size={20} color={Colors.systemBlue} />
                  <Text style={[styles.quickActionLabel, { color: Colors.systemBlue }]}>Message</Text>
                </Pressable>
                {bookingLocation && (
                  <Pressable 
                    style={[styles.quickAction, styles.navAction]}
                    onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`)}
                  >
                    <MapIcon size={20} color={Colors.systemPurple} />
                    <Text style={[styles.quickActionLabel, { color: Colors.systemPurple }]}>Navigate</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.findingWrap}>
              <SearchIcon size={40} color={Colors.tertiaryLabel} />
              <Text style={styles.findingTitle}>
                {data?.openToPool ? 'Finding you another caregiver…' : 'Finding your Provider…'}
              </Text>
              <Text style={styles.findingSub}>
                {data?.openToPool
                  ? 'Your first choice is unavailable, so we’ve opened your request to more verified Providers nearby. You can also pick someone yourself.'
                  : 'A verified Provider will accept your booking shortly. We’ll auto-match you if they don’t respond.'}
              </Text>
              <Pressable
                style={styles.chooseAnotherBtn}
                onPress={() => nav.navigate('NewBooking', { reassignBookingId: bookingId })}
              >
                <Text style={styles.chooseAnotherBtnText}>Choose a Provider myself</Text>
              </Pressable>
            </View>
          )}

          {booking && (
            <View style={styles.bookingSection}>
              <Text style={styles.sectionTitle}>Booking Details</Text>
              <View style={styles.bookingCard}>
                <View style={styles.bookingIconRow}>
                  <ServiceIcon serviceType={booking.serviceType} size={22} bubbleSize={42} style={{ marginRight: 4 }} />
                  <View style={styles.bookingMain}>
                    <Text style={styles.bookingService}>{booking.serviceType}</Text>
                    <Text style={styles.bookingDate}>{formatDate(booking.scheduledAt)}</Text>
                  </View>
                </View>

                <View style={styles.bookingDivider} />

                <View style={styles.bookingDetails}>
                  <View style={styles.bookingDetailRow}>
                    <View style={styles.bookingDetailLeft}>
                      <Text style={styles.detailLabel}>Duration</Text>
                    </View>
                    <Text style={styles.detailValue}>{booking.hours} hours</Text>
                  </View>
                  <View style={styles.bookingDetailRow}>
                    <View style={styles.bookingDetailLeft}>
                      <Text style={styles.detailLabel}>Location</Text>
                    </View>
                    <Text style={[styles.detailValue, { flex: 0, maxWidth: '50%' }]} numberOfLines={1}>{booking.address || DEFAULT_REGION_NAME}</Text>
                  </View>
                  <View style={styles.bookingDetailRow}>
                    <View style={styles.bookingDetailLeft}>
                      <Text style={styles.detailLabel}>Total</Text>
                    </View>
                    <Text style={[styles.detailValue, styles.priceValue]}>{formatCurrency(booking.totalPrice ?? 0)}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Post-care rating CTA — shown once the session is complete. Lets the
              customer rate (or re-open the prompt if they dismissed it). */}
          {status === 'COMPLETED' && !rated && (
            <Pressable style={styles.rateCta} onPress={() => setShowRateModal(true)}>
              <StarIcon size={18} color="#fff" filled />
              <Text style={styles.rateCtaText}>Rate Your Provider</Text>
            </Pressable>
          )}
          {rated && (
            <View style={styles.ratedBanner}>
              <StarIcon size={16} color={Colors.accentGold} filled />
              <Text style={styles.ratedBannerText}>Thanks! Your rating has been submitted.</Text>
            </View>
          )}

          {canCancel && (
            <View style={styles.cancelSection}>
              <Pressable style={styles.cancelBtn} onPress={handleCancel}>
                <Text style={styles.cancelBtnText}>Cancel Booking</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>
      </View>

      <Modal
        visible={showProfile && !!provider}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProfile(false)}
      >
        <View style={styles.profileModalRoot}>
          <View style={styles.profileModalHeader}>
            <Text style={styles.profileModalTitle}>Provider Profile</Text>
            <Pressable onPress={() => setShowProfile(false)} style={styles.profileModalDone}>
              <Text style={styles.profileModalDoneText}>Done</Text>
            </Pressable>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.profileModalContent}
            showsVerticalScrollIndicator={false}
          >
            {provider && (
              <ProviderProfileCard
                provider={{
                  // _id is required so the tappable rating row can load this Provider's
                  // client reviews via apiGetProviderReviews — without it the reviews
                  // panel always rendered "No reviews".
                  _id: provider._id,
                  name: provider.name,
                  photoUrl: provider.photoUrl || undefined,
                  rating: provider.rating,
                  ratingCount: provider.ratingCount,
                  experienceYears: provider.experienceYears,
                  languages: provider.languages,
                  certifications: provider.certifications,
                  specialties: provider.specialties,
                  policeCheckCleared: provider.policeCheckCleared,
                }}
              />
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Post-care rating sheet — auto-pops on COMPLETED, or via the CTA. */}
      <RatingModal
        visible={showRateModal}
        title="How was your care session?"
        subtitle={`Rate ${provider?.name ?? 'your Provider'}${booking?.serviceType ? ` for ${booking.serviceType}` : ''}`}
        onSubmit={async (rating, comment) => {
          await apiRateBooking({ bookingId, rating, comment });
          setRated(true);
          // Leave the sheet open so RatingModal shows its thank-you state; the
          // user closes it via "Done" (onDismiss).
        }}
        onDismiss={() => setShowRateModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F7F8' },
  mapContainer: {
    backgroundColor: '#E8E8EA',
    overflow: 'hidden',
    // Polished card feel — rounded bottom + subtle shadow so the map reads as a
    // distinct surface above the sheet.
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 1,
  },
  map: { flex: 1 },
  // Map legend — frosted card, bottom-left
  mapLegend: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  mapLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mapLegendDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff' },
  mapLegendText: { fontSize: 11, fontWeight: '700', color: Colors.label },
  // Native (react-native-maps) custom markers
  nativeCareMarker: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#FF3B30', borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  nativeProviderMarker: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#00C853', borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  nativeProviderMarkerText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: { 
    backgroundColor: '#fff', 
    paddingHorizontal: 14, 
    paddingVertical: 10, 
    borderRadius: 24, 
    shadowColor: '#000', 
    shadowOpacity: 0.12, 
    shadowRadius: 8, 
    shadowOffset: { width: 0, height: 2 }, 
    elevation: 4 
  },
  backBtnText: { fontSize: 14, fontWeight: '700', color: Colors.label },
  statusPill: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  mapWaitBanner: {
    // Sits above the bottom-left legend so the two never overlap.
    position: 'absolute', left: 16, right: 16, bottom: 76,
    backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center',
  },
  mapWaitText: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  statusPillText: { fontSize: 13, fontWeight: '700' },
  etaCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  etaIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  etaIcon: { fontSize: 20, color: '#fff', fontWeight: '900' },
  etaInfo: { flex: 1 },
  etaLabel: { fontSize: 12, color: Colors.secondaryLabel, fontWeight: '600', marginBottom: 2 },
  etaTime: { fontSize: 28, fontWeight: '900', color: Colors.label, letterSpacing: -1 },
  directionsBtn: {
    backgroundColor: Colors.brand,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  directionsBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bottomSheet: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  drawerHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#D1D1D6',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetExpandHint: { fontSize: 11, fontWeight: '700', color: Colors.brand, marginBottom: 8 },
  scrollView: { flex: 1 },
  providerSection: { marginBottom: 20 },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F7F8',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    gap: 14,
  },
  providerAvatar: { width: 52, height: 52, borderRadius: 26 },
  providerAvatarPlaceholder: { backgroundColor: Colors.systemBlue, alignItems: 'center', justifyContent: 'center' },
  providerAvatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  providerInfo: { flex: 1 },
  providerName: { fontSize: 17, fontWeight: '800', color: Colors.label, marginBottom: 2 },
  providerMeta: { fontSize: 13, color: Colors.secondaryLabel, marginBottom: 2 },
  providerRating: { fontSize: 12, color: Colors.secondaryLabel },
  viewProfileBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F0F0F0', borderRadius: 12 },
  viewProfileText: { fontSize: 13, fontWeight: '600', color: Colors.systemBlue },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
    backgroundColor: '#F7F7F8',
  },
  callAction: {},
  messageAction: {},
  navAction: {},
  quickActionIcon: { fontSize: 20, fontWeight: '900', color: Colors.label },
  quickActionLabel: { fontSize: 12, fontWeight: '700', color: Colors.label },
  findingWrap: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  findingIcon: { fontSize: 40, color: Colors.tertiaryLabel },
  findingTitle: { fontSize: 20, fontWeight: '800', color: Colors.label },
  findingSub: { fontSize: 14, color: Colors.secondaryLabel, textAlign: 'center', paddingHorizontal: 24, lineHeight: 20 },
  chooseAnotherBtn: { marginTop: 8, backgroundColor: Colors.brandLight, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20 },
  chooseAnotherBtnText: { color: Colors.brand, fontSize: 14, fontWeight: '800' },
  bookingSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.secondaryLabel, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  bookingCard: {
    backgroundColor: '#F7F7F8',
    borderRadius: 16,
    padding: 18,
  },
  bookingIconRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bookingIcon: { fontSize: 32 },
  bookingMain: { flex: 1 },
  bookingService: { fontSize: 16, fontWeight: '800', color: Colors.label, marginBottom: 2 },
  bookingDate: { fontSize: 13, color: Colors.secondaryLabel },
  bookingDivider: { height: 1, backgroundColor: '#E5E5EA', marginVertical: 14 },
  bookingDetails: { gap: 10 },
  bookingDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bookingDetailLeft: { flexDirection: 'row', alignItems: 'center' },
  detailLabel: { fontSize: 14, color: Colors.secondaryLabel },
  detailValue: { fontSize: 14, fontWeight: '600', color: Colors.label, textAlign: 'right' },
  priceValue: { color: Colors.trustGreen, fontSize: 18, fontWeight: '800' },
  cancelHeaderLink: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 12, marginBottom: 2 },
  cancelHeaderLinkText: { fontSize: 13, fontWeight: '700', color: Colors.systemRed, textDecorationLine: 'underline' },
  cancelSection: { marginTop: 8 },
  cancelBtn: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1.5,
    borderColor: '#FFD1D1',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: Colors.systemRed },
  // Post-care rating CTA + confirmation
  rateCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand,
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 12,
    minHeight: 44,
    shadowColor: Colors.brand,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  rateCtaText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  ratedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  ratedBannerText: { fontSize: 13, fontWeight: '700', color: '#92400E', flex: 1 },
  bottomPadding: { height: 40 },
  profileModalRoot: { flex: 1, backgroundColor: '#F7F7F8' },
  profileModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  profileModalTitle: { fontSize: 18, fontWeight: '800', color: Colors.label },
  profileModalDone: { paddingHorizontal: 8, paddingVertical: 4 },
  profileModalDoneText: { fontSize: 16, fontWeight: '600', color: Colors.systemBlue },
  profileModalContent: { padding: 16, paddingBottom: 40 },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  secureBadgeLock: { },
  secureBadgeText: { fontSize: 12, color: '#166534', fontWeight: '600', flex: 1 },
  staleWarning: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  staleWarningText: { fontSize: 12, color: '#92400E', fontWeight: '600', lineHeight: 17 },
});
