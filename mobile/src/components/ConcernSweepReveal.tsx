/**
 * ConcernSweepReveal — the "scanning" reveal for a concern's heatmap overlay.
 *
 * A single Skia Canvas draws the SAME overlay PNG the static path already
 * renders, behind a moving luminance mask: a soft-edged gradient sweeps top
 * to bottom, so the overlay is uncovered progressively instead of appearing
 * all at once. A bright line rides the mask edge (that's the visible
 * "scanner"), and for the two concerns that have real discrete findings
 * (Blemishes, Dark Spots) each finding pings as the line actually crosses it.
 *
 * Deliberate constraints, each for a reason:
 *
 * - ONE Canvas. The mask, the line and every ping are children of it, not
 *   stacked canvases — a Canvas is a real native view, and one per finding
 *   would be ~40 views over a photo.
 *
 * - ~700ms, plays ONCE per tab open. Not a loop: a repeating sweep stops
 *   reading as "scanning" and starts reading as "stuck/broken", which is the
 *   opposite of the intent. It re-arms only when the overlay URL changes
 *   (i.e. a different concern tab), which is exactly "once per tab open".
 *
 * - The pings are driven by the SAME shared value as the mask, comparing the
 *   sweep's current position against each finding's own y. They are not
 *   setTimeout-ed off a guessed delay, so they cannot drift out of sync with
 *   the line if a frame is dropped or the duration is ever retuned.
 *
 * - Coordinates come from `overlay.points` on the scan record — the real
 *   component centres/radii the backend measured off the rendered PNG,
 *   strongest-first. Nothing here invents a point. Concerns whose overlay is
 *   a region wash (Redness, Dryness, Uneven Texture, Pores, Fine Lines) have
 *   no `points` at all, and correctly get the sweep with no pings rather
 *   than fabricated ones.
 *
 * Native only. The web build (expo export -p web, see package.json) would
 * need CanvasKit's WASM binary loaded and configured to run Skia at all, so
 * web keeps the existing plain fade — see ConcernHeatmapOverlay, which owns
 * that decision and this component's fallback.
 *
 * NOT reduced-motion aware: this app has no reduced-motion handling anywhere
 * today (checked — no AccessibilityInfo/isReduceMotionEnabled usage in
 * src/), so honouring it here would mean introducing that concept for one
 * animation. Called out as a follow-up instead. It is genuinely small when
 * wanted: RN's own AccessibilityInfo.isReduceMotionEnabled() + a listener,
 * and this component already has the "just show it" path (progress jumps
 * straight to fully-revealed) that such a flag would flip.
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  Image as SkiaImage,
  LinearGradient,
  Mask,
  Rect,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export type OverlayPoint = { x: number; y: number; r: number; strength: number };

// One clean pass. Under a second, per the "reads as scanning, not as a
// loading spinner" requirement.
const SWEEP_MS = 700;

// Height of the mask's soft edge, as a fraction of the photo. The reveal is
// a gradient, not a hard wipe, so the overlay fades in over this band rather
// than snapping on at a visible horizontal seam.
const EDGE_BAND = 0.14;

// How far past the bottom the sweep travels. Without this the last EDGE_BAND
// of the photo would still be mid-gradient when the animation ends, leaving
// the bottom strip permanently dimmer than the rest of the overlay.
const OVERSHOOT = EDGE_BAND;

// How long after the line crosses a finding its ping lasts, in sweep-progress
// units (so it is tied to distance travelled, not wall-clock — retuning
// SWEEP_MS keeps the pings proportionally identical).
const PING_WINDOW = 0.13;

const MASK_COLORS = ['white', 'white', 'black', 'black'];
// Transparent → light → transparent, so the line has soft falloff on both
// sides instead of being a hard 1px rule.
const LINE_COLORS = [
  'rgba(255,255,255,0)',
  'rgba(255,255,255,0)',
  'rgba(255,255,255,0.85)',
  'rgba(255,255,255,0)',
  'rgba(255,255,255,0)',
];

function clamp01(v: number) {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * One finding's ping. Its own component (not a loop body inside the parent)
 * so each gets its own hooks legally — `points` length varies per concern,
 * and hooks in a .map() would be a rules-of-hooks violation the moment a tab
 * switch changed the count.
 */
