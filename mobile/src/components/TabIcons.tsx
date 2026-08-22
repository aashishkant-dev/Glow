/**
 * Custom SVG tab icons — no font loading, works on all platforms including web PWA.
 *
 * ── Glow icon system v3 ──────────────────────────────────────────────────────
 * Rebuilt to the geometric discipline of professional icon libraries rather
 * than hand-eased curves. The rules below are lifted from Lucide's published
 * icon design guide and from reading Phosphor's source SVGs directly:
 *
 *   1. 24×24 canvas, ONE stroke weight (SW = 2), round caps + round joins.
 *      Lucide ships every icon at stroke-width 2 with no secondary weight. The
 *      previous Glow set used 1.7 plus a 1.45 "soft" weight plus per-path
 *      opacity fades — three weights in one glyph is the clearest tell of a
 *      developer-drawn set, and it made icons read washed-out at tab size.
 *   2. ≥1px padding inside the canvas; geometry lives in 2..22 in practice.
 *   3. Rect corner radius 2 (Lucide's `rx="2"`). The old rx 4–5.5 "squircles"
 *      inflated at small sizes until bodies looked like pills.
 *   4. ≥2px spacing between distinct elements.
 *   5. Coordinates and arc centres land ON the grid — integers and halves.
 *      The old set used 3.6 / 10.7 / .85 / 6.3, which is what made strokes hit
 *      pixel boundaries inconsistently and look softly out of focus.
 *   6. Prefer primitives (<Circle r=8>, <Rect rx=2>) over bespoke beziers when
 *      the form allows it, so sibling glyphs share an exact footprint.
 *
 * `filled` uses Phosphor's DUOTONE construction, verified from its source:
 * a solid fill layer at opacity 0.2 sitting under the full-weight foreground —
 * NOT an outline with a tint wash behind it (the old `color + '26'` approach,
 * which muddied the silhouette because the stroke and wash disagreed).
 *
 * Glow's own bloom-dot accent is kept, but disciplined: it appears only where
 * it carries meaning (active states, and the brand-mark glyphs), never as
 * scattered decoration at assorted opacities.
 *
 * NO SVG gradients — url(#id) renders blank in react-native-svg-web/PWA.
 */
import React from 'react';
import Svg, { Path, Rect, Circle, G } from 'react-native-svg';
import { Colors } from '../utils/colors';

interface P { size?: number; color?: string; filled?: boolean }

/** Single stroke weight for the whole set — Lucide's 24px/2px ratio. */
const SW = 2;
/** Duotone under-layer opacity — Phosphor's exact value. */
const DUO = 0.2;
/** Standard stroke props — round everything, no fill. */
const S = { strokeWidth: SW, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

/** House silhouette, shared by outline + duotone layers so they cannot drift. */
const HOUSE_D = 'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';

/**
 * HomeIcon — Lucide's house construction: the body is one closed path whose
 * roof rake is a true straight run into 2-unit corner arcs, and the doorway is
 * a separate 1-unit-radius path. Replaces the old arced "roof" that made the
 * house read as a tent.
 */
export function HomeIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {filled && <Path d={HOUSE_D} fill={color} opacity={DUO} />}
      <G>
        <Path d={HOUSE_D}  stroke={color} {...S} />
        <Path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/**
 * CalendarIcon — Lucide's calendar exactly: rect rx=2 on the grid, a full-width
 * header rule, and two straight hanger studs. The old version had an rx=5
 * body and five day-dots at five different opacities, which at 24px collapsed
 * into grey mush; a single bloom dot now marks "today" instead.
 */
export function CalendarIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {filled && <Rect x="3" y="4" width="18" height="18" rx="2" fill={color} opacity={DUO} />}
      <G>
        <Rect x="3" y="4" width="18" height="18" rx="2"  stroke={color} {...S} />
        <Path d="M3 10h18"  stroke={color} {...S} />
        <Path d="M8 2v4M16 2v4"  stroke={color} {...S} />
      </G>
      {/* Bloom dot — the single "booked day" marker, on-grid */}
      <Circle cx={12} cy={16} r={1.5} fill={color} />
    </Svg>
  );
}

