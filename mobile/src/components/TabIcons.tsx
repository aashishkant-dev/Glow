/**
 * Custom SVG tab icons — no font loading, works on all platforms including web PWA.
 *
 * ── Glow icon system ─────────────────────────────────────────────────────────
 * Drawn to belong to the same family as the Bloom brand mark (GlowMark in
 * GlowLogo.tsx): everything is curve-first, nothing terminates in a sharp
 * point, and each glyph carries one small "bloom dot" of scattered light the
 * way the mark does. Deliberately NOT a Material/Feather clone:
 *
 *   - SW (1.7) is a touch heavier than Feather's hairline so the set reads warm
 *     and confident rather than clinical/thin at tab-bar size.
 *   - Round caps + round joins everywhere, no mitered corners.
 *   - Straight runs are eased into gentle arcs where a geometric set would use
 *     a hard line (roof lines, pin shoulders, chevrons).
 *   - `filled` states use a soft tint wash (TINT) under the same stroked
 *     silhouette + a solid accent dot, instead of a flat solid slab — the mark's
 *     two-layer petal logic applied to UI icons.
 *
 * NO SVG gradients — url(#id) renders blank in react-native-svg-web/PWA.
 */
import React from 'react';
import Svg, { Path, Rect, Circle, Line, G } from 'react-native-svg';
import { Colors } from '../utils/colors';

interface P { size?: number; color?: string; filled?: boolean }

/** Shared stroke system for the redrawn Glow icons. */
const SW = 1.7;
/** Secondary/support strokes (inner detail) sit one step lighter. */
const SW_SOFT = 1.45;
/** Soft tint wash used under `filled` silhouettes (alpha suffix on hex color). */
const TINT = '26';
/** Standard stroke props — round everything, no fill. */
const S = { strokeWidth: SW, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

/**
 * HomeIcon — a softened house: the roof is a gentle arc rather than a peak,
 * shoulders are heavily rounded, and the doorway is an arch (not a rectangle)
 * echoing the petal silhouette in the Bloom mark. Filled state adds the
 * signature bloom dot in the gable.
 */
export function HomeIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Soft tint wash under the silhouette when active */}
      {filled && (
        <Path
          d="M3.6 10.7c0-.7.3-1.3.85-1.75l6.3-4.9a2 2 0 0 1 2.5 0l6.3 4.9c.55.45.85 1.05.85 1.75v7.5a2.3 2.3 0 0 1-2.3 2.3H5.9a2.3 2.3 0 0 1-2.3-2.3z"
          fill={color + TINT}
        />
      )}
      <G stroke={color} {...S}>
        {/* Body + gently curved roof, drawn as one continuous rounded form */}
        <Path d="M3.6 10.7c0-.7.3-1.3.85-1.75l6.3-4.9a2 2 0 0 1 2.5 0l6.3 4.9c.55.45.85 1.05.85 1.75v7.5a2.3 2.3 0 0 1-2.3 2.3H5.9a2.3 2.3 0 0 1-2.3-2.3z" />
        {/* Arched doorway — petal-shaped, not a box */}
        <Path d="M9.6 20.5v-4.1a2.4 2.4 0 0 1 4.8 0v4.1" />
      </G>
      {/* Bloom dot — scattered-light accent from the brand mark */}
      {filled && <Circle cx={12} cy={9.5} r={1.15} fill={color} />}
    </Svg>
  );
}

/**
 * CalendarIcon — squircle body (rx 5, iOS-soft) instead of the usual boxy
 * rect, short rounded hanger studs, and a single gold-position bloom dot as
 * the "booked day" marker rather than a grid of hard squares.
 */
export function CalendarIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        {/* Generously rounded body — squircle, not a rectangle */}
        <Rect x="3.3" y="5.2" width="17.4" height="15.3" rx="5"
          fill={filled ? color + TINT : 'none'}
        />
        {/* Header rule, eased to the body's curve */}
        <Path d="M3.6 10.1h16.8" />
        {/* Hanger studs — short, round-capped */}
        <Path d="M8.2 3.4v2.6M15.8 3.4v2.6" />
      </G>
      {/* Day marks: one solid bloom dot + two soft companions (scattered light) */}
      <Circle cx={8.4} cy={14.2} r={1.2} fill={color} />
      <Circle cx={12} cy={14.2} r={1.2} fill={color} opacity={filled ? 0.9 : 0.4} />
      <Circle cx={15.6} cy={14.2} r={1.2} fill={color} opacity={filled ? 0.55 : 0.28} />
      <Circle cx={8.4} cy={17.5} r={1.2} fill={color} opacity={filled ? 0.55 : 0.28} />
      <Circle cx={12} cy={17.5} r={1.2} fill={color} opacity={filled ? 0.4 : 0.2} />
    </Svg>
  );
}

