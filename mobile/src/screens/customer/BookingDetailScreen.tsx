import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet,
  Text, View,
} from 'react-native';
import { ArrowBackIcon, LocationIcon, CallIcon, ChatIcon, NavigateIcon } from '../../components/TabIcons';
// Brand SVG icons (no emoji) — BellIcon for the help header, EmailIcon/ClockIcon for support rows.
import { BellIcon, EmailIcon, ClockIcon } from '../../components/CareIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { apiCancelBooking, apiGetBooking, apiRateBooking, Booking } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusTimeline } from '../../components/StatusTimeline';
import { ProviderProfileCard } from '../../components/ProviderProfileCard';
import { Colors } from '../../utils/colors';
import { confirmAction } from '../../utils/haptics';
import { ServiceIcon } from '../../components/ServiceIcon';
import { RatingModal } from '../../components/RatingModal';
import { Radius, Spacing, Typography } from '../../utils/theme';

const SCREEN_H = Dimensions.get('window').height;
// Bounded, interactive map card height — a sensible fixed band the user can pinch/
// zoom/pan, NOT a full-bleed sticky backdrop the content used to cover.
const MAP_CARD_H = Math.min(320, Math.max(240, SCREEN_H * 0.4));

import { OSMMap } from '../../components/OSMMap';

declare global { interface Window { L: any } }

