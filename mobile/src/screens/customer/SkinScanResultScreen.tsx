/**
 * Full detail view for one skin scan — reached right after a new scan
 * completes (`justScanned`) or by tapping a past entry in My Space's
 * progress timeline. Redesigned around what actually makes this feel like a
 * real AI reading, not a static report: the model's own written summary
 * leads (Fraunces italic — this app's existing treatment for warm,
 * editorial moments, e.g. HomeScreen's hero line), and a distinct callout
 * surfaces progressNote when Gemini had a previous scan to compare against.
 *
 * Concern navigation (SkinConcernTabs) replaces the old point-marker +
 * tooltip-callout system entirely — Summary plus one tab per concern
 * (Redness/Texture/Shine/Fine Lines), each showing a full-region heatmap
 * overlay instead of a coordinate marker. See SkinConcernTabs.tsx's own
 * header for why that's a structural fix, not a styling one, for the old
 * "marker lands on a hat" bug class. A scan from before this existed
 * (`scan.heatmaps` null) shows no tabs at all — Summary only — rather than
 * four tabs that can only ever say "not assessed."
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts } from '../../utils/colors';
import { apiDeleteSkinScan, apiDeepScan, apiGetScanAngles, SkinScan } from '../../api/client';
import { tapLight, confirmAction } from '../../utils/haptics';
import { NearbyArtistRow } from '../../components/NearbyArtistRow';
import { ConcernHeatmapOverlay, ConcernTabBar, ConcernDetailCard, CONCERN_ORDER, ConcernTab } from '../../components/SkinConcernTabs';
import { resolveZoneRect, ZoneKey, FaceBox } from '../../utils/skinZones';
import { ShareCardModal, ShareCardSpec } from '../../components/ShareCardModal';
import { SkinScanCamera } from '../../components/SkinScanCamera';
import { SparkleIcon } from '../../components/BeautyIcons';
import { CloseCircleIcon, SearchIcon } from '../../components/TabIcons';

// Full-screen pinch-to-zoom viewer — "which pore/line is this actually
// talking about" is exactly the kind of thing worth zooming into, and the
// main result photo (sized to fit the layout, with a heatmap overlay
// stacked on top) was never built to inspect at full detail. ScrollView's own
// native zoom (minimumZoomScale/maximumZoomScale) rather than a gesture
// library — no new dependency, and it's the same pinch-to-zoom mechanism
// iOS/Android photo viewers use natively. contentContainerStyle sizes the
// image at exactly its real aspect ratio (passed in, not re-measured) so
// zoom math has real dimensions to work from, not a percentage.
function ZoomablePhotoModal({ visible, photoUrl, aspect, onClose, onShare }: {
  visible: boolean; photoUrl: string; aspect: number; onClose: () => void; onShare: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  // Fit the full photo on screen at 1x — width-constrained or
  // height-constrained, whichever the photo's own aspect ratio needs, so
  // there's never a dead gray bar AND the image is never pre-cropped
  // before the user even starts zooming in.
  const fitsByWidth = winW / aspect <= winH;
  const baseWidth = fitsByWidth ? winW : winH * aspect;
  const baseHeight = fitsByWidth ? winW / aspect : winH;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.zoomRoot}>
        <ScrollView
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{ width: winW, height: winH, alignItems: 'center', justifyContent: 'center' }}
          minimumZoomScale={1}
          maximumZoomScale={4}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          centerContent
        >
          <Image source={{ uri: photoUrl }} style={{ width: baseWidth, height: baseHeight }} contentFit="contain" />
        </ScrollView>
        <Pressable style={[styles.zoomCloseBtn, { top: insets.top + 12 }]} onPress={onClose} hitSlop={10}>
          <CloseCircleIcon size={30} color="rgba(255,255,255,0.85)" />
        </Pressable>
        <Pressable style={[styles.zoomShareBtn, { top: insets.top + 12 }]} onPress={onShare} hitSlop={10}>
          <Text style={styles.zoomShareBtnText}>↗ Share</Text>
        </Pressable>
        <Text style={[styles.zoomHint, { bottom: insets.bottom + 16 }]} pointerEvents="none">Pinch to zoom in on any area</Text>
      </View>
    </Modal>
  );
}

// Honest, specific reason copy for why this scan's heatmaps are an
// estimate rather than a real Perfect Corp read — surfaced once at the top
// of the Summary tab (see the ESTIMATED pill on each concern tab for the
// per-concern reminder). 'not_configured' covers both "vendor not set up
// yet" and any scan from before this integration existed.
const ESTIMATED_REASON_COPY: Record<string, string> = {
  not_configured: "This reading uses our free estimate model, not the full AI Skin Diagnostic — still useful, but less precise.",
  network_error: "We couldn't reach our live analysis service for this scan, so this is an estimated read. Try a new scan when you're back online for the full analysis.",
  timeout: 'The live analysis service took too long to respond, so this is an estimated read for this scan.',
  quota_exceeded: "We've hit our live analysis limit for now, so this is an estimated read. Full analysis will resume shortly.",
  server_error: 'The live analysis service had an issue, so this is an estimated read for this scan.',
};

const TONE_LABELS: Record<string, string> = { FAIR: 'Fair', LIGHT: 'Light', MEDIUM: 'Medium', TAN: 'Tan', DEEP: 'Deep', RICH: 'Rich' };
const TONE_SWATCH: Record<string, string> = { FAIR: '#F5D5C0', LIGHT: '#E8B894', MEDIUM: '#C68863', TAN: '#A9673F', DEEP: '#7A4B32', RICH: '#4A2C20' };
const TYPE_LABELS: Record<string, string> = { DRY: 'Dry', OILY: 'Oily', COMBINATION: 'Combination', NORMAL: 'Normal', SENSITIVE: 'Sensitive' };
const HYDRATION_LABELS: Record<string, string> = { LOW: 'Low', MODERATE: 'Moderate', HIGH: 'High' };

// One row in the Summary tab's concern list — icon (severity band color +
// check/exclamation/dash glyph) + name + one-line verdict, tapping jumps to
// that concern's own tab. A concern this scan has no data for (heatmaps
// missing that key) still gets a row — "not assessed," not an omission —
// so the list always covers the same concerns regardless of what any one
// photo happened to show.
function ConcernSummaryRow({ label, verdict, band, onPress }: { label: string; verdict: string; band: 'clear' | 'mild' | 'moderate' | 'notable' | 'unassessed'; onPress: () => void }) {
  const color = band === 'clear' ? Colors.systemGreen : band === 'unassessed' ? Colors.tertiaryLabel : band === 'notable' ? Colors.systemRed : band === 'moderate' ? Colors.systemOrange : Colors.brand;
  const glyph = band === 'clear' ? '✓' : band === 'unassessed' ? '—' : '!';
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <View style={concernRowStyles.row}>
        <View style={[concernRowStyles.icon, { backgroundColor: color }]}>
          <Text style={concernRowStyles.iconText}>{glyph}</Text>
        </View>
        <View style={concernRowStyles.body}>
          <Text style={concernRowStyles.label}>{label}</Text>
          <Text style={concernRowStyles.verdict} numberOfLines={1}>{verdict}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const concernRowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: Colors.separatorSoft },
  icon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#fff', fontSize: 12, fontFamily: Fonts.bold },
  body: { flex: 1 },
  label: { fontSize: 11, fontFamily: Fonts.bold, color: Colors.brandDark, letterSpacing: 0.5, textTransform: 'uppercase' },
  verdict: { fontSize: 13.5, fontFamily: Fonts.regular, color: Colors.label, marginTop: 1 },
});

export function SkinScanResultScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  // Real state (not a plain destructure of route.params) specifically so a
  // successful Deep Scan can update what's on screen — the whole point of
  // Deep Scan is seeing the real result replace the estimated one without
  // leaving this screen or re-navigating.
  const [scan, setScan] = useState<SkinScan>(route.params.scan);
  const justScanned: boolean = !!route.params.justScanned;
  const [deleting, setDeleting] = useState(false);
  const [deepScanning, setDeepScanning] = useState(false);
  // Multi-angle scans (see schema.prisma's SkinScan.parentScanId): every
  // scan in this session, oldest first — just [scan] itself for an
  // ordinary single-photo scan, which is also the initial value so the
  // gallery has something correct to render before the real fetch below
  // resolves (never an empty flash). `angleCamera` is a SEPARATE, local
  // <SkinScanCamera> instance just for capturing an additional angle —
  // deliberately not routed through My Space's own camera-reopen
  // mechanism (that's for "start an unrelated new scan," not "add a
  // second photo to THIS scan"), so it never disturbs My Space's own
  // latest/history state.
  const [angles, setAngles] = useState<SkinScan[]>([route.params.scan]);
  const [angleCameraOpen, setAngleCameraOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiGetScanAngles(route.params.scan.id)
      .then(({ angles: fetched }) => { if (!cancelled && fetched.length > 0) setAngles(fetched); })
      .catch((err) => console.error('[SkinScanResultScreen] failed to load scan angles', err));
    return () => { cancelled = true; };
  }, [route.params.scan.id]);
  const [shareCard, setShareCard] = useState<ShareCardSpec | null>(null);
  // Which tab is showing — 'summary' or one concern. Lifted to screen level
  // (not owned inside a tab component) so the photo overlay (inside
  // photoWrap) and the tab bar + detail card (in the body below) all read
  // the same selection from one place.
  const [activeTab, setActiveTab] = useState<ConcernTab>('summary');
  // Bug fix (real device report, 2026-08-30): the ScrollView had no ref and
  // nothing reset its scroll position on tab change — the WHOLE point of a
  // concern tab is the heatmap overlay on the photo at the top, but if the
  // user had scrolled down at all (e.g. reading one concern's tips, then
  // tapping the next tab pill — which stays at whatever scroll position
  // it's currently rendered at, since it isn't pinned), every subsequent
  // tab inherited that same scroll offset and showed neck/collar instead
  // of the face. Not a crop/frame bug — the photo and overlay were never
  // wrong, just scrolled out of view. selectTab (below) is now the ONLY
  // way activeTab changes, so this can't be reintroduced by a future call
  // site forgetting to scroll back up.
  const scrollRef = useRef<ScrollView>(null);
  // Tap-to-highlight: which zone (e.g. 'forehead') is currently spotlighted
  // on the active concern's overlay — null means show the full, undimmed
  // overlay (the default). Cleared on every tab switch since a zone
  // belongs to exactly one concern's own zoneBreakdown; carrying it across
  // tabs would either spotlight the wrong region or silently do nothing.
  const [highlightedZone, setHighlightedZone] = useState<string | null>(null);
  function selectTab(tab: ConcernTab) {
    tapLight();
    setActiveTab(tab);
    setHighlightedZone(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }
  // Tapping the already-highlighted zone's chip again clears it (back to
  // the full overlay) — a toggle, not a one-way selection.
  function selectZone(zone: string) {
    tapLight();
    setHighlightedZone((prev) => (prev === zone ? null : zone));
  }
  // Switches which angle's photo/heatmaps this screen is showing — the
  // tab/zone state resets since a different angle's heatmaps may not have
  // data for whichever concern/zone was selected on the previous one.
  function selectAngle(angleScan: SkinScan) {
    tapLight();
    setScan(angleScan);
    setActiveTab('summary');
    setHighlightedZone(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }
  function onAngleCaptured(newScan: SkinScan) {
    setAngles((prev) => [...prev, newScan]);
    selectAngle(newScan);
  }
  // Resolved to full-photo 0-1 fractions (same space as the heatmap
  // overlay) only when a zone is actually selected — real landmark
  // geometry when this scan has it (scan.zoneMarkers), the same
  // proportion-of-faceBox fallback used everywhere else otherwise. null
  // when unresolvable (no faceBox at all — a scan from before it existed),
  // which ConcernHeatmapOverlay treats as "no spotlight," not a crash.
  const highlightedZoneRect = highlightedZone
    ? resolveZoneRect(highlightedZone as ZoneKey, scan.zoneMarkers, scan.faceBox as FaceBox)
    : null;
  // The photo container's aspect ratio, measured from the actual loaded
  // image — NOT hardcoded. The backend stores at `resize(1080, 1350, {fit:
  // 'inside'})`, which only FITS WITHIN that box while preserving the
  // original photo's aspect ratio — it never crops, so the output is almost
  // never exactly 1080×1350 (that only happens if the source photo already
  // happened to be exactly 4:5). A hardcoded 1080/1350 here previously
  // forced the wrong box, and contentFit="cover" then cropped the real
  // image to fit it — which is exactly what desynced the old marker
  // system's fractions (correct relative to the real, uncropped stored
  // photo) from what was actually visible on screen. The heatmap overlays
  // are generated server-side at these exact same resize dimensions (see
  // skin.js), so this same real aspect ratio is what keeps them aligned
  // too. 1080/1350 is kept only as the pre-load guess so layout doesn't
  // jump from nothing to something.
  const [photoAspect, setPhotoAspect] = useState(1080 / 1350);
  const [zoomOpen, setZoomOpen] = useState(false);

  function goBack() {
    if (justScanned) nav.navigate('Home', { screen: 'MySpaceTab' });
    else if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Home');
  }

  // Reuses the exact navigation goBack() already takes for a justScanned
  // result (MySpaceScreen's own useFocusEffect auto-opens its camera on
  // focus unless skipNextAutoOpen was set right before navigating away —
  // see that screen's own comment). Deliberately NOT a second, independent
  // <SkinScanCamera> instance rendered locally here: MySpaceScreen keeps
  // latest/history as plain local state, only ever correctly updated
  // through ITS OWN onScanComplete (no refetch-on-focus exists) — a camera
  // opened from anywhere else would produce a new scan that screen never
  // learns about, reading as stale data the next time someone visits My
  // Space. Routing back through the same screen/mechanism that already
  // keeps that state in sync is what "without losing their place" actually
  // requires here, not staying pixel-identical on this exact screen.
  function retakeScan() {
    tapLight();
    nav.navigate('Home', { screen: 'MySpaceTab' });
  }

  function shareProgress() {
    tapLight();
    // Sharing FROM a specific concern tab (not Summary) with real heatmap
    // data attaches that concern's own overlay + verdict — this is what
    // makes the Heatmap card variant possible (real visual proof of "my
    // pores reading," not just the tone/type summary restated). Absent
    // entirely when sharing from Summary, or from a concern this scan
    // couldn't assess — ShareCardModal simply doesn't offer that variant
    // then, same as before this existed.
    const activeConcern = activeTab !== 'summary' ? scan.heatmaps?.[activeTab] : undefined;
    // The old share just sent the bare photo — this bakes the actual reading
    // (tone/type/hydration, the AI's own summary, the concerns) into a
    // designed card, so what lands in a DM/Story actually says something.
    setShareCard({
      photoUrl: scan.photoUrl,
      kicker: 'MY SPACE · AI SKIN READING',
      title: `${TONE_LABELS[scan.skinTone]} tone · ${TYPE_LABELS[scan.skinType]} skin`,
      subtitle: scan.summary || undefined,
      meta: scan.hydrationLevel ? `${HYDRATION_LABELS[scan.hydrationLevel]} hydration` : undefined,
      chips: scan.concerns,
      shareCaption: activeConcern
        ? `My Glow ${activeConcern.label} reading ✨`
        : `My Glow skin check-in: ${TONE_LABELS[scan.skinTone]} tone · ${TYPE_LABELS[scan.skinType]} skin ✨`,
      faceBox: scan.faceBox,
      heatmap: activeConcern
        ? { url: activeConcern.url, label: activeConcern.label, verdict: activeConcern.verdict, band: activeConcern.band }
        : undefined,
    });
  }

  function deleteScan() {
    confirmAction({
      title: 'Delete this scan?',
      message: 'This removes it from your progress history. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        setDeleting(true);
        try {
          await apiDeleteSkinScan(scan.id);
          goBack();
        } catch (err: any) {
          setDeleting(false);
          Alert.alert('Could not delete', err?.message || 'Please try again.');
        }
      },
    });
  }

  // Explicit, user-triggered — never auto-fired. A failure shows the real
  // reason (Deep Scan's own honest error, not a silent re-serve of the
  // estimated result the user already has) and leaves `scan` untouched;
  // success replaces it wholesale, so every concern tab (and the tap-to-
  // highlight system already wired to `scan.heatmaps`) picks up the real
  // Perfect Corp data with no separate code path of its own.
  async function runDeepScan() {
    tapLight();
    setDeepScanning(true);
    try {
      const { scan: updated } = await apiDeepScan(scan.id);
      setScan(updated);
      setActiveTab('summary');
    } catch (err: any) {
      Alert.alert('Deep Scan', err?.message || "Couldn't complete Deep Scan right now. Try again in a moment.");
    } finally {
      setDeepScanning(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Extra bottom padding (vs. the old +40) so the floating New Scan
          button below never sits on top of "Delete this scan"/the
          disclaimer text at full scroll. */}
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
        <View style={styles.photoWrap}>
          <Image
            source={{ uri: scan.photoUrl }}
            style={[styles.photo, { aspectRatio: photoAspect }]}
            contentFit="cover"
            onLoad={(e) => {
              const { width, height } = e.source;
              if (width && height) setPhotoAspect(width / height);
            }}
          />
          <ConcernHeatmapOverlay activeTab={activeTab} heatmaps={scan.heatmaps} highlightedZoneRect={highlightedZoneRect} />
          <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent']} style={styles.photoTopGradient} pointerEvents="none" />
          <Pressable style={[styles.floatBack, { top: insets.top + 8 }]} onPress={goBack} hitSlop={12}>
            <Text style={styles.floatBackText}>‹</Text>
          </Pressable>
          <Pressable style={[styles.floatShare, { top: insets.top + 8 }]} onPress={shareProgress} hitSlop={12}>
            <Text style={styles.floatShareText}>↗</Text>
          </Pressable>
          {/* Separate, dedicated button rather than making the whole photo
              tappable — overloading a tap gesture already reserved for
              nothing else on this photo (the old point-marker system used
              to own it; heatmap overlays are just a static image, not
              interactive) would make "open full-screen zoom" less
              discoverable, not more. */}
          <Pressable style={styles.floatZoom} onPress={() => { tapLight(); setZoomOpen(true); }} hitSlop={12}>
            <SearchIcon size={15} color="#fff" />
          </Pressable>
        </View>

        {/* Multi-angle gallery (see schema.prisma's SkinScan.parentScanId)
            — a thumbnail strip. Always rendered, even for a plain
            single-photo scan (just one thumbnail + the add tile then) —
            it's the one visible entry point for "add another angle" at
            all, so gating it behind already HAVING a second angle would
            make the feature undiscoverable. Tapping a thumbnail swaps the
            ENTIRE screen (photo, heatmaps, tabs) to that angle's own
            independent analysis — never a crop of the same data, each
            angle really is its own full scan. The trailing "+" tile opens
            a second, local, purpose-built camera instance (angleCamera)
            to add another — deliberately not My Space's own camera-reopen
            flow, which is for starting an unrelated new scan. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.angleRow}>
          {angles.map((a) => (
            <Pressable key={a.id} onPress={() => selectAngle(a)} style={[styles.angleThumbWrap, a.id === scan.id && styles.angleThumbWrapActive]}>
              <Image source={{ uri: a.photoUrl }} style={styles.angleThumb} contentFit="cover" />
            </Pressable>
          ))}
          <Pressable onPress={() => { tapLight(); setAngleCameraOpen(true); }} style={styles.angleAddTile}>
            <Text style={styles.angleAddTileText}>+</Text>
          </Pressable>
        </ScrollView>

        {/* Outside styles.body (which has its own horizontal padding) since
            ConcernTabBar carries its own — only rendered at all when this
            scan actually has heatmap data; a scan from before this existed
            gets no tab bar rather than one whose every tab can only ever
            say "not assessed." */}
        {!!scan.heatmaps && (
          <ConcernTabBar activeTab={activeTab} onSelect={selectTab} heatmaps={scan.heatmaps} />
        )}

        {activeTab !== 'summary' && (
          <ConcernDetailCard
            concernKey={activeTab}
            concern={scan.heatmaps?.[activeTab]}
            onViewRecommendations={() => selectTab('summary')}
            highlightedZone={highlightedZone}
            onSelectZone={selectZone}
          />
        )}

        <View style={[styles.body, activeTab !== 'summary' && styles.bodyNoTop]}>
          {activeTab === 'summary' && (
            <>
              {/* Only when this scan's heatmaps came from the free heuristic
                  fallback, not the real Perfect Corp API — an honest reason
                  why, not a silent quality downgrade. Absent entirely on a
                  real vendor-backed read (the common case once configured). */}
              {!!scan.heatmaps && scan.heatmapSource === 'estimated' && (
                <View style={styles.estimatedBanner}>
                  <Text style={styles.estimatedBannerText}>{ESTIMATED_REASON_COPY[scan.heatmapSourceReason || 'not_configured']}</Text>
                </View>
              )}

              {/* Deep Scan — the explicit, user-triggered upgrade to a real
                  Perfect Corp read on this exact photo (never fired
                  automatically). Only shown when this scan ISN'T already a
                  real vendor result — no point offering to upgrade
                  something that's already the real thing. */}
              {scan.heatmapSource !== 'perfectcorp' && (
                <Pressable style={styles.deepScanBtn} onPress={runDeepScan} disabled={deepScanning}>
                  {deepScanning ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <SparkleIcon size={14} color="#fff" />
                  )}
                  <Text style={styles.deepScanBtnText}>{deepScanning ? 'Running Deep Scan…' : 'Run Deep Scan (AI Skin Diagnostic)'}</Text>
                </Pressable>
              )}

              <View style={styles.eyebrowRow}>
                <SparkleIcon size={13} color={Colors.brand} />
                <Text style={styles.eyebrow}>{justScanned ? 'AI READING' : 'SCAN DETAILS'}</Text>
              </View>

              {/* The model's own written line — this is what makes it read
                  as a real AI looking at THIS photo, not a templated
                  report. */}
              {!!scan.summary && <Text style={styles.summary}>{scan.summary}</Text>}

              <View style={styles.resultRow}>
                <View style={[styles.toneSwatch, { backgroundColor: TONE_SWATCH[scan.skinTone] }]} />
                <Text style={styles.resultText}>{TONE_LABELS[scan.skinTone]} tone · {TYPE_LABELS[scan.skinType]} skin</Text>
                {!!scan.hydrationLevel && (
                  <View style={styles.hydrationPill}>
                    <Text style={styles.hydrationPillText}>{HYDRATION_LABELS[scan.hydrationLevel]} hydration</Text>
                  </View>
                )}
              </View>

              {/* Concern-by-concern read — the direct successor to the old
                  per-face-zone marker list, now organized the way the
                  heatmap tabs are (by concern, not by face zone), so
                  tapping a row here and tapping its tab do the same thing.
                  Worst-first: the most important issues surface immediately
                  instead of a fixed alphabetical/arbitrary order, using the
                  SAME severity scale every concern shares (see
                  SkinHeatmapConcern.severity's own comment on why that
                  comparison is valid). Unassessed concerns sort after every
                  assessed one, regardless of severity — "we don't know" is
                  never more urgent-looking than a real, if mild, finding.
                  Only shown when this scan actually has heatmap data — same
                  condition as the tab bar above. */}
              {!!scan.heatmaps && (
                <View style={styles.zoneSection}>
                  <Text style={styles.zoneHint}>Tap a row, or a tab above, to see it broken down</Text>
                  {[...CONCERN_ORDER]
                    .sort((a, b) => {
                      const ca = scan.heatmaps?.[a.key];
                      const cb = scan.heatmaps?.[b.key];
                      if (!ca && !cb) return 0;
                      if (!ca) return 1;
                      if (!cb) return -1;
                      return cb.severity - ca.severity;
                    })
                    .map(({ key, label }) => {
                      const c = scan.heatmaps?.[key];
                      return (
                        <ConcernSummaryRow
                          key={key}
                          label={label}
                          verdict={c?.verdict ?? 'Not assessed in this photo'}
                          band={c?.band ?? 'unassessed'}
                          onPress={() => selectTab(key)}
                        />
                      );
                    })}
                </View>
              )}

              {scan.concerns.length > 0 && (
                <View style={styles.chipRow}>
                  {scan.concerns.map(c => (
                    <View key={c} style={styles.concernChip}><Text style={styles.concernChipText}>{c}</Text></View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Progress callout — only when Gemini actually had a previous
              scan to compare against. Visually distinct (not just another
              text block) so it reads as the AI actively tracking them over
              time, the thing that makes repeat scanning worth doing. Summary-
              tab only, same as the content above it. */}
          {activeTab === 'summary' && !!scan.progressNote && (
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <SparkleIcon size={14} color="#fff" />
                <Text style={styles.progressLabel}>YOUR PROGRESS</Text>
              </View>
              <Text style={styles.progressText}>{scan.progressNote}</Text>
            </View>
          )}

          {/* Not happy with how this came out (bad lighting, something in
              the way, off-center)? A dedicated, clearly-labeled action —
              relying on the generic back caret to also mean "redo this"
              isn't discoverable, and the first time it happened to pop the
              camera back open unexpectedly would read as a bug, not a
              feature. Only for a JUST-completed scan — retaking something
              pulled up from history days later doesn't have the same
              "fix the capture" meaning, and the plain "scan again" entry
              point already covers that from My Space directly. */}
          {justScanned && (
            <Pressable style={styles.retakeBtn} onPress={retakeScan}>
              <Text style={styles.retakeBtnText}>Not happy with this scan? Retake it</Text>
            </Pressable>
          )}

          <Text style={styles.sectionTitle}>Recommended for you</Text>
          {scan.recommendations.map((r, i) => (
            <View key={i} style={styles.recCard}>
              <View style={styles.recCategoryPill}><Text style={styles.recCategoryText}>{r.category}</Text></View>
              <Text style={styles.recTitle}>{r.title}</Text>
              <Text style={styles.recNote}>{r.note}</Text>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Want a professional take?</Text>
          <NearbyArtistRow category="Facials & Skin" serviceType="Facial" />

          <Pressable style={styles.deleteBtn} onPress={deleteScan} disabled={deleting}>
            <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete this scan'}</Text>
          </Pressable>

          <Text style={styles.disclaimer}>
            Cosmetic guidance based on a photo and your answers — not a medical diagnosis. For any skin concern that worries you, see a dermatologist.
          </Text>
        </View>
      </ScrollView>

      {/* Real device bug report (2026-08-30): no way to start a fresh scan
          from a result reached via history — the old "Not happy with this
          scan? Retake it" button only ever appears for a just-completed
          scan (justScanned), and lives inside the scrollable content, so it
          isn't even visible unless scrolled to. This is a SEPARATE,
          ALWAYS-visible action, floating outside the ScrollView so it's
          reachable regardless of scroll position or which concern tab is
          active — reuses the exact same retakeScan() navigation (routes
          through MySpace's own camera-reopen mechanism, see that
          function's comment) since "start a new scan" and "retake this
          one" are the same navigation, just reached from a different
          prompt. */}
      <Pressable style={[styles.newScanFab, { bottom: insets.bottom + 16 }]} onPress={retakeScan}>
        <SparkleIcon size={14} color="#fff" />
        <Text style={styles.newScanFabText}>New Scan</Text>
      </Pressable>

      <ShareCardModal visible={!!shareCard} card={shareCard} onClose={() => setShareCard(null)} />
      <ZoomablePhotoModal
        visible={zoomOpen}
        photoUrl={scan.photoUrl}
        aspect={photoAspect}
        onClose={() => setZoomOpen(false)}
        onShare={() => { setZoomOpen(false); shareProgress(); }}
      />
      {/* Local, purpose-built instance for "add another angle" — parentScanId
          always points at angles[0] (the group's primary/first photo,
          angles being fetched oldest-first), regardless of which angle is
          currently being viewed, so every additional angle files under the
          SAME session rather than chaining off whichever one happened to
          be on screen when "+" was tapped. */}
      <SkinScanCamera
        visible={angleCameraOpen}
        onClose={() => setAngleCameraOpen(false)}
        onComplete={(newScan) => { setAngleCameraOpen(false); onAngleCaptured(newScan); }}
        previousScan={scan}
        parentScanId={angles[0]?.id ?? scan.id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.systemBackground },
  // overflow: 'hidden' — nothing rendered inside this wrapper (the heatmap
  // overlay included) can ever visually spill onto the text content below
  // the photo.
  photoWrap: { overflow: 'hidden' },
  // aspectRatio is overridden inline per-scan from the real loaded image
  // (see photoAspect) — this 1080/1350 is only the pre-load placeholder.
  // It used to be forced here unconditionally, on the assumption that the
  // backend's resize(1080, 1350, {fit:'inside'}) always outputs exactly
  // that box — it doesn't: `fit:'inside'` preserves the source photo's
  // real aspect ratio and only fits it within 1080×1350, so the output is
  // almost never exactly 4:5. With contentFit="cover" locked to the wrong
  // assumed ratio, the real photo got cropped to fit it, desyncing the old
  // marker system's fractions (correct relative to the real, uncropped
  // stored photo) from what was actually visible — markers reading as
  // scattered off-face. The heatmap overlays now generated server-side use
  // this exact same real aspect ratio for the same reason.
  photo: { width: '100%', backgroundColor: Colors.brandLight },
  photoTopGradient: { position: 'absolute', left: 0, right: 0, top: 0, height: 90 },
  floatBack: {
    position: 'absolute', left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  floatBackText: { color: '#fff', fontSize: 22, fontFamily: Fonts.semibold, marginTop: -2 },
  floatShare: {
    position: 'absolute', right: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  floatShareText: { color: '#fff', fontSize: 16, fontFamily: Fonts.semibold },
  floatZoom: {
    position: 'absolute', right: 12, bottom: 12,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },

  angleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 12 },
  angleThumbWrap: { borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  angleThumbWrapActive: { borderColor: Colors.brand },
  angleThumb: { width: 52, height: 64, borderRadius: 10, backgroundColor: Colors.surfaceCream },
  angleAddTile: {
    width: 52, height: 64, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.separatorSoft,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
  },
  angleAddTileText: { fontSize: 22, fontFamily: Fonts.medium, color: Colors.tertiaryLabel },

  zoomRoot: { flex: 1, backgroundColor: '#000' },
  zoomCloseBtn: {
    position: 'absolute', right: 14, zIndex: 2, borderRadius: 15, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  zoomShareBtn: {
    position: 'absolute', left: 14, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  zoomShareBtnText: { color: '#fff', fontSize: 13, fontFamily: Fonts.semibold },
  zoomHint: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: Fonts.medium,
  },

  body: { padding: 20, gap: 4 },
  bodyNoTop: { paddingTop: 8 },
  estimatedBanner: { backgroundColor: Colors.surfaceCream, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 },
  estimatedBannerText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.secondaryLabel, lineHeight: 17 },
  deepScanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.label, borderRadius: 100, paddingVertical: 13, marginBottom: 16,
  },
  deepScanBtnText: { color: '#fff', fontSize: 13.5, fontFamily: Fonts.semibold },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  eyebrow: { fontSize: 11, fontFamily: Fonts.semibold, color: Colors.brandDark, letterSpacing: 1.4 },

  summary: {
    fontSize: 21, fontFamily: Fonts.displayItalic, color: Colors.label,
    lineHeight: 28, marginBottom: 16,
  },

  resultRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  toneSwatch: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.separator },
  resultText: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  hydrationPill: { backgroundColor: Colors.surfaceCream, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  hydrationPillText: { fontSize: 11.5, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },

  zoneSection: {
    marginTop: 18, backgroundColor: Colors.surfaceCream, borderRadius: 16,
    paddingHorizontal: 14, paddingBottom: 4,
  },
  zoneHint: {
    fontSize: 10.5, fontFamily: Fonts.medium, color: Colors.tertiaryLabel,
    paddingTop: 12, paddingBottom: 6,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  concernChip: { backgroundColor: Colors.surfaceBlush, borderRadius: 100, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: Colors.brandAccent },
  concernChipText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.brandDark },

  progressCard: {
    marginTop: 20, borderRadius: 20, padding: 16,
    backgroundColor: Colors.brandDeep,
  },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  progressLabel: { fontSize: 10.5, fontFamily: Fonts.bold, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  progressText: { fontSize: 14, fontFamily: Fonts.medium, color: '#fff', lineHeight: 20 },

  retakeBtn: {
    marginTop: 20, alignSelf: 'center',
    borderRadius: 100, paddingHorizontal: 18, paddingVertical: 11,
    borderWidth: 1.5, borderColor: Colors.brandAccent,
  },
  retakeBtnText: { color: Colors.brandDark, fontSize: 13, fontFamily: Fonts.semibold },

  // Floats OUTSIDE the ScrollView (a sibling, not a child) so it stays
  // fixed on screen regardless of scroll position or which concern tab is
  // active — see the real-device bug fix note at its call site.
  newScanFab: {
    position: 'absolute', alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.brand, borderRadius: 100,
    paddingHorizontal: 20, paddingVertical: 13,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10,
    elevation: 6,
  },
  newScanFabText: { color: '#fff', fontSize: 14, fontFamily: Fonts.semibold },

  sectionTitle: { fontSize: 15.5, fontFamily: Fonts.display, color: Colors.label, marginTop: 24, marginBottom: 10 },
  recCard: { backgroundColor: Colors.surfaceCream, borderRadius: 18, padding: 14, marginBottom: 10 },
  recCategoryPill: { alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 6 },
  recCategoryText: { fontSize: 10.5, fontFamily: Fonts.bold, color: Colors.brandDark, letterSpacing: 0.3, textTransform: 'uppercase' },
  recTitle: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label },
  recNote: { fontSize: 12.5, fontFamily: Fonts.regular, color: Colors.secondaryLabel, marginTop: 3, lineHeight: 18 },

  deleteBtn: { alignSelf: 'center', paddingVertical: 20 },
  deleteBtnText: { color: Colors.systemRed, fontSize: 13, fontFamily: Fonts.semibold },

  disclaimer: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.tertiaryLabel, textAlign: 'center', lineHeight: 16, marginTop: 4 },
});
