import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { apiMyJobs, Booking } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { JobCard } from '../../components/JobCard';
import { JobCardSkeleton } from '../../components/SkeletonLoader';
import { Colors } from '../../utils/colors';
import { Radius, Spacing, Typography } from '../../utils/theme';
import { FindJobsIcon } from '../../components/CareIcons';

// ── Active job status label ────────────────────────────────────────────────────
function activeStatusLabel(status: string): string {
  if (status === 'ACCEPTED')  return 'Accepted · Head to client';
  if (status === 'ON_MY_WAY') return 'En route · Client notified';
  if (status === 'STARTED')   return 'In progress · Service running';
  return status;
}

// ── Live pulse indicator ───────────────────────────────────────────────────────
// A small solid dot with an expanding+fading ring behind it — the premium "live"
// cue (think AirPods/ride-hail). Subtle, not a big neon blob. The ring is absolute
// so it pulses *around* the dot without nudging layout.
function LivePulseDot() {
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1600, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [ring]);

  // 0 → 1 drives the ring from tight+opaque to wide+invisible.
  const scale   = ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.6] });
  const opacity = ring.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.55, 0.12, 0] });

  return (
    <View style={heroStyles.pulseWrap}>
      <Animated.View style={[heroStyles.pulseRing, { opacity, transform: [{ scale }] }]} />
      <View style={heroStyles.pulseDot} />
    </View>
  );
}

// ── Active job hero banner ─────────────────────────────────────────────────────
// Defined outside the screen component to avoid remount-on-render
function ActiveJobHero({ job, onPress }: { job: Booking; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [heroStyles.container, pressed && { opacity: 0.92 }]}>
      <LinearGradient
        colors={[Colors.brandDark, Colors.brand]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={heroStyles.gradient}
      >
        {/* Faint ambient glow in the far corner — depth only, no hard dot. */}
        <View style={heroStyles.ambientGlow} />

        {/* Left: status */}
        <View style={heroStyles.left}>
          {/* LIVE chip: pulsing dot + label — the attention indicator. */}
          <View style={heroStyles.liveChip}>
            <LivePulseDot />
            <Text style={heroStyles.liveChipText}>LIVE · ACTIVE JOB</Text>
          </View>
          <Text style={heroStyles.serviceType}>
            {job.services && job.services.length > 0 ? job.services[0].name : job.serviceType}
          </Text>
          {job.services && job.services.length > 1 && (
            <Text style={heroStyles.serviceExtra}>+{job.services.length - 1} more service{job.services.length > 2 ? 's' : ''}</Text>
          )}
          <Text style={heroStyles.statusText}>{activeStatusLabel(job.status)}</Text>
        </View>

        {/* Right: earnings + CTA */}
        <View style={heroStyles.right}>
          <Text style={heroStyles.earningsLabel}>You earn</Text>
          <Text style={heroStyles.earningsAmount}>${job.totalPrice?.toFixed(0)}</Text>
          <View style={heroStyles.ctaBtn}>
            <Text style={heroStyles.ctaBtnText}>Continue</Text>
            <Text style={heroStyles.ctaArrow}>→</Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const heroStyles = StyleSheet.create({
  container: { marginHorizontal: 16, marginTop: 14, marginBottom: 4 },
  gradient: {
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: Colors.brandDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  // Faint ambient wash in the top-right corner for depth — never a hard dot.
  ambientGlow: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  left: { flex: 1 },

  // LIVE chip — translucent pill holding the pulse dot + label.
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    paddingLeft: 7,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    marginBottom: 9,
  },
  liveChipText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  // Pulse indicator: fixed-size wrapper so the absolute ring can't shift layout.
  pulseWrap: { width: 9, height: 9, alignItems: 'center', justifyContent: 'center' },
  pulseDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#5BFFB0', // bright mint — reads as "live" on the green gradient
  },
  pulseRing: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#5BFFB0',
  },

  serviceType: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  serviceExtra: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  statusText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)',
  },
  right: { alignItems: 'flex-end' },
  earningsLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 1,
  },
  earningsAmount: {
    fontSize: 30,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
    marginBottom: 10,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  ctaBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  ctaArrow: { fontSize: 14, fontWeight: '800', color: '#fff', marginTop: -1 },
});

