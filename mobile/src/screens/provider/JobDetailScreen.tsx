import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { ArrowBackIcon, MapIcon, DocumentIcon, CallIcon, ChatIcon, NavigateIcon } from '../../components/TabIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { apiAcceptJob, apiCompleteJob, apiGetBooking, apiOnMyWay, apiRateCustomer, apiStartJob, Booking } from '../../api/client';
import { getSocket } from '../../utils/socket';
import { Avatar } from '../../components/Avatar';
import { RatingModal } from '../../components/RatingModal';
import { StatusBadge } from '../../components/StatusBadge';
import { Colors } from '../../utils/colors';
import { ServiceIcon } from '../../components/ServiceIcon';
import { useAuth } from '../../context/AuthContext';
import { Radius, Shadow, Spacing, Typography } from '../../utils/theme';
import { OSMMap } from '../../components/OSMMap';
import { formatCurrency } from '../../utils/format';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface CareChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

const DEFAULT_CHECKLIST: CareChecklistItem[] = [
  { id: '1', label: 'Confirmed the look/style with the customer', completed: false },
  { id: '2', label: 'Tools and products sanitized', completed: false },
  { id: '3', label: 'Service completed as requested', completed: false },
  { id: '4', label: 'Customer happy with the result', completed: false },
  { id: '5', label: 'Work area cleaned up', completed: false },
];

const SERVICE_CHECKLISTS: Record<string, CareChecklistItem[]> = {
  'Makeup': DEFAULT_CHECKLIST,
  'Bridal Makeup': [
    { id: '1', label: 'Bridal look confirmed (trial reference)', completed: false },
    { id: '2', label: 'Tools and products sanitized', completed: false },
    { id: '3', label: 'Base, eyes and lips completed', completed: false },
    { id: '4', label: 'Setting spray / long-wear finish applied', completed: false },
    { id: '5', label: 'Touch-up kit handed over', completed: false },
    { id: '6', label: 'Bride happy with the final look', completed: false },
  ],
  'Party Makeup': DEFAULT_CHECKLIST,
  'Threading': [
    { id: '1', label: 'Shape confirmed with the customer', completed: false },
    { id: '2', label: 'Fresh thread used, skin prepped', completed: false },
    { id: '3', label: 'Threading completed', completed: false },
    { id: '4', label: 'Soothing gel applied', completed: false },
  ],
  'Hair Styling': [
    { id: '1', label: 'Style confirmed with the customer', completed: false },
    { id: '2', label: 'Tools sanitized', completed: false },
    { id: '3', label: 'Styling completed', completed: false },
    { id: '4', label: 'Finish/hold product applied', completed: false },
  ],
  'Hair Coloring': [
    { id: '1', label: 'Shade confirmed, patch test done', completed: false },
    { id: '2', label: 'Color applied evenly', completed: false },
    { id: '3', label: 'Processing time respected', completed: false },
    { id: '4', label: 'Rinse and aftercare advice given', completed: false },
  ],
  'Facial': [
    { id: '1', label: 'Skin type checked, products confirmed', completed: false },
    { id: '2', label: 'Cleanse, exfoliate, massage completed', completed: false },
    { id: '3', label: 'Mask applied and removed', completed: false },
    { id: '4', label: 'Moisturizer/SPF applied', completed: false },
  ],
  'Waxing': [
    { id: '1', label: 'Areas confirmed with the customer', completed: false },
    { id: '2', label: 'Wax temperature tested', completed: false },
    { id: '3', label: 'Waxing completed', completed: false },
    { id: '4', label: 'Soothing lotion applied', completed: false },
  ],
  'Nails': [
    { id: '1', label: 'Design/color confirmed', completed: false },
    { id: '2', label: 'Tools sanitized', completed: false },
    { id: '3', label: 'Prep, shape and cuticle care done', completed: false },
    { id: '4', label: 'Polish/art applied and dried', completed: false },
  ],
  'Mehendi': [
    { id: '1', label: 'Design confirmed with the customer', completed: false },
    { id: '2', label: 'Fresh cone used', completed: false },
    { id: '3', label: 'Design applied', completed: false },
    { id: '4', label: 'Aftercare instructions shared', completed: false },
  ],
  'Massage': [
    { id: '1', label: 'Pressure preference confirmed', completed: false },
    { id: '2', label: 'Clean linens/oils used', completed: false },
    { id: '3', label: 'Massage completed', completed: false },
    { id: '4', label: 'Customer comfortable throughout', completed: false },
  ],
};