/**
 * BriefcaseIcon — Lucide's briefcase: rect rx=2 plus a handle drawn as one
 * path that reads as a continuous strap over the lid. Clasp is a bloom dot,
 * kept because it distinguishes this from PersonIcon at a glance.
 */
export function BriefcaseIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {filled && <Rect x="2" y="6" width="20" height="14" rx="2" fill={color} opacity={DUO} />}
      <G>
        <Rect x="2" y="6" width="20" height="14" rx="2"  stroke={color} {...S} />
        <Path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/** Teardrop pin body — Lucide's map-pin arc, shared by every pin in the app. */
const PIN_D = 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0';

/**
 * LocationPinIcon — solid map marker (map overlays / dark chips). Same
 * silhouette as LocationIcon so stroked and solid pins are the same drawing.
 * The bore is punched with the fill colour at low alpha rather than a
 * hardcoded black wash, so it works on rose and plum chips as well as maps.
 */
export function LocationPinIcon({ size = 24, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={PIN_D + 'z'} fill={color} />
      <Circle cx="12" cy="10" r="3" fill="rgba(0,0,0,0.35)" />
    </Svg>
  );
}

/** PlusIcon — round-capped, on-grid, centred in a circular FAB. */
export function PlusIcon({ size = 28, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} {...S} />
    </Svg>
  );
}

/** Lens + handle shared by SearchIcon and SearchJobsIcon — Lucide's search. */
const LENS_C = { cx: 11, cy: 11, r: 7 } as const;
const LENS_HANDLE = 'm20 20-3.9-3.9';

/**
 * SearchJobsIcon — the Provider tab bar's centre action and the single
 * most-seen glyph in the Provider app, so it carries the brand mark directly:
 * a four-petal bloom inside the lens. The petals are now built on the mark's
 * own symmetry (equal 3-unit lobes about the lens centre) at a single opacity,
 * replacing four lobes at four different opacities.
 */
export function SearchJobsIcon({ size = 24, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Circle {...LENS_C}  stroke={color} {...S} />
        <Path d={LENS_HANDLE}  stroke={color} {...S} />
      </G>
      {/* Bloom inside the lens — four equal petals + core, echoing GlowMark */}
      <G fill={color}>
        <Path d="M11 7c1.2 1.2 1.8 2.3 1.8 3.2S12 11.8 11 11.8 9.2 11.1 9.2 10.2 9.8 8.2 11 7z" />
        <Path d="M15 11c-1.2 1.2-2.3 1.8-3.2 1.8s-1.6-.8-1.6-1.8.7-1.8 1.6-1.8S13.8 9.8 15 11z" />
        <Path d="M11 15c-1.2-1.2-1.8-2.3-1.8-3.2s.8-1.6 1.8-1.6 1.8.7 1.8 1.6S12.2 13.8 11 15z" />
        <Path d="M7 11c1.2-1.2 2.3-1.8 3.2-1.8s1.6.8 1.6 1.8-.7 1.8-1.6 1.8S8.2 12.2 7 11z" />
      </G>
    </Svg>
  );
}

/**
 * ArrowBackIcon — the app's back affordance (~15 screens). Lucide's arrow-left:
 * a full-width shaft with a straight-runs chevron head, joined by round joins
 * rather than the old curved-elbow head.
 */
export function ArrowBackIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Path d="M19 12H5"  stroke={color} {...S} />
        <Path d="m12 19-7-7 7-7"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/**
 * LocationIcon — stroked sibling of LocationPinIcon (identical silhouette), so
 * inline "where" labels match the map markers exactly.
 */
export function LocationIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Path d={PIN_D}  stroke={color} {...S} />
        <Circle cx="12" cy="10" r="3"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/** Handset silhouette shared by CallIcon and PhoneCheckIcon. */
const PHONE_D = 'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384';

/** CallIcon — handset. Lucide's phone: the receiver sweep is one continuous
 *  path anchored to 2-unit corner radii at both ends, not a traced outline. */