/**
 * BriefcaseIcon — kit bag. Softened to a squircle body (rx 4) with a rounded
 * handle arc; the clasp is a bloom dot rather than a person glyph, which was
 * doing double duty with PersonIcon and reading busy at 15-16px.
 */
export function BriefcaseIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        <Rect x="2.9" y="7.6" width="18.2" height="12" rx="4"
          fill={filled ? color + TINT : 'none'} />
        {/* Rounded handle */}
        <Path d="M8.9 7.6V6.6A2 2 0 0 1 10.9 4.6h2.2a2 2 0 0 1 2 2v1" />
        {/* Band across the body */}
        <Path d="M2.9 12.4h18.2" opacity={0.55} />
      </G>
      {/* Clasp — bloom dot. Never paints an opaque backdrop: this icon renders
          on rose/plum chips as well as white cards, so a hardcoded light fill
          would punch a visible hole in it. */}
      <Circle cx="12" cy="12.4" r="1.5" fill={filled ? color : 'none'}
        stroke={color} strokeWidth={SW_SOFT} />
    </Svg>
  );
}

/**
 * LocationPinIcon — solid map marker (map overlays / dark chips). Redrawn as a
 * teardrop with the same shoulder curve as the Bloom mark's petal, tapering to
 * a soft point rather than the stock circle-on-a-spike.
 */
export function LocationPinIcon({ size = 24, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21.4c-4.3-4.9-6.6-8.4-6.6-11.3A6.6 6.6 0 0 1 18.6 10.1c0 2.9-2.3 6.4-6.6 11.3z"
        fill={color}
      />
      <Circle cx="12" cy="9.9" r="2.5" fill="rgba(0,0,0,0.35)" />
    </Svg>
  );
}

/** PlusIcon — round-capped, slightly inset so it centres in a circular FAB. */
export function PlusIcon({ size = 28, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Path d="M14 7v14M7 14h14"
        stroke={color} strokeWidth={2} strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * SearchJobsIcon — the Provider tab bar's centre action. A lens with a soft
 * four-petal bloom inside it (the brand mark, miniaturised) instead of the
 * stock "magnifier + map pin": this is the single most-seen glyph in the
 * Provider app, so it carries the mark directly.
 */
export function SearchJobsIcon({ size = 24, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        {/* Lens */}
        <Circle cx="10.6" cy="10.6" r="6.5" />
        {/* Handle, angled off the lens on the brand's 45deg */}
        <Path d="m15.5 15.5 4.2 4.2" />
      </G>
      {/* Bloom inside the lens — four petals + core, echoing GlowMark */}
      <G fill={color}>
        <Path d="M10.6 6.6c1 1 1.5 2 1.5 2.85s-.65 1.45-1.5 1.45-1.5-.6-1.5-1.45.5-1.85 1.5-2.85z" opacity={0.95} />
        <Path d="M14.6 10.6c-1 1-2 1.5-2.85 1.5s-1.45-.65-1.45-1.5.6-1.5 1.45-1.5 1.85.5 2.85 1.5z" opacity={0.75} />
        <Path d="M10.6 14.6c-1-1-1.5-2-1.5-2.85s.65-1.45 1.5-1.45 1.5.6 1.5 1.45-.5 1.85-1.5 2.85z" opacity={0.95} />
        <Path d="M6.6 10.6c1-1 2-1.5 2.85-1.5s1.45.65 1.45 1.5-.6 1.5-1.45 1.5-1.85-.5-2.85-1.5z" opacity={0.75} />
        <Circle cx="10.6" cy="10.6" r="1.05" />
      </G>
    </Svg>
  );
}

/**
 * ArrowBackIcon — the app's back affordance (used on ~15 screens). Stroked to
 * match the chevrons; the head is a soft open V with round joins, not the
 * solid Material wedge it replaced.
 */
export function ArrowBackIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        <Path d="M19.4 12H4.9" />
        <Path d="M10.6 5.9 4.85 11.4a.85.85 0 0 0 0 1.2l5.75 5.5" />
      </G>
    </Svg>
  );
}

