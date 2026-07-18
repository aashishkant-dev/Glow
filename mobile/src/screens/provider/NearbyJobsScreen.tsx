import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LocateIcon, SearchIcon, CloseCircleIcon, MapIcon, ListIcon, RadioOnIcon, BriefcaseIcon } from '../../components/TabIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { apiAcceptJob, apiSkipJob, apiNearbyJobs, apiMyJobs, Booking } from '../../api/client';
import { LocationBanner } from '../../components/LocationBanner';
import { JobCardSkeleton } from '../../components/SkeletonLoader';
import { useLocation, useCoordsOrFallback } from '../../context/LocationContext';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../utils/colors';
import { ServiceIcon } from '../../components/ServiceIcon';
import { PulseIcon, PinIcon, MedalIcon, ProfileIcon, BellIcon, ShieldCheckIcon, ClockIcon } from '../../components/CareIcons';
import { Radius, Spacing, Typography } from '../../utils/theme';
import { OSMMap, OSMMarker } from '../../components/OSMMap';

// Module-level ref so ProviderNavigator can read the current pending job count for the tab badge
export const pendingJobsCount = { current: 0 };

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

interface WebLeafletProps {
  center: { lat: number; lng: number };
  jobs: Booking[];
  onJobPress: (job: Booking) => void;
  onAcceptJob: (job: Booking) => void;
  filterText: string;
}