export function CallIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={PHONE_D} stroke={color} {...S} />
    </Svg>
  );
}

/**
 * ChatIcon — messages. Solid bubble with knocked-out dots. The dots were
 * previously hardcoded #FFFFFF, which punched white holes when the icon sat on
 * a coloured chip; they now knock out via the bubble's own fill at low alpha.
 */
export function ChatIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4.5 3.6A1 1 0 0 1 3 19.8V6a2 2 0 0 1 2-2z"
        fill={color}
      />
      <G fill="#FFFFFF" opacity={0.92}>
        <Circle cx="8" cy="11" r="1.25" />
        <Circle cx="12" cy="11" r="1.25" />
        <Circle cx="16" cy="11" r="1.25" />
      </G>
    </Svg>
  );
}

/**
 * SearchIcon — Lucide's search verbatim (circle r=7 at 11,11 + handle running
 * to 20,20). Shares LENS_C with SearchJobsIcon so the two are the same lens.
 * The old decorative "catchlight" arc is gone — it was a second stroke weight
 * at 50% opacity, and Lucide's search has no interior detail at all.
 */
export function SearchIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Circle {...LENS_C}  stroke={color} {...S} />
        <Path d={LENS_HANDLE}  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/** CloseCircleIcon — clear/dismiss. Solid disc, on-grid X inset to 9..15. */
export function CloseCircleIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" fill={color} />
      <Path d="m9 9 6 6M15 9l-6 6" stroke="#fff" strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * MapIcon / ListIcon — the Find Jobs view toggle, always seen as a pair, so
 * they share weight and inset. Map is Lucide's folded-map: the folds are dead
 * straight verticals (a fold IS straight — the old S-curved folds read as
 * squiggles at 20px) and the sheet corners land on the grid.
 */
export function MapIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Path d="M9 4 3.6 6.2A1 1 0 0 0 3 7.1v11.4a1 1 0 0 0 1.4.9L9 18l6 2 5.4-2.2a1 1 0 0 0 .6-.9V5.5a1 1 0 0 0-1.4-.9L15 6z"  stroke={color} {...S} />
        <Path d="M9 4v14M15 6v14"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

export function ListIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Path d="M9 6h11M9 12h11M9 18h11"  stroke={color} {...S} />
      </G>
      {/* Leading bullets — one weight, one size, on the same baselines */}
      <G fill={color}>
        <Circle cx="4.5" cy="6" r="1.5" />
        <Circle cx="4.5" cy="12" r="1.5" />
        <Circle cx="4.5" cy="18" r="1.5" />
      </G>
    </Svg>
  );
}

/**
 * LocateIcon — Lucide's locate-fixed: ring r=7 with four ticks that start
 * exactly at the canvas edge and stop 2 units clear of the ring, plus a solid
 * bloom core. The old version stacked a third faded ring inside.
 */
export function LocateIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Circle cx="12" cy="12" r="7"  stroke={color} {...S} />
        <Path d="M12 2v3M12 19v3M2 12h3M19 12h3"  stroke={color} {...S} />
      </G>
      <Circle cx="12" cy="12" r="2" fill={color} />
    </Svg>
  );
}

/** RadioOnIcon — selection dot: ring + core, sharing LocateIcon's r=7 ring. */
export function RadioOnIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={SW} fill="none" />
      <Circle cx="12" cy="12" r="4" fill={color} />
    </Svg>
  );
}

/**
 * NavigateIcon — directions arrow. Lucide's navigation: a solid kite with a
 * true straight leading edge and a notched tail, on-grid at 12,2 / 19,21.
 */
export function NavigateIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a1 1 0 0 1 .92.61l6.5 15.5a1 1 0 0 1-1.33 1.29L12 16.6l-6.09 2.8a1 1 0 0 1-1.33-1.29l6.5-15.5A1 1 0 0 1 12 2z"
        fill={color} />
    </Svg>
  );
}