/**
 * LocationIcon — stroked sibling of LocationPinIcon (identical silhouette),
 * so inline "where" labels match the map markers exactly.
 */
export function LocationIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        <Path d="M12 21.4c-4.3-4.9-6.6-8.4-6.6-11.3A6.6 6.6 0 0 1 18.6 10.1c0 2.9-2.3 6.4-6.6 11.3z" />
        <Circle cx="12" cy="9.9" r="2.5" />
      </G>
    </Svg>
  );
}

/** CallIcon — handset, stroked to match the set (was a solid Material glyph). */
export function CallIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5.2 3.7h3.1a1.2 1.2 0 0 1 1.18 1c.1.75.28 1.48.53 2.18a1.2 1.2 0 0 1-.3 1.26l-1.5 1.5a14.5 14.5 0 0 0 6.15 6.15l1.5-1.5a1.2 1.2 0 0 1 1.26-.3c.7.25 1.43.43 2.18.53a1.2 1.2 0 0 1 1 1.2v3.05a1.9 1.9 0 0 1-2.06 1.9C10.6 19.9 4.1 13.4 3.3 5.76A1.9 1.9 0 0 1 5.2 3.7z"
        stroke={color} {...S} />
    </Svg>
  );
}

/**
 * ChatIcon — messages. Rounded bubble (rx 5.5) with a soft tail, and bloom-dot
 * ellipsis instead of hard rules — friendlier at the small sizes it's used at.
 */
export function ChatIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4.4 3.6h15.2a2.4 2.4 0 0 1 2.4 2.4v8.6a2.4 2.4 0 0 1-2.4 2.4H9.1l-4.3 3.6a.9.9 0 0 1-1.5-.7V6a2.4 2.4 0 0 1 2.4-2.4z"
        fill={color} />
      <G fill="#FFFFFF">
        <Circle cx="8.3" cy="10.3" r="1.15" />
        <Circle cx="12" cy="10.3" r="1.15" />
        <Circle cx="15.7" cy="10.3" r="1.15" />
      </G>
    </Svg>
  );
}

/**
 * SearchIcon — same lens geometry and handle angle as SearchJobsIcon so the
 * two read as one family, with a soft catchlight arc inside the lens (the
 * mark's specular highlight) instead of an empty ring.
 */
export function SearchIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        <Circle cx="10.6" cy="10.6" r="6.5" />
        <Path d="m15.5 15.5 4.2 4.2" />
      </G>
      {/* Catchlight — reads as glass, and as the brand's scattered light */}
      <Path d="M7.8 8.5a3.9 3.9 0 0 1 2.4-1.7"
        stroke={color} strokeWidth={SW_SOFT} strokeLinecap="round" fill="none" opacity={0.5} />
    </Svg>
  );
}

/** CloseCircleIcon — clear/dismiss. Tighter inset X, round caps, softer disc. */
export function CloseCircleIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9.4" fill={color} />
      <Path d="M9.1 9.1l5.8 5.8M14.9 9.1l-5.8 5.8"
        stroke="#fff" strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * MapIcon / ListIcon — the Find Jobs view toggle, always seen as a pair, so
 * they share weight and inset. Map folds are eased into gentle S-curves (a
 * folded paper map never sits perfectly straight); the list gets round-capped
 * rules with leading bloom dots.
 */
export function MapIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        <Path d="M9 4.1 3.9 6.2a1.2 1.2 0 0 0-.75 1.1v11.3c0 .85.85 1.45 1.65 1.15L9 18.1l6 2.1 5.1-2.1a1.2 1.2 0 0 0 .75-1.1V5.7c0-.85-.85-1.45-1.65-1.15L15 6.2z" />
        {/* Folds — softly curved, not dead straight */}
        <Path d="M9 4.1c.3 5.2.3 9.9 0 14M15 6.2c-.3 5.2-.3 9.9 0 14" opacity={0.6} />
      </G>
    </Svg>
  );
}

