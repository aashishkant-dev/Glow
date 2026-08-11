import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  Alert,
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
import { LocationIcon, HourglassIcon, DocumentIcon, BriefcaseIcon, CloseCircleIcon, CheckCircleIcon } from '../../components/TabIcons';
import {
  BellIcon,
  ChevronForwardIcon,
  ShieldCheckIcon,
} from '../../components/CareIcons';
import {
  ShoppingBagIcon,
  WalletIcon,
  UserProfileFilledIcon,
  SupportIcon,
} from '../../components/IllustratedIcons';
import { ServiceIcon } from '../../components/ServiceIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { tapImpact } from '../../utils/haptics';
import { apiGetProfile, apiMyJobs, apiToggleAvailability, apiGetMyDocuments, apiGetRequests, Booking, UserProfile } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../context/LocationContext';
import { useChatUnread } from '../../context/ChatUnreadContext';
import { Colors, Fonts } from '../../utils/colors';
import { Radius, Shadow, Spacing, Typography } from '../../utils/theme';
import { getSocket } from '../../utils/socket';
import { GlowLogo } from '../../components/GlowLogo';
import { JobCard } from '../../components/JobCard';
import { LocationPrompt } from '../../components/LocationPrompt';
import { formatCurrency } from '../../utils/format';

function monthAbbrev(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}
function dayNumber(iso: string) {
  return new Date(iso).getDate();
}
function relativeDayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diffDays = Math.round((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Matches the customer-side "Upcoming Appointment" card exactly (same dark
// card + rose date badge treatment) so both sides of the app read as one
// product — see HomeScreen.tsx's equivalent card.
function ActiveJobBanner({ job, onPress }: { job: Booking; onPress: () => void }) {
  const statusLabel =
    job.status === 'ACCEPTED' ? 'Accepted · head to client' :
    job.status === 'ON_MY_WAY' ? 'On your way' :
    job.status === 'STARTED' ? 'In progress' : job.status;
  return (
    <Pressable style={activeJobBannerStyles.banner} onPress={onPress}>
      <View style={activeJobBannerStyles.dateBadge}>
        <Text style={activeJobBannerStyles.dateMonth}>{monthAbbrev(job.scheduledAt)}</Text>
        <Text style={activeJobBannerStyles.dateDay}>{dayNumber(job.scheduledAt)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={activeJobBannerStyles.title} numberOfLines={1}>{job.serviceType}</Text>
        <Text style={activeJobBannerStyles.sub} numberOfLines={1}>
          {relativeDayLabel(job.scheduledAt)} · {formatTime(job.scheduledAt)} · {statusLabel}
          {job.customer?.name ? ` · ${job.customer.name}` : ''}
        </Text>
      </View>
      <View style={activeJobBannerStyles.viewBtn}>
        <Text style={activeJobBannerStyles.viewBtnText}>View</Text>
      </View>
    </Pressable>
  );
}

const activeJobBannerStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#2C1A20',
    padding: 16,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 20,
  },
  dateBadge: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center',
  },
  dateMonth: { fontSize: 10, fontFamily: Fonts.semibold, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5 },
  dateDay:   { fontSize: 17, fontFamily: Fonts.bold, color: '#fff', marginTop: 1 },
  title: { fontSize: 14.5, fontFamily: Fonts.semibold, color: '#fff' },
  sub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3, fontFamily: Fonts.regular },
  viewBtn: { backgroundColor: Colors.brand, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8 },
  viewBtnText: { fontSize: 12.5, fontFamily: Fonts.semibold, color: '#fff' },
});

// Required docs — kept in sync with ProviderOnboardingScreen STEP4_DOCS (required: true).
// First Aid/CPR and a Driver's Licence were CareNearby-era home-care-aide
// requirements that never applied to a beauty marketplace — dropped from the
// required set (still optional to note certs in the bio if relevant).
const REQUIRED_DOCS = ['id_proof', 'provider_certificate'] as const;
const DOC_LABELS: Record<string, string> = {
  police_check: 'Police Check',
  provider_certificate: 'Beauty Certificate / Diploma',
  id_proof: 'Government ID',
};

