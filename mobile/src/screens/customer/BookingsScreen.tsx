import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { apiMyBookings, Booking } from '../../api/client';
import { BookingCard } from '../../components/BookingCard';
import { BookingCardSkeleton } from '../../components/SkeletonLoader';
import { Colors } from '../../utils/colors';
import { StatusBadge } from '../../components/StatusBadge';
import { NoteIcon, KeyIcon, PhoneMobileIcon } from '../../components/CareIcons';
import { CheckCircleIcon, HourglassIcon, CashIcon } from '../../components/TabIcons';
import { formatCurrency } from '../../utils/format';

type IconComp = (p: { size?: number; color?: string }) => React.ReactElement;

type Filter = 'ACTIVE' | 'UPCOMING' | 'PAST';

const FILTER_KEYS: Filter[] = ['ACTIVE', 'UPCOMING', 'PAST'];

const LIVE_STATUSES     = new Set(['ACCEPTED', 'ON_MY_WAY', 'STARTED']);
const ACTIVE_STATUSES   = new Set(['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED']);

// Top-level filter:
//   ACTIVE   = happening now (Provider en route / in progress) + awaiting-Provider
//   UPCOMING = confirmed sessions scheduled for the future (ACCEPTED, not yet started)
//   PAST     = done / cancelled
function matchesFilter(b: Booking, filter: Filter): boolean {
  if (filter === 'PAST') return b.status === 'COMPLETED' || b.status === 'CANCELLED';
  if (filter === 'ACTIVE') {
    // En-route/in-progress, or any REQUESTED still waiting on a Provider.
    return b.status === 'ON_MY_WAY' || b.status === 'STARTED' || b.status === 'REQUESTED';
  }
  // UPCOMING — accepted-but-not-yet-started sessions (the future schedule).
  return b.status === 'ACCEPTED';
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Industry-standard sectioning (mirrors the Provider My Jobs screen):
// In Progress → Awaiting Provider → Today → Tomorrow → This Week → Later → Completed → Cancelled.
type SectionKey = 'inProgress' | 'awaiting' | 'today' | 'tomorrow' | 'thisWeek' | 'later' | 'completed' | 'cancelled';
interface Section { title: SectionKey; tag: string; data: Booking[] }

function buildSections(bookings: Booking[], filter: Filter): Section[] {
  const now = new Date();
  const tom = new Date(); tom.setDate(now.getDate() + 1);

  const live: Booking[]      = [];
  const awaiting: Booking[]  = [];
  const today: Booking[]     = [];
  const tomorrow: Booking[]  = [];
  const thisWeek: Booking[]  = [];
  const later: Booking[]     = [];
  const completed: Booking[] = [];
  const cancelled: Booking[] = [];

  for (const b of bookings) {
    if (!matchesFilter(b, filter)) continue;
    const d = new Date(b.scheduledAt);
    // Truly live = en route / in progress. ACCEPTED is "confirmed upcoming" → route by date.
    if (b.status === 'ON_MY_WAY' || b.status === 'STARTED') { live.push(b); continue; }
    if (b.status === 'COMPLETED')     { completed.push(b); continue; }
    if (b.status === 'CANCELLED')     { cancelled.push(b); continue; }
    if (b.status === 'REQUESTED')     { awaiting.push(b); continue; }
    // ACCEPTED — bucket by scheduled date.
    if (isSameDay(d, now))            { today.push(b); continue; }
    if (isSameDay(d, tom))            { tomorrow.push(b); continue; }
    if ((d.getTime() - now.getTime()) < 7 * 864e5) { thisWeek.push(b); continue; }
    later.push(b);
  }

  const out: Section[] = [];
  const push = (title: SectionKey, tag: string, data: Booking[]) => { if (data.length) out.push({ title, tag, data }); };
  push('inProgress', 'live', live);
  push('awaiting', `${awaiting.length}`, awaiting);
  push('today', 'today', today);
  push('tomorrow', 'soon', tomorrow);
  push('thisWeek', 'week', thisWeek);
  push('later', 'scheduled', later);
  push('completed', `${completed.length}`, completed);
  push('cancelled', `${cancelled.length}`, cancelled);
  return out;
}

// Short payment-status label for a booking card.
type PayTone = 'escrow' | 'released' | 'pending';
type PayKey = 'payPaid' | 'payEscrow' | 'payAwaiting';
function paymentLabel(b: Booking): { key: PayKey; tone: PayTone } | null {
  const ps = (b as any).paymentStatus as string | undefined;
  if (ps === 'RELEASED' || ps === 'PAID') return { key: 'payPaid', tone: 'released' };
  if (b.status === 'ACCEPTED' || b.status === 'ON_MY_WAY' || b.status === 'STARTED') return { key: 'payEscrow', tone: 'escrow' };
  if (b.status === 'REQUESTED') return { key: 'payAwaiting', tone: 'pending' };
  return null;
}

const SECTION_TITLES: Record<SectionKey, string> = {
  inProgress: 'In Progress',
  awaiting:   'Awaiting Artist',
  today:      'Today',
  tomorrow:   'Tomorrow',
  thisWeek:   'This Week',
  later:      'Later',
  completed:  'Completed',
  cancelled:  'Cancelled',
};

const PAY_LABELS: Record<PayKey, string> = {
  payPaid:     'Paid',
  payEscrow:   'Pay after visit',
  payAwaiting: 'Awaiting Artist',
};

export function BookingsScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [bookings,          setBookings]          = useState<Booking[]>([]);
  const [filter,            setFilter]            = useState<Filter>('ACTIVE');
  const [loading,           setLoading]           = useState(true);
  const [refreshing,        setRefreshing]        = useState(false);
  const [installPrompt,     setInstallPrompt]     = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIOSHint,       setShowIOSHint]       = useState(false);

  // Android/Chrome: capture beforeinstallprompt to show custom install button
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); setShowInstallBanner(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // iOS: show share hint once
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;
    const ua = navigator.userAgent;
    const isIOS = (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !(window as any).MSStream;
    if (isIOS) setShowIOSHint(true);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setShowInstallBanner(false);
  }

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { bookings: data } = await apiMyBookings(true);
      setBookings(prev => {
        const sorted = data.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
        // Notify user when a booking flips from REQUESTED → ACCEPTED
        sorted.forEach(b => {
          const old = prev.find(p => p._id === b._id);
          if (old?.status === 'REQUESTED' && b.status === 'ACCEPTED') {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        });
        return sorted;
      });
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(useCallback(() => {
    load();
    // Poll every 8s while screen is focused and there are active bookings
    pollRef.current = setInterval(() => {
      setBookings(prev => {
        const hasActive = prev.some(b => ACTIVE_STATUSES.has(b.status));
        if (hasActive) load();
        return prev;
      });
    }, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]));

  const sections = loading ? [] : buildSections(bookings, filter);

  const liveCount         = bookings.filter(b => b.status === 'ON_MY_WAY' || b.status === 'STARTED').length;
  const awaitingCount     = bookings.filter(b => b.status === 'REQUESTED').length;
  const upcomingCount     = bookings.filter(b => b.status === 'ACCEPTED').length;
  const completedBookings = bookings.filter(b => b.status === 'COMPLETED');
  // "Hours" isn't a metric customers think about for a beauty appointment —
  // what they spent on completed visits is a more meaningful third stat here.
  const totalSpent        = completedBookings.reduce((s, b) => s + (b.totalPrice ?? 0), 0);

  const statsHeader = !loading && bookings.length > 0 ? (
    <View style={styles.statsCard}>
      {([
        [NoteIcon, String(bookings.length),              'Bookings'],
        [CheckCircleIcon, String(completedBookings.length), 'Completed'],
        [CashIcon, formatCurrency(totalSpent),                'Spent'],
      ] as [IconComp, string, string][]).map(([Icon, val, label]) => (
        <View key={label} style={styles.statCell}>
          <View style={styles.statCellIcon}><Icon size={18} color={Colors.brand} /></View>
          <Text style={styles.statCellVal}>{val}</Text>
          <Text style={styles.statCellLabel}>{label}</Text>
        </View>
      ))}
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#9C5560', '#B76E79', '#CA8490']}
        locations={[0, 0.5, 1]}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        {/* Bookings is a stack route now (not a tab) — needs its own back. */}
        {nav.canGoBack() && (
          <Pressable
            onPress={() => nav.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10, alignSelf: 'flex-start' }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '600' }}>‹ Back</Text>
          </Pressable>
        )}
        <Text style={styles.headerTitle}>My Bookings</Text>
        <Text style={styles.headerSub}>
          {liveCount > 0 ? `${liveCount} in progress` : awaitingCount > 0 ? `${awaitingCount} awaiting Artist` : 'No active sessions'}
        </Text>

        <View style={styles.filterRow}>
          {FILTER_KEYS.map(key => {
            const active = filter === key;
            const label = key === 'ACTIVE' ? 'Active' : key === 'UPCOMING' ? 'Upcoming' : 'Past';
            const count = key === 'ACTIVE' ? liveCount + awaitingCount
                        : key === 'UPCOMING' ? upcomingCount
                        : null;
            return (
              <Pressable
                key={key}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => setFilter(key)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
                {count != null && count > 0 && (
                  <View style={[styles.filterBadge, active && styles.filterBadgeActive]}>
                    <Text style={[styles.filterBadgeText, active && styles.filterBadgeTextActive]}>{count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>

      {/* Active booking banner — shown when there's a live booking */}
      {!loading && bookings.some(b => ACTIVE_STATUSES.has(b.status)) && (() => {
        const active = bookings.find(b => ACTIVE_STATUSES.has(b.status))!;
        return (
          <Pressable
            style={styles.activeBanner}
            onPress={() => nav.navigate('Tracking', {
              bookingId: active._id,
              bookingLocation: active.lat ? { lat: active.lat, lng: active.lng } : undefined,
            })}
          >
            <View style={styles.activeDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeBannerTitle}>Active Booking</Text>
              <Text style={styles.activeBannerSub}>{active.serviceType}</Text>
            </View>
            <StatusBadge status={active.status} />
            <Text style={styles.activeBannerChevron}>›</Text>
          </Pressable>
        );
      })()}

      {/* Android PWA install banner */}
      {showInstallBanner && (
        <View style={styles.installBanner}>
          <View style={{ marginRight: 8 }}><PhoneMobileIcon size={18} color="#fff" /></View>
          <Text style={styles.installBannerText}>Add Glow to your home screen</Text>
          <Pressable onPress={handleInstall} style={styles.installBannerBtn}>
            <Text style={styles.installBannerBtnText}>Install</Text>
          </Pressable>
          <Pressable onPress={() => setShowInstallBanner(false)} style={styles.installBannerDismiss} hitSlop={10}>
            <Text style={styles.installBannerDismissText}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* iOS install hint */}
      {showIOSHint && !showInstallBanner && (
        <View style={styles.iosHint}>
          <Text style={styles.iosHintText}>Tap Share ⎙ → "Add to Home Screen" to install the app</Text>
          <Pressable onPress={() => setShowIOSHint(false)} style={styles.installBannerDismiss} hitSlop={10}>
            <Text style={styles.installBannerDismissText}>✕</Text>
          </Pressable>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(i) => i._id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.brand} />
        }
        ListHeaderComponent={
          loading ? (
            <View style={{ marginTop: 16 }}>
              <BookingCardSkeleton /><BookingCardSkeleton /><BookingCardSkeleton />
            </View>
          ) : statsHeader
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{SECTION_TITLES[(section as Section).title]}</Text>
            <View style={styles.sectionTagPill}>
              <Text style={styles.sectionTagText}>{(section as any).tag}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <NoteIcon size={40} color={Colors.tertiaryLabel} />
            </View>
            <Text style={styles.emptyTitle}>
              {filter === 'ACTIVE' ? 'No active sessions'  :
               filter === 'UPCOMING' ? 'No upcoming sessions' :
               'No past bookings'}
            </Text>
            <Text style={styles.emptySub}>
              {filter === 'ACTIVE' ? 'Live and pending sessions show up here.' :
               filter === 'UPCOMING' ? "Accepted sessions show up here once your Artist confirms." :
               'Completed and cancelled sessions appear here.'}
            </Text>
            {filter !== 'PAST' && (
              <Pressable
                style={({ pressed }) => [styles.bookNowBtn, pressed && { opacity: 0.85 }]}
                onPress={() => nav.navigate('NewBooking')}
              >
                <Text style={styles.bookNowBtnText}>Book an Artist →</Text>
              </Pressable>
            )}
          </View>
        ) : null}
        renderItem={({ item }: { item: any }) => {
          const pay = paymentLabel(item);
          return (
          <View>
            <BookingCard
              booking={item}
              onPress={() => nav.navigate('BookingDetail', { booking: item })}
            />
            {pay && (
              <View style={[styles.payTag, { flexDirection: 'row', alignItems: 'center', gap: 4 }, pay.tone === 'released' ? styles.payReleased : pay.tone === 'escrow' ? styles.payEscrow : styles.payPending]}>
                {pay.tone === 'escrow'
                  ? <KeyIcon size={12} color={Colors.systemOrange ?? '#B45309'} />
                  : pay.tone === 'released'
                    ? <Text style={[styles.payTagText, styles.payTextReleased]}>✓</Text>
                    : <HourglassIcon size={12} color={Colors.secondaryLabel} />}
                <Text style={[styles.payTagText, pay.tone === 'released' ? styles.payTextReleased : pay.tone === 'escrow' ? styles.payTextEscrow : styles.payTextPending]}>
                  {PAY_LABELS[pay.key]}
                </Text>
              </View>
            )}
            {item.status === 'COMPLETED' && (
              <Pressable
                style={({ pressed }) => [styles.reBookBtn, pressed && { opacity: 0.82 }]}
                onPress={() => nav.navigate('NewBooking')}
              >
                <Text style={styles.reBookBtnText}>Book Again</Text>
              </Pressable>
            )}
          </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemGroupedBackground },

  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 4 },
  headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 14, marginBottom: 16 },

  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  filterPillActive: { backgroundColor: '#fff', borderColor: '#fff' },
  filterText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  filterTextActive: { color: Colors.brandDark, fontWeight: '700' },
  filterBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.3)',
  },
  filterBadgeActive: { backgroundColor: Colors.brand },
  filterBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  filterBadgeTextActive: { color: '#fff' },

  // Section header — pill style (matches Provider My Jobs)
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 22, marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: Colors.secondaryLabel, letterSpacing: 1.1, textTransform: 'uppercase' },
  sectionTagPill: { backgroundColor: Colors.systemBackground, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: Colors.separator },
  sectionTagText: { fontSize: 11, fontWeight: '600', color: Colors.tertiaryLabel },

  activeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.separator,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  activeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#34C759' },
  activeBannerTitle: { fontSize: 14, fontWeight: '700', color: Colors.label },
  activeBannerSub: { fontSize: 12, color: Colors.secondaryLabel, marginTop: 1 },
  activeBannerChevron: { fontSize: 22, color: Colors.tertiaryLabel },

  // Install banners
  installBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0D2042', paddingHorizontal: 16, paddingVertical: 12,
  },
  installBannerText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  installBannerBtn: {
    backgroundColor: Colors.brand, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  installBannerBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  installBannerDismiss: { padding: 4 },
  installBannerDismissText: { color: 'rgba(255,255,255,0.5)', fontSize: 16 },
  iosHint: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.brandLight, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.separator,
  },
  iosHintText: { flex: 1, color: Colors.brandDark, fontSize: 13, fontWeight: '500' },

  statsCard: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 16, marginBottom: 4,
    backgroundColor: Colors.systemBackground, borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 2 },
  statCellIcon: { marginBottom: 2 },
  statCellVal: { fontSize: 16, fontWeight: '800', color: Colors.label },
  statCellLabel: { fontSize: 10, color: Colors.secondaryLabel, fontWeight: '600' },

  list: { paddingTop: 8, paddingBottom: 130 },

  reBookBtn: {
    marginHorizontal: 16, marginTop: -6, marginBottom: 12,
    backgroundColor: Colors.brandLight, borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.separator,
    borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0,
  },
  reBookBtnText: { fontSize: 13, fontWeight: '700', color: Colors.brandDark },
  payTag: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: -2, marginBottom: 10, marginLeft: 16 },
  payEscrow:   { backgroundColor: '#FEF3C7' },
  payReleased: { backgroundColor: Colors.brandLight },
  payPending:  { backgroundColor: Colors.systemGray5 },
  payTagText:  { fontSize: 11, fontWeight: '700' },
  payTextEscrow:   { color: Colors.urgentOrange },
  payTextReleased: { color: Colors.trustGreen },
  payTextPending:  { color: Colors.secondaryLabel },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.systemGray6, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.label, marginBottom: 8 },
  emptySub: { fontSize: 14, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  bookNowBtn: {
    backgroundColor: Colors.brand, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 28,
  },
  bookNowBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