export function ListIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        <Path d="M9.2 6.4h11M9.2 12h11M9.2 17.6h11" />
      </G>
      {/* Leading bullets — bloom dots */}
      <Circle cx="4.6" cy="6.4" r="1.25" fill={color} />
      <Circle cx="4.6" cy="12" r="1.25" fill={color} opacity={0.7} />
      <Circle cx="4.6" cy="17.6" r="1.25" fill={color} opacity={0.45} />
    </Svg>
  );
}

/**
 * LocateIcon — GPS crosshair. Core is a solid bloom dot inside a ring (the
 * mark's core + petal ring), with shorter, softer tick marks.
 */
export function LocateIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="7.8" stroke={color} strokeWidth={SW} fill="none" />
      <G stroke={color} {...S}>
        <Path d="M12 2.9v2.3M12 18.8v2.3M2.9 12h2.3M18.8 12h2.3" />
      </G>
      <Circle cx="12" cy="12" r="3.1" stroke={color} strokeWidth={SW_SOFT} fill="none" opacity={0.55} />
      <Circle cx="12" cy="12" r="1.5" fill={color} />
    </Svg>
  );
}

/** RadioOnIcon — selection dot: ring + bloom core, matching LocateIcon. */
export function RadioOnIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.6" stroke={color} strokeWidth={SW} fill="none" />
      <Circle cx="12" cy="12" r="4.2" fill={color} />
    </Svg>
  );
}

/**
 * NavigateIcon — directions arrow, redrawn as a petal-tapered paper plane with
 * softly curved trailing edges instead of the stock hard triangle.
 */
export function NavigateIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2.9c.42 0 .8.25.96.65l6.3 15.6c.35.87-.55 1.72-1.4 1.32L12 17.8l-5.86 2.67c-.85.4-1.75-.45-1.4-1.32l6.3-15.6c.16-.4.54-.65.96-.65z"
        fill={color} />
    </Svg>
  );
}

/**
 * StarIcon — ratings glyph, one of the most-repeated marks in the app (artist
 * cards, reviews, match scores). Redrawn with shallower, wider points and
 * round joins so a row of them reads as a soft gold constellation rather than
 * the spiky stock star. Round joins do the rounding — no separate radius math.
 */
export function StarIcon({ size = 24, color = '#FFB800', filled = true }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.4c.35 0 .67.2.83.52l2.2 4.45 4.92.72c.78.11 1.1 1.07.53 1.62l-3.56 3.47.84 4.9c.13.78-.68 1.37-1.38 1l-4.4-2.31-4.4 2.31c-.7.37-1.51-.22-1.38-1l.84-4.9-3.56-3.47c-.57-.55-.25-1.51.53-1.62l4.92-.72 2.2-4.45c.16-.32.48-.52.83-.52z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={filled ? 0 : SW_SOFT}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** DocumentIcon — rounded page with a softened folded corner. */
export function DocumentIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        <Path d="M13.6 3.1H6.9a2.4 2.4 0 0 0-2.4 2.4v13a2.4 2.4 0 0 0 2.4 2.4h10.2a2.4 2.4 0 0 0 2.4-2.4V8.9z" />
        <Path d="M13.6 3.1v4.2a1.6 1.6 0 0 0 1.6 1.6h4.3" />
        <Path d="M8.4 13.2h7.2M8.4 16.8h4.8" opacity={0.6} />
      </G>
    </Svg>
  );
}

/** CashIcon — payout note. Squircle bill with a bloom-core coin. */
export function CashIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2.4" y="6.2" width="19.2" height="11.6" rx="4"
        stroke={color} strokeWidth={SW} fill="none" />
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={SW_SOFT} fill="none" />
      <Circle cx="12" cy="12" r="1" fill={color} />
      <G fill={color} opacity={0.5}>
        <Circle cx="6" cy="12" r="0.9" />
        <Circle cx="18" cy="12" r="0.9" />
      </G>
    </Svg>
  );
}

/**
 * CheckCircleIcon — confirmation seal, used ~36 places (verified badges,
 * completed steps). Slightly smaller disc with a rounder, better-centred tick.
 */
