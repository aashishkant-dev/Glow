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
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../utils/colors';
import { SkinHeatmapConcern, SkinHeatmapConcernKey } from '../api/client';

export type ConcernTab = 'summary' | SkinHeatmapConcernKey;

// Order + display label — one place so the tab bar and the Summary tab's
// concern-row list (SkinScanResultScreen) can never drift on ordering.
// Matches the product spec exactly: Pores, Dryness, Fine Lines & Wrinkles,
// Blemishes, Uneven Texture, Dark Spots, Redness. Keys are Perfect Corp's
// own SD concern names (src/utils/perfectCorpClient.js's DST_ACTIONS), used
// directly rather than an app-invented translation layer.
export const CONCERN_ORDER: { key: SkinHeatmapConcernKey; label: string }[] = [
  { key: 'pore', label: 'Pores' },
  { key: 'moisture', label: 'Dryness' },
  { key: 'wrinkle', label: 'Fine Lines' },
  { key: 'acne', label: 'Blemishes' },
  { key: 'texture', label: 'Uneven Texture' },
  { key: 'age_spot', label: 'Dark Spots' },
  { key: 'redness', label: 'Redness' },
];

type Heatmaps = Partial<Record<SkinHeatmapConcernKey, SkinHeatmapConcern>> | null;

// Lives inside the same absolute-fill photo container the base <Image>
// sits in — a plain Image stack, not an interactive overlay, since the
// heatmap itself is pre-rendered server-side. Nothing renders for
// 'summary' or a concern this scan has no data for. Fades in (~200ms)
// rather than popping in on every tab switch.
export function ConcernHeatmapOverlay({ activeTab, heatmaps }: { activeTab: ConcernTab; heatmaps: Heatmaps }) {
  const concern = activeTab === 'summary' ? undefined : heatmaps?.[activeTab];
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    opacity.setValue(0);
    if (concern) Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [concern?.url, opacity]);

  if (!concern) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      <Image source={{ uri: concern.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

export function ConcernTabBar({ activeTab, onSelect, heatmaps }: { activeTab: ConcernTab; onSelect: (tab: ConcernTab) => void; heatmaps: Heatmaps }) {
  return (
    <View style={tabStyles.row}>
      <Pressable onPress={() => onSelect('summary')} style={[tabStyles.pill, activeTab === 'summary' && tabStyles.pillActive]}>
        <Text style={[tabStyles.pillText, activeTab === 'summary' && tabStyles.pillTextActive]}>Summary</Text>
      </Pressable>
      {CONCERN_ORDER.map(({ key, label }) => {
        // Every concern always gets a tab, whether or not this particular
        // scan could assess it — a scan-to-scan disappearing/reappearing
        // tab set would be more confusing than one tab occasionally
        // opening to a clearly-labeled "not assessed" state (see
        // ConcernDetailCard below).
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
function SeverityGradientBar({ severity, gradientLabels }: { severity: number; gradientLabels: { low: string; high: string } }) {
  const clamped = Math.max(0, Math.min(1, severity));
  const markerFromTopPct = (1 - clamped) * 100;
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
  }, [severity, anim]);

  return (
    <View style={gradStyles.outer}>
      <Text style={gradStyles.endLabel}>{gradientLabels.high}</Text>
      <View style={gradStyles.wrap}>
        <LinearGradient
          colors={[Colors.systemRed, Colors.systemOrange, Colors.brand, Colors.systemGreen]}
          style={gradStyles.bar}
        />
        <Animated.View
          style={[
            gradStyles.marker,
            { top: `${markerFromTopPct}%`, opacity: anim, transform: [{ scale: anim }] },
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
export function ConcernDetailCard({ concernKey, concern, onViewRecommendations }: {
  concernKey: SkinHeatmapConcernKey;
  concern: SkinHeatmapConcern | undefined;
  onViewRecommendations: () => void;
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
      </View>
      <View style={detailStyles.row}>
        <SeverityGradientBar severity={concern.severity} gradientLabels={concern.gradientLabels} />
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