/**
 * StarIcon — ratings glyph, one of the most-repeated marks in the app. Lucide's
 * star proportions (outer r≈9 from centre, points on the grid) with round
 * joins doing the softening. Stroke weight now matches the set instead of
 * sitting a step lighter, so a star next to a chevron reads as one family.
 */
export function StarIcon({ size = 24, color = '#FFB800', filled = true }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={filled ? 0 : SW}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** DocumentIcon — Lucide's file-text: page with a true 45° folded corner and
 *  on-grid rule lines, replacing the eased-corner page. */
export function DocumentIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Path d="M15 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6z"  stroke={color} {...S} />
        <Path d="M14 2v4a2 2 0 0 0 2 2h4"  stroke={color} {...S} />
        <Path d="M9 13h6M9 17h4"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/** CashIcon — payout note. Rect rx=2 to match the card family, coin ring
 *  centred on the note. Flanking "corner" dots removed — they were opacity
 *  decoration that read as dirt at 18px. */
export function CashIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Rect x="2" y="6" width="20" height="12" rx="2"  stroke={color} {...S} />
        <Circle cx="12" cy="12" r="3"  stroke={color} {...S} />
        <Path d="M6 12h.01M18 12h.01"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/**
 * CheckCircleIcon — confirmation seal, used ~36 places (verified badges,
 * completed steps). Solid disc r=10 with an on-grid tick; the tick's elbow
 * sits at 11,15 so it optically centres rather than sagging low.
 */
export function CheckCircleIcon({ size = 24, color = Colors.onlineGreen }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" fill={color} />
      <Path d="m8 12.5 2.5 2.5L16 9.5"
        stroke="#fff" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/**
 * PersonIcon — Lucide's user: circle r=4 head at cy=7 over a 4-unit-radius
 * shoulder path that terminates cleanly at y=21. The old version closed the
 * shoulders into a cradle, which at 24px filled in and read as a lightbulb.
 */
export function PersonIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {filled && (
        <G fill={color} opacity={DUO}>
          <Circle cx="12" cy="7" r="4" />
          <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2z" />
        </G>
      )}
      <G>
        <Circle cx="12" cy="7" r="4"  stroke={color} {...S} />
        <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/**
 * Chevrons — Lucide's chevron-left/right: two straight runs meeting at a round
 * join, spanning 6..18 vertically so they optically match the arrow head.
 */
export function ChevronBackIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={color} {...S} />
    </Svg>
  );
}

export function ChevronForwardIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m9 18 6-6-6-6" stroke={color} {...S} />
    </Svg>
  );
}

export function ChevronDownIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m6 9 6 6 6-6" stroke={color} {...S} />
    </Svg>
  );
}

/** HourglassIcon — pending state. Lucide's hourglass: straight cap rails and
 *  two mirrored bulbs that pinch at the exact centre (12,12). */
export function HourglassIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Path d="M6 2h12M6 22h12"  stroke={color} {...S} />
        {/* Each bulb is a straight taper into the 12,12 waist — arcs here made
            the two bulbs bulge past each other and read as a figure-8. */}
        <Path d="M7 2v4l5 6 5-6V2"  stroke={color} {...S} />
        <Path d="M7 22v-4l5-6 5 6v4"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/** FlashIcon — "just in" / urgent. Lucide's zap silhouette, solid, with the
 *  bolt's shoulders on the grid so it doesn't lean. */
export function FlashIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13.4 2a1 1 0 0 1 .98 1.2L13.5 9h4.7a1 1 0 0 1 .76 1.65l-8.9 10.4a1 1 0 0 1-1.74-.83L9.2 14.5H5a1 1 0 0 1-.78-1.63l8.4-10.5A1 1 0 0 1 13.4 2z"
        fill={color} />
    </Svg>
  );
}

/**
 * CalendarSVGIcon / HomeSVGIcon — legacy aliases kept for existing call sites.
 * They delegate to the redrawn primaries so the two can never drift apart.
 */
export function CalendarSVGIcon({ size = 24, color = '#000' }: P) {
  return <CalendarIcon size={size} color={color} />;
}