export function CheckCircleIcon({ size = 24, color = Colors.onlineGreen }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9.4" fill={color} />
      <Path d="M7.6 12.2l2.9 2.9 5.9-6.2"
        stroke="#fff" strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/**
 * PersonIcon — a slightly smaller, higher head over a wide, low, softly
 * shouldered bust. The generic version used an open half-circle sweep that
 * reads clinical; this one closes the shoulders into a rounded cradle so the
 * negative space between head and body forms a petal.
 */
export function PersonIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {filled && (
        <>
          <Circle cx="12" cy="8.1" r="3.75" fill={color + TINT} />
          <Path d="M4.6 20.4c0-3.9 3.3-6.6 7.4-6.6s7.4 2.7 7.4 6.6a1 1 0 0 1-1 .1H5.6a1 1 0 0 1-1-.1z" fill={color + TINT} />
        </>
      )}
      <G stroke={color} {...S}>
        <Circle cx="12" cy="8.1" r="3.75" />
        {/* Rounded shoulder cradle, closed at the base */}
        <Path d="M4.6 20.4c0-3.9 3.3-6.6 7.4-6.6s7.4 2.7 7.4 6.6" />
      </G>
    </Svg>
  );
}

/**
 * Chevrons — stroked and round-jointed, replacing the old filled Material
 * glyphs (which were the loudest "stock icon library" tell in the set).
 * The apex is a round join, so they read as a soft bend rather than a spike.
 */
export function ChevronBackIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14.6 5.9 8.9 11.4a.85.85 0 0 0 0 1.2l5.7 5.5"
        stroke={color} {...S} />
    </Svg>
  );
}

export function ChevronForwardIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9.4 5.9l5.7 5.5a.85.85 0 0 1 0 1.2l-5.7 5.5"
        stroke={color} {...S} />
    </Svg>
  );
}

/** HourglassIcon — pending state. Round-capped frame, softly waisted middle. */
export function HourglassIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        <Path d="M6.6 3.2h10.8M6.6 20.8h10.8" />
        <Path d="M7.4 3.2v3.4c0 1.5.9 2.6 2.4 3.6 1.1.75 1.1 1.75 0 2.5-1.5 1-2.4 2.1-2.4 3.6v4.5" />
        <Path d="M16.6 3.2v3.4c0 1.5-.9 2.6-2.4 3.6-1.1.75-1.1 1.75 0 2.5 1.5 1 2.4 2.1 2.4 3.6v4.5" />
      </G>
      {/* Falling grain — bloom dot */}
      <Circle cx="12" cy="14.4" r="1" fill={color} opacity={0.55} />
    </Svg>
  );
}

/** FlashIcon — "just in" / urgent. Softened bolt with eased, rounded angles. */
export function FlashIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13.4 2.6c.6-.15 1.15.35 1.05.96l-.95 5.54h4.4c.72 0 1.1.84.63 1.38l-8.9 10.2c-.44.5-1.25.1-1.13-.56l1.15-6.52H5.5c-.72 0-1.1-.85-.62-1.39z"
        fill={color} />
    </Svg>
  );
}

/**
 * CalendarSVGIcon / HomeSVGIcon — legacy aliases kept for existing call sites.
 * They now delegate to the redrawn primaries so the two can never drift apart
 * visually (the old copies had their own, slightly different geometry).
 */
export function CalendarSVGIcon({ size = 24, color = '#000' }: P) {
  return <CalendarIcon size={size} color={color} />;
}

export function HomeSVGIcon({ size = 24, color = '#000' }: P) {
  return <HomeIcon size={size} color={color} />;
}

/**
 * CameraIcon — avatar/portfolio upload affordance. Squircle body (rx 4.5) and
 * a lens with the mark's specular dot.
 */
export function CameraIcon({ size = 18, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        <Path d="M3.9 9a2.4 2.4 0 0 1 2.4-2.4h1.05l.85-1.5a1.7 1.7 0 0 1 1.5-.9h4.6a1.7 1.7 0 0 1 1.5.9l.85 1.5h1.05A2.4 2.4 0 0 1 20.1 9v7.5a2.4 2.4 0 0 1-2.4 2.4H6.3a2.4 2.4 0 0 1-2.4-2.4z" />
        <Circle cx="12" cy="12.6" r="3.3" />
      </G>
      <Circle cx="10.6" cy="11.2" r="0.75" fill={color} opacity={0.75} />
    </Svg>
  );
}

