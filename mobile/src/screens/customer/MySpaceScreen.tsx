/**
 * My Space — the AI skin-scan home. Latest result, product recommendations,
 * a "book an artist" hand-off, a progress timeline across past scans, and a
 * daily reminder toggle. Analysis is free/on-device-style (pixel color math
 * + a short quiz — see src/utils/skinAnalysis.js on the backend), never a
 * paid vision API call — see SkinScanCamera.tsx for the capture flow itself.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../../utils/colors';
import { ScanFaceIcon } from '../../components/TabIcons';
import { PencilIcon, DownloadIcon } from '../../components/CareIcons';
import { SkinScanCamera } from '../../components/SkinScanCamera';
import { NearbyArtistRow } from '../../components/NearbyArtistRow';
import { apiGetLatestSkinScan, apiGetSkinScans, apiGetSkinProfiles, apiRenameSkinProfile, apiSetSkinGoal, apiClearSkinGoal, SkinScan, SkinProfile } from '../../api/client';
import { Storage } from '../../utils/storage';
import { scheduleDailyReminder, cancelDailyReminder } from '../../utils/notifications';
import { formatRelativeTime } from '../../utils/dateTime';
import { tapLight } from '../../utils/haptics';
import { exportSkinHistory } from '../../utils/exportSkinHistory';

const TONE_LABELS: Record<string, string> = { FAIR: 'Fair', LIGHT: 'Light', MEDIUM: 'Medium', TAN: 'Tan', DEEP: 'Deep', RICH: 'Rich' };
const TONE_SWATCH: Record<string, string> = { FAIR: '#F5D5C0', LIGHT: '#E8B894', MEDIUM: '#C68863', TAN: '#A9673F', DEEP: '#7A4B32', RICH: '#4A2C20' };
const TYPE_LABELS: Record<string, string> = { DRY: 'Dry', OILY: 'Oily', COMBINATION: 'Combination', NORMAL: 'Normal', SENSITIVE: 'Sensitive' };
// Reminder fires at 8pm local — evening is when someone's actually near a
// mirror/bathroom counter, not mid-workday.
const REMINDER_HOUR = 20;

export function MySpaceScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [latest, setLatest] = useState<SkinScan | null>(null);
  const [history, setHistory] = useState<SkinScan[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [reminderOn, setReminderOn] = useState(false);

  // Almost every account has exactly one profile (one person); a shared
  // device (family sharing a phone) can have more — see SkinProfile on the
  // backend. Defaults to whoever scanned most recently.
  const [profiles, setProfiles] = useState<SkinProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [newProfileBanner, setNewProfileBanner] = useState(false);
  const [renaming, setRenaming] = useState<SkinProfile | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const activeProfile = profiles.find(p => p.id === activeProfileId) || null;
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [goalDays, setGoalDays] = useState(7);
  const [goalSaving, setGoalSaving] = useState(false);

  const loadScansFor = useCallback(async (profileId: string | null) => {
    try {
      const [{ scan }, { scans }] = await Promise.all([
        apiGetLatestSkinScan(profileId || undefined),
        apiGetSkinScans(profileId || undefined),
      ]);
      setLatest(scan);
      setHistory(scans);
    } catch (err) {
      console.error('Failed to load My Space scans', err);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const { profiles: fetched } = await apiGetSkinProfiles();
      setProfiles(fetched);
      // apiGetSkinProfiles already sorts most-recently-scanned first.
      const first = fetched[0]?.id ?? null;
      setActiveProfileId(first);
      await loadScansFor(first);
    } catch (err) {
      console.error('Failed to load My Space', err);
    }
    setLoading(false);
  }, [loadScansFor]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { Storage.getSkinReminderEnabled().then(setReminderOn); }, []);

  // My Space opens straight into the camera — it's a scan-first screen, not
  // a dashboard you scan from. Skipped exactly once right after a scan
  // completes: without that, backing out of the result screen you just got
  // would throw you straight back into another camera, which reads as
  // broken rather than "camera-first."
  const skipNextAutoOpen = useRef(false);
  useFocusEffect(useCallback(() => {
    if (skipNextAutoOpen.current) { skipNextAutoOpen.current = false; return; }
    setCameraOpen(true);
  }, []));

  function selectProfile(id: string) {
    if (id === activeProfileId) return;
    tapLight();
    setActiveProfileId(id);
    setLoading(true);
    loadScansFor(id).then(() => setLoading(false));
  }

  function openRename(p: SkinProfile) {
    tapLight();
    setRenaming(p);
    setRenameDraft(p.label);
  }

  async function saveRename() {
    if (!renaming || !renameDraft.trim()) return;
    setRenameSaving(true);
    try {
      await apiRenameSkinProfile(renaming.id, renameDraft.trim());
      setProfiles(prev => prev.map(p => (p.id === renaming.id ? { ...p, label: renameDraft.trim() } : p)));
      setRenaming(null);
    } catch (err: any) {
      console.error('Failed to rename profile', err);
    }
    setRenameSaving(false);
  }

  function openGoalModal() {
    tapLight();
    setGoalDraft(activeProfile?.goalText || '');
    setGoalDays(7);
    setGoalModalOpen(true);
  }

  async function saveGoal() {
    if (!activeProfileId || !goalDraft.trim()) return;
    setGoalSaving(true);
    try {
      const { profile } = await apiSetSkinGoal(activeProfileId, goalDraft.trim(), goalDays);
      setProfiles(prev => prev.map(p => (p.id === activeProfileId ? { ...p, ...profile } : p)));
      setGoalModalOpen(false);
      // Reminder text references the goal by name — if it's already
      // scheduled, re-point it at the new/updated goal immediately instead
      // of waiting for a toggle off/on to notice.
      if (reminderOn) await scheduleDailyReminder(REMINDER_HOUR, 0, `Working on "${profile.goalText}" — scan today to track it.`);
    } catch (err: any) {
      console.error('Failed to set goal', err);
    }
    setGoalSaving(false);
  }

  async function clearGoal() {
    if (!activeProfileId) return;
    tapLight();
    setGoalModalOpen(false);
    try {
      await apiClearSkinGoal(activeProfileId);
      setProfiles(prev => prev.map(p => (p.id === activeProfileId ? { ...p, goalText: null, goalSetAt: null, goalCheckInAt: null } : p)));
      if (reminderOn) await scheduleDailyReminder(REMINDER_HOUR, 0);
    } catch (err: any) {
      console.error('Failed to clear goal', err);
    }
  }

  function reminderBody() {
    // References the active goal by name when there is one, instead of a
    // generic nudge — the reminder and the goal are the same feature from
    // the user's side ("check back in"), so the notification should say so.
    return activeProfile?.goalText
      ? `Working on "${activeProfile.goalText}" — scan today to track it.`
      : undefined;
  }

  async function toggleReminder(next: boolean) {
    tapLight();
    setReminderOn(next);
    await Storage.saveSkinReminderEnabled(next);
    if (next) await scheduleDailyReminder(REMINDER_HOUR, 0, reminderBody());
    else await cancelDailyReminder();
  }

  async function onScanComplete(scan: SkinScan, _bookCategory: string, isNewProfile?: boolean) {
    setCameraOpen(false);
    if (isNewProfile) {
      // The face-match on the backend decided this photo doesn't match
      // anyone previously scanned on this account — a family member's first
      // time, most likely — and started a fresh profile for them.
      setNewProfileBanner(true);
      setTimeout(() => setNewProfileBanner(false), 6000);
      try {
        const { profiles: fresh } = await apiGetSkinProfiles();
        setProfiles(fresh);
      } catch (err) {
        console.error('Failed to refresh profiles', err);
      }
    }
    setActiveProfileId(scan.profileId);
    setLatest(scan);
    setHistory(prev => (scan.profileId === activeProfileId ? [scan, ...prev] : [scan]));
    skipNextAutoOpen.current = true;
    nav.navigate('SkinScanResult', { scan, justScanned: true });
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.systemGroupedBackground }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 130 }}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MY SPACE</Text>
          <Text style={styles.title}>Your skin, over time</Text>
        </View>

        {/* Only shows once a second person has actually scanned on this
            account — the overwhelming majority of accounts never see this
            at all. */}
        {profiles.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileRow}>
            {profiles.map(p => {
              const active = p.id === activeProfileId;
              return (
                <Pressable
                  key={p.id}
                  style={[styles.profileChip, active && styles.profileChipActive]}
                  onPress={() => selectProfile(p.id)}
                  onLongPress={() => openRename(p)}
                >
                  {!!p.latestPhotoUrl && <Image source={{ uri: p.latestPhotoUrl }} style={styles.profileChipAvatar} contentFit="cover" />}
                  <Text style={[styles.profileChipText, active && styles.profileChipTextActive]} numberOfLines={1}>{p.label}</Text>
                  {active && (
                    <Pressable onPress={() => openRename(p)} hitSlop={8}>
                      <PencilIcon size={11} color="#fff" />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {newProfileBanner && (
          <View style={styles.newProfileBanner}>
            <ScanFaceIcon size={15} color={Colors.brand} />
            <Text style={styles.newProfileBannerText}>Didn't recognize that face — started a fresh profile so their history stays separate from yours.</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={Colors.brand} />
        ) : !latest ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}><ScanFaceIcon size={30} color={Colors.brand} /></View>
            <Text style={styles.emptyTitle}>Scan your skin</Text>
            <Text style={styles.emptySub}>
              A quick photo and a few questions — get your skin tone, type, and product picks. Free, and it stays here to track your progress over time.
            </Text>
            <Pressable style={styles.scanBtn} onPress={() => { tapLight(); setCameraOpen(true); }}>
              <Text style={styles.scanBtnText}>Scan now ✨</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <LinearGradient
              colors={[Colors.brandAccent, Colors.brand, Colors.brandDeep]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroGlow} pointerEvents="none" />
              <View style={styles.heroTop}>
                <Image source={{ uri: latest.photoUrl }} style={styles.heroPhoto} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroLabel}>Latest scan · {formatRelativeTime(latest.createdAt)}</Text>
                  <View style={styles.heroResultRow}>
                    <View style={[styles.toneSwatch, { backgroundColor: TONE_SWATCH[latest.skinTone] }]} />
                    <Text style={styles.heroResult}>{TONE_LABELS[latest.skinTone]} tone · {TYPE_LABELS[latest.skinType]} skin</Text>
                  </View>
                </View>
              </View>
              {/* The AI's own written line — same reason SkinScanResultScreen
                  leads with it: this is what reads as a real reading of THIS
                  photo, not a static template. */}
              {!!latest.summary && <Text style={styles.heroSummary}>“{latest.summary}”</Text>}
              <Pressable style={styles.rescanBtn} onPress={() => { tapLight(); setCameraOpen(true); }}>
                <Text style={styles.rescanBtnText}>Rescan</Text>
              </Pressable>
            </LinearGradient>

            {!!latest.progressNote && (
              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <ScanFaceIcon size={14} color="#fff" />
                  <Text style={styles.progressLabel}>YOUR PROGRESS</Text>
                </View>
                <Text style={styles.progressText}>{latest.progressNote}</Text>
              </View>
            )}

            {/* A self-set target with a real check-in date — turns the scan
                history from a passive timeline into an actual plan
                ("reduce redness, check back in a week"). */}
            {activeProfile?.goalText ? (
              <Pressable style={styles.goalCard} onPress={openGoalModal}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalLabel}>YOUR GOAL</Text>
                  <Text style={styles.goalEdit}>Edit</Text>
                </View>
                <Text style={styles.goalText}>{activeProfile.goalText}</Text>
                {(() => {
                  const daysLeft = activeProfile.goalCheckInAt
                    ? Math.ceil((new Date(activeProfile.goalCheckInAt).getTime() - Date.now()) / 86_400_000)
                    : null;
                  if (daysLeft === null) return null;
                  return (
                    <Text style={styles.goalCountdown}>
                      {daysLeft > 1 ? `Check back in ${daysLeft} days`
                        : daysLeft === 1 ? 'Check back tomorrow'
                        : "Check-in day — rescan to see how it's going"}
                    </Text>
                  );
                })()}
              </Pressable>
            ) : (
              <Pressable style={styles.goalPrompt} onPress={openGoalModal}>
                <Text style={styles.goalPromptText}>Set a goal — pick a focus and we'll tell you when to check back in</Text>
                <Text style={styles.goalPromptCta}>Set goal ›</Text>
              </Pressable>
            )}

            {latest.concerns.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {latest.concerns.map(c => (
                  <View key={c} style={styles.concernChip}><Text style={styles.concernChipText}>{c}</Text></View>
                ))}
              </ScrollView>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recommended for you</Text>
              {latest.recommendations.map((r, i) => (
                <View key={i} style={styles.recCard}>
                  <View style={styles.recCategoryPill}><Text style={styles.recCategoryText}>{r.category}</Text></View>
                  <Text style={styles.recTitle}>{r.title}</Text>
                  <Text style={styles.recNote}>{r.note}</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Want a professional take?</Text>
              <NearbyArtistRow category="Facials & Skin" serviceType="Facial" />
            </View>

            {history.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your progress</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
                  {history.map(scan => (
                    <Pressable key={scan.id} style={styles.historyTile} onPress={() => { tapLight(); skipNextAutoOpen.current = true; nav.navigate('SkinScanResult', { scan }); }}>
                      <Image source={{ uri: scan.photoUrl }} style={styles.historyTileImg} contentFit="cover" />
                      <Text style={styles.historyTileDate}>{formatRelativeTime(scan.createdAt)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Real, exportable memory — every scan (photo, tone/type,
                zone notes, progress) lives here, not just the latest
                snapshot. A subtle text link at the very bottom of the
                screen went unnoticed; a real card, placed right after the
                history it's exporting, reads as the actual feature it is. */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your memory</Text>
              <Pressable
                style={styles.exportCard}
                onPress={() => {
                  tapLight();
                  const label = profiles.find(p => p.id === activeProfileId)?.label || 'You';
                  exportSkinHistory(label, history);
                }}
              >
                <View style={styles.exportCardIconWrap}><DownloadIcon size={18} color={Colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportCardTitle}>Export your history</Text>
                  <Text style={styles.exportCardSub}>
                    {history.length} scan{history.length === 1 ? '' : 's'} saved · download as JSON, share anywhere
                  </Text>
                </View>
                <Text style={styles.exportCardChevron}>›</Text>
              </Pressable>
            </View>

            <View style={styles.reminderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderTitle}>Daily check-in reminder</Text>
                <Text style={styles.reminderSub}>A gentle nudge to scan and track your progress</Text>
              </View>
              <Switch
                value={reminderOn}
                onValueChange={toggleReminder}
                trackColor={{ false: '#D1D5DB', true: Colors.brandAccent }}
                thumbColor={reminderOn ? Colors.brand : '#F4F4F5'}
              />
            </View>
          </>
        )}

        <Text style={styles.disclaimer}>
          My Space gives cosmetic guidance based on a photo and your answers — it's not a medical diagnosis. For any skin concern that worries you, see a dermatologist.
        </Text>
      </ScrollView>

      <SkinScanCamera visible={cameraOpen} onClose={() => setCameraOpen(false)} onComplete={onScanComplete} previousScan={latest} />

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={styles.renameBackdrop}>
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>Rename profile</Text>
            <TextInput
              style={styles.renameInput}
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="e.g. Mom, Priya…"
              placeholderTextColor={Colors.tertiaryLabel}
              maxLength={30}
              autoFocus
            />
            <View style={styles.renameActions}>
              <Pressable style={styles.renameCancelBtn} onPress={() => setRenaming(null)}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.renameSaveBtn} onPress={saveRename} disabled={renameSaving || !renameDraft.trim()}>
                {renameSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.renameSaveText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={goalModalOpen} transparent animationType="fade" onRequestClose={() => setGoalModalOpen(false)}>
        <View style={styles.renameBackdrop}>
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>Set a goal</Text>
            <TextInput
              style={styles.renameInput}
              value={goalDraft}
              onChangeText={setGoalDraft}
              placeholder="e.g. Reduce redness on my nose"
              placeholderTextColor={Colors.tertiaryLabel}
              maxLength={120}
              autoFocus
            />
            <Text style={styles.goalDaysLabel}>Check back in</Text>
            <View style={styles.goalDaysRow}>
              {[3, 7, 14, 30].map(d => (
                <Pressable
                  key={d}
                  style={[styles.goalDayChip, goalDays === d && styles.goalDayChipActive]}
                  onPress={() => { tapLight(); setGoalDays(d); }}
                >
                  <Text style={[styles.goalDayChipText, goalDays === d && styles.goalDayChipTextActive]}>{d} days</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.renameActions}>
              {activeProfile?.goalText ? (
                <Pressable style={styles.renameCancelBtn} onPress={clearGoal}>
                  <Text style={[styles.renameCancelText, { color: Colors.systemRed }]}>Remove</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.renameCancelBtn} onPress={() => setGoalModalOpen(false)}>
                  <Text style={styles.renameCancelText}>Cancel</Text>
                </Pressable>
              )}
              <Pressable style={styles.renameSaveBtn} onPress={saveGoal} disabled={goalSaving || !goalDraft.trim()}>
                {goalSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.renameSaveText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingBottom: 16 },
  eyebrow: { fontSize: 11, fontFamily: Fonts.semibold, color: Colors.brandDark, letterSpacing: 1.6 },
  title: { fontSize: 28, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -0.7, marginTop: 6 },

  profileRow: { gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
  profileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.separator,
  },
  profileChipActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  profileChipAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.brandLight },
  profileChipText: { fontSize: 12.5, fontFamily: Fonts.semibold, color: Colors.label, maxWidth: 90 },
  profileChipTextActive: { color: '#fff' },

  newProfileBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 14, padding: 13, borderRadius: 16,
    backgroundColor: Colors.brandLight, borderWidth: 1, borderColor: Colors.brandAccent,
  },
  newProfileBannerText: { flex: 1, fontSize: 12, fontFamily: Fonts.medium, color: Colors.brandDark, lineHeight: 17 },

  renameBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  renameCard: { width: '100%', backgroundColor: '#fff', borderRadius: 22, padding: 20 },
  renameTitle: { fontSize: 16, fontFamily: Fonts.semibold, color: Colors.label, marginBottom: 12 },
  renameInput: {
    borderWidth: 1, borderColor: Colors.separator, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: Fonts.regular, color: Colors.label,
  },
  renameActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  renameCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, backgroundColor: Colors.surfaceCream },
  renameCancelText: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  renameSaveBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, backgroundColor: Colors.brand },
  renameSaveText: { fontSize: 14, fontFamily: Fonts.semibold, color: '#fff' },

  empty: {
    alignItems: 'center', paddingVertical: 44, paddingHorizontal: 30, gap: 8,
    marginHorizontal: 20, borderRadius: 26,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
  },
  emptyIconWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyTitle: { fontSize: 17, fontFamily: Fonts.semibold, color: Colors.label },
  emptySub: { fontSize: 13.5, color: Colors.secondaryLabel, textAlign: 'center', lineHeight: 20, fontFamily: Fonts.regular, marginBottom: 6 },
  scanBtn: {
    backgroundColor: Colors.brand, borderRadius: 100, paddingHorizontal: 28, paddingVertical: 14,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 5,
  },
  scanBtnText: { color: '#fff', fontSize: 14.5, fontFamily: Fonts.semibold },

  hero: {
    marginHorizontal: 20, marginBottom: 14, borderRadius: 28, padding: 18, overflow: 'hidden',
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 18, elevation: 7,
  },
  heroGlow: { position: 'absolute', top: -50, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.14)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroPhoto: { width: 58, height: 58, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  heroLabel: { fontSize: 11.5, color: 'rgba(255,255,255,0.8)', fontFamily: Fonts.medium },
  heroResultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  toneSwatch: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' },
  heroResult: { fontSize: 15.5, color: '#fff', fontFamily: Fonts.display },
  heroSummary: {
    fontSize: 15, fontFamily: Fonts.displayItalic, color: 'rgba(255,255,255,0.92)',
    lineHeight: 21, marginTop: 14,
  },
  rescanBtn: {
    alignSelf: 'flex-start', marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 100,
    paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  rescanBtnText: { color: '#fff', fontSize: 12.5, fontFamily: Fonts.semibold },

  progressCard: {
    marginHorizontal: 20, marginBottom: 14, borderRadius: 20, padding: 16,
    backgroundColor: Colors.brandDeep,
  },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  progressLabel: { fontSize: 10.5, fontFamily: Fonts.bold, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  progressText: { fontSize: 13.5, fontFamily: Fonts.medium, color: '#fff', lineHeight: 19 },

  goalCard: {
    marginHorizontal: 20, marginBottom: 14, borderRadius: 20, padding: 16,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.brandAccent,
  },
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  goalLabel: { fontSize: 10.5, fontFamily: Fonts.bold, color: Colors.brand, letterSpacing: 1 },
  goalEdit: { fontSize: 12, fontFamily: Fonts.semibold, color: Colors.tertiaryLabel },
  goalText: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label, lineHeight: 20 },
  goalCountdown: { fontSize: 12.5, fontFamily: Fonts.medium, color: Colors.secondaryLabel, marginTop: 6 },

  goalPrompt: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 20, marginBottom: 14, borderRadius: 20, padding: 16,
    backgroundColor: Colors.surfaceCream, borderWidth: 1, borderColor: Colors.separator, gap: 10,
  },
  goalPromptText: { flex: 1, fontSize: 12.5, fontFamily: Fonts.medium, color: Colors.secondaryLabel, lineHeight: 17 },
  goalPromptCta: { fontSize: 13, fontFamily: Fonts.semibold, color: Colors.brand },

  goalDaysLabel: { fontSize: 12, fontFamily: Fonts.semibold, color: Colors.secondaryLabel, marginTop: 16, marginBottom: 8 },
  goalDaysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goalDayChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 100,
    backgroundColor: Colors.surfaceCream, borderWidth: 1, borderColor: Colors.separator,
  },
  goalDayChipActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  goalDayChipText: { fontSize: 12.5, fontFamily: Fonts.medium, color: Colors.label },
  goalDayChipTextActive: { color: '#fff', fontFamily: Fonts.semibold },

  chipRow: { gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  concernChip: { backgroundColor: Colors.surfaceBlush, borderRadius: 100, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: Colors.brandAccent },
  concernChipText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.brandDark },

  section: { marginTop: 18, paddingHorizontal: 20 },
  sectionTitle: { fontSize: 15.5, fontFamily: Fonts.display, color: Colors.label, marginBottom: 10 },
  recCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.separator,
  },
  recCategoryPill: { alignSelf: 'flex-start', backgroundColor: Colors.brandLight, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 6 },
  recCategoryText: { fontSize: 10.5, fontFamily: Fonts.bold, color: Colors.brandDark, letterSpacing: 0.3, textTransform: 'uppercase' },
  recTitle: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label },
  recNote: { fontSize: 12.5, fontFamily: Fonts.regular, color: Colors.secondaryLabel, marginTop: 3, lineHeight: 18 },

  historyTile: { width: 90, gap: 6 },
  historyTileImg: { width: 90, height: 110, borderRadius: 16, backgroundColor: Colors.brandLight },
  historyTileDate: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.tertiaryLabel, textAlign: 'center' },

  reminderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginTop: 22, padding: 16, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
  },
  reminderTitle: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.label },
  reminderSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.secondaryLabel, marginTop: 2 },

  exportCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: Colors.separator,
  },
  exportCardIconWrap: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  exportCardTitle: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label },
  exportCardSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.secondaryLabel, marginTop: 2 },
  exportCardChevron: { fontSize: 20, color: Colors.tertiaryLabel, fontFamily: Fonts.regular },

  disclaimer: {
    fontSize: 11, fontFamily: Fonts.regular, color: Colors.tertiaryLabel,
    textAlign: 'center', lineHeight: 16, marginTop: 26, marginHorizontal: 32,
  },
});