export function ProviderDashboardScreen() {
  const { user, photoUri, token } = useAuth();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { requestLocation, permissionStatus } = useLocation();
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  // Auto-dismiss once granted (e.g. user enabled in iOS Settings and returned).
  useEffect(() => {
    if (permissionStatus === 'granted' && showLocationPrompt) setShowLocationPrompt(false);
  }, [permissionStatus, showLocationPrompt]);
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  // Once the user manually flips the switch, stop letting background polls
  // overwrite it from the server — the 15s silent refresh was reading a stale
  // `availability` and snapping the toggle back to OFF right after the Provider
  // tapped Online. We only adopt the server value until the first manual toggle.
  const userToggledOnlineRef = useRef(false);
  const [serverDocs, setServerDocs] = useState<Record<string, string>>({});
  const [pendingRequests, setPendingRequests] = useState<Booking[]>([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  // Today/Week/Month tabs double as the earnings-card period selector — the
  // graph below reshapes to match (hourly bars / daily bars / weekly bars).
  const [graphPeriod, setGraphPeriod] = useState<'today' | 'week' | 'month'>('week');

  const activeJob = jobs.find(j => ['ACCEPTED', 'ON_MY_WAY', 'STARTED'].includes(j.status));
  // Bell badge = unread NOTIFICATIONS (matches the Notifications screen the bell
  // opens), not one booking's chat count.
  const { notifications } = useChatUnread();
  const unreadCount = notifications.filter(n => !n.read).length;
  // Keyed off updatedAt (when the job actually flipped to COMPLETED), not
  // scheduledAt — a job scheduled 10+ days ago but completed today was being
  // excluded from "today"/"this week", while a job scheduled for this week
  // but completed later was counted before it was actually earned.
  const todayEarnings = jobs
    .filter(j => j.status === 'COMPLETED' && new Date(j.updatedAt ?? j.scheduledAt).toDateString() === new Date().toDateString())
    .reduce((sum, j) => sum + j.totalPrice, 0);
  const weekEarnings = jobs
    .filter(j => {
      if (j.status !== 'COMPLETED') return false;
      const d = new Date(j.updatedAt ?? j.scheduledAt);
      const now = new Date();
      const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 7 && diff >= 0;
    })
    .reduce((sum, j) => sum + j.totalPrice, 0);
  const monthEarnings = jobs
    .filter(j => {
      if (j.status !== 'COMPLETED') return false;
      const d = new Date(j.updatedAt ?? j.scheduledAt);
      const now = new Date();
      const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 28 && diff >= 0;
    })
    .reduce((sum, j) => sum + j.totalPrice, 0);

  // `silent` = background poll: never toggles the loading skeleton and only commits
  // state that actually changed. Without this, the 15s interval flashed the skeleton +
  // replaced every slice with a new ref each tick → the whole dashboard flickered.
  const load = useCallback(async (showRefresh = false, silent = false) => {
    if (!token) return;
    if (showRefresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    try {
      const [{ bookings }, profileRes, docsRes, reqRes] = await Promise.all([
        apiMyJobs(),
        apiGetProfile().catch(() => ({ user: null })),
        apiGetMyDocuments().catch(() => ({ documents: [] })),
        apiGetRequests().catch(() => ({ requests: [] as Booking[] })),
      ]);
      const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
      setJobs(prev => same(prev, bookings) ? prev : bookings);
      setPendingRequests(prev => same(prev, reqRes.requests || []) ? prev : (reqRes.requests || []));
      if (profileRes.user) {
        setProfile(prev => same(prev, profileRes.user) ? prev : (profileRes.user as UserProfile));
        const avail = profileRes.user.providerProfile?.availability;
        // Don't clobber a manual toggle with a stale poll — only adopt the
        // server value before the user has ever flipped the switch this session.
        if (typeof avail === 'boolean' && !userToggledOnlineRef.current) {
          setIsOnline(avail);
        }
      }
      const docMap: Record<string, string> = {};
      docsRes.documents.forEach((d: any) => { docMap[d.docType] = d.status; });
      setServerDocs(prev => same(prev, docMap) ? prev : docMap);
    } catch {}
    if (!silent) setLoading(false);
    setRefreshing(false);
  }, [token]);

  useFocusEffect(useCallback(() => { if (token) load(); }, [load, token]));

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => load(false, true), 15_000); // silent background refresh
    return () => clearInterval(timer);
  }, [load, token]);

  // Refresh the moment admin approval lands (socket), so the Provider doesn't wait up
  // to 15s — and the "pending approval" gate clears + Go Online unlocks instantly.
  useEffect(() => {
    if (!token) return;
    let s: ReturnType<typeof getSocket> | null = null;
    try { s = getSocket(); } catch { return; }
    const onApproved = () => load(false, true);
    s.on('provider-approved', onApproved);
    return () => { s?.off('provider-approved', onApproved); };
  }, [load, token]);

  useEffect(() => {
    if (isOnline) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ]),
      );
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ]),
      );
      pulse.start(); glow.start();
      return () => { pulse.stop(); glow.stop(); };
    }
  }, [isOnline]);

  // Online state reflects the server (profile.providerProfile.availability), set in load().
  // The toggle below is a real two-way switch — we do NOT force-online on mount,
  // which previously made tapping "Go Offline" snap right back to online.


  // Provider location broadcast now lives in useProviderLocationBroadcast (mounted in
  // RootNavigator) so GPS keeps flowing from any screen, not just this one.

  async function toggleOnline() {
    if (toggling) return;
    // Must be approved to go online.
    if (!isOnline && !isApproved) {
      Alert.alert('Pending approval', 'Your account is still under review. You can go online once an admin approves you.');
      return;
    }
    const next = !isOnline;
    setToggling(true);
    tapImpact();
    // Mark that the user owns the toggle now → background polls stop overwriting it.
    userToggledOnlineRef.current = true;
    // Optimistic flip so the switch responds instantly; revert on failure.
    setIsOnline(next);
    try {
      await apiToggleAvailability(next);
      // Going online → make sure we have location permission so clients can find/track.
      if (next && permissionStatus !== 'granted') {
        requestLocation().catch(() => {});
      }
    } catch (e: any) {
      setIsOnline(!next); // revert
      Alert.alert('Could not update status', e?.message || 'Please try again.');
    }
    setToggling(false);
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const isApproved = (profile as any)?.providerProfile?.approvedByAdmin ?? false;

  const approvedDocCount = REQUIRED_DOCS.filter(d => serverDocs[d] === 'APPROVED').length;
  const hasDocIssues = !isApproved || REQUIRED_DOCS.some(d => !serverDocs[d] || serverDocs[d] === 'REJECTED');

  const recentCompleted = jobs.filter(j => j.status === 'COMPLETED').slice(0, 3);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,';

  function docStatusIconEl(docType: string): { el: React.ReactElement; color: string } {
    const s = serverDocs[docType];
    if (s === 'APPROVED') return { el: <CheckCircleIcon size={18} color={Colors.trustGreen} />, color: Colors.trustGreen };
    if (s === 'PENDING')  return { el: <HourglassIcon size={18} color={Colors.urgentOrange} />, color: Colors.urgentOrange };
    if (s === 'REJECTED') return { el: <CloseCircleIcon size={18} color={Colors.systemRed} />, color: Colors.systemRed };
    return { el: <DocumentIcon size={18} color={Colors.tertiaryLabel} />, color: Colors.tertiaryLabel };
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.systemGroupedBackground }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.brand} progressBackgroundColor={Colors.cardBackground} />
        }
      >
        {/* ── Light header — Stripe × Apple ── */}
        <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
          {/* Header row */}
          <View style={styles.heroHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroGreeting}>{greeting}</Text>
              <Text style={styles.heroName} numberOfLines={1}>{firstName}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable style={styles.heroBtn} onPress={() => nav.navigate('Notifications')}>
                <BellIcon size={18} color={Colors.label} />
                {unreadCount > 0 && (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={styles.heroAvatar} onPress={() => nav.navigate('Profile')}>
                {photoUri
                  ? <Image source={{ uri: photoUri }} style={styles.heroAvatarImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                  : <Text style={styles.heroAvatarText}>{user?.name?.[0]?.toUpperCase() ?? '?'}</Text>
                }
                {isOnline && <View style={styles.avatarOnlineDot} />}
              </Pressable>
            </View>
          </View>

          {/* Availability card */}
          <View style={styles.heroToggleRow}>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={[styles.statusDot, { backgroundColor: isOnline ? Colors.systemGreen : Colors.systemGray3 }]} />
                <Text style={styles.heroToggleTitle}>
                  {isOnline ? "You're online" : "You're offline"}
                </Text>
              </View>
              <Text style={styles.heroToggleSub}>
                {isOnline ? "You're online · Accepting jobs" : 'Go online to start accepting jobs'}
              </Text>
            </View>
            <Pressable
              onPress={toggleOnline}
              disabled={toggling}
              style={[styles.toggleSwitch, { backgroundColor: isOnline ? Colors.systemGreen : Colors.systemGray4 }]}
            >
              <View style={[styles.toggleKnob, { transform: [{ translateX: isOnline ? 20 : 0 }] }]} />
            </Pressable>
          </View>

          {/* Today/This Week/Month — doubles as the earnings-graph period
              selector below (tap to reshape the bars: hourly/daily/weekly). */}
          <View style={styles.periodTabRow}>
            {([
              ['today', 'Today',     todayEarnings],
              ['week',  'This Week', weekEarnings],
              ['month', 'Month',     monthEarnings],
            ] as const).map(([key, label, amount]) => {
              const active = graphPeriod === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.periodTab, active && styles.periodTabActive]}
                  onPress={() => setGraphPeriod(key)}
                >
                  <Text style={[styles.periodTabValue, active && styles.periodTabValueActive]} numberOfLines={1}>
                    {formatCurrency(amount, { decimals: 0 })}
                  </Text>
                  <Text style={[styles.periodTabLabel, active && styles.periodTabLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Earnings card — bars reshape with the Today/Week/Month tab above:
             Today → hourly, Week → daily (last 7 days), Month → weekly (last 4). ── */}
        <View style={styles.earnCard}>
          <View style={styles.earnCardTop}>
            <Text style={styles.earnCardLabel}>
              {graphPeriod === 'today' ? 'Today · by hour' : graphPeriod === 'week' ? 'This Week · by day' : 'This Month · by week'}
            </Text>
            <Text style={styles.earnCardValue}>
              {formatCurrency(graphPeriod === 'today' ? todayEarnings : graphPeriod === 'week' ? weekEarnings : monthEarnings, { decimals: 0 })}
            </Text>
          </View>
          <View style={styles.earnBars}>
            {(() => {
              const now = new Date();
              const completedAt = (j: Booking) => new Date(j.updatedAt ?? j.scheduledAt);

              let bars: { value: number; label: string; highlight: boolean }[];

              if (graphPeriod === 'today') {
                const sums = Array.from({ length: 24 }, () => 0);
                jobs.forEach(j => {
                  if (j.status !== 'COMPLETED') return;
                  const d = completedAt(j);
                  if (d.toDateString() !== now.toDateString()) return;
                  sums[d.getHours()] += j.totalPrice;
                });
                bars = sums.map((value, h) => ({
                  value,
                  label: h % 6 === 0 ? (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`) : '',
                  highlight: h === now.getHours(),
                }));
              } else if (graphPeriod === 'month') {
                // Last 4 weeks, oldest→newest, each a 7-day bucket ending today.
                bars = Array.from({ length: 4 }, (_, i) => {
                  const weeksAgo = 3 - i;
                  const bucketEnd = new Date(now); bucketEnd.setDate(now.getDate() - weeksAgo * 7);
                  const bucketStart = new Date(bucketEnd); bucketStart.setDate(bucketEnd.getDate() - 6);
                  const value = jobs
                    .filter(j => {
                      if (j.status !== 'COMPLETED') return false;
                      const d = completedAt(j);
                      return d >= bucketStart && d <= bucketEnd;
                    })
                    .reduce((s, j) => s + j.totalPrice, 0);
                  return { value, label: weeksAgo === 0 ? 'This wk' : `-${weeksAgo}w`, highlight: weeksAgo === 0 };
                });
              } else {
                const days = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(now);
                  d.setDate(now.getDate() - (6 - i));
                  return d;
                });
                bars = days.map((d, i) => ({
                  value: jobs
                    .filter(j => j.status === 'COMPLETED' && completedAt(j).toDateString() === d.toDateString())
                    .reduce((s, j) => s + j.totalPrice, 0),
                  label: d.toLocaleDateString('en-CA', { weekday: 'narrow' }),
                  highlight: i === 6,
                }));
              }

              const max = Math.max(...bars.map(b => b.value), 1);
              return bars.map((b, i) => (
                <View key={i} style={styles.earnBarCol}>
                  <View style={styles.earnBarTrack}>
                    <View
                      style={[
                        styles.earnBarFill,
                        {
                          height: `${Math.max(b.value / max * 100, 6)}%` as any,
                          backgroundColor: b.highlight ? Colors.brand : Colors.brandLight,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.earnBarLabel}>{b.label}</Text>
                </View>
              ));
            })()}
          </View>
        </View>

        {/* Rating + Sessions — below the graph, not competing with the
            Today/Week/Month earnings tabs above it for attention. */}
        <View style={styles.statGrid}>
          {([
            [(profile?.rating ?? 0) > 0 ? `${profile?.rating?.toFixed(1)} ★` : '—', 'Rating', Colors.gold],
            [String((profile as any)?.totalSessions ?? jobs.filter(j => j.status === 'COMPLETED').length), 'Sessions', Colors.label],
          ] as [string, string, string][]).map(([value, label, color]) => (
            <View key={label} style={styles.statCard}>
              <Text style={[styles.statCardValue, { color }]} numberOfLines={1}>{value}</Text>
              <Text style={styles.statCardLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── New Requests banner (client picked this Provider) — top priority ── */}
        {pendingRequests.length > 0 && (
          <Pressable style={styles.requestsBanner} onPress={() => nav.navigate('Requests')}>
            <View style={styles.requestsBell}><BellIcon size={24} color="#fff" /></View>
            <View style={styles.requestsBannerText}>
              <Text style={styles.requestsBannerTitle} numberOfLines={1}>
                {pendingRequests.length} new booking request{pendingRequests.length > 1 ? 's' : ''}
              </Text>
              <Text style={styles.requestsBannerSub} numberOfLines={2}>
                A client requested you — tap to accept or decline
              </Text>
            </View>
            {/* wrap chevron so it has breathing room from the card edge + a true touch target */}
            <View style={styles.requestsChevronWrap}>
              <ChevronForwardIcon size={22} color="#fff" />
            </View>
          </Pressable>
        )}

        {/* ── Doc verification card (missing-doc alert — shown high so Provider sees it first) ── */}
        {hasDocIssues && (
          <View style={styles.docCard}>
            <View style={styles.docCardHeader}>
              <Text style={styles.docCardTitle}>Complete your documents</Text>
              <View style={styles.docBadge}>
                <Text style={styles.docBadgeText}>{approvedDocCount} / {REQUIRED_DOCS.length}</Text>
              </View>
            </View>
            <View style={styles.docProgressBg}>
              <View style={[styles.docProgressFill, { backgroundColor: Colors.brand, width: `${Math.round((approvedDocCount / REQUIRED_DOCS.length) * 100)}%` as any }]} />
            </View>
            {REQUIRED_DOCS.map(docType => (
              <View key={docType} style={styles.docRow}>
                {docStatusIconEl(docType).el}
                <Text style={styles.docRowName}>{DOC_LABELS[docType]}</Text>
                <Text style={[
                  styles.docRowStatus,
                  {
                    color: serverDocs[docType] === 'APPROVED' ? Colors.trustGreen
                      : serverDocs[docType] === 'PENDING' ? Colors.urgentOrange
                      : serverDocs[docType] === 'REJECTED' ? Colors.systemRed
                      : Colors.tertiaryLabel,
                  },
                ]}>
                  {serverDocs[docType] ?? 'Not uploaded'}
                </Text>
              </View>
            ))}
            {REQUIRED_DOCS.some(d => !serverDocs[d] || serverDocs[d] === 'REJECTED') && (
              <Pressable
                style={({ pressed }) => [styles.docUploadBtn, pressed && { opacity: 0.75 }]}
                onPress={() => nav.navigate('ProviderDocuments')}
              >
                <Text style={styles.docUploadBtnText}>
                  Upload {DOC_LABELS[REQUIRED_DOCS.find(d => !serverDocs[d] || serverDocs[d] === 'REJECTED')!] ?? 'Documents'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Quick Actions ── */}
        <View style={styles.quickWrap}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickGrid}>
            {([
              { Icon: ShoppingBagIcon,      label: 'Find Jobs', sub: 'Browse open jobs', bg: Colors.brandLight, go: () => nav.navigate('ProviderHome', { screen: 'NearbyJobs' }) },
              { Icon: WalletIcon,           label: 'Earnings',  sub: 'Wallet & payouts', bg: '#FEF3C7',         go: () => nav.navigate('Earnings') },
              { Icon: UserProfileFilledIcon, label: 'Profile',   sub: 'Your details',     bg: '#DBEAFE',         go: () => nav.navigate('Profile') },
              { Icon: SupportIcon,          label: 'Help',      sub: 'Support & FAQ',    bg: '#EDE9FE',         go: () => nav.navigate('Help') },
            ]).map(a => (
              <Pressable key={a.label} style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={a.go}>
                <View style={[styles.quickIconBubble, { backgroundColor: a.bg }]}>
                  <a.Icon size={38} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickLabel} numberOfLines={1}>{a.label}</Text>
                  <Text style={styles.quickSub} numberOfLines={1}>{a.sub}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* All docs verified → compact tappable card (single Documents entry point) */}
        {!hasDocIssues && (
          <Pressable style={styles.docOkCard} onPress={() => nav.navigate('ProviderDocuments')}>
            <View style={styles.docOkIcon}>
              <ShieldCheckIcon size={20} color={Colors.trustGreen} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.docOkTitle}>Documents verified</Text>
              <Text style={styles.docOkSub}>All credentials approved · tap to view</Text>
            </View>
            <ChevronForwardIcon size={20} color={Colors.tertiaryLabel} />
          </Pressable>
        )}

        {/* ── Upcoming Appointment — matches the customer-side card ── */}
        {activeJob && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Appointment</Text>
            </View>
            <ActiveJobBanner
              job={activeJob}
              onPress={() => nav.navigate('JobDetail', { job: activeJob })}
            />
          </>
        )}

        {/* ── Pending approval overlay card ── */}
        {!isApproved && profile?.providerProfile && (
          <View style={styles.pendingBanner}>
            <HourglassIcon size={20} color="#92400E" />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingBannerTitle}>Awaiting Admin Approval</Text>
              <Text style={styles.pendingBannerSub}>Your credentials are under review. You'll receive jobs once approved.</Text>
            </View>
          </View>
        )}

        {/* (Documents shown above: the verification card when incomplete, or the
            compact 'Documents verified' card when complete — no duplicate here.) */}

        {/* ── Recent Jobs section ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Jobs</Text>
          <Pressable onPress={() => nav.navigate('MyJobs')}>
            <Text style={styles.seeAllLink}>See All →</Text>
          </Pressable>
        </View>

        {!loading && recentCompleted.length > 0 && recentCompleted.map(j => (
          <Pressable
            key={j._id}
            style={({ pressed }) => [styles.activityCard, pressed && { opacity: 0.8 }]}
            onPress={() => nav.navigate('JobDetail', { job: j })}
          >
            <View style={styles.activityIconWrap}>
              <ServiceIcon serviceType={j.serviceType} size={20} color={Colors.brandAccent} bubble={false} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.activityJobType}>{j.serviceType}</Text>
              <Text style={styles.activityDate}>
                {new Date(j.scheduledAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                {j.customer?.name ? ` · ${j.customer.name}` : ''}
              </Text>
            </View>
            <Text style={styles.activityEarn}>+{formatCurrency(j.totalPrice, { decimals: 0 })}</Text>
          </Pressable>
        ))}

        {!loading && recentCompleted.length === 0 && (
          <View style={styles.emptyState}>
            <BriefcaseIcon size={36} color={Colors.systemGray3} />
            <Text style={styles.emptyText}>No recent jobs. Go online to find work nearby.</Text>
            <Pressable
              style={({ pressed }) => [styles.browseBtn, pressed && { opacity: 0.85 }]}
              onPress={() => nav.navigate('ProviderHome', { screen: 'NearbyJobs' })}
            >
              <Text style={styles.browseBtnText}>Browse nearby jobs</Text>
            </Pressable>
          </View>
        )}

        {/* ── How Clients See You ── */}
        {profile && (
          <View style={styles.previewSection}>
            <Text style={styles.sectionTitle}>HOW CLIENTS SEE YOU</Text>
            <View style={styles.previewCard}>
              <View style={styles.previewRow}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.previewAvatar} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.previewAvatar, { backgroundColor: Colors.brandLight, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 20, fontFamily: Fonts.bold, color: Colors.brandDark }}>
                      {user?.name?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewName} numberOfLines={1}>{profile.name}</Text>
                  <Text style={styles.previewSpec} numberOfLines={1}>
                    {profile.providerProfile?.specialties?.[0] ?? 'Beauty Professional'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={styles.previewRating}>★ {(profile.rating ?? 0).toFixed(1)}</Text>
                    <Text style={styles.previewReviews}>({profile.ratingCount ?? 0})</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

      </ScrollView>

      <LocationPrompt
        visible={showLocationPrompt}
        onRequest={async () => { await requestLocation(); setShowLocationPrompt(false); }}
        onSkip={() => setShowLocationPrompt(false)}
        isDenied={permissionStatus === 'denied'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemGroupedBackground },

  // ── Weekly earnings card (floats over hero bottom edge) ──
  earnCard: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#fff', borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: Colors.separator,
    shadowColor: Colors.brandDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  earnCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earnCardLabel: { fontSize: 12, fontWeight: '700', color: Colors.brandDark },
  earnCardValue: { fontSize: 24, fontWeight: '800', color: Colors.label, letterSpacing: -0.5 },
  earnBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, height: 76, marginTop: 12 },
  earnBarCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  earnBarTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  earnBarFill: { width: '100%', borderRadius: 4 },
  earnBarLabel: { fontSize: 9.5, color: Colors.tertiaryLabel, fontWeight: '600' },

  // ── Light header (greeting + availability + stat grid) ──
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  heroGreeting: { fontSize: 14, color: Colors.secondaryLabel, fontFamily: Fonts.regular, marginBottom: 2 },
  heroName: { fontSize: 30, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -0.8 },

  heroBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: Colors.separator,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  heroBtnText: { color: Colors.secondaryLabel, fontSize: 12, fontFamily: Fonts.semibold, letterSpacing: 0.4 },

  heroAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  heroAvatarImg: { width: 42, height: 42, borderRadius: 21 },
  heroAvatarText: { color: Colors.brandDark, fontSize: 16, fontFamily: Fonts.semibold },
  avatarOnlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.systemGreen,
    borderWidth: 1.5, borderColor: '#fff',
  },

  bellBadge: {
    position: 'absolute', top: 0, right: 0,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.brand,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: '#fff', fontSize: 10, fontFamily: Fonts.bold },

  // Availability card
  heroToggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16,
    gap: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.separator,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  heroToggleTitle: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label },
  heroToggleSub: { fontSize: 12.5, color: Colors.secondaryLabel, fontFamily: Fonts.regular },
  toggleSwitch: {
    width: 48, height: 28, borderRadius: 14,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleKnob: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, shadowRadius: 3, elevation: 3,
  },

  // Stat grid — 2×2 metric cards
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 16, marginTop: 12, marginBottom: 4 },

  // Today/This Week/Month tabs — replaces the old static "Today"/"This Week"
  // stat cards; selecting one reshapes the earnings graph below.
  periodTabRow: { flexDirection: 'row', gap: 10 },
  periodTab: {
    flex: 1, backgroundColor: '#fff', borderRadius: 20,
    paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.separator,
  },
  periodTabActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  periodTabValue: { fontSize: 19, fontFamily: Fonts.bold, letterSpacing: -0.4, color: Colors.label },
  periodTabValueActive: { color: '#fff' },
  periodTabLabel: { fontSize: 11, color: Colors.secondaryLabel, marginTop: 4, fontFamily: Fonts.medium, textTransform: 'uppercase', letterSpacing: 0.5 },
  periodTabLabelActive: { color: 'rgba(255,255,255,0.85)' },
  statCard: {
    flexBasis: '48%', flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 20, paddingVertical: 18, paddingHorizontal: 18,
    borderWidth: 1, borderColor: Colors.separator,
  },
  statCardValue: { fontSize: 24, fontFamily: Fonts.bold, letterSpacing: -0.6 },
  statCardLabel: { fontSize: 11.5, color: Colors.secondaryLabel, marginTop: 5, fontFamily: Fonts.medium, textTransform: 'uppercase', letterSpacing: 0.6 },

  // Doc verification card
  docCard: {
    marginHorizontal: 16, marginBottom: 16,
    borderRadius: 20, padding: 18, paddingHorizontal: 20,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1, borderColor: Colors.cardBorder,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  docCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  docCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.label },
  docBadge: {
    backgroundColor: Colors.brandLight, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  docBadgeText: { color: Colors.brand, fontSize: 12, fontWeight: '700' },
  docProgressBg: {
    height: 4, backgroundColor: Colors.systemGray5, borderRadius: 2,
    overflow: 'hidden', marginBottom: 14,
  },
  docProgressFill: { height: '100%', borderRadius: 2 },
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  docRowName: { flex: 1, color: Colors.secondaryLabel, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  docRowStatus: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  docUploadBtn: {
    marginTop: 6, borderRadius: 12,
    backgroundColor: Colors.brand,
    paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center',
  },
  docUploadBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // Credential Documents nav card
  credCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: 16, padding: 14, paddingHorizontal: 16,
    marginHorizontal: 16, marginBottom: 16,
  },
  credIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  credTitle: { fontSize: 15, fontWeight: '700', color: Colors.label },
  credSub: { fontSize: 12, color: Colors.secondaryLabel, marginTop: 2 },
  credChevron: { fontSize: 22, color: Colors.tertiaryLabel, fontWeight: '300' },

  // Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 12, marginTop: 22,
  },
  sectionTitle: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.secondaryLabel, letterSpacing: 1.1, textTransform: 'uppercase' },

  // Quick actions
  quickWrap: { paddingHorizontal: 16, marginTop: 22 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 10 },
  quickCard: {
    width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: Colors.cardBackground, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.cardBorder,
    shadowColor: Colors.label, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  quickIconBubble: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  quickLabel: { fontSize: 13, fontWeight: '800', color: Colors.label },
  quickSub: { fontSize: 10.5, color: Colors.secondaryLabel, marginTop: 1 },
  seeAllLink: { fontSize: 13, color: Colors.brand, fontWeight: '600' },

  // Activity card (recent jobs)
  activityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.cardBackground, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: 16, padding: 14, paddingHorizontal: 16,
    marginHorizontal: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  activityIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  activityJobType: { fontSize: 14, fontWeight: '600', color: Colors.label },
  activityDate: { fontSize: 12, color: Colors.tertiaryLabel },
  activityEarn: { fontSize: 15, fontWeight: '700', color: Colors.trustGreen },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.tertiaryLabel, textAlign: 'center', lineHeight: 20 },

  // Pending banner
  pendingBanner: {
    marginHorizontal: 16, marginTop: 0, marginBottom: 16,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  pendingBannerTitle: { fontSize: 14, fontWeight: '800', color: '#D97706', marginBottom: 3 },
  pendingBannerSub: { fontSize: 12, color: Colors.secondaryLabel, lineHeight: 17 },

  // New requests banner (prominent, brand green)
  // Solid brand-green so it pops as the top-priority alert (was pale-green-on-green
  // = low contrast, hard to read). White text + white icon bubble.
  requestsBanner: {
    marginHorizontal: 16, marginTop: 16, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.brand, borderRadius: 16, padding: 16,
    shadowColor: Colors.brandDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5,
  },
  requestsBell: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
  },
  // Chevron gets its own padded container so it never jams against the card edge
  // and the whole row stays vertically centered.
  requestsChevronWrap: { width: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // flex:1 + minWidth:0 lets the text column shrink so the chevron never overlaps it.
  requestsBannerText: { flex: 1, minWidth: 0 },
  requestsBannerTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  requestsBannerSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2, lineHeight: 16 },
  requestsBannerChevron: { fontSize: 26, color: '#fff', fontWeight: '700', lineHeight: 26, width: 16, textAlign: 'center', flexShrink: 0 },

  docOkCard: {
    marginHorizontal: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.cardBackground, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.cardBorder,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  docOkIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  docOkTitle: { fontSize: 14, fontWeight: '700', color: Colors.label },
  docOkSub: { fontSize: 12, color: Colors.secondaryLabel, marginTop: 2 },

  browseBtn: {
    backgroundColor: Colors.brand,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  browseBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Fonts.semibold,
  },
  previewSection: {
    paddingHorizontal: 16,
    marginTop: 22,
    marginBottom: 12,
  },
  previewCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  previewAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
  },
  previewName: {
    fontSize: 16,
    fontFamily: Fonts.semibold,
    color: Colors.label,
  },
  previewSpec: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.secondaryLabel,
    marginTop: 2,
  },
  previewRating: {
    fontSize: 14,
    fontFamily: Fonts.semibold,
    color: Colors.gold,
  },
  previewReviews: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.tertiaryLabel,
  },
});
