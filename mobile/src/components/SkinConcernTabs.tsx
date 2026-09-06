/**
 * Concern-based navigation for a skin scan's results — replaces the old
 * point-marker + tooltip system entirely. That system represented a
 * region's condition with a single coordinate computed from landmark
 * geometry, so its correctness was hostage to detection quality for that
 * one point; occlusion or head tilt had no way to "partially" degrade a
 * point; it either sat at a wrong spot or vanished. A heatmap is masked to
 * a REGION server-side (src/utils/skinHeatmaps.js) instead, so it
 * structurally cannot render outside the assessable skin area regardless
 * of detection quality — occlusion becomes "this concern/area wasn't
 * assessed," a normal, expected, clearly-labeled state, not a wrong guess.
 *
 * Three exported pieces, used together by SkinScanResultScreen but kept
 * separate so the photo overlay (which must live inside the existing photo
 * container, stacked with the base photo) isn't forced into the same
 * component as the tab bar / detail card (which live in the scrolling body
 * below):
 * - ConcernHeatmapOverlay: the transparent PNG stacked over the photo for
 *   whichever concern tab is active, fading in on tab switch. Renders
 *   nothing for the Summary tab.
 * - ConcernTabBar: the horizontal Summary + per-concern tab selector.
 * - ConcernDetailCard: one concern's severity gradient bar (labeled at
 *   both ends specifically for that concern), a specific verdict line,
 *   real educational copy, actionable tips, a confidence note when this
 *   particular read is less certain, and a CTA — or, for a concern this
 *   scan has no assessable pixels for, an explicit "not assessed" state
 *   instead of guessing.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ConcernSweepReveal } from './ConcernSweepReveal';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../utils/colors';
import { SkinHeatmapConcern, SkinHeatmapConcernKey } from '../api/client';
import { FaceBox } from '../utils/skinZones';

export type ConcernTab = 'summary' | SkinHeatmapConcernKey;

// Order + display label — one place so the tab bar and the Summary tab's
// concern-row list (SkinScanResultScreen) can never drift on ordering.
// Matches the product spec exactly: Pores, Dryness, Fine Lines & Wrinkles,
// Blemishes, Uneven Texture, Dark Spots, Redness.
export const CONCERN_ORDER: { key: SkinHeatmapConcernKey; label: string }[] = [
  { key: 'pore', label: 'Pores' },
  { key: 'moisture', label: 'Dryness' },
  { key: 'wrinkle', label: 'Fine Lines' },
  { key: 'acne', label: 'Blemishes' },
  { key: 'texture', label: 'Uneven Texture' },
  { key: 'age_spot', label: 'Dark Spots' },
  { key: 'redness', label: 'Redness' },
  // Vendor-measured only — no overlay, and absent from `heatmaps` entirely
  // unless Ivy AI actually returned them. Listed last because a concern with
  // no picture is a weaker tab than one with a map, not because it matters
  // less.
  { key: 'firmness', label: 'Firmness' },
  { key: 'dark_circles', label: 'Dark Circles' },
  { key: 'eye_bags', label: 'Puffiness' },
];

// The three above are the ONLY concerns allowed to disappear from the tab bar.
// That is a deliberate exception to the rule below it, not an oversight.
//
// For the seven pixel-measured concerns, "not assessed" is real information
// about the PHOTO — we tried and this image couldn't support it — so their
// tab stays put and says so. For these three we never measure anything
// ourselves; their absence means an optional vendor didn't answer (no key,
// quota, timeout, refusal), which says nothing whatsoever about the user's
// skin. A permanently dimmed "Firmness — not assessed" tab on every scan
// would be reporting our billing status as if it were a skin finding.
export const VENDOR_ONLY_CONCERNS: ReadonlySet<SkinHeatmapConcernKey> = new Set([
  'firmness', 'dark_circles', 'eye_bags',
]);

type Heatmaps = Partial<Record<SkinHeatmapConcernKey, SkinHeatmapConcern>> | null;

// Tap-to-highlight "spotlight": four opaque bars framing a cutout at
// `zoneRect` (already resolved to full-photo 0-1 fractions by the caller —
// see skinZones.ts's resolveZoneRect) — dims everything OUTSIDE the
// tapped zone while leaving it, and the heatmap color underneath it, at
// full visibility. Four plain Views rather than an SVG mask/library: every
// zone rect this app uses is already a rectangle (see ZONE_RECTS), so a
// literal rectangular cutout needs nothing more than this. Percentage
// strings position it in the exact same fractional space the base photo
// and heatmap overlay already share, so it needs zero pixel math of its
// own and can't drift out of alignment with either.
// React Native's DimensionValue only accepts the literal `${number}%`
// template pattern, not a general string — a plain template-literal const
// widens to `string` and fails to typecheck against it, hence this cast in
// one place rather than four.
function pct(fraction: number): `${number}%` {
  return `${fraction * 100}%`;
}

function ZoneHighlightMask({ zoneRect }: { zoneRect: FaceBox }) {
  const DIM = 'rgba(0,0,0,0.6)';
  const leftPct = pct(Math.max(0, zoneRect.x));
  const topPct = pct(Math.max(0, zoneRect.y));
  const rightEdgePct = pct(Math.min(1, zoneRect.x + zoneRect.width));
  const bottomEdgePct = pct(Math.min(1, zoneRect.y + zoneRect.height));
  const heightPct = pct(Math.max(0, zoneRect.height));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: topPct, backgroundColor: DIM }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: bottomEdgePct, bottom: 0, backgroundColor: DIM }} />
      <View style={{ position: 'absolute', left: 0, top: topPct, width: leftPct, height: heightPct, backgroundColor: DIM }} />
      <View style={{ position: 'absolute', right: 0, top: topPct, left: rightEdgePct, height: heightPct, backgroundColor: DIM }} />
    </View>
  );
}

// Lives inside the same absolute-fill photo container the base <Image>
// sits in — a plain Image stack, not an interactive overlay by itself
// (the heatmap PNG is pre-rendered server-side), PLUS the tap-to-highlight
// spotlight (ZoneHighlightMask) stacked on top when a specific zone is
// selected. Nothing renders for 'summary' or a concern this scan has no
// data for. Fades in (~200ms) rather than popping in on every tab switch.
// Skia runs the sweep reveal on native only. On web it would need
// CanvasKit's WASM binary loaded and served (this app really does ship a web
// build — see package.json's build:web/deploy), so web keeps the original
// opacity fade rather than risking a blank overlay on a platform the
// animation was never the point for. Same fallback covers the (unlikely)
// case of a native build where Skia isn't linked: SWEEP_ENABLED is the one
// switch, and the static <Image> path below is untouched underneath it.
const SWEEP_ENABLED = Platform.OS !== 'web';

export function ConcernHeatmapOverlay({ activeTab, heatmaps, highlightedZoneRect, justScanned }: { activeTab: ConcernTab; heatmaps: Heatmaps; highlightedZoneRect?: FaceBox | null; justScanned?: boolean }) {
  const concern = activeTab === 'summary' ? undefined : heatmaps?.[activeTab];
  const opacity = useRef(new Animated.Value(0)).current;
  // Real laid-out pixel size of the photo box. Skia needs concrete numbers —
  // it cannot lay out from percentage strings the way the RN views here do —
  // and this is measured from the same absolutely-filled box the static
  // overlay occupies, so the two are guaranteed to describe the same frame.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  // The sweep only replaces the fade once it can actually run: native, and a
  // measured box to draw into. Until then (first layout pass) the fade still
  // does its job, so there is never a frame with no overlay at all.
  const sweeping = SWEEP_ENABLED && !!size && size.width > 0 && size.height > 0;

  useEffect(() => {
    opacity.setValue(0);
    if (concern) Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [concern?.url, opacity]);

  // Summary tab has no concern overlay at all, so normally there is nothing
  // to draw. The one exception is a scan that JUST completed: that is the
  // moment the result first appears, and it gets the scanner line on its own
  // over the bare photo (no reveal — nothing to reveal — and no pings, see
  // ConcernSweepReveal's `url` note). Only while justScanned, so re-opening
  // an old scan from history doesn't pretend to be analysing it again.
  // A concern with no overlay url is scored but has nothing to draw (see
  // SkinHeatmapConcern.url): either the engine found nothing worth painting,
  // or it is a vendor-only concern with no per-pixel evidence. The tab still
  // shows its verdict, education and tips below — there is simply no ink on
  // the photo. Without this the sweep would be handed an undefined image and
  // the fallback <Image> a null uri, which is a blank/erroring layer over the
  // face rather than a clean photo.
  // Bound to a local so TypeScript's narrowing survives into the JSX below —
  // narrowing a property access (concern.url) is discarded across the early
  // returns, which is what leaves `string | null` reaching props that only
  // accept `string | undefined`.
  const overlayUrl = concern?.url ?? null;
  if (concern && !overlayUrl) {
    return highlightedZoneRect ? (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <ZoneHighlightMask zoneRect={highlightedZoneRect} />
      </View>
    ) : null;
  }

  if (!concern) {
    if (activeTab !== 'summary' || !justScanned || !SWEEP_ENABLED) return null;
    // The measuring View renders unconditionally here — gating IT on
    // `sweeping` would deadlock, since `sweeping` only becomes true once this
    // View's own onLayout has reported a size. Only the Skia child waits.
    return (
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
        }}
      >
        {sweeping && <ConcernSweepReveal width={size.width} height={size.height} />}
      </View>
    );
  }
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity }]}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
      }}
    >
      {sweeping ? (
        // Keyed on the overlay URL so a tab switch REMOUNTS this: that is
        // what makes the sweep play exactly once per tab open, and it also
        // resets the per-finding hooks cleanly when the number of points
        // changes between concerns.
        <ConcernSweepReveal
          key={overlayUrl ?? 'none'}
          url={overlayUrl ?? undefined}
          points={concern.overlay?.points}
          width={size.width}
          height={size.height}
        />
      ) : (
        <Image source={{ uri: overlayUrl ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}
      {!!highlightedZoneRect && <ZoneHighlightMask zoneRect={highlightedZoneRect} />}
    </Animated.View>
  );
}

// Per-concern overlay colour, mirroring CONCERN_COLORS in the backend's
// skinHeatmaps.js EXACTLY (rgb triples, same keys modulo this file's
// singular naming: pore->pores, wrinkle->wrinkles). A legend that doesn't
// match the ink actually laid on the photo is worse than no legend, so if
// those server colours ever change, these must change with them.
// Only the seven pixel-measured concerns appear here. The vendor-only three
// never render an overlay, so they have no colour and no legend — the legend
// is gated on a real overlay url anyway, so a missing entry can't be reached.
const OVERLAY_RGB: Partial<Record<SkinHeatmapConcernKey, string>> = {
  redness: '222,108,118',
  texture: '204,158,96',
  pore: '138,104,118',
  wrinkle: '150,122,180',
  moisture: '140,162,198',
  age_spot: '255,176,59',
  acne: '255,79,129',
};

// What the two ends of the scale MEAN for this specific concern. Generic
// "high / low" would be close to useless: the overlay's strong end means
// "more visible pores" on one tab and "drier" on another, and a user reading
// a coloured wash on their own face has no way to know which without being
// told. Phrased per concern for that reason.
const LEGEND_ENDS: Partial<Record<SkinHeatmapConcernKey, [string, string]>> = {
  pore: ['More visible pores', 'Fewer pores'],
  moisture: ['Driest areas', 'Well hydrated'],
  wrinkle: ['Deeper lines', 'Fine lines'],
  acne: ['More blemishes', 'Clear skin'],
  texture: ['Most uneven', 'Smooth'],
  age_spot: ['Darkest spots', 'Even tone'],
  redness: ['Most redness', 'Calm skin'],
};

// The vertical colour scale down the right edge of the photo on a concern
// tab. The overlay itself is drawn at an alpha proportional to severity over
// one flat per-concern colour, so the honest legend for it is that same
// colour ramped from faint to full — NOT a rainbow, which would imply
// hue-coded categories the overlay does not actually encode.
export function ConcernOverlayLegend({ concernKey }: { concernKey: SkinHeatmapConcernKey }) {
  const rgb = OVERLAY_RGB[concernKey];
  const ends = LEGEND_ENDS[concernKey];
  // Both are absent for the vendor-only concerns, which never draw an overlay
  // — guard before destructuring rather than after, or a missing entry is a
  // crash instead of a skipped legend.
  if (!rgb || !ends) return null;
  const [strong, weak] = ends;
  return (
    <View style={legendStyles.wrap} pointerEvents="none">
      <Text style={legendStyles.label} numberOfLines={2}>{strong}</Text>
      <LinearGradient
        colors={[`rgba(${rgb},0.95)`, `rgba(${rgb},0.45)`, `rgba(${rgb},0.08)`]}
        style={legendStyles.bar}
      />
      <Text style={legendStyles.label} numberOfLines={2}>{weak}</Text>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  wrap: {
    position: 'absolute', right: 10, top: '14%', bottom: '14%',
    alignItems: 'center', justifyContent: 'center', gap: 6, width: 74,
  },
  bar: { flex: 1, width: 10, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.45)' },
  // Shadowed text, no plate — same reasoning as the capture screen's
  // in-frame guidance: a solid box over the photo hides the very skin the
  // legend is describing.
  label: {
    color: '#fff', fontSize: 9.5, fontFamily: Fonts.semibold, textAlign: 'center', lineHeight: 12,
    textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
});

// Legend for the Summary tab's own severity icons. Without it the three
// states are just coloured dots the user has to infer — and "green means
// good" is an assumption, not something the screen ever actually says.
export function SeverityKey() {
  const rows: { band: SkinHeatmapConcern['band']; text: string }[] = [
    { band: 'notable', text: 'Worth focusing on — the clearest signal in this photo.' },
    { band: 'moderate', text: 'Worth watching — present, but moderate.' },
    { band: 'mild', text: 'Mild — showing up a little.' },
    { band: 'clear', text: 'Doing well — minimal to none found.' },
  ];
  return (
    <View style={keyStyles.wrap}>
      <Text style={keyStyles.title}>What the colours mean</Text>
      {rows.map((r) => (
        <View key={r.band} style={keyStyles.row}>
          <View style={[keyStyles.dot, { backgroundColor: BAND_COLOR[r.band] }]} />
          <Text style={keyStyles.text}>{r.text}</Text>
        </View>
      ))}
    </View>
  );
}

const keyStyles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surfaceCream, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 14, gap: 7,
  },
  title: { fontSize: 12, fontFamily: Fonts.semibold, color: Colors.label, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, fontSize: 12, fontFamily: Fonts.regular, color: Colors.secondaryLabel, lineHeight: 16 },
});

export function ConcernTabBar({ activeTab, onSelect, heatmaps }: { activeTab: ConcernTab; onSelect: (tab: ConcernTab) => void; heatmaps: Heatmaps }) {
  return (
    <View style={tabStyles.row}>
      <Pressable onPress={() => onSelect('summary')} style={[tabStyles.pill, activeTab === 'summary' && tabStyles.pillActive]}>
        <Text style={[tabStyles.pillText, activeTab === 'summary' && tabStyles.pillTextActive]}>Summary</Text>
      </Pressable>
      {CONCERN_ORDER.filter(({ key }) => !VENDOR_ONLY_CONCERNS.has(key) || !!heatmaps?.[key]).map(({ key, label }) => {
        // Every PIXEL-measured concern always gets a tab, whether or not this
        // particular scan could assess it — a scan-to-scan disappearing/
        // reappearing tab set would be more confusing than one tab
        // occasionally opening to a clearly-labeled "not assessed" state (see
        // ConcernDetailCard below). The vendor-only three are filtered above
        // instead; see VENDOR_ONLY_CONCERNS for why they are the exception.
        const assessed = !!heatmaps?.[key];
        const active = activeTab === key;
        return (
          <Pressable key={key} onPress={() => onSelect(key)} style={[tabStyles.pill, active && tabStyles.pillActive]}>
            <Text style={[tabStyles.pillText, active && tabStyles.pillTextActive, !assessed && tabStyles.pillTextDim]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  pill: { borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.surfaceCream },
  pillActive: { backgroundColor: Colors.brand },
  pillText: { fontSize: 13, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  pillTextActive: { color: '#fff' },
  pillTextDim: { color: Colors.tertiaryLabel },
});

const BAND_COLOR: Record<SkinHeatmapConcern['band'], string> = {
  clear: Colors.systemGreen,
  mild: Colors.brand,
  moderate: Colors.systemOrange,
  notable: Colors.systemRed,
};

// Vertical severity bar — a fixed calm→intense gradient (green→rose→amber→
// red, matching every band's own color so the marker's position and its
// color story reinforce each other), labeled at both ends with THIS
// concern's own gradient labels (e.g. "Even Tone"/"Flushed" for redness —
// never a generic Low/High pair reused across concerns), with a marker at
// this concern's actual severity. severity is 0 (bottom, calmest) to 1
// (top, most severe). The marker springs into position (~220ms) on mount/
// severity change rather than appearing static.
// Confidence → marker "fog": stacked translucent white capsules drawn BEHIND
// the marker dot (never touching the dot's own size/border, so the exact
// computed value always stays legible) that widen and stack taller as
// confidence drops. White was chosen because it desaturates whichever of the
// 4 gradient colors sits under it, the same way the dot's own white fill
// reads as "the instrument," not "the measurement" — a wider, hazier patch
// of that same white directly encodes "the true value could be anywhere in
// this range" instead of forcing false precision onto a marginal read.
// 'high' is deliberately an empty array — no fog at all is itself the
// high-confidence signal, by contrast with medium/low, not a special case.
//
// 'vendor' MUST have an entry. The backend emits confidence.level 'vendor'
// for the three vendor-only concerns (firmness / dark circles / puffiness —
// see VENDOR_ONLY_CONCERNS in routes/skin.js), but this map only had
// low/medium/high and SeverityGradientBar destructures the result:
// `const [fog0, fog1, fog2] = CONFIDENCE_FOG[confidenceLevel]`. Destructuring
// undefined throws, so opening the Dark Circles tab — or Firmness, or
// Puffiness — crashed the screen every time. Reported as "clicking on dark
// circles shows something went wrong". TypeScript never caught it because
// SkinHeatmapConcern.confidence.level was typed 'low' | 'medium' | 'high',
// which was simply not true of what the server sends (now corrected in
// client.ts).
//
// Vendor reads get medium fog, not none: the score is real, but it comes
// from a model scoring the WHOLE photo with no per-pixel evidence behind it,
// so rendering it as pinpoint-precise would overclaim.
const CONFIDENCE_FOG: Record<'low' | 'medium' | 'high' | 'vendor', { width: number; height: number; opacity: number }[]> = {
  high: [],
  vendor: [
    { width: 22, height: 34, opacity: 0.16 },
    { width: 22, height: 22, opacity: 0.26 },
  ],
  medium: [
    { width: 22, height: 34, opacity: 0.16 },
    { width: 22, height: 22, opacity: 0.26 },
  ],
  low: [
    { width: 26, height: 56, opacity: 0.14 },
    { width: 26, height: 38, opacity: 0.20 },
    { width: 26, height: 24, opacity: 0.26 },
  ],
};

// Pure — no ref access — so it's safe to call from anywhere in render,
// unlike inlining `anim` into a `.map()`-generated style object (which the
// react-hooks/refs rule flags as a ref read escaping into a closure, even
// though the closure itself only runs synchronously during this render).
function fogLayerStyle(layer: { width: number; height: number; opacity: number }, topFraction: number) {
  return {
    position: 'absolute' as const,
    left: -(layer.width - 10) / 2,
    top: pct(topFraction),
    width: layer.width,
    height: layer.height,
    marginTop: -layer.height / 2,
    borderRadius: layer.width / 2,
    backgroundColor: `rgba(255,255,255,${layer.opacity})`,
  };
}

function SeverityGradientBar({ severity, gradientLabels, confidenceLevel }: { severity: number; gradientLabels: { low: string; high: string }; confidenceLevel: SkinHeatmapConcern['confidence']['level'] }) {
  const clamped = Math.max(0, Math.min(1, severity));
  const topFraction = 1 - clamped;
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
  }, [severity, anim]);

  // Unrolled rather than .map()'d over CONFIDENCE_FOG[confidenceLevel] —
  // see fogLayerStyle's comment. At most 3 layers (the 'low' case); absent
  // layers for 'medium'/'high' are simply undefined and render nothing.
  // `?? []` is the belt to the type's braces: an unrecognised level now
  // renders without fog instead of throwing and taking the whole result
  // screen down with it. A server that adds a fourth confidence level should
  // cost this bar a visual nicety, never the screen.
  const [fog0, fog1, fog2] = CONFIDENCE_FOG[confidenceLevel] ?? [];

  return (
    <View style={gradStyles.outer}>
      <Text style={gradStyles.endLabel}>{gradientLabels.high}</Text>
      <View style={gradStyles.wrap}>
        <LinearGradient
          colors={[Colors.systemRed, Colors.systemOrange, Colors.brand, Colors.systemGreen]}
          style={gradStyles.bar}
        />
        {!!fog0 && <Animated.View pointerEvents="none" style={[fogLayerStyle(fog0, topFraction), { opacity: anim }]} />}
        {!!fog1 && <Animated.View pointerEvents="none" style={[fogLayerStyle(fog1, topFraction), { opacity: anim }]} />}
        {!!fog2 && <Animated.View pointerEvents="none" style={[fogLayerStyle(fog2, topFraction), { opacity: anim }]} />}
        <Animated.View
          style={[
            gradStyles.marker,
            { top: pct(topFraction), opacity: anim, transform: [{ scale: anim }] },
          ]}
        />
      </View>
      <Text style={gradStyles.endLabel}>{gradientLabels.low}</Text>
    </View>
  );
}

const gradStyles = StyleSheet.create({
  outer: { alignItems: 'center', gap: 6 },
  wrap: { width: 10, height: 120, justifyContent: 'center' },
  bar: { width: 10, height: 120, borderRadius: 5 },
  marker: {
    position: 'absolute', left: -4, width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#fff', borderWidth: 2.5, borderColor: Colors.label,
    marginTop: -9,
  },
  endLabel: { fontSize: 8.5, fontFamily: Fonts.bold, color: Colors.tertiaryLabel, letterSpacing: 0.3, textAlign: 'center', width: 64 },
});

// One concern's full detail — the gradient bar + specific verdict +
// educational copy + actionable tips + confidence note + CTA, or (when this
// scan has no data for this concern) an explicit "not assessed" state.
// `onViewRecommendations` just switches back to the Summary tab, where the
// skin-type-based recommendations already live — there's no separate
// per-concern recommendation set in this data model, so pointing at the one
// real list beats fabricating five more. Fades in (~180ms) on concern
// switch, same motion language as the heatmap overlay it sits beside.
export function ConcernDetailCard({ concernKey, concern, onViewRecommendations, highlightedZone, onSelectZone }: {
  concernKey: SkinHeatmapConcernKey;
  concern: SkinHeatmapConcern | undefined;
  onViewRecommendations: () => void;
  // Tap-to-highlight: which zone (if any) is currently spotlighted on the
  // photo, and the handler to change it. Tapping the already-selected zone
  // deselects it (back to the full, undimmed overlay) — see
  // SkinScanResultScreen's selectZone, the single place this toggle lives.
  highlightedZone?: string | null;
  onSelectZone?: (zone: string) => void;
}) {
  const meta = CONCERN_ORDER.find(c => c.key === concernKey)!;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [concernKey, opacity]);

  if (!concern) {
    return (
      <Animated.View style={[detailStyles.card, { opacity }]}>
        <Text style={detailStyles.title}>{meta.label}</Text>
        <View style={detailStyles.notAssessedRow}>
          <View style={detailStyles.notAssessedIcon}><Text style={detailStyles.notAssessedIconText}>—</Text></View>
          <Text style={detailStyles.verdict}>Not assessed in this photo</Text>
        </View>
        <Text style={detailStyles.education}>
          This area wasn't confidently visible — a hat, hair, glasses, an extreme angle, or low light can all cause this. Nothing was guessed in its place; try another scan with this area clearly visible and evenly lit.
        </Text>
      </Animated.View>
    );
  }

  const isGood = concern.band === 'clear';

  return (
    <Animated.View style={[detailStyles.card, { opacity }]}>
      <View style={detailStyles.titleRow}>
        <Text style={detailStyles.title}>{meta.label}</Text>
        {/* Real vendor read vs. free heuristic fallback is a genuine
            accuracy difference the user explicitly asked to always see —
            never present an estimated read with the same confidence as a
            licensed vision model's output. */}
        {concern.source === 'estimated' && (
          <View style={detailStyles.estimatedPill}>
            <Text style={detailStyles.estimatedPillText}>ESTIMATED</Text>
          </View>
        )}
        {/* Mirrors the ESTIMATED pill for the opposite case — a real Deep
            Scan (Perfect Corp) result deserves its own visible attribution,
            not just the absence of the estimated label. */}
        {concern.source === 'perfectcorp' && (
          <View style={detailStyles.dermPill}>
            <Text style={detailStyles.dermPillText}>DERMATOLOGIST-GRADE</Text>
          </View>
        )}
        {/* Stage 7: this concern's SEVERITY came from a real Ivy AI vision
            read, not our own pixel heuristic — so it must not carry the
            ESTIMATED pill. The highlighted area under it is still the
            heuristic's own map (Ivy returns scores, never pixels — see
            mergeIvyIntoHeatmaps), which is exactly why this says the
            reading is AI-verified rather than claiming the whole overlay is. */}
        {concern.source === 'ivyai' && (
          <View style={detailStyles.dermPill}>
            <Text style={detailStyles.dermPillText}>AI-VERIFIED READING</Text>
          </View>
        )}
      </View>
      <View style={detailStyles.row}>
        <SeverityGradientBar severity={concern.severity} gradientLabels={concern.gradientLabels} confidenceLevel={concern.confidence.level} />
        <View style={detailStyles.rowBody}>
          <View style={detailStyles.verdictRow}>
            <View style={[detailStyles.verdictIcon, { backgroundColor: BAND_COLOR[concern.band] }]}>
              <Text style={detailStyles.verdictIconText}>{isGood ? '✓' : '!'}</Text>
            </View>
            <Text style={detailStyles.verdict}>{concern.verdict}</Text>
          </View>
          {/* A low-confidence read gets a visible caveat instead of being
              presented with the same certainty as a fully-assessed one —
              this is genuinely computed (see SkinHeatmapConcern.confidence),
              not a blanket disclaimer on every result. */}
          {concern.confidence.level === 'low' && (
            <Text style={detailStyles.confidenceNote}>Based on limited visibility in this area — retake with it clearly in frame for a fuller read.</Text>
          )}
          {/* A verdict above "clear" over an overlay that marks nothing
              (see SkinHeatmapConcern.overlayNote) must say so, in words,
              right here — otherwise the blank photo above reads as a
              broken tab, not an honest "couldn't pinpoint it." */}
          {!!concern.overlayNote && (
            <Text style={detailStyles.confidenceNote}>{concern.overlayNote}</Text>
          )}
          {/* Tap-to-highlight: real per-zone severity (skinHeatmaps.js),
              worst-first — tapping a chip spotlights that exact region on
              the photo above (dims the rest) instead of the old marker
              system's floating tooltip. Only renders when this concern
              actually has zone data (empty on the 'perfectcorp' path so
              far, or a concern with too little assessable area for a
              breakdown) — no chips is the honest state, not a bug. */}
          {/* Optional chaining despite the type saying required: every scan
              already in the database was generated before this field
              existed, so its `heatmaps` JSON (persisted, never rewritten)
              simply doesn't have it — undefined, not []. A type isn't a
              runtime guarantee against historical data. */}
          {!!concern.zoneBreakdown?.length && (
            <View style={detailStyles.zoneChipRow}>
              {concern.zoneBreakdown.map((z) => {
                const active = highlightedZone === z.zone;
                return (
                  <Pressable
                    key={z.zone}
                    onPress={() => onSelectZone?.(z.zone)}
                    style={[detailStyles.zoneChip, active && detailStyles.zoneChipActive]}
                  >
                    <View style={[detailStyles.zoneChipDot, { backgroundColor: BAND_COLOR[z.band] }]} />
                    <Text style={[detailStyles.zoneChipText, active && detailStyles.zoneChipTextActive]}>{z.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Text style={detailStyles.education}>{concern.education}</Text>
          <View style={detailStyles.tipsList}>
            {concern.tips.map((tip, i) => (
              <View key={i} style={detailStyles.tipRow}>
                <Text style={detailStyles.tipBullet}>•</Text>
                <Text style={detailStyles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
          <Pressable onPress={onViewRecommendations} style={detailStyles.cta}>
            <Text style={detailStyles.ctaText}>View Recommendations</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const detailStyles = StyleSheet.create({
  card: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 15.5, fontFamily: Fonts.display, color: Colors.label },
  estimatedPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: Colors.surfaceCream },
  estimatedPillText: { fontSize: 9, fontFamily: Fonts.bold, color: Colors.tertiaryLabel, letterSpacing: 0.5 },
  dermPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: Colors.label },
  dermPillText: { fontSize: 9, fontFamily: Fonts.bold, color: '#fff', letterSpacing: 0.5 },
  zoneChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  zoneChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100, backgroundColor: Colors.surfaceCream },
  zoneChipActive: { backgroundColor: Colors.brand },
  zoneChipDot: { width: 6, height: 6, borderRadius: 3 },
  zoneChipText: { fontSize: 11.5, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  zoneChipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', gap: 16 },
  rowBody: { flex: 1, gap: 8 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verdictIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  verdictIconText: { color: '#fff', fontSize: 12, fontFamily: Fonts.bold },
  verdict: { flex: 1, fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label },
  confidenceNote: { fontSize: 11, fontFamily: Fonts.medium, color: Colors.brandDark, fontStyle: 'italic' },
  education: { fontSize: 12.5, fontFamily: Fonts.regular, color: Colors.secondaryLabel, lineHeight: 18 },
  tipsList: { gap: 5, marginTop: 2 },
  tipRow: { flexDirection: 'row', gap: 6 },
  tipBullet: { fontSize: 12.5, color: Colors.brand, lineHeight: 17 },
  tipText: { flex: 1, fontSize: 12, fontFamily: Fonts.regular, color: Colors.label, lineHeight: 17 },
  cta: { alignSelf: 'flex-start', marginTop: 4 },
  ctaText: { fontSize: 13, fontFamily: Fonts.semibold, color: Colors.brandDark },
  notAssessedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  notAssessedIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.tertiaryLabel },
  notAssessedIconText: { color: '#fff', fontSize: 13, fontFamily: Fonts.bold },
});