function FindingPing({
  point,
  maxStrength,
  progress,
  width,
  height,
}: {
  point: OverlayPoint;
  maxStrength: number;
  progress: SharedValue<number>;
  width: number;
  height: number;
}) {
  const cx = point.x * width;
  const cy = point.y * height;
  // `r` is a fraction of the photo's WIDTH on both axes (see the backend's
  // pointsToPx/overlay.points construction), so it scales by width here too —
  // scaling by height would distort it on a non-square photo.
  //
  // The floor is doing most of the work in practice, and that is deliberate:
  // measured against a real photo through the actual engine, r came back
  // 0.0049–0.0171, i.e. roughly 2–7px on a ~390pt-wide phone. A 2px ring is
  // not a visible "ping", so findings are drawn at a legible minimum and the
  // real radius only takes over for genuinely larger components. This is an
  // annotation of where a finding is, not a literal 1:1 tracing of its size —
  // the overlay PNG underneath already depicts the true extent.
  const baseR = Math.max(point.r * width, 8);
  // Stronger findings ping brighter — real signal off the record, and the
  // same value the PNG's own intensity came from.
  //
  // Normalised against the STRONGEST finding in this concern rather than
  // treated as an absolute 0-1. That is not a stylistic choice: `strength` is
  // not a 0-1 score. Measured on a real photo it came back 4.93–5.51 for
  // Blemishes and 4.48–9.80 for Dark Spots, so clamping it to 0-1 would peg
  // every single ping to maximum and silently delete the variation this is
  // supposed to show. Relative-to-strongest keeps the differences visible
  // whatever absolute range a given photo produces.
  const rel = maxStrength > 0 ? clamp01(point.strength / maxStrength) : 1;
  const peak = 0.4 + 0.6 * rel;

  // t: 0 at the instant the line reaches this finding, 1 when its ping has
  // fully decayed. Negative before the line arrives (nothing drawn), >1 after
  // (nothing drawn). This is what keeps every ping locked to the line's real
  // position rather than a scheduled delay.
  const t = useDerivedValue(() => {
    'worklet';
    return (progress.value - point.y) / PING_WINDOW;
  });

  const ringR = useDerivedValue(() => {
    'worklet';
    const v = t.value;
    if (v < 0 || v > 1) return 0;
    return baseR * (1 + 2.6 * v);
  });

  const ringOpacity = useDerivedValue(() => {
    'worklet';
    const v = t.value;
    if (v < 0 || v > 1) return 0;
    return peak * (1 - v);
  });

  // A brief solid core under the expanding ring — reads as "landed on
  // something" rather than just a ripple. Fades faster than the ring.
  const coreOpacity = useDerivedValue(() => {
    'worklet';
    const v = t.value;
    if (v < 0 || v > 1) return 0;
    return peak * (1 - v) * (1 - v);
  });

  return (
    <Group>
      <Circle cx={cx} cy={cy} r={ringR} color="white" opacity={ringOpacity} style="stroke" strokeWidth={1.5} />
      <Circle cx={cx} cy={cy} r={baseR} color="white" opacity={coreOpacity} />
    </Group>
  );
}

export function ConcernSweepReveal({
  url,
  points,
  width,
  height,
}: {
  // Omitted for the "scan just completed" pass on the Summary tab, which has
  // no concern selected and therefore no overlay to uncover. In that mode
  // only the scanner line is drawn — deliberately with no pings either, since
  // findings belong to a specific concern and pulsing one concern's points
  // while Summary is showing would be attributing them to nothing.
  url?: string;
  points?: OverlayPoint[];
  width: number;
  height: number;
}) {
  // null (not conditional) so the hook order never changes between the two
  // modes — DataSourceParam explicitly accepts null.
  const image = useImage(url ?? null);
  const progress = useSharedValue(0);
  // points arrive strongest-first (verified against the engine's real output,
  // which sorts descending before capping at 40), so [0] is the max — but
  // computed defensively rather than assuming the ordering holds forever.
  const maxStrength = points?.length ? Math.max(...points.map((p) => p.strength)) : 0;

  useEffect(() => {
    // Re-arm on every concern change. Keyed on `url` because that is what
    // actually identifies a concern's overlay; the parent also remounts this
    // component per URL, so this is belt-and-braces rather than the only
    // thing resetting it.
    progress.value = 0;
    progress.value = withTiming(1 + OVERSHOOT, {
      duration: SWEEP_MS,
      // Slight ease-out: the line decelerates as it clears the chin, which
      // reads as a deliberate finish instead of running off the edge.
      easing: Easing.out(Easing.quad),
    });
  }, [url, progress]);

  // Reveal mask. White (show) behind the edge, black (hide) ahead of it, with
  // EDGE_BAND of gradient between. Positions must be non-decreasing, which
  // holds after clamping since (p - EDGE_BAND) <= p.
  const maskPositions = useDerivedValue(() => {
    'worklet';
    const p = progress.value;
    return [0, clamp01(p - EDGE_BAND), clamp01(p), 1];
  });

  // The visible scanner line, drawn as one full-canvas rect whose gradient
  // stops track the sweep — cheaper and smoother than animating a thin rect's
  // y, and it cannot desync from the mask because both read `progress`.
  const linePositions = useDerivedValue(() => {
    'worklet';
    const p = progress.value;
    const lead = clamp01(p + 0.012);
    return [0, clamp01(p - 0.05), clamp01(p), lead, 1];
  });

  // Fade the line out as it leaves the frame, so it doesn't sit parked at the
  // bottom edge for the last frames of the sweep.
  const lineOpacity = useDerivedValue(() => {
    'worklet';
    const p = progress.value;
    if (p <= 1) return 1;
    return clamp01(1 - (p - 1) / OVERSHOOT);
  });

  // Nothing to draw until the PNG has actually decoded (when one was asked
  // for at all). Returning an empty Canvas (rather than null) keeps the view
  // identity stable so the parent's layout doesn't reflow the instant the
  // image lands.
  if ((url && !image) || width <= 0 || height <= 0) {
    return <Canvas style={StyleSheet.absoluteFill} pointerEvents="none" />;
  }

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {!!image && (
      <Mask
        mode="luminance"
        mask={
          <Rect x={0} y={0} width={width} height={height}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, height)}
              colors={MASK_COLORS}
              positions={maskPositions}
            />
          </Rect>
        }
      >
        {/* The same overlay PNG the static path draws — this animates how it
            is revealed, it does not replace or re-render it. "cover" matches
            the <Image contentFit="cover"> the photo and the static overlay
            both already use, so all three stay in the same frame. */}
        <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="cover" />
      </Mask>
      )}

      {/* Pings sit ABOVE the mask, not inside it: a finding's ping should be
          visible at the moment of crossing, and inside the mask the crossing
          point is exactly where the gradient is still half-black. */}
      {points?.map((p, i) => (
        <FindingPing
          key={`${p.x},${p.y},${i}`}
          point={p}
          maxStrength={maxStrength}
          progress={progress}
          width={width}
          height={height}
        />
      ))}

      <Group opacity={lineOpacity}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={LINE_COLORS}
            positions={linePositions}
          />
        </Rect>
      </Group>
    </Canvas>
  );
}