export function HomeSVGIcon({ size = 24, color = '#000' }: P) {
  return <HomeIcon size={size} color={color} />;
}

/**
 * CameraIcon — avatar/portfolio upload affordance. Lucide's camera: the hump
 * is part of the body path (not a separate bump), lens r=3 on centre.
 */
export function CameraIcon({ size = 18, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Path d="M14.5 4h-5L8 6.5H5a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-3z"  stroke={color} {...S} />
        <Circle cx="12" cy="13" r="3"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/**
 * HeartIcon — Customer "Saved" tab. Lucide's heart: two 5-unit lobes meeting
 * at a true apex with the base tapering to a point at 12,21. Duotone fill for
 * the active tab state, matching HomeIcon/CompassIcon.
 */
export function HeartIcon({ size = 24, color = '#000', filled = false }: P) {
  const d = 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {filled && <Path d={d} fill={color} opacity={DUO} />}
      <Path d={d} stroke={color} {...S} fill={filled ? color : 'none'} />
    </Svg>
  );
}

/**
 * TuneIcon — filter sliders. Lucide's sliders-horizontal: rails and thumbs
 * share one weight, thumbs are short perpendicular ticks rather than rings
 * with cores. Three rails on 6/12/18 baselines matching ListIcon.
 */
export function TuneIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Path d="M4 6h10M18 6h2"  stroke={color} {...S} />
        <Path d="M4 12h2M10 12h10"  stroke={color} {...S} />
        <Path d="M4 18h8M16 18h4"  stroke={color} {...S} />
        <Path d="M16 4v4M8 10v4M14 16v4"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/**
 * SortIcon — Lucide's arrow-down-wide-narrow: graduated bars (wide → narrow)
 * beside a shaft-and-head arrow. The arrow now has a real shaft, so the
 * direction reads instantly; the old version was a shaft plus a curved "V".
 */
export function SortIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G>
        <Path d="M11 5h10M11 12h7M11 19h4"  stroke={color} {...S} />
        <Path d="M4 4v16"  stroke={color} {...S} />
        <Path d="m7 17-3 3-3-3"  stroke={color} {...S} />
      </G>
    </Svg>
  );
}

/**
 * CompassIcon — Customer "Explore" tab. Lucide's compass construction: ring
 * r=10 plus a single needle path built from two mirrored 2-unit-radius lobes
 * about the centre, so the needle is one closed shape at one opacity instead
 * of two petals at 100% and 40%.
 */
export function CompassIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {filled && <Circle cx="12" cy="12" r="10" fill={color} opacity={DUO} />}
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={SW} fill="none" />
      {/* Needle stays STROKED in both states — filling it turned the kite into
          an undifferentiated blob at 24px. The duotone disc alone carries the
          active state, matching Home/Person/Heart. */}
      <Path
        d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"
        stroke={color}
        {...S}
      />
    </Svg>
  );
}

/**
 * ScanFaceIcon — Customer "My Space" tab (AI skin scan). Four rounded
 * viewfinder corner brackets (the universal "scan/Face ID" frame — same
 * on-grid r=2 corner radius as the rest of the set) around a simple face,
 * so it reads as "scan a face" specifically rather than a plain camera.
 * Duotone fill on the face only, matching Home/Person/Heart's active state.
 */
export function ScanFaceIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {filled && <Circle cx="12" cy="12" r="7" fill={color} opacity={DUO} />}
      <G>
        <Path d="M4 8V6a2 2 0 0 1 2-2h2" stroke={color} {...S} />
        <Path d="M16 4h2a2 2 0 0 1 2 2v2" stroke={color} {...S} />
        <Path d="M20 16v2a2 2 0 0 1-2 2h-2" stroke={color} {...S} />
        <Path d="M8 20H6a2 2 0 0 1-2-2v-2" stroke={color} {...S} />
      </G>
      <G>
        <Circle cx="9" cy="11" r="1" fill={color} />
        <Circle cx="15" cy="11" r="1" fill={color} />
        <Path d="M9 15q3 3 6 0" stroke={color} {...S} />
      </G>
    </Svg>
  );
}