// ── Payout badge ──────────────────────────────────────────────────────────────
function PayoutBadge({ job }: { job: Booking }) {
  if (job.status !== 'COMPLETED' || job.providerPayout == null) return null;
  const released = job.paymentStatus === 'RELEASED';
  return (
    <View style={payoutStyles.badge}>
      <Text style={payoutStyles.net}>You earned ${job.providerPayout.toFixed(0)}</Text>
      {released
        ? <View style={payoutStyles.released}><Text style={payoutStyles.releasedTxt}>Released</Text></View>
        : <View style={payoutStyles.pending}><Text style={payoutStyles.pendingTxt}>Pending</Text></View>}
    </View>
  );
}

const payoutStyles = StyleSheet.create({
  badge: {
    marginHorizontal: 16,
    marginTop: -6,
    marginBottom: 10,
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    flexWrap: 'wrap',
  },
  net:         { fontSize: 13, color: Colors.trustGreen, fontWeight: '800', flex: 1 },
  released:    { backgroundColor: Colors.brandLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  releasedTxt: { fontSize: 11, fontWeight: '700', color: Colors.trustGreen },
  pending:     { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pendingTxt:  { fontSize: 11, fontWeight: '700', color: Colors.urgentOrange },
});

// ── Section grouping helpers ───────────────────────────────────────────────────
const ACTIVE_STATUSES = new Set(['ACCEPTED', 'ON_MY_WAY', 'STARTED']);

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
}

function isTomorrow(date: Date): boolean {
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  return date.getFullYear() === tom.getFullYear() &&
    date.getMonth() === tom.getMonth() &&
    date.getDate() === tom.getDate();
}

function isThisWeek(date: Date): boolean {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

interface Section { title: string; tag: string; data: Booking[] }

type JobFilter = 'ALL' | 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
const JOB_FILTERS: { key: JobFilter; label: string }[] = [
  { key: 'ALL',       label: 'All' },
  { key: 'UPCOMING',  label: 'Upcoming' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

// Filter a job list by the selected chip. UPCOMING = active/accepted/scheduled (anything
// not yet done or cancelled). Declined/skipped jobs never reach My Jobs (they leave the
// Provider's list on skip), so Cancelled covers the visible "rejected" outcomes.
function applyJobFilter(jobs: Booking[], filter: JobFilter): Booking[] {
  if (filter === 'ALL') return jobs;
  if (filter === 'COMPLETED') return jobs.filter(j => j.status === 'COMPLETED');
  if (filter === 'CANCELLED') return jobs.filter(j => j.status === 'CANCELLED');
  // UPCOMING — everything still in flight.
  return jobs.filter(j => j.status !== 'COMPLETED' && j.status !== 'CANCELLED');
}

function buildSections(jobs: Booking[]): Section[] {
  const active: Booking[]    = [];
  const today: Booking[]     = [];
  const tomorrow: Booking[]  = [];
  const thisWeek: Booking[]  = [];
  const upcoming: Booking[]  = [];
  const completed: Booking[] = [];
  const cancelled: Booking[] = [];

  for (const j of jobs) {
    const d = new Date(j.scheduledAt);
    if (ACTIVE_STATUSES.has(j.status))    { active.push(j); continue; }
    if (j.status === 'COMPLETED')         { completed.push(j); continue; }
    if (j.status === 'CANCELLED')         { cancelled.push(j); continue; }
    if (isToday(d))                       { today.push(j); continue; }
    if (isTomorrow(d))                    { tomorrow.push(j); continue; }
    if (isThisWeek(d))                    { thisWeek.push(j); continue; }
    upcoming.push(j);
  }

  const sections: Section[] = [];
  if (active.length)    sections.push({ title: 'Active Now', tag: 'live', data: active });
  if (today.length)     sections.push({ title: 'Today', tag: 'today', data: today });
  if (tomorrow.length)  sections.push({ title: 'Tomorrow', tag: 'soon', data: tomorrow });
  if (thisWeek.length)  sections.push({ title: 'This Week', tag: 'week', data: thisWeek });
  if (upcoming.length)  sections.push({ title: 'Upcoming', tag: 'upcoming', data: upcoming });
  // Cap completed in the list — full history lives in Earnings. Keeps the list fast & scannable.
  if (completed.length) sections.push({ title: `Completed`, tag: `${completed.length} jobs`, data: completed.slice(0, 10) });
  if (cancelled.length) sections.push({ title: `Cancelled`, tag: `${cancelled.length} jobs`, data: cancelled.slice(0, 10) });
  return sections;
}

function deriveEarnings(jobs: Booking[]) {
  let totalEarned = 0, pendingRelease = 0;
  for (const j of jobs) {
    const payout = j.providerPayout ?? 0;
    if (j.paymentStatus === 'RELEASED') totalEarned += payout;
    else if (ACTIVE_STATUSES.has(j.status)) pendingRelease += payout;
  }
  return {
    totalEarned:    Math.round(totalEarned * 100) / 100,
    pendingRelease: Math.round(pendingRelease * 100) / 100,
  };
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export function MyJobsScreen() {
  const nav    = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [jobs, setJobs]         = useState<Booking[]>([]);
  const [filter, setFilter]     = useState<JobFilter>('ALL');
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastLoadedAt = useRef<string | undefined>(undefined);
  const mountedRef   = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (showRefresh = false) => {
    if (!token || !mountedRef.current) return;
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await apiMyJobs({ nocache: true });
      if (!mountedRef.current) return;
      setJobs(res.bookings.sort(
        (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      ));
      lastLoadedAt.current = new Date().toISOString();
    } catch {}
    if (mountedRef.current) { setLoading(false); setRefreshing(false); }
  }, [token]);

  const refreshIncremental = useCallback(async () => {
    if (!token || !lastLoadedAt.current || !mountedRef.current) return;
    try {
      const res = await apiMyJobs({ since: lastLoadedAt.current });
      if (!mountedRef.current || res.bookings.length === 0) return;
      setJobs(prev => {
        const map = new Map(res.bookings.map(b => [b._id, b]));
        const merged = prev.map(j => map.has(j._id) ? map.get(j._id)! : j);
        res.bookings.forEach(b => { if (!merged.find(j => j._id === b._id)) merged.unshift(b); });
        return merged.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
      });
      lastLoadedAt.current = new Date().toISOString();
    } catch {}
  }, [token]);

  useFocusEffect(useCallback(() => { if (token) load(); }, [load, token]));

  useEffect(() => {
    if (!token) return;
    const t = setInterval(refreshIncremental, 15_000);
    return () => clearInterval(t);
  }, [refreshIncremental, token]);

  const sections = buildSections(applyJobFilter(jobs, filter));
  const { totalEarned, pendingRelease } = deriveEarnings(jobs);
  const activeJob   = jobs.find(j => ACTIVE_STATUSES.has(j.status));
  const completedCount = jobs.filter(j => j.status === 'COMPLETED').length;
  const filterCounts: Record<JobFilter, number> = {
    ALL:       jobs.length,
    UPCOMING:  jobs.filter(j => j.status !== 'COMPLETED' && j.status !== 'CANCELLED').length,
    COMPLETED: completedCount,
    CANCELLED: jobs.filter(j => j.status === 'CANCELLED').length,
  };

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>My Jobs</Text>
        <Text style={styles.headerSub}>Your accepted and completed bookings</Text>

        {/* ── Earnings strip ── */}
        <View style={styles.earningsStrip}>
          <View style={styles.earningsItem}>
            <Text style={styles.earningsAmount}>${totalEarned.toFixed(0)}</Text>
            <Text style={styles.earningsLabel}>Earned</Text>
          </View>
          <View style={styles.earningsDivider} />
          <View style={styles.earningsItem}>
            <Text style={[styles.earningsAmount, { color: '#FCD34D' }]}>${pendingRelease.toFixed(0)}</Text>
            <Text style={styles.earningsLabel}>Pending</Text>
          </View>
          <View style={styles.earningsDivider} />
          <View style={styles.earningsItem}>
            <Text style={styles.earningsAmount}>{completedCount}</Text>
            <Text style={styles.earningsLabel}>Done</Text>
          </View>
        </View>

        {/* ── Filter chips ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ width: '100%', marginTop: Spacing.md }}
          contentContainerStyle={styles.filterRow}
        >
          {JOB_FILTERS.map(f => {
            const active = filter === f.key;
            const c = filterCounts[f.key];
            return (
              <Pressable
                key={f.key}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => setFilter(f.key)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                {c > 0 && (
                  <View style={[styles.filterBadge, active && styles.filterBadgeActive]}>
                    <Text style={[styles.filterBadgeText, active && styles.filterBadgeTextActive]}>{c}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Active job hero ── */}
      {activeJob && (
        <ActiveJobHero
          job={activeJob}
          onPress={() => nav.navigate('JobDetail', { job: activeJob })}
        />
      )}

      {/* ── Sectioned list ── */}
      <SectionList
        sections={loading ? [] : sections}
        keyExtractor={i => i._id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.systemGreen} />
        }
        ListHeaderComponent={loading ? (
          <View style={{ marginTop: 16 }}>
            <JobCardSkeleton /><JobCardSkeleton /><JobCardSkeleton />
          </View>
        ) : null}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}><FindJobsIcon size={44} color={Colors.brand} /></View>
            <Text style={styles.emptyTitle}>No jobs yet</Text>
            <Text style={styles.emptySub}>
              Go online and accept nearby jobs to see them here.
            </Text>
            <Pressable
              style={styles.emptyBtn}
              onPress={() => nav.navigate('NearbyJobs')}
            >
              <Text style={styles.emptyBtnText}>Find Jobs Nearby</Text>
            </Pressable>
          </View>
        ) : null}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionTagPill}>
              <Text style={styles.sectionTagText}>{section.tag}</Text>
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <View>
            <JobCard
              job={item}
              onPress={() => nav.navigate('JobDetail', { job: item })}
            />
            <PayoutBadge job={item} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F4' },

  // Header
  header: {
    backgroundColor: Colors.brand,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: { ...Typography.title2, color: '#fff' },
  headerSub: { ...Typography.footnote, color: 'rgba(255,255,255,0.75)', marginTop: 2, marginBottom: Spacing.sm },

  // Earnings strip
  earningsStrip: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  // Filter chips
  filterRow: { flexDirection: 'row', gap: 8, paddingRight: 16 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  filterPillActive: { backgroundColor: '#fff', borderColor: '#fff' },
  filterText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  filterTextActive: { color: Colors.brandDark, fontWeight: '700' },
  filterBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.3)' },
  filterBadgeActive: { backgroundColor: Colors.brand },
  filterBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  filterBadgeTextActive: { color: '#fff' },

  earningsItem: { flex: 1, alignItems: 'center', gap: 4 },
  earningsDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.25)' },
  earningsAmount: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  earningsLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  // List
  list: { paddingTop: 14, paddingBottom: 48 },

  // Section header — pill style
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.secondaryLabel,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sectionTagPill: {
    backgroundColor: Colors.systemBackground,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  sectionTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.tertiaryLabel,
  },

  // Empty state
  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 32 },
  emptyIconWrap: { width: 92, height: 92, borderRadius: 46, backgroundColor: Colors.brandLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: Colors.label, marginBottom: 8 },
  emptySub: { fontSize: 14, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  emptyBtn: {
    backgroundColor: Colors.onlineGreen,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    shadowColor: Colors.onlineGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
