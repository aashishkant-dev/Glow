import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowBackIcon } from '../../components/TabIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { apiMyJobs, apiGetEarnings, apiWithdrawEarnings, apiGetPayoutMethod, apiSetPayoutMethod, Booking, EarningsData, PayoutMethod } from '../../api/client';
import { Colors } from '../../utils/colors';
import { ServiceIcon } from '../../components/ServiceIcon';
import { EarningsIcon, CreditCardIcon, NoteIcon } from '../../components/CareIcons';
import { CashIcon } from '../../components/TabIcons';
import { JobCardSkeleton } from '../../components/SkeletonLoader';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function groupByPeriod(jobs: Booking[]) {
  const today = jobs.filter(j =>
    new Date(j.scheduledAt).toDateString() === new Date().toDateString(),
  );
  const thisWeek = jobs.filter(j => {
    const diff = (Date.now() - new Date(j.scheduledAt).getTime()) / 86400000;
    return diff <= 7 && new Date(j.scheduledAt).toDateString() !== new Date().toDateString();
  });
  const older = jobs.filter(j => (Date.now() - new Date(j.scheduledAt).getTime()) / 86400000 > 7);
  return { today, thisWeek, older };
}

// ── Earnings group (defined outside component to avoid remount) ─────────────
function EarningsGroup({ title, items }: { title: string; items: Booking[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {items.map(j => (
        <View key={j._id} style={styles.jobRow}>
          <View style={styles.jobIconWrap}>
            <ServiceIcon serviceType={j.serviceType} size={22} color={Colors.brand} bubble={false} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.jobService} numberOfLines={1}>{j.serviceType}</Text>
            <Text style={styles.jobMeta}>{formatDate(j.scheduledAt)} · {j.hours}h{j.customer?.name ? ` · ${j.customer.name}` : ''}</Text>
          </View>
          <View style={styles.jobEarningWrap}>
            <Text style={styles.jobEarnings}>${(j.providerPayout ?? j.totalPrice ?? 0).toFixed(2)}</Text>
            {j.hours > 0 && (
              <Text style={styles.jobHourRate}>${((j.providerPayout ?? j.totalPrice ?? 0) / j.hours).toFixed(2)}/hr</Text>
            )}
          </View>
        </View>
      ))}
      <View style={styles.groupTotal}>
        <Text style={styles.groupTotalLabel}>Subtotal</Text>
        <Text style={styles.groupTotalValue}>${items.reduce((s, j) => s + (j.providerPayout ?? j.totalPrice ?? 0), 0).toFixed(2)}</Text>
      </View>
    </View>
  );
}

