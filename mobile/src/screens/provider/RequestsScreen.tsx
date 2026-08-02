import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowBackIcon } from '../../components/TabIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { apiGetRequests, apiAcceptJob, apiSkipJob, Booking } from '../../api/client';
import { requestsBadge } from '../../utils/providerBadges';
import { Colors } from '../../utils/colors';
import { ServiceIcon } from '../../components/ServiceIcon';
import { PersonIcon, StarIcon } from '../../components/TabIcons';
import { PinIcon, NoteIcon, ClockIcon, BellIcon } from '../../components/CareIcons';
import { JobCardSkeleton } from '../../components/SkeletonLoader';
import { formatCurrency } from '../../utils/format';

const DECLINE_REASONS = ['Too far', 'Schedule conflict', 'Outside my specialty', 'Rate too low', 'Other'];

// Alert.alert is a no-op on web (RN-Web) — so errors were silently swallowed and
// the Provider saw "nothing happens" on Accept. Route through this so web uses window.alert.
function safeAlert(title: string, msg: string) {
  if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(`${title}\n\n${msg}`); }
  else Alert.alert(title, msg);
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}`;
}

// Human-friendly distance. Backend sends distanceKm only when both the Provider and the
// client have real coordinates, so a missing/0 value means "unknown" → render nothing.
function fmtDistance(km?: number): string | null {
  if (km == null || !isFinite(km) || km <= 0) return null;
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
}

export function RequestsScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<any>();
  const [requests, setRequests] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId]     = useState<string | null>(null);
  const [declineJob, setDeclineJob] = useState<Booking | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { requests } = await apiGetRequests();
      setRequests(requests);
      requestsBadge.current = requests.length;
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doAccept = useCallback(async (job: Booking) => {
    setBusyId(job._id);
    try {
      const { booking } = await apiAcceptJob(job._id);
      setRequests(prev => { const next = prev.filter(r => r._id !== job._id); requestsBadge.current = next.length; return next; });
      // Go to the active job. navigate is wrapped in try in case the param shape
      // differs — the accept already succeeded, so never block on navigation.
      try { nav.navigate('JobDetail', { job: booking }); }
      catch { nav.navigate('ProviderHome', { screen: 'MyJobs' }); }
    } catch (e: any) {
      const msg = e?.message || '';
      // If it's "already claimed", this Provider likely already accepted it — treat as
      // success: drop it from the inbox and send them to My Jobs.
      if (/already claimed|not found/i.test(msg)) {
        setRequests(prev => { const next = prev.filter(r => r._id !== job._id); requestsBadge.current = next.length; return next; });
        nav.navigate('ProviderHome', { screen: 'MyJobs' });
      } else {
        safeAlert('Could not accept', msg || 'Please try again. The server may be waking up — give it a moment.');
      }
    }
    setBusyId(null);
  }, [nav]);

  // Confirm before accepting — and surface how far the client is so the Provider can
  // judge the trip. Distance only shown when known (real coords on both sides).
  const accept = useCallback((job: Booking) => {
    const dist = fmtDistance(job.distanceKm);
    const lines = [
      `${job.serviceType} · ${job.hours}h · ${formatCurrency(job.totalPrice)}`,
      dist ? `Client is ${dist}` : null,
      job.address ? `Near ${job.address}` : null,
    ].filter(Boolean).join('\n');
    if (Platform.OS === 'web') {
      if (window.confirm(`Accept this care request?\n\n${lines}`)) doAccept(job);
      return;
    }
    Alert.alert('Accept request?', lines, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: () => doAccept(job) },
    ]);
  }, [doAccept]);

  const decline = useCallback(async (job: Booking, reason?: string) => {
    setDeclineJob(null);
    setBusyId(job._id);
    try {
      await apiSkipJob(job._id, reason);
      setRequests(prev => { const next = prev.filter(r => r._id !== job._id); requestsBadge.current = next.length; return next; });
    } catch (e: any) {
      safeAlert('Could not decline', e?.message || 'Please try again.');
    }
    setBusyId(null);
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.brand, Colors.brandDark]} style={[styles.header, { paddingTop: embedded ? 14 : insets.top + 14 }]}>
        <View style={styles.headerRow}>
          {!embedded && (
            <Pressable
              onPress={() => { if (nav.canGoBack()) nav.goBack(); else nav.navigate('ProviderHome'); }}
              style={styles.headerBack}
              hitSlop={8}
            >
              <ArrowBackIcon size={22} color="#fff" />
            </Pressable>
          )}
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>Care Requests</Text>
            <Text style={styles.headerSub}>
              {requests.length === 0 ? 'No pending requests' : `${requests.length} client${requests.length > 1 ? 's' : ''} requested you`}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.brand} />}
      >
        {loading ? (
          <View style={{ marginTop: 16 }}><JobCardSkeleton /><JobCardSkeleton /></View>
        ) : requests.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><BellIcon size={34} color={Colors.brand} /></View>
            <Text style={styles.emptyTitle}>No requests right now</Text>
            <Text style={styles.emptySub}>When a client picks you specifically, their request shows up here for you to accept or decline — no rush, no timer.</Text>
            <Pressable style={styles.findBtn} onPress={() => nav.navigate('NearbyJobs')}>
              <Text style={styles.findBtnText}>Browse open jobs →</Text>
            </Pressable>
          </View>
        ) : (
          requests.map(job => (
            <View key={job._id} style={styles.card}>
              <View style={styles.cardTop}>
                <ServiceIcon serviceType={job.serviceType} size={24} bubbleSize={48} style={{ borderWidth: 1, borderColor: '#A7F3D0' }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.service}>{job.serviceType}</Text>
                  <View style={styles.whenRow}>
                    <ClockIcon size={13} color={Colors.secondaryLabel} />
                    <Text style={styles.when}>{fmtWhen(job.scheduledAt)} · {job.hours}h</Text>
                  </View>
                </View>
                <View style={styles.priceWrap}>
                  <Text style={styles.price}>{formatCurrency(job.totalPrice)}</Text>
                  <Text style={styles.priceSub}>{job.hours}h · earn</Text>
                </View>
              </View>

              <View style={styles.clientRow}>
                <PersonIcon size={15} color={Colors.secondaryLabel} />
                <Text style={styles.clientLabel}>{job.customer?.name ?? 'Client'}</Text>
                {(job.customer?.rating ?? 0) > 0 && (
                  <>
                    <View style={{ marginLeft: 4 }}><StarIcon size={14} color="#F59E0B" /></View>
                    <Text style={styles.clientRating}>{job.customer?.rating?.toFixed(1)}</Text>
                  </>
                )}
              </View>
              {!!job.address && (
                <View style={styles.metaRow}>
                  <PinIcon size={14} color={Colors.tertiaryLabel} />
                  <Text style={styles.address} numberOfLines={2}>{job.address}</Text>
                </View>
              )}
              {/* Distance chip — Provider → client, brand-tinted so it stands out as the
                  "is this worth the drive?" signal. Only shows when known. */}
              {fmtDistance(job.distanceKm) && (
                <View style={styles.distancePill}>
                  <PinIcon size={13} color={Colors.brand} />
                  <Text style={styles.distanceText}>{fmtDistance(job.distanceKm)}</Text>
                </View>
              )}
              {!!job.notes && (
                <View style={styles.metaRow}>
                  <NoteIcon size={14} color={Colors.tertiaryLabel} />
                  <Text style={styles.notes} numberOfLines={3}>{job.notes}</Text>
                </View>
              )}

              <View style={styles.actions}>
                <Pressable style={styles.declineBtn} onPress={() => setDeclineJob(job)} disabled={busyId === job._id}>
                  <Text style={styles.declineText}>Decline</Text>
                </Pressable>
                <Pressable style={[styles.acceptBtn, busyId === job._id && { opacity: 0.7 }]} onPress={() => accept(job)} disabled={busyId === job._id}>
                  {busyId === job._id
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.acceptText}>Accept · ${job.totalPrice}</Text>}
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Decline reason picker */}
      <Modal visible={!!declineJob} transparent animationType="slide" onRequestClose={() => setDeclineJob(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Decline this request?</Text>
            <Text style={styles.sheetSub}>{declineJob?.serviceType} · ${declineJob?.totalPrice}. The client sees your reason and can pick another Provider.</Text>
            <View style={styles.reasonChips}>
              {DECLINE_REASONS.map(r => (
                <Pressable key={r} style={styles.reasonChip} onPress={() => declineJob && decline(declineJob, r)}>
                  <Text style={styles.reasonChipText}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.sheetBtnRow}>
              <Pressable style={styles.keepBtn} onPress={() => setDeclineJob(null)}>
                <Text style={styles.keepText}>Keep</Text>
              </Pressable>
              <Pressable style={styles.skipNoReason} onPress={() => declineJob && decline(declineJob, undefined)}>
                <Text style={styles.skipNoReasonText}>Decline without reason</Text>
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
  header: { paddingHorizontal: 20, paddingBottom: 18 },
  // Back arrow top-aligns with the title (not the centre of the 2-line block) so
  // the arrow, title, and subtitle read as one clean left edge.
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerBack: { padding: 4, marginTop: 2 },
  headerTextBlock: { flex: 1 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '800', lineHeight: 30 },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 },
  list: { padding: 16, paddingBottom: 130 },

  card: {
    backgroundColor: Colors.systemBackground, borderRadius: 18, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.separator,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#A7F3D0' },
  icon: { fontSize: 24 },
  service: { fontSize: 16, fontWeight: '800', color: Colors.label },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  when: { fontSize: 13, color: Colors.secondaryLabel },
  priceWrap: { alignItems: 'flex-end' },
  price: { fontSize: 20, fontWeight: '900', color: Colors.trustGreen },
  priceSub: { fontSize: 10, color: Colors.tertiaryLabel },

  // Distance Provider → client. Brand-tinted self-sizing pill (alignSelf flex-start so it
  // hugs its text instead of stretching the card width).
  distancePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: Colors.brandLight, borderWidth: 1, borderColor: '#A7F3D0',
  },
  distanceText: { fontSize: 12.5, fontWeight: '700', color: Colors.brand },

  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  clientLabel: { fontSize: 14, fontWeight: '700', color: Colors.label },
  clientRating: { fontSize: 13, color: Colors.secondaryLabel, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  address: { flex: 1, fontSize: 13, color: Colors.secondaryLabel, lineHeight: 18 },
  notes: { flex: 1, fontSize: 13, color: Colors.secondaryLabel, lineHeight: 18 },

  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  declineBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.systemGray5, alignItems: 'center' },
  declineText: { fontSize: 15, fontWeight: '700', color: Colors.label },
  acceptBtn: { flex: 2, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.trustGreen, alignItems: 'center' },
  acceptText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.systemGray6, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.label, marginBottom: 8 },
  emptySub: { fontSize: 14, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  findBtn: { backgroundColor: Colors.brand, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  findBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.systemBackground, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: Colors.label, marginBottom: 6 },
  sheetSub: { fontSize: 13, color: Colors.secondaryLabel, lineHeight: 19, marginBottom: 16 },
  reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5' },
  reasonChipText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  sheetBtnRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  keepBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.systemGray5, alignItems: 'center' },
  keepText: { fontSize: 15, fontWeight: '700', color: Colors.label },
  skipNoReason: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.systemGray6, alignItems: 'center', borderWidth: 1, borderColor: Colors.separator },
  skipNoReasonText: { fontSize: 14, fontWeight: '600', color: Colors.secondaryLabel },
});