function WebLeafletMap({ center, jobs, onJobPress, onAcceptJob, filterText }: WebLeafletProps) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.textContent = `
      .leaflet-control-zoom a { width: 36px !important; height: 36px !important; line-height: 36px !important; font-size: 18px !important; }
      .leaflet-control-zoom { border-radius: 10px !important; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important; }
      .leaflet-popup-content-wrapper { border-radius: 14px !important; box-shadow: 0 8px 24px rgba(0,0,0,0.18) !important; }
      .leaflet-popup-content { margin: 14px 18px !important; font-family: -apple-system, sans-serif; }
      .cn-accept-btn { background: ${Colors.brand}; color: #fff; border: none; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 700; cursor: pointer; width: 100%; margin-top: 10px; }
      .cn-accept-btn:hover { background: ${Colors.brandDark}; }
      .cn-detail-btn { background: transparent; color: ${Colors.brand}; border: 1.5px solid ${Colors.brand}; border-radius: 10px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; width: 100%; margin-top: 6px; }
      .cn-detail-btn:hover { background: #F0FDF8; }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    loadLeaflet().then(() => {
      if (!containerRef.current || mapRef.current) return;
      const L = window.L;
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
        .setView([center.lat, center.lng], 12);
      setTimeout(() => { if (mapRef.current) mapRef.current.invalidateSize(); }, 300);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© CartoDB', maxZoom: 19,
      }).addTo(map);
      const youIcon = L.divIcon({
        html: `<div style="background:${Colors.brand};width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(27,108,168,0.6)"></div>`,
        className: '', iconAnchor: [7, 7],
      });
      L.marker([center.lat, center.lng], { icon: youIcon }).addTo(map).bindPopup('<b>You</b>');
      mapRef.current = map;
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom(), { animate: true });
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const L = window.L;
    markersRef.current.forEach(m => mapRef.current.removeLayer(m));
    markersRef.current = [];
    const filtered = filterText.trim()
      ? jobs.filter(j => j.serviceType.toLowerCase().includes(filterText.toLowerCase()))
      : jobs;
    filtered.forEach(job => {
      const lat = job.lat ?? 0; const lng = job.lng ?? 0;
      if (!lat || !lng) return;
      // No client info in the open-pool map: just the pay pill (privacy-safe).
      const jobIcon = L.divIcon({
        html: `<div style="background:${Colors.brandDark};color:#fff;border-radius:10px;padding:5px 10px;font-size:13px;font-weight:800;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.3)">$${job.totalPrice}</div>`,
        className: '', iconAnchor: [0, 0],
      });
      const marker = L.marker([lat, lng], { icon: jobIcon }).addTo(mapRef.current);
      const popup = `<div style="min-width:200px">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
          <span style="width:9px;height:9px;border-radius:50%;background:${Colors.brand};display:inline-block"></span>
          <span style="font-size:16px;font-weight:800;color:#0F172A">${job.serviceType}</span>
        </div>
        <div style="font-size:14px;color:#555;margin-bottom:2px">$${job.totalPrice} · ${job.hours}h</div>
        <div style="font-size:12px;color:#888">${new Date(job.scheduledAt).toLocaleDateString('en-CA',{weekday:'short',month:'short',day:'numeric'})}</div>
        <button class="cn-detail-btn" id="detail-${job._id}">View Details</button>
      </div>`;
      marker.bindPopup(popup, { maxWidth: 260 });
      marker.on('popupopen', () => {
        setTimeout(() => {
          const d = document.getElementById(`detail-${job._id}`);
          if (d) d.onclick = () => { onJobPress(job); return false; };
        }, 100);
      });
      markersRef.current.push(marker);
    });
  }, [jobs, filterText]);

  return (
    <View style={styles.mapContainer}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 300 }} />
      <Pressable style={styles.locateBtn} onPress={() => {
        if (mapRef.current) mapRef.current.setView([center.lat, center.lng], 14, { animate: true });
      }}>
        <LocateIcon size={20} color={Colors.label} />
      </Pressable>
      <View style={styles.mapOverlay}>
        <Text style={styles.mapOverlayText}>
          {markersRef.current.length} job{markersRef.current.length !== 1 ? 's' : ''} · tap a pin for details
        </Text>
      </View>
    </View>
  );
}

type ViewMode = 'list' | 'map';
const SUDBURY_CENTER = { latitude: 46.4917, longitude: -80.9930 };

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const NEW_JOB_BANNER_DURATION = 4000;

// Quick decline reasons (client sees these when a requested Provider declines).
const DECLINE_REASONS = ['Too far', 'Schedule conflict', 'Outside my specialty', 'Rate too low', 'Other'];

// ── Job action row: Accept + Skip ─────────────────────────────────────────────
function JobActions({
  job,
  accepting,
  skipping,
  onAccept,
  onSkip,
}: {
  job: Booking;
  accepting: boolean;
  skipping: boolean;
  onAccept: () => void;
  onSkip: () => void;
}) {
  if (job.hasConflict) {
    return (
      <View style={actionStyles.conflictBar}>
        <Text style={actionStyles.conflictText}>Time conflict — overlaps your active job</Text>
      </View>
    );
  }
  return (
    <View style={actionStyles.row}>
      {/* Skip / Decline */}
      <Pressable
        style={({ pressed }) => [actionStyles.skipBtn, (pressed || skipping) && { opacity: 0.6 }]}
        onPress={onSkip}
        disabled={skipping || accepting}
      >
        {skipping
          ? <ActivityIndicator color={Colors.secondaryLabel} size="small" />
          : <Text style={actionStyles.skipText}>Skip</Text>}
      </Pressable>

      {/* Accept */}
      <Pressable
        style={({ pressed }) => [actionStyles.acceptBtn, (pressed || accepting) && { opacity: 0.85 }]}
        onPress={onAccept}
        disabled={accepting || skipping}
      >
        {accepting
          ? <ActivityIndicator color="#fff" size="small" />
          : <>
              <Text style={actionStyles.acceptText}>Accept</Text>
              <Text style={actionStyles.acceptAmt}>${job.totalPrice}</Text>
            </>}
      </Pressable>
    </View>
  );
}

const actionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -6,
    marginBottom: 16,
    gap: 10,
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.separator,
    backgroundColor: Colors.systemBackground,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  skipText: {
    fontSize: 15, fontWeight: '700', color: Colors.secondaryLabel,
  },
  acceptBtn: {
    flex: 3,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  acceptText: {
    fontSize: 15, fontWeight: '800', color: '#fff',
  },
  acceptAmt: {
    fontSize: 15, fontWeight: '900', color: 'rgba(255,255,255,0.85)',
  },
  conflictBar: {
    marginHorizontal: 16,
    marginTop: -6,
    marginBottom: 16,
    backgroundColor: '#FFF0F0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  conflictText: { color: '#8B0000', fontSize: 13, fontWeight: '700' },
});

// ── Pending approval gate ─────────────────────────────────────────────────────
// Discreet "live" indicator — a soft pulsing dot + sweeping bar that signals the app is
// actively watching for nearby jobs, without a loud spinner. Self-contained (own anims).
function ScanningPulse({ jobCount }: { jobCount: number }) {
  const dot   = useRef(new Animated.Value(0.4)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const dotLoop = Animated.loop(Animated.sequence([
      Animated.timing(dot, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(dot, { toValue: 0.4, duration: 900, useNativeDriver: true }),
    ]));
    const sweepLoop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 2200, useNativeDriver: true })
    );
    dotLoop.start();
    sweepLoop.start();
    return () => { dotLoop.stop(); sweepLoop.stop(); };
  }, [dot, sweep]);

  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-60, 220] });

  return (
    <View style={scanStyles.wrap}>
      <Animated.View style={[scanStyles.dot, { opacity: dot }]} />
      <Text style={scanStyles.text}>
        {jobCount > 0 ? `Watching ${jobCount} job${jobCount > 1 ? 's' : ''} near you` : 'Scanning for jobs near you…'}
      </Text>
      <View style={scanStyles.track} pointerEvents="none">
        <Animated.View style={[scanStyles.sweepBar, { transform: [{ translateX }] }]} />
      </View>
    </View>
  );
}

const scanStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
    overflow: 'hidden',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  text: { flex: 1, fontSize: 12, fontWeight: '600', color: '#047857' },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, overflow: 'hidden' },
  sweepBar: { width: 60, height: 2, backgroundColor: '#34D399', opacity: 0.6, borderRadius: 2 },
});

// Discreet recent-activity ticker — rotates through the real nearby jobs as a subtle
// "social proof" hum ("Personal Care posted 12m ago · 3km away"). No fake data: it only
// surfaces jobs already in the pool, fading between them every few seconds.
function relTime(iso?: string): string {
  if (!iso) return 'just now';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function RecentActivityTicker({ jobs }: { jobs: any[] }) {
  const [idx, setIdx] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  // Most-recent first; cap to a handful so it stays a gentle hum, not a feed.
  const recent = React.useMemo(
    () => [...jobs]
      .sort((a, b) => new Date(b.createdAt ?? b.scheduledAt ?? 0).getTime() - new Date(a.createdAt ?? a.scheduledAt ?? 0).getTime())
      .slice(0, 6),
    [jobs],
  );

  useEffect(() => {
    if (recent.length < 2) return;
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setIdx(i => (i + 1) % recent.length);
        Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      });
    }, 3500);
    return () => clearInterval(t);
  }, [recent.length, fade]);

  if (recent.length === 0) return null;
  const job = recent[idx % recent.length];

  return (
    <View style={tickerStyles.wrap}>
      <PulseIcon size={14} color="#64748B" />
      <Animated.Text style={[tickerStyles.text, { opacity: fade }]} numberOfLines={1}>
        <Text style={tickerStyles.strong}>{job.serviceType}</Text>
        {` posted ${relTime(job.createdAt)}`}
        {job.distanceKm != null ? ` · ${job.distanceKm}km away` : ''}
      </Animated.Text>
    </View>
  );
}

const tickerStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4, paddingVertical: 6, marginBottom: 8 },
  text: { flex: 1, fontSize: 12, color: '#64748B' },
  strong: { fontWeight: '700', color: '#334155' },
});

// Derive a coarse, privacy-safe area label from a full address. We never show the
// street/unit — only a neighbourhood/locality token (e.g. "Minnow Lake", "New Sudbury")
// so the Provider gets a sense of WHERE the work is without the client's exact location.
function coarseArea(address?: string): string | null {
  if (!address) return null;
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  // Skip the first segment (usually the street/number); prefer the next locality-ish token.
  const candidate = parts.length > 1 ? parts[1] : parts[0];
  // Strip a leading street number if it's all we have.
  const cleaned = candidate.replace(/^\d+\s*/, '').trim();
  if (!cleaned || /\d{3}/.test(cleaned)) return null; // looks like a postal/number → drop
  return cleaned.length > 24 ? cleaned.slice(0, 24) + '…' : cleaned;
}

// ── Privacy-safe open-pool job card ───────────────────────────────────────────
// For the OPEN Find Jobs pool we deliberately hide the client's name, exact address
// and phone. A Provider only sees the kind of work going on around them: service type,
// schedule, hours, $ pay, a rough "~X km away" and a coarse neighbourhood — enough to
// decide, nothing that identifies the client before a match.
function OpenJobCard({ job, isNew, onPress }: { job: any; isNew: boolean; onPress: () => void }) {
  const accent = Colors.brand;
  const date = new Date(job.scheduledAt);
  const dateStr = date.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
  const area = coarseArea(job.address);
  const urgent = job.urgency === 'urgent' || job.urgency === 'emergency';

  return (
    <Pressable
      style={({ pressed }) => [openCardStyles.card, pressed && { opacity: 0.93, transform: [{ scale: 0.99 }] }]}
      onPress={onPress}
    >
      <View style={openCardStyles.header}>
        <View style={[openCardStyles.iconWrap, { backgroundColor: accent + '18' }]}>
          <ServiceIcon serviceType={job.serviceType} size={24} color={accent} bubble={false} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={openCardStyles.titleRow}>
            <Text style={openCardStyles.serviceType} numberOfLines={1}>{job.serviceType}</Text>
            {isNew && (
              <View style={openCardStyles.newTag}><Text style={openCardStyles.newTagText}>NEW</Text></View>
            )}
            {urgent && (
              <View style={openCardStyles.urgentTag}><Text style={openCardStyles.urgentTagText}>URGENT</Text></View>
            )}
          </View>
          <Text style={openCardStyles.dateTime}>{dateStr} · {timeStr}</Text>
        </View>
        <View style={openCardStyles.priceWrap}>
          <Text style={openCardStyles.price}>${job.totalPrice}</Text>
          <Text style={openCardStyles.hours}>{job.hours}h</Text>
        </View>
      </View>

      <View style={openCardStyles.divider} />

      <View style={openCardStyles.metaRow}>
        {job.distanceKm != null && (
          <View style={openCardStyles.chip}>
            <PinIcon size={13} color={Colors.brand} />
            <Text style={openCardStyles.chipText}>~{job.distanceKm} km away</Text>
          </View>
        )}
        {area && (
          <View style={openCardStyles.chip}>
            <Text style={openCardStyles.chipText} numberOfLines={1}>{area}</Text>
          </View>
        )}
        <View style={openCardStyles.chip}>
          <ClockIcon size={13} color={Colors.secondaryLabel} />
          <Text style={openCardStyles.chipText}>{job.hours}h shift</Text>
        </View>
      </View>
    </Pressable>
  );
}

const openCardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.systemBackground,
    borderWidth: 1, borderColor: Colors.separator,
    borderRadius: 18, padding: 16,
    marginHorizontal: 16, marginVertical: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  serviceType: { fontSize: 16, fontWeight: '800', color: Colors.label, flexShrink: 1 },
  dateTime: { fontSize: 12.5, color: Colors.secondaryLabel, marginTop: 3 },
  priceWrap: { alignItems: 'flex-end' },
  price: { fontSize: 22, fontWeight: '900', color: Colors.brand },
  hours: { fontSize: 11, color: Colors.secondaryLabel },
  divider: { height: 1, backgroundColor: Colors.separator, marginVertical: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F1F5F4', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.secondaryLabel },
  newTag: { backgroundColor: Colors.brand, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  newTagText: { fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  urgentTag: { backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#FCA5A5' },
  urgentTagText: { fontSize: 9, fontWeight: '900', color: '#DC2626', letterSpacing: 0.5 },
});

// ── Profile-boost incentive banner ────────────────────────────────────────────
// A tasteful nudge for new Providers: completing/strengthening their profile gets them
// matched with more clients. Shows a prominent version when the pool is empty or the
// profile is incomplete, and a slim version otherwise. Not spammy — one tap to Profile.
function ProfileBoostBanner({ prominent, onPress }: { prominent: boolean; onPress: () => void }) {
  if (prominent) {
    return (
      <Pressable
        style={({ pressed }) => [boostStyles.cardBig, pressed && { opacity: 0.95 }]}
        onPress={onPress}
      >
        <View style={boostStyles.bigIcon}>
          <MedalIcon size={26} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={boostStyles.bigTitle}>Stand out to more clients</Text>
          <Text style={boostStyles.bigSub}>
            Complete your profile and add certifications — verified Providers get matched with more jobs.
          </Text>
          <View style={boostStyles.bigBtn}>
            <ProfileIcon size={15} color={Colors.brand} />
            <Text style={boostStyles.bigBtnText}>Improve my profile</Text>
          </View>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [boostStyles.slim, pressed && { opacity: 0.9 }]}
      onPress={onPress}
    >
      <MedalIcon size={16} color={Colors.brand} />
      <Text style={boostStyles.slimText} numberOfLines={1}>
        Add certifications to your profile to get more jobs
      </Text>
      <Text style={boostStyles.slimCta}>Improve</Text>
    </Pressable>
  );
}

const boostStyles = StyleSheet.create({
  cardBig: {
    flexDirection: 'row', gap: 14, alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#A7F3D0',
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 3,
  },
  bigIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  bigTitle: { fontSize: 16, fontWeight: '800', color: Colors.label },
  bigSub: { fontSize: 13, color: Colors.secondaryLabel, lineHeight: 19, marginTop: 4 },
  bigBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 12, backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#A7F3D0' },
  bigBtnText: { fontSize: 13.5, fontWeight: '800', color: Colors.brand },
  slim: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  slimText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#047857' },
  slimCta: { fontSize: 12.5, fontWeight: '800', color: Colors.brand },
});

function PendingApprovalScreen() {
  return (
    <View style={pendingStyles.container}>
      <View style={pendingStyles.card}>
        <View style={pendingStyles.iconBubble}>
          <ShieldCheckIcon size={32} color={Colors.brand} />
        </View>
        <Text style={pendingStyles.title}>Account Under Review</Text>
        <Text style={pendingStyles.body}>
          Your profile is being verified by the Glow team. This usually takes 1–2 business days.{'\n\n'}
          Once approved, you'll be able to see and accept jobs in your area.
        </Text>
        <View style={pendingStyles.steps}>
          {([
            ['Profile submitted', true],
            ['Admin verification', false],
            ['Access granted', false],
          ] as const).map(([label, done]) => (
            <View key={label} style={pendingStyles.stepRow}>
              <View style={[pendingStyles.stepDot, done && pendingStyles.stepDotDone]}>
                {done
                  ? <ShieldCheckIcon size={16} color={Colors.brand} />
                  : <ClockIcon size={16} color={Colors.tertiaryLabel} />}
              </View>
              <Text style={[pendingStyles.stepLabel, done && pendingStyles.stepLabelDone]}>{label}</Text>
            </View>
          ))}
        </View>
        <Text style={pendingStyles.contact}>Questions? Email support@glow.app</Text>
      </View>
    </View>
  );
}

const pendingStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F1F5F4' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4, borderWidth: 1, borderColor: Colors.separator },
  iconBubble: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.label, marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 14, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  steps: { width: '100%', gap: 12, marginBottom: 24 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.systemGray5, alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: '#D1FAE5' },
  stepDotText: { fontSize: 14 },
  stepLabel: { fontSize: 14, fontWeight: '600', color: Colors.secondaryLabel },
  stepLabelDone: { color: Colors.brand },
  contact: { fontSize: 12, color: Colors.tertiaryLabel },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export function NearbyJobsScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { coords: rawCoords, requestLocation } = useLocation();
  const coords = useCoordsOrFallback();
  const { token } = useAuth();

  const [activeTab, setActiveTab]     = useState<'new' | 'upcoming' | 'past'>('new');
  const [myJobs, setMyJobs]           = useState<Booking[]>([]);
  const [jobs, setJobs]               = useState<Booking[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [pendingApproval, setPending] = useState(false);
  const [viewMode, setViewMode]       = useState<ViewMode>('list');
  const [searchText, setSearchText]   = useState('');
  const [serviceFilter, setFilter]    = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [skippingId, setSkippingId]   = useState<string | null>(null);
  const [declineJob, setDeclineJob]   = useState<Booking | null>(null); // job pending a decline reason

  const knownIds  = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const seenOnce  = useRef(false);
  const mounted   = useRef(true);
  const listRef   = useRef<FlatList<any>>(null);

  const bannerAnim    = useRef(new Animated.Value(-64)).current;
  const [bannerOn, setBannerOn]     = useState(false);
  const [bannerCount, setBannerCount] = useState(0);
  const bannerTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function showBanner(count: number) {
    setBannerCount(count); setBannerOn(true);
    Animated.timing(bannerAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start();
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(dismissBanner, NEW_JOB_BANNER_DURATION);
  }

  function dismissBanner() {
    Animated.timing(bannerAnim, { toValue: -64, duration: 240, useNativeDriver: true })
      .start(() => { if (mounted.current) setBannerOn(false); });
  }

  const load = useCallback(async (showRefresh = false) => {
    if (!mounted.current || !token) return;
    if (showRefresh) setRefreshing(true);
    else if (!seenOnce.current) setLoading(true);
    try {
      const { bookings, approvedByAdmin } = await apiNearbyJobs(coords ?? undefined);
      if (!mounted.current) return;
      setPending(!approvedByAdmin);
      pendingJobsCount.current = bookings.filter(j => j.status === 'REQUESTED').length;

      if (seenOnce.current) {
        const fresh = bookings.filter(j => !knownIds.current.has(j._id));
        if (fresh.length > 0) {
          const freshIds = fresh.map(j => j._id);
          setNewIds(prev => new Set([...prev, ...freshIds]));
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          if (Platform.OS === 'web' && typeof document !== 'undefined') {
            document.title = `(${fresh.length}) New Job — Glow`;
            setTimeout(() => { if (document) document.title = 'Glow'; }, 5000);
          }
          showBanner(fresh.length);
          setTimeout(() => {
            if (!mounted.current) return;
            setNewIds(prev => { const n = new Set(prev); freshIds.forEach(id => n.delete(id)); return n; });
          }, NEW_JOB_BANNER_DURATION);
        }
      }
      knownIds.current = new Set(bookings.map(j => j._id));
      seenOnce.current = true;
      setJobs(bookings);
    } catch {}
    if (mounted.current) { setLoading(false); setRefreshing(false); }
  }, [coords]);

  useEffect(() => { if (token) load(); }, [load, token]);

  useEffect(() => {
    if (!token) return;
    const t = setInterval(() => load(), 6_000);
    return () => clearInterval(t);
  }, [load, token]);

  // Refresh My Jobs when the tab changes to Upcoming or Past — but also on mount
  // (token dep covers that). Previously there were two near-identical effects which
  // caused a double fetch on every mount; collapsed into one.
  useEffect(() => {
    if (!token) return;
    apiMyJobs().then(r => { if (mounted.current) setMyJobs(r.bookings); }).catch(() => {});
  }, [activeTab, token]);

  async function handleAccept(job: Booking) {
    const doAccept = async () => {
      setAcceptingId(job._id);
      try {
        const { booking } = await apiAcceptJob(job._id);
        await load();
        nav.navigate('JobDetail', { job: booking });
      } catch (e: any) {
        if (Platform.OS === 'web') alert(e.message || 'Failed to accept.');
        else Alert.alert('Error', e.message || 'Failed to accept.');
      }
      setAcceptingId(null);
    };

    if (Platform.OS === 'web') {
      if (confirm(`Accept ${job.serviceType} — $${job.totalPrice}?`)) doAccept();
    } else {
      Alert.alert('Accept Job', `${job.serviceType} · $${job.totalPrice} · ${job.hours}h`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', style: 'default', onPress: doAccept },
      ]);
    }
  }

  function handleSkip(job: Booking) {
    // A booking the client requested specifically (REQUESTED + assigned to me) →
    // ask for a decline reason (client sees it). General open jobs → quick skip.
    if (job.status === 'REQUESTED') {
      setDeclineJob(job);
    } else {
      doSkip(job, undefined);
    }
  }

  async function doSkip(job: Booking, reason?: string) {
    setDeclineJob(null);
    setSkippingId(job._id);
    try {
      await apiSkipJob(job._id, reason);
      setJobs(prev => prev.filter(j => j._id !== job._id));
    } catch {}
    setSkippingId(null);
  }

  const jobsWithDist = jobs.map(j => {
    const lat = j.lat ?? 0; const lng = j.lng ?? 0;
    if (!lat || !lng) return { ...j, distanceKm: undefined as number | undefined };
    return { ...j, distanceKm: Math.round(getDistanceKm(coords.lat, coords.lng, lat, lng) * 10) / 10 };
  });

  const serviceTypes = Array.from(new Set(jobs.map(j => j.serviceType))).slice(0, 6);

  const filtered = jobsWithDist.filter(j => {
    const matchSearch = !searchText.trim() || j.serviceType.toLowerCase().includes(searchText.toLowerCase());
    const matchChip   = !serviceFilter || j.serviceType === serviceFilter;
    return matchSearch && matchChip;
  });

  // Nearby = the OPEN pool (all REQUESTED + unassigned). Dedicated requests live in
  // the Requests inbox, not here. So the whole filtered list is the open jobs.
  const openJobs = filtered as any[];

  const potentialEarnings = filtered.reduce((s, j) => s + (j.totalPrice ?? 0), 0);
  // Prefer the Provider's real GPS; fall back to the first open job; only then the
  // regional centre. Avoids parking the map on a default city when the device
  // actually knows where the Provider is.
  const firstJob = filtered.find(j => j.lat != null && j.lng != null);
  const mapCenter = rawCoords
    ?? (firstJob ? { lat: firstJob.lat!, lng: firstJob.lng! } : null)
    ?? { lat: SUDBURY_CENTER.latitude, lng: SUDBURY_CENTER.longitude };
  const newJobsCount = jobs.filter(j => j.status === 'REQUESTED').length;
  const upcomingJobs = myJobs.filter(j => ['ACCEPTED', 'ON_MY_WAY', 'STARTED'].includes(j.status));
  const pastJobs = myJobs.filter(j => j.status === 'COMPLETED');

  // Search bar lives OUTSIDE the FlatList. As ListHeaderComponent it was rebuilt
  // every render (and we re-render every 6s from polling) → FlatList remounted the
  // header subtree → the TextInput lost focus on every keystroke. Rendered as a
  // fixed sibling it keeps focus while typing.
  const searchBar = (
    <View style={[styles.listHeader, { paddingBottom: 0 }]}>
      <View style={styles.searchBar}>
        <SearchIcon size={16} color={Colors.tertiaryLabel} />
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search by service…"
          placeholderTextColor={Colors.tertiaryLabel}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <Pressable onPress={() => setSearchText('')}>
            <CloseCircleIcon size={18} color={Colors.tertiaryLabel} />
          </Pressable>
        )}
      </View>
    </View>
  );

  const listHeader = (
    <View style={[styles.listHeader, { paddingTop: 4 }]}>

      {/* Service chips */}
      {serviceTypes.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
          <Pressable style={[styles.chip, !serviceFilter && styles.chipActive]} onPress={() => setFilter(null)}>
            <Text style={[styles.chipText, !serviceFilter && styles.chipTextActive]}>All</Text>
          </Pressable>
          {serviceTypes.map(st => {
            const on = serviceFilter === st;
            return (
              <Pressable key={st} style={[styles.chip, on && styles.chipActive, { flexDirection: 'row', alignItems: 'center', gap: 6 }]} onPress={() => setFilter(p => p === st ? null : st)}>
                <ServiceIcon serviceType={st} size={15} color={on ? '#fff' : Colors.brand} bubble={false} />
                <Text style={[styles.chipText, on && styles.chipTextActive]}>{st}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Discreet live-scanning cue — shows the app is actively looking for work */}
      <ScanningPulse jobCount={filtered.length} />

      {/* Weekly FOMO pill — subtle social proof from real pool activity (no fake data) */}
      {(() => {
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const weekCount = filtered.filter(j => {
          const t = new Date((j as any).createdAt ?? (j as any).scheduledAt ?? 0).getTime();
          return t >= weekAgo;
        }).length;
        if (weekCount < 2) return null;
        return (
          <View style={styles.weekPill}>
            <Text style={styles.weekPillText}>📈 {weekCount} new jobs near you this week</Text>
          </View>
        );
      })()}

      {/* Profile-boost nudge: slim here when jobs exist (prominent version shows in empty state) */}
      {filtered.length > 0 && (
        <ProfileBoostBanner prominent={false} onPress={() => nav.navigate('Profile')} />
      )}

      {/* Stats row */}
      {filtered.length > 0 && (
        <View style={styles.statsBanner}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{filtered.length}</Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>${potentialEarnings}</Text>
            <Text style={styles.statLabel}>Potential</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>$25/hr</Text>
            <Text style={styles.statLabel}>Rate</Text>
          </View>
        </View>
      )}

      {/* Discreet recent-activity hum — subtle social proof from the real job pool */}
      {filtered.length > 0 && <RecentActivityTicker jobs={filtered} />}

      {loading && <View><JobCardSkeleton /><JobCardSkeleton /><JobCardSkeleton /></View>}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* New job banner */}
      {bannerOn && (
        <Animated.View style={[styles.newJobBanner, { top: insets.top, transform: [{ translateY: bannerAnim }] }]}>
          <Pressable style={styles.newJobBannerInner} onPress={() => {
            dismissBanner();
            setViewMode('list');
          }}>
            <BellIcon size={18} color="#fff" />
            <Text style={styles.newJobBannerText}>
              {bannerCount === 1 ? 'New job nearby — tap to view' : `${bannerCount} new jobs nearby`}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Find Jobs</Text>
            <Text style={styles.headerSub}>Open bookings near you</Text>
          </View>
          <View style={styles.headerRight}>
            {activeTab === 'new' && (
              <Pressable style={styles.toggleBtn} onPress={() => setViewMode(v => v === 'list' ? 'map' : 'list')}>
                {viewMode === 'list' ? <MapIcon size={15} color="#fff" /> : <ListIcon size={15} color="#fff" />}
                <Text style={styles.toggleBtnText}>{viewMode === 'list' ? 'Map' : 'List'}</Text>
              </Pressable>
            )}
            <Pressable style={styles.gpsBadge} onPress={requestLocation}>
              <RadioOnIcon size={12} color={rawCoords ? '#34D399' : '#FCD34D'} />
              <Text style={styles.gpsBadgeText}>{rawCoords ? 'Live GPS' : 'Sudbury'}</Text>
            </Pressable>
          </View>
        </View>
        {/* Tab bar */}
        <View style={styles.tabBar}>
          {(['new', 'upcoming', 'past'] as const).map(tab => {
            const isActive = activeTab === tab;
            const label = tab === 'new'
              ? (newJobsCount > 0 ? `New (${newJobsCount})` : 'New')
              : tab === 'upcoming' ? 'Upcoming' : 'Past';
            return (
              <Pressable
                key={tab}
                style={[styles.tabPill, isActive && styles.tabPillActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabPillText, isActive && styles.tabPillTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* New tab content */}
      {activeTab === 'new' && (
        <>
          {/* Pending approval gate */}
          {pendingApproval && !loading && <PendingApprovalScreen />}

          {/* Map — web Leaflet */}
          {!pendingApproval && viewMode === 'map' && Platform.OS === 'web' && (
            <WebLeafletMap
              center={mapCenter}
              jobs={filtered}
              onJobPress={job => nav.navigate('JobDetail', { job })}
              onAcceptJob={handleAccept}
              filterText={searchText}
            />
          )}

          {/* Map — native */}
          {!pendingApproval && viewMode === 'map' && Platform.OS !== 'web' && (
            <View style={styles.mapContainer}>
              <OSMMap
                style={styles.mapFull}
                center={{ lat: mapCenter.lat, lng: mapCenter.lng }}
                zoom={12}
                markers={filtered
                  .filter(job => (job.lat ?? 0) && (job.lng ?? 0))
                  .map(job => ({
                    lat: job.lat ?? 0,
                    lng: job.lng ?? 0,
                    color: Colors.brand,
                    label: `${job.serviceType} · $${job.totalPrice} · ${job.hours}h`,
                  } as OSMMarker))}
              />
              <View style={styles.mapOverlay}>
                <Text style={styles.mapOverlayText}>{filtered.length} jobs · tap a pin for details</Text>
              </View>
            </View>
          )}

          {/* List */}
          {!pendingApproval && viewMode === 'list' && (
            <View style={{ flex: 1 }}>
              <LocationBanner />
              {searchBar}
              <FlatList
                ref={listRef}
                style={{ flex: 1 }}
                data={loading ? [] : openJobs}
                keyExtractor={i => i._id}
                contentContainerStyle={styles.list}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.brand} />
                }
                ListHeaderComponent={listHeader}
                ListEmptyComponent={!loading ? (
                  <>
                  {!searchText && (
                    <ProfileBoostBanner prominent onPress={() => nav.navigate('Profile')} />
                  )}
                  <View style={styles.empty}>
                    <View style={styles.emptyIconBubble}>
                      {searchText
                        ? <SearchIcon size={30} color={Colors.brand} />
                        : <BriefcaseIcon size={30} color={Colors.brand} />}
                    </View>
                    <Text style={styles.emptyTitle}>
                      {searchText ? 'No matching jobs' : 'No jobs nearby right now'}
                    </Text>
                    <Text style={styles.emptySub}>
                      {searchText
                        ? `No jobs match "${searchText}". Try clearing the filter.`
                        : 'New jobs are posted regularly. Pull down to refresh, or check back soon.'}
                    </Text>
                    {!searchText && (
                      <Pressable style={styles.refreshBtn} onPress={() => load(true)}>
                        <Text style={styles.refreshBtnText}>Check Again</Text>
                      </Pressable>
                    )}
                  </View>
                  </>
                ) : null}
                renderItem={({ item }) => (
                  // Privacy-safe open-pool card: shows the kind of work nearby
                  // (service, schedule, hours, pay, ~distance, coarse area) but NOT
                  // the client's name, exact address or phone. Dedicated matched
                  // requests (with client info) live in the Requests inbox.
                  <OpenJobCard
                    job={item}
                    isNew={newIds.has(item._id)}
                    onPress={() => nav.navigate('JobDetail', { job: item })}
                  />
                )}
              />
            </View>
          )}
        </>
      )}

      {/* Upcoming / Past tab content */}
      {(activeTab === 'upcoming' || activeTab === 'past') && (
        <View style={{ flex: 1 }}>
          {(() => {
            const displayJobs = activeTab === 'upcoming' ? upcomingJobs : pastJobs;
            if (displayJobs.length === 0) {
              return (
                <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
                  <View style={styles.emptyIconBubble}>
                    {activeTab === 'upcoming'
                      ? <ClockIcon size={30} color={Colors.brand} />
                      : <BriefcaseIcon size={30} color={Colors.brand} />}
                  </View>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.label }}>
                    {activeTab === 'upcoming' ? 'No upcoming jobs' : 'No completed jobs'}
                  </Text>
                  <Text style={{ fontSize: 13, color: Colors.secondaryLabel, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 }}>
                    {activeTab === 'upcoming' ? 'Accepted jobs will appear here.' : 'Completed jobs will appear here.'}
                  </Text>
                </View>
              );
            }
            return (
              <FlatList
                style={{ flex: 1 }}
                data={displayJobs}
                keyExtractor={j => j._id}
                contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
                renderItem={({ item: job }) => (
                  <Pressable
                    onPress={() => nav.navigate('JobDetail', { bookingId: job._id })}
                    style={styles.myJobCard}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.myJobService}>{job.serviceType}</Text>
                      <Text style={styles.myJobDate}>
                        {new Date(job.scheduledAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} · {job.hours}h
                      </Text>
                      <Text style={styles.myJobClient}>{(job as any).customer?.name ?? 'Customer'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.myJobEarn}>${job.totalPrice}</Text>
                      <View style={[styles.myJobBadge, {
                        backgroundColor: job.status === 'COMPLETED' ? 'rgba(34,197,94,0.15)' : 'rgba(14,165,111,0.15)',
                      }]}>
                        <Text style={[styles.myJobBadgeText, {
                          color: job.status === 'COMPLETED' ? '#22C55E' : '#0EA56F',
                        }]}>
                          {job.status === 'COMPLETED' ? 'Paid'
                            : job.status === 'ACCEPTED' ? 'Accepted'
                            : job.status === 'ON_MY_WAY' ? 'On Way'
                            : 'In Progress'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                )}
              />
            );
          })()}
        </View>
      )}

      {/* Decline-reason picker (for a job the client requested specifically) */}
      <Modal visible={!!declineJob} transparent animationType="slide" onRequestClose={() => setDeclineJob(null)}>
        <View style={styles.declineOverlay}>
          <View style={styles.declineCard}>
            <Text style={styles.declineTitle}>Decline this request?</Text>
            <Text style={styles.declineSub}>
              {declineJob?.serviceType} · ${declineJob?.totalPrice}. The client sees your reason and can pick another Provider.
            </Text>
            <View style={styles.reasonChips}>
              {DECLINE_REASONS.map(r => (
                <Pressable key={r} style={styles.reasonChip} onPress={() => declineJob && doSkip(declineJob, r)}>
                  <Text style={styles.reasonChipText}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.declineBtnRow}>
              <Pressable style={styles.declineCancel} onPress={() => setDeclineJob(null)}>
                <Text style={styles.declineCancelText}>Keep</Text>
              </Pressable>
              <Pressable style={styles.declineSkip} onPress={() => declineJob && doSkip(declineJob, undefined)}>
                <Text style={styles.declineSkipText}>Decline without reason</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F4' },

  newJobBanner: {
    position: 'absolute', left: 0, right: 0, zIndex: 100,
    shadowColor: Colors.brandDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 12,
  },
  newJobBannerInner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.brand, paddingVertical: 14, paddingHorizontal: 20, gap: 10,
  },
  newJobBannerIcon: { fontSize: 18 },
  newJobBannerText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700' },

  header: {
    backgroundColor: Colors.brand,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { ...Typography.title2, color: '#fff' },
  headerSub: { ...Typography.footnote, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.full,
  },
  toggleBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  gpsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Radius.full,
  },
  gpsBadgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  listHeader: { paddingHorizontal: 16, paddingTop: 14 },

  weekPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F0FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
  },
  weekPillText: { fontSize: 12, fontWeight: '700', color: Colors.brand },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.systemBackground,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    marginBottom: 12, borderWidth: 1, borderColor: Colors.separator, gap: 10,
  },
  searchInput: { flex: 1, color: Colors.label, fontSize: 15, fontWeight: '500' },

  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.separator, backgroundColor: Colors.systemBackground,
  },
  chipActive: { backgroundColor: Colors.brandDark, borderColor: Colors.brandDark },
  chipText: { color: Colors.secondaryLabel, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#fff' },

  statsBanner: {
    flexDirection: 'row', backgroundColor: Colors.systemBackground,
    borderRadius: 16, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.separator,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { color: Colors.label, fontSize: 18, fontWeight: '900' },
  statLabel: { color: Colors.secondaryLabel, fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.separator, marginHorizontal: 8 },

  mapContainer: { flex: 1, position: 'relative' },
  mapFull: { flex: 1 },
  mapOverlay: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    backgroundColor: Colors.mapOverlay, borderRadius: 12, padding: 10, alignItems: 'center',
  },
  mapOverlayText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  locateBtn: {
    position: 'absolute', bottom: 70, right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },

  list: { paddingTop: 4, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyIconBubble: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.label, marginBottom: 8 },
  emptySub: { fontSize: 14, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  refreshBtn: {
    backgroundColor: Colors.brand, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 32,
  },
  refreshBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 4,
  },
  tabPill: {
    backgroundColor: Colors.systemGray5,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  tabPillActive: { backgroundColor: Colors.brand },
  tabPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabPillTextActive: { color: '#fff' },

  myJobCard: {
    backgroundColor: Colors.systemBackground,
    borderWidth: 1,
    borderColor: Colors.separator,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  myJobService: { fontSize: 15, fontWeight: '700', color: Colors.label },
  myJobDate: { fontSize: 12, color: Colors.secondaryLabel, marginTop: 3 },
  myJobClient: { fontSize: 12, color: Colors.tertiaryLabel, marginTop: 2 },
  myJobEarn: { fontSize: 16, fontWeight: '800', color: Colors.trustGreen },
  myJobBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  myJobBadgeText: { fontSize: 10, fontWeight: '700' },

  requestedSection: { marginBottom: Spacing.sm },
  requestedLabel: { fontSize: 13, fontWeight: '700', color: Colors.brand, marginHorizontal: Spacing.lg, marginBottom: Spacing.xs, marginTop: Spacing.md },
  acceptRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  skipBtnSm: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.separator, alignItems: 'center' },
  skipBtnSmText: { fontSize: 14, fontWeight: '600', color: Colors.secondaryLabel },
  acceptBtnSm: { flex: 3, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: Colors.brand, alignItems: 'center' },
  acceptBtnSmText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Decline reason modal
  declineOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  declineCard: { backgroundColor: Colors.systemBackground, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  declineTitle: { fontSize: 19, fontWeight: '800', color: Colors.label, marginBottom: 6 },
  declineSub: { fontSize: 13, color: Colors.secondaryLabel, lineHeight: 19, marginBottom: 16 },
  reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5' },
  reasonChipText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  declineBtnRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  declineCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.systemGray5, alignItems: 'center' },
  declineCancelText: { fontSize: 15, fontWeight: '700', color: Colors.label },
  declineSkip: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.systemGray6, alignItems: 'center', borderWidth: 1, borderColor: Colors.separator },
  declineSkipText: { fontSize: 14, fontWeight: '600', color: Colors.secondaryLabel },
});