export function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const nav    = useNavigation<any>();
  const [jobs,       setJobs]       = useState<Booking[]>([]);
  const [wallet,     setWallet]     = useState<EarningsData | null>(null);
  const [payout,     setPayout]     = useState<PayoutMethod | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [payoutModal, setPayoutModal] = useState(false);
  const [emailInput,  setEmailInput]  = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [jobsRes, walletRes, payoutRes] = await Promise.all([
        apiMyJobs(),
        apiGetEarnings().catch(() => null),
        apiGetPayoutMethod().catch(() => null),
      ]);
      setJobs(
        jobsRes.bookings
          .filter(j => j.status === 'COMPLETED')
          .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
      );
      if (walletRes) setWallet(walletRes);
      if (payoutRes) { setPayout(payoutRes); setEmailInput(payoutRes.payoutEmail || ''); }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const savePayoutEmail = useCallback(async () => {
    const email = emailInput.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      Alert.alert('Invalid email', 'Enter a valid Interac e-Transfer email.');
      return;
    }
    setSavingEmail(true);
    try {
      const res = await apiSetPayoutMethod(email);
      setPayout(res);
      setPayoutModal(false);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    }
    setSavingEmail(false);
  }, [emailInput]);

  const onWithdraw = useCallback(() => {
    if (!wallet || wallet.available <= 0 || withdrawing) return;
    // Require a payout email first.
    if (!payout?.configured) {
      setPayoutModal(true);
      return;
    }
    Alert.alert(
      'Withdraw earnings',
      `Send $${wallet.available.toFixed(2)} via Interac e-Transfer to ${payout.payoutEmail}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          onPress: async () => {
            setWithdrawing(true);
            try {
              const res = await apiWithdrawEarnings();
              await load(true);
              Alert.alert('Withdrawal sent', res.message);
            } catch (e: any) {
              Alert.alert('Withdrawal failed', e?.message || 'Please try again.');
            }
            setWithdrawing(false);
          },
        },
      ],
    );
  }, [wallet, withdrawing, payout, load]);

  const totalEarned = jobs.reduce((s, j) => s + (j.providerPayout ?? j.totalPrice ?? 0), 0);
  const totalHours  = jobs.reduce((s, j) => s + j.hours, 0);
  const avgPerJob   = jobs.length > 0 ? Math.round(totalEarned / jobs.length) : 0;

  const now = new Date();
  const thisMonthJobs = jobs.filter(j => {
    const d = new Date(j.scheduledAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthEarned = thisMonthJobs.reduce((s, j) => s + (j.providerPayout ?? j.totalPrice ?? 0), 0);
  const monthGoal = 2000;
  const progressPct = Math.min(thisMonthEarned / monthGoal, 1);

  // ── Last 7 days bar chart ──
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = d.toDateString();
    const earned = jobs
      .filter(j => new Date(j.scheduledAt).toDateString() === dayStr)
      .reduce((s, j) => s + (j.providerPayout ?? j.totalPrice ?? 0), 0);
    return {
      label: d.toLocaleDateString('en-CA', { weekday: 'short' }).slice(0, 1),
      date:  d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
      earned,
    };
  });
  const maxBar = Math.max(...last7.map(d => d.earned), 1);

  const { today, thisWeek, older } = groupByPeriod(jobs);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.brand} />
      }
    >
      {/* ── Hero ── */}
      <LinearGradient
        colors={[Colors.brandDark, Colors.brand, '#CA8490']}
        style={[styles.hero, { paddingTop: insets.top + 16 }]}
      >
        {nav.canGoBack() && (
          <Pressable onPress={() => nav.goBack()} style={styles.heroBack}>
            <ArrowBackIcon size={22} color="rgba(255,255,255,0.8)" />
          </Pressable>
        )}
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroLabel}>YOUR EARNINGS</Text>
            <Text style={styles.heroTotal}>${totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
          <View style={styles.heroGoldBadge}>
            <Text style={styles.heroGoldBadgeText}>All Time</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          {([
            [String(jobs.length), 'Jobs Done'],
            [`${totalHours}h`,    'Hours Worked'],
            [`$${avgPerJob}`,     'Avg / Job'],
            // Effective take-home per hour from real payouts — never quote the
            // customer's gross rate here (it would reveal the platform margin).
            [totalHours > 0 ? `$${Math.round(totalEarned / totalHours)}/hr` : '—', 'Avg / Hour'],
          ] as [string, string][]).map(([num, label], i, arr) => (
            <View key={label} style={styles.statWrap}>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{num}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.statDivider} />}
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* ── Wallet (Available / Pending + Withdraw) ── */}
      <View style={styles.sectionPad}>
        <View style={styles.walletCard}>
          <View style={styles.walletRow}>
            <View style={styles.walletCol}>
              <Text style={styles.walletColLabel}>AVAILABLE</Text>
              <Text style={styles.walletAvailable}>${(wallet?.available ?? 0).toFixed(2)}</Text>
              <Text style={styles.walletColSub}>Ready to withdraw</Text>
            </View>
            <View style={styles.walletVDivider} />
            <View style={styles.walletCol}>
              <Text style={styles.walletColLabel}>PENDING</Text>
              <Text style={styles.walletPending}>${(wallet?.pendingRelease ?? 0).toFixed(2)}</Text>
              <Text style={styles.walletColSub}>Held until job done</Text>
            </View>
          </View>
          <Pressable
            onPress={onWithdraw}
            disabled={!wallet || wallet.available <= 0 || withdrawing}
            style={[
              styles.withdrawBtn,
              (!wallet || wallet.available <= 0 || withdrawing) && styles.withdrawBtnDisabled,
            ]}
          >
            {withdrawing
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.withdrawBtnText}>
                  {wallet && wallet.available > 0 ? `Withdraw $${wallet.available.toFixed(2)}` : 'Nothing to withdraw'}
                </Text>}
          </Pressable>
          {/* Payout method row */}
          <Pressable style={styles.payoutRow} onPress={() => setPayoutModal(true)}>
            <View style={styles.payoutRowIcon}><CashIcon size={22} color={Colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payoutRowLabel}>Payout method</Text>
              <Text style={styles.payoutRowValue}>
                {payout?.configured ? `Interac e-Transfer · ${payout.payoutEmail}` : 'Not set up — tap to add'}
              </Text>
            </View>
            <Text style={styles.payoutRowChevron}>{payout?.configured ? 'Edit' : 'Add'}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CreditCardIcon size={14} color={Colors.secondaryLabel} />
            <Text style={styles.walletNote}>Mock wallet · Interac e-Transfer in 1–2 business days (Stripe coming soon)</Text>
          </View>
        </View>
      </View>

      {/* ── Payout method modal ── */}
      <Modal visible={payoutModal} transparent animationType="slide" onRequestClose={() => setPayoutModal(false)}>
        {/* KeyboardAvoidingView: without it the keyboard (autoFocus) covers the
            bottom-sheet card and the Provider can't see the email they're typing. */}
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Payout method</Text>
            <Text style={styles.modalSub}>Where should we send your earnings? Enter the email registered for Interac e-Transfer.</Text>
            <TextInput
              style={styles.modalInput}
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="you@example.com"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.modalBtnRow}>
              <Pressable style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setPayoutModal(false)} disabled={savingEmail}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnSave]} onPress={savePayoutEmail} disabled={savingEmail}>
                {savingEmail ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnSaveText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── This Month Goal ── */}
      <View style={styles.sectionPad}>
        <View style={styles.monthCard}>
          <View style={styles.monthTop}>
            <View>
              <Text style={styles.monthLabel}>THIS MONTH</Text>
              <Text style={styles.monthAmount}>${thisMonthEarned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </View>
            <View style={styles.monthRight}>
              <Text style={styles.monthGoalLabel}>Goal: ${monthGoal.toLocaleString()}</Text>
              <Text style={[styles.monthPct, { color: progressPct >= 1 ? Colors.trustGreen : Colors.brand }]}>
                {Math.round(progressPct * 100)}%
              </Text>
            </View>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.round(progressPct * 100)}%` as any }]} />
          </View>
          <Text style={styles.monthSub}>
            {progressPct >= 1
              ? 'Monthly goal reached!'
              : `$${monthGoal - thisMonthEarned} to go · ${thisMonthJobs.length} jobs this month`}
          </Text>
        </View>
      </View>

      {/* ── Breakdown cards ── */}
      <View style={styles.breakdownRow}>
        {[
          { label: 'Today',     amount: today.reduce((s, j) => s + (j.providerPayout ?? j.totalPrice ?? 0), 0),              color: Colors.systemGreen },
          { label: 'This Week', amount: [...today, ...thisWeek].reduce((s, j) => s + (j.providerPayout ?? j.totalPrice ?? 0), 0), color: Colors.systemBlue },
          { label: 'All Time',  amount: totalEarned,                                               color: Colors.brand },
        ].map(c => (
          <View key={c.label} style={[styles.breakdownCard, { borderTopColor: c.color }]}>
            <Text style={[styles.breakdownAmount, { color: c.color }]}>${c.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            <Text style={styles.breakdownLabel}>{c.label}</Text>
          </View>
        ))}
      </View>

      {/* ── 7-day bar chart ── */}
      {jobs.length > 0 && (
        <View style={styles.sectionPad}>
          <Text style={styles.chartSectionLabel}>LAST 7 DAYS</Text>
          <View style={styles.chartCard}>
            <View style={styles.chartRow}>
              {last7.map((day, i) => (
                <View key={i} style={styles.chartCol}>
                  {day.earned > 0 && (
                    <Text style={styles.chartBarValue}>${day.earned}</Text>
                  )}
                  <View style={styles.chartBarContainer}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: Math.max((day.earned / maxBar) * 72, day.earned > 0 ? 6 : 0),
                          backgroundColor: day.earned > 0 ? Colors.brand : Colors.systemGray5,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.chartDayLabel}>{day.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* ── Tax note ── */}
      <View style={styles.sectionPad}>
        <View style={styles.taxNote}>
          <View style={styles.taxNoteIcon}><NoteIcon size={22} color={Colors.secondaryLabel} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.taxNoteTitle}>Tax Reminder</Text>
            <Text style={styles.taxNoteSub}>
              As a self-employed Provider, keep records of all income for tax season.
              Contact an accountant for guidance on deductions.
            </Text>
          </View>
        </View>
      </View>

      {/* ── Earnings history ── */}
      {loading ? (
        <View style={{ marginTop: 16 }}><JobCardSkeleton /><JobCardSkeleton /></View>
      ) : jobs.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <EarningsIcon size={30} color={Colors.brand} />
          </View>
          <Text style={styles.emptyTitle}>No earnings yet</Text>
          <Text style={styles.emptySub}>Complete jobs to see your earnings history here.</Text>
        </View>
      ) : (
        <>
          <EarningsGroup title="Today"     items={today}    />
          <EarningsGroup title="This Week" items={thisWeek} />
          <EarningsGroup title="Earlier"   items={older}    />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F4' },

  hero: { paddingHorizontal: 20, paddingBottom: 24 },
  heroBack: { alignSelf: 'flex-start', marginBottom: 12, padding: 4 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  heroLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.2, marginBottom: 6 },
  heroTotal: { color: '#fff', fontSize: 48, fontWeight: '900', letterSpacing: -1 },
  heroGoldBadge: {
    backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, alignSelf: 'flex-start', marginTop: 8,
  },
  heroGoldBadgeText: { fontSize: 12, fontWeight: '800', color: Colors.brandDark },
  statsRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 16, padding: 14 },
  statWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { color: '#fff', fontSize: 15, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 9, marginTop: 3, textAlign: 'center', letterSpacing: 0.2 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 4, height: 30 },

  sectionPad: { paddingHorizontal: 16, marginTop: 16 },

  // Wallet card
  walletCard: {
    backgroundColor: Colors.systemBackground, borderRadius: 18, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  walletRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  walletCol: { flex: 1, alignItems: 'center' },
  walletColLabel: { fontSize: 10, fontWeight: '700', color: Colors.secondaryLabel, letterSpacing: 1, marginBottom: 6 },
  walletAvailable: { fontSize: 26, fontWeight: '900', color: Colors.trustGreen, letterSpacing: -0.5 },
  walletPending: { fontSize: 26, fontWeight: '900', color: Colors.brand, letterSpacing: -0.5 },
  walletColSub: { fontSize: 10, color: Colors.tertiaryLabel, marginTop: 3 },
  walletVDivider: { width: 1, height: 48, backgroundColor: Colors.separator },
  withdrawBtn: {
    backgroundColor: Colors.trustGreen, borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  withdrawBtnDisabled: { backgroundColor: Colors.systemGray4 },
  withdrawBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  walletNote: { fontSize: 11, color: Colors.tertiaryLabel, textAlign: 'center', marginTop: 10, lineHeight: 16 },

  // Payout method row
  payoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.separator,
  },
  payoutRowIcon: { },
  payoutRowLabel: { fontSize: 13, fontWeight: '700', color: Colors.label },
  payoutRowValue: { fontSize: 12, color: Colors.secondaryLabel, marginTop: 2 },
  payoutRowChevron: { fontSize: 14, fontWeight: '700', color: Colors.trustGreen },

  // Payout modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: Colors.systemBackground, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.label, marginBottom: 6 },
  modalSub: { fontSize: 13, color: Colors.secondaryLabel, lineHeight: 19, marginBottom: 16 },
  modalInput: {
    borderWidth: 1, borderColor: Colors.separator, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 16, color: Colors.label, backgroundColor: '#F1F5F4',
  },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: Colors.systemGray5 },
  modalBtnCancelText: { fontSize: 15, fontWeight: '700', color: Colors.label },
  modalBtnSave: { backgroundColor: Colors.trustGreen },
  modalBtnSaveText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // This month goal card
  monthCard: {
    backgroundColor: Colors.systemBackground, borderRadius: 18, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  monthTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  monthLabel: { fontSize: 11, fontWeight: '700', color: Colors.secondaryLabel, letterSpacing: 0.8, marginBottom: 4 },
  monthAmount: { fontSize: 32, fontWeight: '900', color: Colors.label, letterSpacing: -0.5 },
  monthRight: { alignItems: 'flex-end' },
  monthGoalLabel: { fontSize: 12, color: Colors.secondaryLabel, marginBottom: 4 },
  monthPct: { fontSize: 22, fontWeight: '900' },
  progressBarBg: {
    height: 8, backgroundColor: Colors.systemGray5, borderRadius: 4, overflow: 'hidden', marginBottom: 10,
  },
  progressBarFill: {
    height: '100%', backgroundColor: Colors.brand, borderRadius: 4,
  },
  monthSub: { fontSize: 12, color: Colors.secondaryLabel },

  breakdownRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16 },
  breakdownCard: {
    flex: 1, backgroundColor: Colors.systemBackground, borderRadius: 14, padding: 14, alignItems: 'center',
    borderTopWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  breakdownAmount: { fontSize: 20, fontWeight: '800' },
  breakdownLabel: { fontSize: 11, color: Colors.secondaryLabel, marginTop: 3 },

  // Bar chart
  chartSectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.secondaryLabel, letterSpacing: 0.8, marginBottom: 10,
  },
  chartCard: {
    backgroundColor: Colors.systemBackground, borderRadius: 18, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  chartCol: { flex: 1, alignItems: 'center' },
  chartBarValue: { fontSize: 9, fontWeight: '700', color: Colors.brand, marginBottom: 3 },
  chartBarContainer: { height: 80, justifyContent: 'flex-end', alignItems: 'center', width: '100%' },
  chartBar: { width: '70%', borderRadius: 4 },
  chartDayLabel: { fontSize: 11, color: Colors.secondaryLabel, marginTop: 6, fontWeight: '600' },

  // Tax note
  taxNote: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  taxNoteIcon: { },
  taxNoteTitle: { fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  taxNoteSub: { fontSize: 12, color: '#78350F', lineHeight: 18 },

  group: { marginHorizontal: 16, marginTop: 20 },
  groupTitle: { fontSize: 13, fontWeight: '700', color: Colors.secondaryLabel, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  jobRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.systemBackground, borderRadius: 16, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    borderWidth: 1, borderColor: Colors.separator,
  },
  jobIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#FDE68A',
  },
  jobIcon: { fontSize: 22 },
  jobService: { fontSize: 14, fontWeight: '700', color: Colors.label },
  jobMeta: { fontSize: 12, color: Colors.secondaryLabel, marginTop: 3 },
  jobEarningWrap: { alignItems: 'flex-end' },
  jobEarnings: { fontSize: 18, fontWeight: '900', color: Colors.trustGreen },
  jobHourRate: { fontSize: 11, color: Colors.tertiaryLabel, marginTop: 2 },
  groupTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, marginTop: 4,
    backgroundColor: Colors.systemGray6, borderRadius: 12,
  },
  groupTotalLabel: { fontSize: 13, color: Colors.secondaryLabel, fontWeight: '600' },
  groupTotalValue: { fontSize: 16, fontWeight: '900', color: Colors.label },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.systemGray6, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyIconText: { fontSize: 36 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.label, marginBottom: 8 },
  emptySub: { fontSize: 14, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 21 },
});