// Inject Leaflet (css + js) once. Mirrors TrackingScreen's proven loader so the
// web map is a real interactive Leaflet map with working +/- zoom + pan.
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

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Only treat a URL as a real caregiver photo when it looks like an image. Some
// Provider records carry a *document* URL (e.g. an uploaded PDF/credential) in
// photoUrl, which loaded as a broken/wrong "document thumbnail" instead of a
// face. Returning undefined for those makes the avatar fall back to initials.
function validPhotoUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const u = url.trim();
  if (/^data:image\//i.test(u)) return u;                       // inline image
  if (/^https?:\/\//i.test(u)) {
    if (/\.(pdf|docx?|txt|csv|xlsx?)(\?|#|$)/i.test(u)) return undefined; // document, not a photo
    return u;
  }
  return undefined;
}


export function BookingDetailScreen() {
  const route  = useRoute<any>();
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const locale = 'en-CA';

  // Screen can be opened two ways:
  //   1. From a list — full `booking` object passed in params (instant render).
  //   2. From a notification — only `bookingId` passed → booking is null until fetched.
  // Guarding against (2) is what fixes the "white screen" when tapping a notification
  // or a completed booking whose object wasn't passed.
  const paramBooking: Booking | undefined = route.params?.booking;
  const paramBookingId: string | undefined = route.params?.bookingId ?? paramBooking?._id;

  const [booking,    setBooking]    = useState<Booking | null>(paramBooking ?? null);
  const [rated,      setRated]      = useState<boolean>(!!paramBooking?.ratingGiven);
  const [showRateModal, setShowRateModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(false);

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef  = useRef<ScrollView>(null);
  const ratingRef  = useRef<View>(null);
  // Web Leaflet map refs
  const mapContainerRef = useRef<any>(null);
  const leafletMapRef   = useRef<any>(null);
  const serviceMarkerRef   = useRef<any>(null);
  const prevStatus = useRef<string>(paramBooking?.status ?? '');
  const isActive = !!booking && ['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED'].includes(booking.status);
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    if (!paramBookingId) return;
    apiGetBooking(paramBookingId, true).then(res => {
      if (res.booking) {
        setBooking(prev => (prev && JSON.stringify(prev) === JSON.stringify(res.booking)) ? prev : res.booking);
        if (res.booking.ratingGiven) setRated(true);
      }
    }).catch(() => {});
  }, [paramBookingId]);

  const bookingId = booking?._id;
  // Poll while active, AND for a completed-but-unrated booking (so a completion that
  // lands while the client is viewing reliably triggers the rating prompt).
  const shouldPoll = !!bookingId && (isActive || (booking?.status === 'COMPLETED' && !rated && !booking?.ratingGiven));
  useEffect(() => {
    if (!shouldPoll || !bookingId) return;
    const id = setInterval(() => {
      apiGetBooking(bookingId, true).then(res => {
        const newStatus = res.booking?.status ?? '';
        if (prevStatus.current === 'REQUESTED' && newStatus === 'ACCEPTED') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        if (prevStatus.current !== 'COMPLETED' && newStatus === 'COMPLETED') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        prevStatus.current = newStatus || prevStatus.current;
        // Only replace state when something actually changed — a new object ref every
        // 6s remounted the map + Provider card and caused the visible flicker.
        if (res.booking) {
          setBooking(prev => {
            if (prev && JSON.stringify(prev) === JSON.stringify(res.booking)) return prev;
            return res.booking;
          });
        }
      }).catch(() => {});
    }, 6000);
    return () => clearInterval(id);
  }, [bookingId, shouldPoll]);

  useEffect(() => {
    if (booking?.status !== 'REQUESTED') return;
    const id = setInterval(() => setDotCount(c => (c + 1) % 4), 600);
    return () => clearInterval(id);
  }, [booking?.status]);

  // Reactive: whenever the (possibly freshly-fetched) booking is COMPLETED and not yet
  // rated, scroll to the rating CTA and pop the modal. Runs on status change too — so
  // it fires whether the booking was already done on open OR completes while watching.
  // `ratingPrompted` guards against re-popping after the user skips/submits.
  const [ratingPrompted, setRatingPrompted] = useState(false);
  useEffect(() => {
    if (booking?.status !== 'COMPLETED') return;
    if (rated || booking.ratingGiven || ratingPrompted) return;
    setRatingPrompted(true);
    const scrollId = setTimeout(() => {
      ratingRef.current?.measureLayout(
        scrollRef.current as any,
        (_x: number, y: number) => scrollRef.current?.scrollTo({ y, animated: true }),
        () => {}
      );
    }, 600);
    const modalId = setTimeout(() => setShowRateModal(true), 400);
    return () => { clearTimeout(scrollId); clearTimeout(modalId); };
  }, [booking?.status, booking?.ratingGiven, rated, ratingPrompted]);

  // ── Web Leaflet map ──────────────────────────────────────────────────────
  // Real interactive map (CARTO light tiles, working +/- zoom bottom-right, pan
  // on). Replaces the old non-interactive OSM iframe backdrop. Re-runs when the
  // care coords become known (booking may load after mount via bookingId).
  const serviceLat = booking?.lat ?? 0;
  const serviceLng = booking?.lng ?? 0;
  const hasCoords = serviceLat !== 0 || serviceLng !== 0;
  useEffect(() => {
    if (Platform.OS !== 'web' || !hasCoords) return;
    let cancelled = false;
    loadLeaflet().then(() => {
      if (cancelled || !mapContainerRef.current) return;
      const L = window.L;
      if (!leafletMapRef.current) {
        const map = L.map(mapContainerRef.current, {
          zoomControl: false,          // we add a positioned control below
          scrollWheelZoom: false,      // page scroll stays smooth; pinch/buttons zoom
          attributionControl: false,
        }).setView([serviceLat, serviceLng], 14);
        // Working +/- zoom, bottom-right so it never collides with the "Open in
        // Maps" pill (top-right) or the back button.
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
        }).addTo(map);
        leafletMapRef.current = map;
      }
      const map = leafletMapRef.current;
      // Care location = red house teardrop pin (same style as TrackingScreen).
      const serviceIcon = L.divIcon({
        html:
          `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">` +
            `<div style="width:34px;height:34px;background:#FF3B30;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 12px rgba(239,68,68,0.45);display:flex;align-items:center;justify-content:center;">` +
              `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" style="transform:rotate(45deg);"><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" stroke="#fff" stroke-width="2" stroke-linejoin="round" fill="none"/></svg>` +
            `</div>` +
          `</div>`,
        className: '',
        iconSize: [34, 40],
        iconAnchor: [17, 38],
      });
      if (serviceMarkerRef.current) {
        serviceMarkerRef.current.setLatLng([serviceLat, serviceLng]);
      } else {
        serviceMarkerRef.current = L.marker([serviceLat, serviceLng], { icon: serviceIcon })
          .addTo(map)
          .bindPopup(`<b>Service location</b>`);
      }
      map.setView([serviceLat, serviceLng], map.getZoom() || 14);
      setTimeout(() => leafletMapRef.current?.invalidateSize(), 250);
    });
    return () => { cancelled = true; };
  }, [hasCoords, serviceLat, serviceLng]);

  // Booking not loaded yet (opened via bookingId from a notification) — show a spinner
  // instead of crashing on `booking.xxx` (which produced a white screen).
  if (!booking) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.brand} size="large" />
        <Text style={{ marginTop: 12, color: Colors.secondaryLabel, fontSize: 14 }}>Loading booking…</Text>
      </View>
    );
  }

  const lat = booking.lat ?? 0;
  const lng = booking.lng ?? 0;
  function openMaps() {
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`);
  }



  function cancelBooking() {
    const doCancel = async () => {
      setCancelling(true);
      try {
        const res = await apiCancelBooking(booking!._id);
        if (typeof Haptics.notificationAsync === 'function') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        setBooking(res.booking);
      } catch (e: any) {
        Alert.alert('Cancel Failed', e.message || 'Please try again.');
      }
      setCancelling(false);
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Cancel this booking? This cannot be undone.')) doCancel();
    } else {
      confirmAction({
        title: 'Cancel Booking',
        message: 'Are you sure you want to cancel? This cannot be undone.',
        confirmLabel: 'Cancel Booking',
        cancelLabel: 'Keep Booking',
        destructive: true,
        onConfirm: doCancel,
      });
    }
  }

  function callProvider() {
    if (booking!.provider?.phone) Linking.openURL(`tel:${booking!.provider.phone}`);
  }

  const bookingRef = `CN-${booking._id.slice(-8).toUpperCase()}`;

  return (
    <View style={styles.container}>
      {/* ── Back button — floating over the map card ── */}
      <View style={[styles.backOverlay, { top: insets.top + 12 }]} pointerEvents="box-none">
        <Pressable style={styles.backButton} onPress={() => nav.goBack()}>
          <View style={styles.backButtonPill}>
            <ArrowBackIcon size={20} color="#fff" />
            <Text style={styles.backButtonText}>Bookings</Text>
          </View>
        </Pressable>
      </View>

      {/* ── Scrollable content ── */}
      {/* KeyboardAvoidingView so the tip amount input (near the bottom) stays
          visible above the keyboard while the customer types. */}
      <KeyboardAvoidingView
        style={StyleSheet.absoluteFill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Interactive map card — a real, bounded element the user can
             pinch / zoom / pan. NOT a sticky backdrop. ── */}
        {hasCoords ? (
          <View style={[styles.mapCardTop, { height: MAP_CARD_H }]}>
            {Platform.OS === 'web' ? (
              <View ref={mapContainerRef} style={styles.mapFill} />
            ) : (
              <OSMMap
                style={styles.mapFill}
                center={{ lat: serviceLat, lng: serviceLng }}
                zoom={15}
                markers={[{ lat: serviceLat, lng: serviceLng, kind: 'care', label: 'Service location' }]}
              />
            )}

            {/* "Open in Maps" — top-right, never overlaps the bottom-right +/- zoom. */}
            <Pressable style={styles.openMapPill} onPress={openMaps}>
              <NavigateIcon size={14} color="#fff" />
              <Text style={styles.openMapPillText}>Open in Maps</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.mapCardTop, styles.mapPlaceholder, { height: MAP_CARD_H }]}>
            <LocationIcon size={30} color={Colors.brand} />
            <Text style={styles.mapPlaceholderText}>{booking.address || 'Service location on file'}</Text>
            <Text style={styles.mapPlaceholderSub}>Map preview unavailable for this address</Text>
          </View>
        )}

        {/* ── Content surface below the map ── */}
        <View style={styles.contentSurface}>

        {/* ── Provider / Searching card — first thing visible when scrolling ── */}
        {booking.provider ? (
          <View style={[styles.section, styles.sectionTop]}>
            <Text style={styles.sectionLabel}>YOUR ARTIST</Text>
            <Pressable
              onPress={() => nav.navigate('ProviderPublicProfile', {
                providerId: (booking.provider as any)?._id ?? (booking.provider as any)?.id,
                providerName: booking.provider?.name,
              })}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              {/* Compact ProviderProfileCard already renders its own chevron — no wrapper chevron (avoids the double "›"). */}
              <ProviderProfileCard
                compact
                provider={{
                  name: booking.provider.name,
                  photoUrl: validPhotoUrl((booking.provider as any)?.photoUrl),
                  rating: booking.provider.rating,
                  ratingCount: booking.provider.ratingCount,
                  policeCheckCleared: true,
                  experienceYears: (booking.provider as any)?.experienceYears,
                  languages: (booking.provider as any)?.languages,
                  certifications: (booking.provider as any)?.certifications,
                  specialties: (booking.provider as any)?.specialties,
                  bio: (booking.provider as any)?.bio,
                }}
              />
            </Pressable>
            {['ACCEPTED', 'ON_MY_WAY', 'STARTED'].includes(booking.status) && (
              <View style={styles.providerActions}>
                {booking.provider.phone && (
                  <Pressable style={[styles.providerActionBtn, styles.providerActionBtnGreen]} onPress={callProvider}>
                    <CallIcon size={18} color="#fff" />
                    <Text style={styles.providerActionBtnText}>Call Artist</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.providerActionBtn, styles.providerActionBtnBlue]}
                  onPress={() => nav.navigate('Chat', {
                    bookingId: booking._id,
                    otherName: booking.provider?.name ?? 'Your Provider',
                    otherPhotoUrl: validPhotoUrl((booking.provider as any)?.photoUrl),
                    otherRole: 'Provider',
                  })}
                >
                  <ChatIcon size={18} color="#fff" />
                  <Text style={styles.providerActionBtnText}>Message</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : booking.status === 'REQUESTED' ? (
          <View style={[styles.section, styles.sectionTop]}>
            <View style={styles.liveCard}>
              <View style={styles.liveCardHeader}>
                <View style={styles.liveDot} />
                <Text style={styles.liveCardTitle}>Finding your Artist{'.'.repeat(dotCount)}</Text>
              </View>
              <Text style={styles.liveCardDesc}>
                Matching you with a verified beauty artist near you. This usually takes under 2 minutes.
              </Text>
              <View style={styles.liveSteps}>
                {[
                  { label: 'Booking received', done: true },
                  { label: 'Matching nearby Artists', done: booking.status !== 'REQUESTED', active: booking.status === 'REQUESTED' },
                  { label: 'Artist confirmed', done: ['ACCEPTED','STARTED','COMPLETED'].includes(booking.status) },
                  { label: 'Glam in progress', done: ['STARTED','COMPLETED'].includes(booking.status) },
                ].map((step, i) => (
                  <View key={i} style={styles.liveStep}>
                    <View style={[styles.liveStepDot, step.done ? styles.liveStepDone : step.active ? styles.liveStepActive : styles.liveStepPending]} />
                    <Text style={[styles.liveStepText, step.done && styles.liveStepTextDone, step.active && styles.liveStepTextActive]}>{step.label}</Text>
                  </View>
                ))}
              </View>
              {/* When the booking has no Provider (e.g. the requested one declined),
                  let the client pick another. */}
              {booking.status === 'REQUESTED' && !booking.provider && (
                <Pressable
                  style={({ pressed }) => [styles.chooseArtistBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => nav.navigate('NewBooking', {
                    reassignBookingId: booking._id,
                    serviceType: booking.serviceType,
                    _t: Date.now(),
                  })}
                >
                  <Text style={styles.chooseArtistBtnText}>Choose an Artist →</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : null}

        {/* ── Status hero ── */}
        <View style={[styles.hero, { backgroundColor: Colors.brandDark }]}>
          <View style={styles.heroContent}>
            <View style={styles.heroIconWrap}>
              <ServiceIcon serviceType={booking.serviceType} size={28} color="#fff" bubble={false} />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <StatusBadge status={booking.status} size="md" />
              <Text style={styles.heroService}>{booking.serviceType}</Text>
              <Text style={styles.heroPrice}>${booking.totalPrice?.toFixed(0) ?? '—'}</Text>
              <Text style={styles.heroPay}>Private pay · Secured</Text>
            </View>
          </View>
          <View style={styles.refPill}>
            <Text style={styles.refPillText}>{bookingRef}</Text>
          </View>
        </View>

        {/* Status Timeline */}
        {booking.status !== 'CANCELLED' && (
          <View style={styles.section}>
            <View style={styles.card}>
              <StatusTimeline status={booking.status} />
            </View>
          </View>
        )}

        {/* Cancelled banner */}
        {booking.status === 'CANCELLED' && (
          <View style={styles.section}>
            <View style={styles.cancelledBanner}>
              <View style={styles.cancelledIconWrap}>
                <Text style={styles.cancelledIcon}>✕</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cancelledTitle}>Booking Cancelled</Text>
                <Text style={styles.cancelledDesc}>This booking was cancelled and is no longer active.</Text>
              </View>
            </View>
          </View>
        )}

        {/* Live status indicator */}
        {isActive && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveIndicatorText}>Live · updates every 6s</Text>
          </View>
        )}

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DETAILS</Text>
          <View style={styles.card}>
            {([
              ['Date',       formatDate(booking.scheduledAt, locale)],
              ['Start Time', formatTime(booking.scheduledAt, locale)],
              ['Duration',   `${booking.hours ?? 0} hour${(booking.hours ?? 0) > 1 ? 's' : ''}`],
              ['Address',    booking.address || 'Address on file'],
              ['Payment',    booking.paymentStatus],
              ['Total',      `$${booking.totalPrice?.toFixed(0) ?? '—'}`],
            ] as [string, string][]).map(([label, value], i, arr) => (
              <View key={label}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
                {i < arr.length - 1 && <View style={styles.detailDivider} />}
              </View>
            ))}
          </View>
        </View>

        {/* Notes */}
        {booking.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SPECIAL INSTRUCTIONS</Text>
            <View style={styles.card}>
              <Text style={styles.notesText}>{booking.notes}</Text>
            </View>
          </View>
        ) : null}

        {/* Address link when no coords */}
        {lat === 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SERVICE LOCATION</Text>
            <Pressable style={styles.mapCard} onPress={openMaps}>
              <View style={styles.mapNoCoords}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <LocationIcon size={16} color={Colors.label} />
                  <Text style={styles.mapNoCoordsText}>{booking.address || 'Address on file'}</Text>
                </View>
                <Text style={styles.mapOpenBtnText}>Open in Maps →</Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* Track Your Provider button */}
        {['ACCEPTED', 'ON_MY_WAY', 'STARTED'].includes(booking.status) && (
          <View style={styles.section}>
            <Pressable
              style={({ pressed }) => [styles.trackBtn, pressed && { opacity: 0.85 }]}
              onPress={() => nav.navigate('Tracking', {
                bookingId: booking._id,
                bookingLocation: booking.lat ? { lat: booking.lat, lng: booking.lng } : undefined,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.trackBtnText}>Track Your Artist</Text>
                <NavigateIcon size={16} color="#fff" />
              </View>
            </Pressable>
          </View>
        )}

        {/* Cancel button (REQUESTED only) */}
        {booking.status === 'REQUESTED' && (
          <View style={styles.section}>
            <Pressable
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
              onPress={cancelBooking}
              disabled={cancelling}
            >
              <Text style={styles.cancelBtnText}>{cancelling ? 'Cancelling...' : 'Cancel Booking'}</Text>
            </Pressable>
          </View>
        )}

        {/* Book Again (COMPLETED / CANCELLED) */}
        {(booking.status === 'COMPLETED' || booking.status === 'CANCELLED') && (
          <View style={styles.section}>
            <Pressable
              style={({ pressed }) => [styles.reBookBtn, pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }]}
              onPress={() => nav.navigate('NewBooking')}
            >
              <Text style={styles.reBookBtnText}>Book This Again →</Text>
            </Pressable>
          </View>
        )}

        {/* Rating */}
        {booking.status === 'COMPLETED' && !rated && (
          <Pressable
            ref={ratingRef}
            style={styles.rateBtn}
            onPress={() => setShowRateModal(true)}
          >
            <Text style={styles.rateBtnText}>★ Rate Your Artist</Text>
          </Pressable>
        )}

        {rated && (
          <View style={styles.section}>
            <View style={styles.ratedBanner}>
              <Text style={styles.ratedIcon}>★</Text>
              <Text style={styles.ratedText}>Rating submitted! Thank you for your feedback.</Text>
            </View>
          </View>
        )}

        {/* Tip prompt — no in-app payment processor exists yet, so this is
            honest informational copy only. It previously rendered a full
            amount-picker + "Send $X Tip" button that said "Processing..."
            and then "Tip sent!" on tap, and ALSO showed "Tip sent!" if the
            customer tapped "No thanks" — none of that ever charged
            anything or reached the Artist. Fixed to never claim a tip was
            sent when it wasn't. */}
        {rated && !tipDismissed && booking?.status === 'COMPLETED' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>LEAVE A TIP</Text>
            <View style={styles.card}>
              <Text style={styles.tipPrompt}>Want to tip your Artist?</Text>
              <Text style={styles.tipSub}>
                In-app tipping isn't available yet — e-transfer your Artist directly if you'd like to say thanks.
              </Text>
              <Pressable onPress={() => setTipDismissed(true)} style={styles.tipSkip}>
                <Text style={styles.tipSkipText}>Got it</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Contact Support */}
        <View style={styles.section}>
          <View style={styles.helpHeaderRow}>
            <BellIcon size={15} color={Colors.secondaryLabel} />
            <Text style={[styles.sectionLabel, { marginTop: 0, marginBottom: 0 }]}>NEED HELP?</Text>
          </View>
          <View style={styles.card}>
            <Pressable
              style={styles.supportRow}
              onPress={() => Linking.openURL(`mailto:support@glow.app?subject=Booking ${bookingRef}`)}
            >
              <View style={styles.supportIconWrap}>
                <EmailIcon size={18} color={Colors.label} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supportLabel}>Email Support</Text>
                <Text style={styles.supportSub}>support@glow.app · 24/7</Text>
              </View>
              <Text style={styles.supportChevron}>›</Text>
            </Pressable>
            <View style={styles.supportDivider} />
            <Pressable
              style={styles.supportRow}
              onPress={() => Linking.openURL('tel:+16476209243')}
            >
              <View style={styles.supportIconWrap}>
                <CallIcon size={18} color={Colors.label} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supportLabel}>Call Support</Text>
                <Text style={styles.supportSub}>+1 (647) 620-9243 · 24/7</Text>
              </View>
              <Text style={styles.supportChevron}>›</Text>
            </Pressable>
            <View style={styles.supportDivider} />
            <View style={styles.supportRow}>
              <View style={styles.supportIconWrap}>
                <ClockIcon size={18} color={Colors.label} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.supportLabel}>Support Hours</Text>
                <Text style={styles.supportSub}>English & Français · 24/7</Text>
              </View>
            </View>
          </View>
        </View>

          <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
            <Text style={styles.bookingId}>{`Booking Reference: ${bookingRef}`}</Text>
          </View>
        </View>{/* end contentSurface */}
      </ScrollView>
      </KeyboardAvoidingView>
      <RatingModal
        visible={showRateModal}
        title="How was your session?"
        subtitle={`Rate ${booking?.provider?.name ?? 'your Provider'} for ${booking?.serviceType ?? 'the session'}`}
        onSubmit={async (rating, comment) => {
          try {
            await apiRateBooking({ bookingId: booking._id, rating, comment });
            setRated(true);
            setShowRateModal(false);
          } catch {
            // rating failed silently — modal stays open, user can retry
          }
        }}
        onDismiss={() => setShowRateModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemGroupedBackground },

  // Interactive map card — bounded, rounded, its own scroll section at the top.
  mapCardTop: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.systemGray5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4,
  },
  mapFill: { flex: 1, width: '100%', height: '100%' },
  nativeCareMarker: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#FF3B30', borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  mapPlaceholder: {
    alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.brandLight,
    paddingHorizontal: 24,
  },
  mapPlaceholderText: { color: Colors.label, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  mapPlaceholderSub: { color: Colors.secondaryLabel, fontSize: 13, textAlign: 'center' },

  // Back button overlay
  backOverlay: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, zIndex: 20,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backButtonPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  backButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  // Top-right of the map card. The +/- zoom lives bottom-right, so they never
  // share a corner — no overlap on any width.
  openMapPill: {
    position: 'absolute', right: 12, top: 12, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 5,
  },
  openMapPillText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Content surface — booking details below the map card
  contentSurface: {
    backgroundColor: Colors.systemGroupedBackground,
    paddingTop: 4,
  },

  // First section after scroll padding — rounded top corners to "slide over" map
  sectionTop: { marginTop: 0 },

  providerActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  providerActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
  providerActionBtnGreen: { backgroundColor: Colors.onlineGreen },
  providerActionBtnBlue: { backgroundColor: Colors.systemBlue },
  providerActionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  hero: { padding: 24, paddingBottom: 28 },
  heroContent: { flexDirection: 'row', gap: 16, alignItems: 'flex-start', marginBottom: 16 },
  heroIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroIcon: { fontSize: 28 },
  heroService: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  heroPrice: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  heroPay: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  refPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  refPillText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },

  section: { paddingHorizontal: 16, marginBottom: 4 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.secondaryLabel,
    letterSpacing: 0.8,
    paddingHorizontal: 4, marginBottom: 10, marginTop: 16,
  },
  card: {
    backgroundColor: Colors.systemBackground, borderRadius: 16, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  detailDivider: { height: 1, backgroundColor: Colors.separator },
  detailLabel: { fontSize: 14, color: Colors.secondaryLabel },
  detailValue: { fontSize: 14, fontWeight: '600', color: Colors.label, flex: 1, textAlign: 'right' },
  notesText: { fontSize: 15, color: Colors.label, lineHeight: 22 },

  cancelledBanner: {
    flexDirection: 'row', gap: 14, alignItems: 'flex-start',
    backgroundColor: '#FFF0F0', borderRadius: 16, padding: 18,
    borderWidth: 1,
    borderColor: '#FFD1D1',
  },
  cancelledIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.systemRed + '15', alignItems: 'center', justifyContent: 'center' },
  cancelledIcon: { fontSize: 16, fontWeight: '900', color: Colors.systemRed },
  cancelledTitle: { fontSize: 15, fontWeight: '700', color: Colors.systemRed, marginBottom: 4 },
  cancelledDesc: { fontSize: 13, color: Colors.secondaryLabel, lineHeight: 19 },

  cancelBtn: {
    marginTop: 8, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 2, borderColor: Colors.systemRed,
  },
  cancelBtnText: { fontSize: 16, fontWeight: '700', color: Colors.systemRed },

  reBookBtn: {
    marginTop: 8, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.brand,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  reBookBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  ratedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F0FFF4', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  ratedIcon: { fontSize: 22, color: Colors.trustGreen },
  ratedText: { fontSize: 14, fontWeight: '600', color: Colors.trustGreen, flex: 1 },

  // Support
  helpHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, marginBottom: 10, marginTop: 16 },
  supportRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  supportDivider: { height: 1, backgroundColor: Colors.separator },
  supportIconWrap: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.systemGray6, alignItems: 'center', justifyContent: 'center' },
  supportIcon: { fontSize: 18, color: Colors.label },
  supportLabel: { fontSize: 14, fontWeight: '600', color: Colors.label },
  supportSub: { fontSize: 12, color: Colors.secondaryLabel, marginTop: 1 },
  supportChevron: { fontSize: 22, color: Colors.systemGray3 },

  bookingId: { fontSize: 12, color: Colors.tertiaryLabel, textAlign: 'center', marginTop: 8 },

  providerTappableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  providerChevron: {
    fontSize: 26,
    color: Colors.systemGray3,
    fontWeight: '300',
    paddingHorizontal: 4,
  },

  // Tip flow
  tipPrompt: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
  tipSub: { fontSize: 13, color: '#8E8E93', marginBottom: 16 },
  tipSkip: { alignItems: 'center', paddingVertical: 10 },
  tipSkipText: { color: '#8E8E93', fontSize: 14 },

  trackBtn: {
    marginTop: 8, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.systemBlue,
    shadowColor: Colors.systemBlue,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
  },
  trackBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Live tracking
  liveCard: {
    backgroundColor: '#F0F9FF', borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: '#BAE6FD',
    marginTop: 8,
  },
  liveCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00C853' },
  liveCardTitle: { fontSize: 15, fontWeight: '700', color: '#0369A1', flex: 1 },
  liveCardDesc: { fontSize: 13, color: '#0284C7', lineHeight: 19, marginBottom: 14 },
  chooseArtistBtn: {
    marginTop: 14, backgroundColor: Colors.brand, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  chooseArtistBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  liveSteps: { gap: 10 },
  liveStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveStepDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  liveStepDone: { backgroundColor: '#00C853' },
  liveStepActive: { backgroundColor: '#FF9500', borderWidth: 2, borderColor: '#FFCC00' },
  liveStepPending: { backgroundColor: '#E5E5EA' },
  liveStepText: { fontSize: 13, color: Colors.secondaryLabel },
  liveStepTextDone: { color: Colors.trustGreen, fontWeight: '600' },
  liveStepTextActive: { color: '#D97706', fontWeight: '700' },
  liveIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 8,
  },
  liveIndicatorText: { fontSize: 12, color: Colors.trustGreen, fontWeight: '600' },

  rateBtn: {
    marginHorizontal: 16, marginTop: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Colors.brand,
    alignItems: 'center',
  },
  rateBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Map
  mapCard: { borderRadius: 16, overflow: 'hidden', backgroundColor: Colors.systemBackground, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  map: { height: 180, width: '100%' },
  mapOpenBtn: { padding: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.separator, backgroundColor: '#F7F7F8' },
  mapOpenBtnText: { fontSize: 14, fontWeight: '700', color: Colors.systemBlue },
  mapNoCoords: { padding: 18, alignItems: 'center', gap: 8 },
  mapNoCoordsText: { fontSize: 15, fontWeight: '600', color: Colors.label },
});