/**
 * HeartIcon — Customer "Saved" tab. Fuller, rounder lobes and a soft base
 * taper (rather than the sharp V-point of the stock heart), so it sits in the
 * same curve family as the petals. Filled state keeps a stroked outline over
 * the fill for the two-layer look.
 */
export function HeartIcon({ size = 24, color = '#000', filled = false }: P) {
  const d = 'M12 20.6c-.35 0-.7-.13-.95-.38l-5.6-5.5a5.1 5.1 0 0 1 0-7.35 5 5 0 0 1 6.55 0c1.85-1.6 4.7-1.6 6.55 0a5.1 5.1 0 0 1 0 7.35l-5.6 5.5c-.25.25-.6.38-.95.38z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={color} {...S} fill={filled ? color : 'none'} />
      {/* Specular highlight — the mark's core dot, only when active */}
      {filled && <Circle cx="8.9" cy="10.2" r="1.15" fill="#FFFFFF" opacity={0.5} />}
    </Svg>
  );
}

/**
 * TuneIcon — filter sliders. Thumbs are hollow rings with a solid bloom core
 * (two-layer petal logic) rather than flat solid discs, and the rails are
 * inset so the thumbs breathe. Reads far softer than the Material slider.
 */
export function TuneIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        <Path d="M4.2 6.4h7.4M16.6 6.4h3.2" />
        <Path d="M4.2 12h2.4M11.6 12h8.2" />
        <Path d="M4.2 17.6h5.6M14.8 17.6h5" />
      </G>
      {/* Thumbs — ring + core, the mark's two-layer construction */}
      <G>
        <Circle cx="14.1" cy="6.4" r="2.4" stroke={color} strokeWidth={SW} fill="none" />
        <Circle cx="14.1" cy="6.4" r="0.95" fill={color} />
        <Circle cx="9.1" cy="12" r="2.4" stroke={color} strokeWidth={SW} fill="none" />
        <Circle cx="9.1" cy="12" r="0.95" fill={color} />
        <Circle cx="12.3" cy="17.6" r="2.4" stroke={color} strokeWidth={SW} fill="none" />
        <Circle cx="12.3" cy="17.6" r="0.95" fill={color} />
      </G>
    </Svg>
  );
}

/**
 * SortIcon — descending stack of rounded bars (long to short) with a soft
 * down-arrow, rather than the stock up/down double-arrow. Bar terminals are
 * fully round so it matches the rest of the set at small sizes.
 */
export function SortIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        {/* Graduated bars — the "sorted" idea, read instantly */}
        <Path d="M4 6.6h9.4M4 12h6.6M4 17.4h3.8" />
        {/* Direction arrow, softly curved shoulders */}
        <Path d="M17.6 5.6v12.8" />
        <Path d="M14.5 15.4c1.5.7 2.6 1.7 3.1 3 .5-1.3 1.6-2.3 3.1-3" />
      </G>
    </Svg>
  );
}

/**
 * CompassIcon — Customer "Explore" tab. The needle is redrawn as two opposed
 * petals around a bloom core instead of the stock rhombus, so the tab bar's
 * Explore glyph carries the brand mark the way the Provider's does.
 */
export function CompassIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.6"
        stroke={color} strokeWidth={SW} fill={filled ? color + TINT : 'none'} />
      {/* Petal needle — leading petal solid, trailing petal soft */}
      <Path d="M15.9 8.1c-.5 2.2-1.1 3.4-1.85 4.15S12.2 13.4 10 13.9c.5-2.2 1.1-3.4 1.85-4.15S13.7 8.6 15.9 8.1z"
        fill={color} />
      <Path d="M8.1 15.9c.5-2.2 1.1-3.4 1.85-4.15S11.8 10.6 14 10.1c-.5 2.2-1.1 3.4-1.85 4.15S10.3 15.4 8.1 15.9z"
        fill={color} opacity={0.4} />
      <Circle cx="12" cy="12" r="1.05" fill={color} />
    </Svg>
  );
}