// ── Status → action config ────────────────────────────────────────────────────
interface ActionConfig {
  label: string;
  subLabel: string;
  color: string;
  showQuickActions: boolean;
  showDirections: boolean;
}

function getActionConfig(status: string, allDone: boolean, completedItems: number, total: number, totalPrice?: number | null): ActionConfig | null {
  switch (status) {
    case 'REQUESTED':
      return {
        label: 'Accept Job',
        subLabel: `Earn ${totalPrice != null ? formatCurrency(totalPrice) : '—'} · Confirm to proceed`,
        color: Colors.onlineGreen,
        showQuickActions: false,
        showDirections: false,
      };
    case 'ACCEPTED':
      // From ACCEPTED the only forward step is "On My Way" — arrival is a SEPARATE,
      // explicit tap available only after ON_MY_WAY. (Previously this offered
      // "I've Arrived" while ALSO showing an On-My-Way button, so one flow appeared
      // to fire two transitions.)
      return {
        label: "I'm On My Way",
        subLabel: 'Let the client know you have departed',
        color: Colors.systemBlue,
        showQuickActions: true,
        showDirections: true,
      };
    case 'ON_MY_WAY':
      return {
        label: "I've Arrived",
        subLabel: 'Mark arrival to begin the care session',
        color: Colors.systemOrange,
        showQuickActions: true,
        showDirections: true,
      };
    case 'STARTED':
      return {
        label: allDone ? 'Complete Job' : `Complete Job (${completedItems}/${total})`,
        subLabel: allDone
          ? `All tasks done — earn ${totalPrice != null ? formatCurrency(totalPrice) : '—'}`
          : `${total - completedItems} tasks remaining`,
        color: Colors.onlineGreen,
        showQuickActions: true,
        showDirections: false,
      };
    default:
      return null;
  }
}

export function JobDetailScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { user, photoUri } = useAuth();
  // Openable two ways: with a full `job` object (from lists) or just `bookingId`
  // (from Upcoming/Past cards & notifications). Guarding the bookingId path fixes
  // the blank screen on tapping a My-Jobs card.
  const paramJob: Booking | undefined = route.params?.job;
  const paramJobId: string | undefined = route.params?.bookingId ?? paramJob?._id;
  const [job, setJob] = useState<Booking | null>(paramJob ?? null);
  const [loading, setLoading] = useState(false);
  const [serviceNotes, setCareNotes] = useState('');
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [providerRated, setProviderRated]           = useState(false);
  const [checklist, setChecklist] = useState<CareChecklistItem[]>(
    (paramJob && SERVICE_CHECKLISTS[paramJob.serviceType]) || SERVICE_CHECKLISTS['Makeup']
  );

  // Fetch on mount (or when only a bookingId was passed). Also resets the checklist
  // to the right service type once the job loads.
  useEffect(() => {
    if (!paramJobId) return;
    let cancelled = false;
    apiGetBooking(paramJobId, true).then(({ booking }) => {
      if (cancelled) return;
      setJob(prev => (prev && JSON.stringify(prev) === JSON.stringify(booking)) ? prev : booking);
      // Only reset the checklist when the service type actually differs — avoids wiping
      // the Provider's checked items if the fetch returns the same job.
      setChecklist(prev => {
        const next = SERVICE_CHECKLISTS[booking.serviceType] || SERVICE_CHECKLISTS['Makeup'];
        return prev.length === next.length ? prev : next;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [paramJobId]);

  // This screen previously never refreshed after mount — no poll, no
  // useFocusEffect, no socket subscription. If a client cancelled the
  // booking (or anything else changed its status) while a Provider had this
  // screen open, the action buttons (On My Way / I've Arrived / Complete
  // Job) stayed live for a booking that was already gone server-side, and
  // tapping them just produced a generic "Booking not found" alert instead
  // of the screen reflecting reality. The backend already emits
  // `booking-status-changed` with `{ bookingId, status }` on every
  // accept/skip/cancel/complete transition (ChatUnreadContext's global
  // listener uses the same event for its toast banner) — this listener is
  // scoped to just this screen's own booking and re-fetches the full
  // object so `job` state always reflects the live server status.
  useEffect(() => {
    if (!paramJobId) return;
    const socket = getSocket();
    const onStatusChanged = (d: any) => {
      if (String(d?.bookingId) !== String(paramJobId)) return;
      apiGetBooking(paramJobId, true).then(({ booking }) => setJob(booking)).catch(() => {});
    };
    socket.on('booking-status-changed', onStatusChanged);
    return () => { socket.off('booking-status-changed', onStatusChanged); };
  }, [paramJobId]);

  useEffect(() => {
    if (job && (job as any).providerRatingGiven) setProviderRated(true);
  }, [job]);

  const prevStatusRef = useRef<string>(paramJob?.status ?? '');
  useEffect(() => {
    if (!job) return;
    if (prevStatusRef.current !== 'COMPLETED' && job.status === 'COMPLETED' && !providerRated) {
      setTimeout(() => setShowRateModal(true), 1200);
    }
    prevStatusRef.current = job.status;
  }, [job, providerRated]);

  const completedItems = checklist.filter(item => item.completed).length;
  const allItemsCompleted = completedItems === checklist.length;

  const isActive = !!job && ['ACCEPTED', 'ON_MY_WAY', 'STARTED'].includes(job.status);

  // Not loaded yet (opened via bookingId) — spinner instead of a blank screen.
  if (!job) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.brand} />
        <Text style={{ marginTop: 12, color: Colors.secondaryLabel }}>Loading job…</Text>
      </View>
    );
  }
  const jobView = job; // non-null alias for the render path below

  function toggleChecklistItem(id: string) {
    setChecklist(prev => prev.map(item =>
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  }

  async function performAction(
    label: string,
    fn: () => Promise<{ booking: Booking }>,
  ) {
    const doAction = async () => {
      setLoading(true);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        const { booking } = await fn();
        setJob(booking);
        if (booking.status === 'COMPLETED') {
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (e: any) {
        if (Platform.OS === 'web') {
          alert(e.message || 'Something went wrong.');
        } else {
          Alert.alert('Error', e.message || 'Something went wrong.');
        }
      }
      setLoading(false);
    };

    if (Platform.OS === 'web') {
      if (confirm(`${label} — Are you sure?`)) doAction();
      return;
    }
    Alert.alert(label, `Are you sure you want to ${label.toLowerCase()}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: label === 'Cancel Job' ? 'destructive' : 'default', onPress: doAction },
    ]);
  }

  function callCustomer() {
    if (jobView.customer?.phone) Linking.openURL(`tel:${jobView.customer.phone}`);
  }

  const lat = jobView.lat ?? 0;
  const lng = jobView.lng ?? 0;

  function openMaps() {
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`);
  }

  function openDirections() {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  }

  function handlePrimaryAction() {
    // Guard: never advance while a transition is already in flight (prevents a
    // rapid double-tap from firing two status changes).
    if (loading) return;
    switch (jobView.status) {
      case 'REQUESTED':
        performAction('Accept Job', () => apiAcceptJob(jobView._id));
        break;
      case 'ACCEPTED':
        // One explicit step: ACCEPTED → ON_MY_WAY. Does NOT mark arrival.
        performAction('On My Way', () => apiOnMyWay(jobView._id));
        break;
      case 'ON_MY_WAY':
        // Separate explicit step: ON_MY_WAY → STARTED (arrived/begin session).
        performAction('Start Job', () => apiStartJob(jobView._id));
        break;
      case 'STARTED': {
        // Early-completion check: never BLOCK finishing early (real visits can
        // wrap up ahead of schedule), but if a meaningful chunk of the booked
        // time remains, confirm with a "you still have ~X left" warning first.
        // Prefer the real session start; fall back to the scheduled time so a
        // stale payload without startedAt doesn't silently disable the warning.
        const startRaw  = jobView.startedAt ?? jobView.scheduledAt;
        const startedMs = startRaw ? new Date(startRaw).getTime() : NaN;
        const remainMs  = Number.isFinite(startedMs)
          ? startedMs + jobView.hours * 3_600_000 - Date.now()
          : 0;
        if (remainMs > 15 * 60_000) {
          const h = Math.floor(remainMs / 3_600_000);
          const m = Math.round((remainMs % 3_600_000) / 60_000);
          const left = h > 0 ? `${h}h ${m}m` : `${m} minutes`;
          const msg = `This is a ${jobView.hours}-hour session and about ${left} is still left. The client is paying for the full time — complete anyway?`;
          if (Platform.OS === 'web') {
            // RN-web Alert has no buttons — use the browser confirm.
            if (window.confirm(`Finish early? ${msg}`)) setShowNotesModal(true);
          } else {
            Alert.alert('Finish early?', msg, [
              { text: 'Keep Working', style: 'cancel' },
              { text: 'Complete Anyway', style: 'destructive', onPress: () => setShowNotesModal(true) },
            ]);
          }
          break;
        }
        setShowNotesModal(true);
        break;
      }
    }
  }

  const actionConfig = getActionConfig(
    jobView.status,
    allItemsCompleted,
    completedItems,
    checklist.length,
    jobView.totalPrice,
  );

  const primaryBtnDisabled = loading || (job.status === 'STARTED' && !allItemsCompleted);

  return (
    <View style={styles.root}>
      {/* ── Scrollable content ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, {
          // Extra padding for sticky footer height (~170px) + safe area
          paddingBottom: actionConfig ? 180 + insets.bottom : 32 + insets.bottom,
        }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
          {/* Back button */}
          <Pressable style={styles.backButton} onPress={() => nav.goBack()}>
            <ArrowBackIcon size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.backButtonText}>Jobs</Text>
          </Pressable>

          {/* Hero content */}
          <View style={styles.heroBody}>
            <View style={styles.heroLeft}>
              {/* Status badge */}
              <StatusBadge status={job.status} size="md" />
              {/* Service type */}
              <Text style={styles.heroService}>{job.serviceType}</Text>
              {/* Date + time */}
              <Text style={styles.heroDateTime}>
                {formatDate(job.scheduledAt)} · {formatTime(job.scheduledAt)}
              </Text>
            </View>
            <View style={styles.heroRight}>
              <ServiceIcon serviceType={job.serviceType} size={32} color="rgba(255,255,255,0.95)" bubble={false} />
              {/* Total earnings large */}
              <Text style={styles.heroEarnings}>{job.totalPrice != null ? formatCurrency(job.totalPrice) : '—'}</Text>
              <Text style={styles.heroRate}>{job.hours}h session</Text>
            </View>
          </View>
        </View>

        {/* ── Care checklist (STARTED only) ── */}
        {job.status === 'STARTED' && (
          <View style={styles.section}>
            <View style={styles.checklistCard}>
              <View style={styles.checklistHeader}>
                <Text style={styles.checklistTitle}>Care Checklist</Text>
                <View style={[
                  styles.checklistProgressBadge,
                  allItemsCompleted && styles.checklistProgressBadgeDone,
                ]}>
                  <Text style={[
                    styles.checklistProgressText,
                    allItemsCompleted && styles.checklistProgressTextDone,
                  ]}>
                    {completedItems}/{checklist.length}
                  </Text>
                </View>
              </View>
              <View style={styles.progressBar}>
                <View style={[
                  styles.progressFill,
                  {
                    width: `${(completedItems / checklist.length) * 100}%` as any,
                    backgroundColor: allItemsCompleted ? Colors.onlineGreen : Colors.systemBlue,
                  },
                ]} />
              </View>
              {checklist.map(item => (
                <Pressable
                  key={item.id}
                  style={[styles.checklistItem, item.completed && styles.checklistItemCompleted]}
                  onPress={() => toggleChecklistItem(item.id)}
                >
                  <View style={[styles.checkbox, item.completed && styles.checkboxDone]}>
                    {item.completed && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.checklistLabel, item.completed && styles.checklistLabelDone]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── Services ── */}
        {/* Additive: the hero still shows the `serviceType` summary string
            above. This section itemizes what was actually requested, with
            this artist's own per-line quote. Absent on older bookings that
            predate BookingService rows, or on a payload that didn't include
            the relation — the summary line above always covers that case. */}
        {job.services && job.services.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SERVICES</Text>
            <View style={styles.card}>
              {job.services.map(svc => (
                <View key={svc._id} style={styles.detailRow}>
                  <View style={styles.serviceLineLeft}>
                    <ServiceIcon serviceType={svc.name} size={16} color={Colors.brand} bubble={false} />
                    <Text style={styles.detailLabel}>{svc.name}</Text>
                  </View>
                  <Text style={styles.detailValue}>
                    ${svc.price} · {svc.durationMin}m
                  </Text>
                </View>
              ))}
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, styles.serviceTotalLabel]}>You earn</Text>
                <Text style={[styles.detailValue, styles.serviceTotalValue]}>
                  ${job.totalPrice ?? '—'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ── Schedule ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SCHEDULE</Text>
          <View style={styles.card}>
            {([
              ['Date', formatDate(job.scheduledAt)],
              ['Start Time', formatTime(job.scheduledAt)],
              ['Duration', `${job.hours} hours`],
              ['Address', job.address || 'Your area'],
            ] as [string, string][]).map(([label, value]) => (
              <View key={label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Location ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>LOCATION</Text>
            <Pressable style={styles.directionsPill} onPress={openDirections}>
              <Text style={styles.directionsPillText}>Directions</Text>
            </Pressable>
          </View>
          {Platform.OS !== 'web' && lat !== 0 ? (
            <View style={styles.mapCard}>
              {/* OSM/Leaflet (key-free) — react-native-maps needed a Google Maps
                  Android API key we don't ship, so the native map rendered blank
                  on Android. OSMMap matches the rest of the app and needs no key. */}
              <OSMMap
                style={styles.map}
                center={{ lat, lng }}
                zoom={15}
                markers={[{ lat, lng, kind: 'care', label: 'Job Location' }]}
              />
              <Pressable style={styles.mapOpenBtn} onPress={openMaps}>
                <Text style={styles.mapOpenBtnText}>Open in Maps</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.webMapCard} onPress={openDirections}>
              <MapIcon size={22} color={Colors.systemBlue} />
              <View style={{ flex: 1 }}>
                <Text style={styles.webMapTitle}>{job.address || 'Your area'}</Text>
                <Text style={styles.webMapSub}>Open in Google Maps</Text>
              </View>
              <Text style={styles.webMapArrow}>→</Text>
            </Pressable>
          )}
        </View>

        {/* ── Client notes ── */}
        {job.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>CLIENT NOTES</Text>
            <View style={[styles.card, styles.notesCard]}>
              <DocumentIcon size={18} color={Colors.secondaryLabel} />
              <Text style={styles.notesText}>{job.notes}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Client card ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CLIENT</Text>
          <View style={[styles.card, styles.customerCard]}>
            <Avatar
              name={job.customer?.name ?? '?'}
              photoUrl={(job.customer as any)?.photoUrl}
              size={48}
              bgColor={Colors.systemPurple}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{job.customer?.name}</Text>
              {(job.customer?.rating ?? 0) > 0 && (
                <View style={styles.customerRatingRow}>
                  <Text style={styles.customerRating}>★ {job.customer?.rating?.toFixed(1)}</Text>
                  <Text style={styles.customerRatingCount}>({(job.customer as any)?.ratingCount || 0})</Text>
                </View>
              )}
            </View>
            {isActive && (
              <View style={styles.customerActions}>
                {job.customer?.phone && (
                  <Pressable style={[styles.iconBtn, { borderColor: Colors.onlineGreen + '40' }]} onPress={callCustomer}>
                    <CallIcon size={16} color={Colors.onlineGreen} />
                  </Pressable>
                )}
                <Pressable
                  style={[styles.iconBtn, { borderColor: Colors.systemBlue + '40' }]}
                  onPress={() => nav.navigate('Chat', {
                    bookingId: job._id,
                    otherName: job.customer?.name ?? 'Client',
                    otherPhotoUrl: (job.customer as any)?.photoUrl,
                    otherRole: 'CUSTOMER',
                  })}
                >
                  <ChatIcon size={16} color={Colors.systemBlue} />
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* ── Accept details info (REQUESTED only) ── */}
        {job.status === 'REQUESTED' && (
          <View style={styles.section}>
            <View style={styles.acceptInfo}>
              <Text style={styles.acceptInfoTitle}>What happens next</Text>
              <Text style={styles.acceptInfoItem}>1. Client is notified of your acceptance</Text>
              <Text style={styles.acceptInfoItem}>2. Get directions to the client's location</Text>
              <Text style={styles.acceptInfoItem}>3. Tap "On My Way" when you depart</Text>
              <Text style={styles.acceptInfoItem}>4. Tap "I've Arrived" when you get there</Text>
            </View>
          </View>
        )}

        {/* ── Completed / Cancelled banners ── */}
        {job.status === 'COMPLETED' && (
          <View style={styles.section}>
            <View style={styles.doneBanner}>
              <View style={styles.doneIconWrap}>
                <Text style={styles.doneBannerIcon}>✓</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.doneBannerTitle}>Job Completed</Text>
                <Text style={styles.doneBannerSub}>You earned ${job.totalPrice ?? '—'}. Great work!</Text>
              </View>
            </View>
            {!providerRated && !showRateModal && (
              <Pressable
                style={styles.rateCustomerBtn}
                onPress={() => setShowRateModal(true)}
              >
                <Text style={styles.rateCustomerBtnText}>★ Rate Client</Text>
              </Pressable>
            )}
            {providerRated && (
              <View style={styles.ratedConfirm}>
                <Text style={styles.ratedConfirmText}>✓ You rated this client</Text>
              </View>
            )}
          </View>
        )}
        {job.status === 'CANCELLED' && (
          <View style={styles.section}>
            <View style={styles.cancelledBanner}>
              <View style={styles.cancelledIconWrap}>
                <Text style={styles.cancelledBannerIcon}>✕</Text>
              </View>
              <Text style={styles.cancelledBannerText}>This job was cancelled.</Text>
            </View>
          </View>
        )}

        {/* Job ID footer */}
        <View style={styles.footer}>
          <Text style={styles.jobId}>Job #{job._id.slice(-8).toUpperCase()}</Text>
        </View>
      </ScrollView>

      {/* ── Sticky action footer (pinned outside ScrollView) ── */}
      {actionConfig && (
        <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + 12 }]}>
          {/* Quick actions row */}
          {actionConfig.showQuickActions && (
            <View style={styles.quickRow}>
              {job.customer?.phone && (
                <Pressable style={styles.quickBtn} onPress={callCustomer}>
                  <CallIcon size={18} color={Colors.onlineGreen} />
                  <Text style={[styles.quickBtnText, { color: Colors.onlineGreen }]}>Call</Text>
                </Pressable>
              )}
              <Pressable
                style={styles.quickBtn}
                onPress={() => nav.navigate('Chat', {
                  bookingId: job._id,
                  otherName: job.customer?.name ?? 'Client',
                  otherPhotoUrl: (job.customer as any)?.photoUrl,
                  otherRole: 'CUSTOMER',
                })}
              >
                <ChatIcon size={18} color={Colors.systemBlue} />
                <Text style={[styles.quickBtnText, { color: Colors.systemBlue }]}>Message</Text>
              </Pressable>
              {job.status === 'ACCEPTED' || job.status === 'ON_MY_WAY' ? (
                <Pressable style={styles.quickBtn} onPress={openDirections}>
                  <NavigateIcon size={18} color={Colors.label} />
                  <Text style={styles.quickBtnText}>Navigate</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {/* Directions row (no call/chat needed — ON_MY_WAY) */}
          {actionConfig.showDirections && !actionConfig.showQuickActions && (
            <Pressable style={styles.directionsCard} onPress={openDirections}>
              <NavigateIcon size={20} color={Colors.systemBlue} />
              <View style={{ flex: 1 }}>
                <Text style={styles.directionsCardTitle}>Navigate to Client</Text>
                <Text style={styles.directionsCardSub}>Open turn-by-turn directions</Text>
              </View>
              <Text style={styles.directionsCardArrow}>→</Text>
            </Pressable>
          )}

          {/* Primary action button — single source of forward progress, one step per
              tap: REQUESTED→accept, ACCEPTED→on-my-way, ON_MY_WAY→arrived/start,
              STARTED→complete. No separate button can double-advance the status. */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: actionConfig.color },
              primaryBtnDisabled && styles.primaryBtnDisabled,
              pressed && !primaryBtnDisabled && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
            onPress={handlePrimaryAction}
            disabled={primaryBtnDisabled}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <View style={styles.primaryBtnInner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.primaryBtnLabel}>{actionConfig.label}</Text>
                  <Text style={styles.primaryBtnSub}>{actionConfig.subLabel}</Text>
                </View>
                <Text style={styles.primaryBtnArrow}>→</Text>
              </View>
            )}
          </Pressable>
        </View>
      )}

      <RatingModal
        visible={showRateModal}
        title="Rate Your Client"
        subtitle={`How was ${job.customer?.name ?? 'the client'}? Your feedback helps the community.`}
        onSubmit={async (rating, comment) => {
          await apiRateCustomer({ bookingId: job._id, rating, comment });
          setProviderRated(true);
          setShowRateModal(false);
        }}
        onDismiss={() => setShowRateModal(false)}
      />

      {/* ── Complete job notes modal ── */}
      <Modal visible={showNotesModal} transparent animationType="slide">
        {/* KeyboardAvoidingView: keeps the notes field visible above the keyboard. */}
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Complete Job</Text>
            <Text style={styles.modalSub}>Add care notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={serviceNotes}
              onChangeText={setCareNotes}
              placeholder="e.g. Assisted with bathing, medication taken, client in good spirits…"
              placeholderTextColor={Colors.tertiaryLabel}
              multiline
              numberOfLines={5}
              maxLength={2000}
            />
            <View style={styles.modalBtnRow}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: Colors.systemGray5 }]}
                onPress={() => setShowNotesModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: Colors.label }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: Colors.onlineGreen, flex: 2 }]}
                onPress={() => {
                  setShowNotesModal(false);
                  performAction('Complete Job', () => apiCompleteJob(job._id, serviceNotes || undefined));
                }}
              >
                <Text style={styles.modalBtnText}>Complete ✓</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F1F5F4' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  // ── Hero ──
  hero: {
    backgroundColor: Colors.brandDark,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginBottom: 20,
    paddingVertical: 4,
    paddingRight: 8,
  },
  backButtonText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
  heroLeft: { flex: 1, gap: 6 },
  heroService: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginTop: 2 },
  heroDateTime: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  heroRight: { alignItems: 'flex-end', gap: 2 },
  heroIcon: { fontSize: 36, marginBottom: 4 },
  heroEarnings: { fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: -1.5 },
  heroRate: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },

  // ── Sections ──
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.secondaryLabel,
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  // ── Cards ──
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  detailLabel: { fontSize: 14, color: Colors.secondaryLabel },
  detailValue: { fontSize: 14, fontWeight: '600', color: Colors.label, flex: 1, textAlign: 'right' },
  serviceLineLeft:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  serviceTotalLabel: { fontWeight: '700', color: Colors.label },
  serviceTotalValue: { fontWeight: '800', fontSize: 16, color: Colors.brand },
  notesCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  notesText: { flex: 1, fontSize: 14, color: Colors.label, lineHeight: 22 },

  // ── Customer ──
  customerCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  customerName: { fontSize: 16, fontWeight: '700', color: Colors.label, marginBottom: 2 },
  customerRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  customerRating: { fontSize: 13, fontWeight: '600', color: '#FF9500' },
  customerRatingCount: { fontSize: 12, color: Colors.secondaryLabel },
  customerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // ── Location ──
  directionsPill: {
    backgroundColor: Colors.systemBlue,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  directionsPillText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  mapCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.separator },
  map: { height: 180, width: '100%' },
  mapOpenBtn: { padding: 12, alignItems: 'center', backgroundColor: '#F7F7F8', borderTopWidth: 1, borderTopColor: Colors.separator },
  mapOpenBtnText: { fontSize: 14, fontWeight: '700', color: Colors.systemBlue },
  webMapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  webMapTitle: { fontSize: 14, fontWeight: '700', color: Colors.label },
  webMapSub: { fontSize: 12, color: Colors.systemBlue, marginTop: 2 },
  webMapArrow: { fontSize: 18, color: Colors.systemGray3 },

  // ── Checklist ──
  checklistCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  checklistHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  checklistTitle: { fontSize: 15, fontWeight: '800', color: Colors.label },
  checklistProgressBadge: { backgroundColor: Colors.systemBlue + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  checklistProgressBadgeDone: { backgroundColor: Colors.onlineGreen + '15' },
  checklistProgressText: { fontSize: 13, fontWeight: '700', color: Colors.systemBlue },
  checklistProgressTextDone: { color: Colors.onlineGreen },
  progressBar: { height: 5, backgroundColor: Colors.systemGray5, borderRadius: 3, marginBottom: 14, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  checklistItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F5F5F7' },
  checklistItemCompleted: { opacity: 0.55 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.systemGray4, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkboxDone: { backgroundColor: Colors.onlineGreen, borderColor: Colors.onlineGreen },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '800' },
  checklistLabel: { flex: 1, fontSize: 14, color: Colors.label },
  checklistLabelDone: { textDecorationLine: 'line-through', color: Colors.secondaryLabel },

  // ── Accept info ──
  acceptInfo: {
    backgroundColor: Colors.systemGray6,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  acceptInfoTitle: { fontSize: 13, fontWeight: '700', color: Colors.label, marginBottom: 8 },
  acceptInfoItem: { fontSize: 12, color: Colors.secondaryLabel, marginBottom: 4, lineHeight: 18 },

  // ── Done / Cancelled banners ──
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#F0FFF4',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  doneIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.onlineGreen + '20', alignItems: 'center', justifyContent: 'center' },
  doneBannerIcon: { fontSize: 18, fontWeight: '900', color: Colors.onlineGreen },
  doneBannerTitle: { fontSize: 16, fontWeight: '800', color: Colors.onlineGreen, marginBottom: 2 },
  doneBannerSub: { fontSize: 13, color: Colors.secondaryLabel },
  cancelledBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF0F0', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#FFD1D1' },
  cancelledIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.systemRed + '15', alignItems: 'center', justifyContent: 'center' },
  cancelledBannerIcon: { fontSize: 16, fontWeight: '900', color: Colors.systemRed },
  cancelledBannerText: { fontSize: 15, fontWeight: '600', color: Colors.systemRed, flex: 1 },

  // ── Footer ──
  footer: { paddingHorizontal: 20, paddingTop: 16 },
  jobId: { fontSize: 12, color: Colors.tertiaryLabel, textAlign: 'center' },

  // ── Sticky footer ──
  stickyFooter: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: Colors.systemGray6,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  quickBtnText: { fontSize: 13, fontWeight: '700', color: Colors.label },
  directionsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.systemBlue + '0E',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.systemBlue + '20',
  },
  directionsCardTitle: { fontSize: 14, fontWeight: '700', color: Colors.systemBlue },
  directionsCardSub: { fontSize: 12, color: Colors.secondaryLabel },
  directionsCardArrow: { fontSize: 18, color: Colors.systemBlue },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: Colors.systemBlue + '10',
    borderWidth: 1,
    borderColor: Colors.systemBlue + '25',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: Colors.systemBlue },
  primaryBtn: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnInner: { flexDirection: 'row', alignItems: 'center' },
  primaryBtnLabel: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3, marginBottom: 2 },
  primaryBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  primaryBtnArrow: { fontSize: 24, color: '#fff', fontWeight: '900' },

  // ── Rate customer ──
  rateCustomerBtn: {
    marginHorizontal: 16, marginTop: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Colors.brand,
    alignItems: 'center',
  },
  rateCustomerBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  ratedConfirm: { marginHorizontal: 16, marginTop: 8, alignItems: 'center' },
  ratedConfirmText: { fontSize: 13, color: Colors.trustGreen },

  // ── Modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.label, marginBottom: 6 },
  modalSub: { fontSize: 13, color: Colors.secondaryLabel, marginBottom: 16 },
  notesInput: {
    backgroundColor: Colors.systemGray6,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    color: Colors.label,
    minHeight: 110,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
