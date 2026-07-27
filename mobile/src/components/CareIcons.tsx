/**
 * CareIcons — Unified flat-geometric SVG icon set for Glow.
 *
 * Rules:
 *   - 24×24 viewBox for all standard icons; 112×112 for role marks.
 *   - strokeWidth 2, round caps/joins throughout.
 *   - NO SVG gradients (url(#id) renders blank in react-native-svg-web/PWA).
 *   - Every icon: function XIcon({ size = 24, color = Colors.brand })
 *   - Two-tone: `color` is primary; white or color-at-opacity for secondary shape.
 *
 * Reuses TabIcons.tsx equivalents by re-exporting them — no duplicate path data.
 */

import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { Colors } from '../utils/colors';

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports from TabIcons (no duplication)
// ─────────────────────────────────────────────────────────────────────────────
export {
  StarIcon,
  ChevronForwardIcon,
  CheckCircleIcon,
  PersonIcon,
  DocumentIcon,
  SearchIcon,
} from './TabIcons';

import {
  SparkleIcon,
  LipstickIcon,
  BrushIcon,
  HennaIcon,
  NailIcon,
  ScissorsIcon,
  HairColorIcon,
  FacialIcon,
  WaxIcon,
  LotusIcon,
  CrownIcon,
  PedicureIcon,
  SpaBloomIcon,
} from './BeautyIcons';
export * from './BeautyIcons';

// ─────────────────────────────────────────────────────────────────────────────
// Shared pin path — identical silhouette to GlowLogo's pin, drawn on
// a 112×112 viewBox so role marks are drop-in siblings of the logo mark.
// ─────────────────────────────────────────────────────────────────────────────
const PIN_PATH =
  'M56 6 C32 6 13 25 13 48.5 C13 66 26 80 44 97 L52.5 104.6 C54.5 106.4 57.5 106.4 59.5 104.6 L68 97 C86 80 99 66 99 48.5 C99 25 80 6 56 6 Z';

// ─────────────────────────────────────────────────────────────────────────────
// 1. ROLE MARKS  (112 × 112)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CustomerMark — pin + heart (same as GlowLogo; exists here so role marks
 * form a consistent set without importing the logo component).
 */
export function CustomerMark({
  size = 112,
  color = Colors.brand,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 112 112">
      {/* Pin body */}
      <Path d={PIN_PATH} fill={color} />
      {/* Heart cutout — white */}
      <Path
        d="M56 66 C54.9 66 53.8 65.6 53 64.9 C44.4 58 38.5 51.9 38.5 44.3 C38.5 38.2 43 34 48.2 34 C51.3 34 54.1 35.5 56 38 C57.9 35.5 60.7 34 63.8 34 C69 34 73.5 38.2 73.5 44.3 C73.5 51.9 67.6 58 59 64.9 C58.2 65.6 57.1 66 56 66 Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

/**
 * ProviderMark — pin + medical cross inside a rounded badge.
 */
export function ProviderMark({
  size = 112,
  color = Colors.brand,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 112 112">
      {/* Pin body */}
      <Path d={PIN_PATH} fill={color} />
      {/* Rounded badge background — slightly lighter white fill */}
      <Rect x="35" y="29" width="42" height="42" rx="11" fill="#FFFFFF" />
      {/* Medical cross — vertical bar */}
      <Rect x="51" y="35" width="10" height="30" rx="3" fill={color} />
      {/* Medical cross — horizontal bar */}
      <Rect x="41" y="45" width="30" height="10" rx="3" fill={color} />
    </Svg>
  );
}

/**
 * AdminMark — pin + shield with a check mark.
 */
export function AdminMark({
  size = 112,
  color = Colors.brand,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 112 112">
      {/* Pin body */}
      <Path d={PIN_PATH} fill={color} />
      {/* Shield — white fill */}
      <Path
        d="M56 29 L38 37 L38 51 C38 62 46 71 56 74 C66 71 74 62 74 51 L74 37 Z"
        fill="#FFFFFF"
      />
      {/* Check mark inside shield */}
      <Path
        d="M47 51 L53 58 L66 44"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. UI + QUICK-ACTION ICONS  (24 × 24)
//    Brand-kit canonical set — stroke 1.9 · round caps/joins · fill="none".
//    Paths lifted verbatim from docs/Glow Brand Kit (1).html (#i-* symbols).
// ─────────────────────────────────────────────────────────────────────────────

// Common props for every line icon.
type IconProps = { size?: number; color?: string };

// Shared stroke system — matches TabIcons/BeautyIcons exactly so the three
// files render as ONE set. Was 1.55 (inherited from the CareNearby brand kit),
// which read thinner and colder than the redrawn Glow icons next to it.
const SW = 1.7;
const SW_SOFT = 1.45;
const S = { strokeWidth: SW, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

/**
 * FindJobsIcon — kit bag + lens. Bag now uses the same squircle + rounded
 * handle as BriefcaseIcon, and the lens/handle angle matches SearchIcon, so
 * this composite reads as two Glow glyphs rather than a third variant of each.
 */
export function FindJobsIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={7.4} width={12.2} height={9.2} rx={3.2} stroke={color} {...S} />
      <Path d="M5.9 7.4V6.5A1.7 1.7 0 0 1 7.6 4.8h2A1.7 1.7 0 0 1 11.3 6.5v.9" stroke={color} {...S} />
      <Path d="M2.5 11.1h12.2" stroke={color} {...S} opacity={0.55} />
      <Circle cx={17.2} cy={16.2} r={3.2} stroke={color} {...S} />
      <Path d="m19.5 18.5 2.3 2.3" stroke={color} {...S} />
    </Svg>
  );
}

/** EarningsIcon — two coins, one with $ (i-earnings). */
export function EarningsIcon({ size = 24, color = Colors.brand }: IconProps) {
  // Single clean coin with a $ — reads clearly at 24-26px (the prior two-coin
  // glyph had an incomplete second circle that looked like a stray squiggle).
  // Ring radius aligned to ClockIcon/ProfileIcon so circular glyphs match.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.6} stroke={color} {...S} />
      <Path d="M12 6.9v10.2" stroke={color} {...S} />
      <Path d="M14.7 9.3c-.6-1-1.7-1.4-2.8-1.4-1.5 0-2.7.8-2.7 2.1 0 1.2 1 1.7 2.7 2.1 1.7.4 2.9.9 2.9 2.2 0 1.3-1.2 2.2-2.9 2.2-1.2 0-2.3-.5-2.9-1.5" stroke={color} {...S} />
    </Svg>
  );
}

/**
 * ProfileIcon — the CUSTOMER tab bar's Profile glyph, so it matters as much as
 * anything in TabIcons. Same head/shoulder proportions as PersonIcon there
 * (smaller, higher head; wide low cradle) enclosed in a ring — the two Profile
 * glyphs across the two tab bars now read as the same drawing.
 */
export function ProfileIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.8} stroke={color} {...S} />
      <Circle cx={12} cy={9.9} r={2.85} stroke={color} {...S} />
      <Path d="M6.6 18.8a5.7 5.7 0 0 1 10.8 0" stroke={color} {...S} />
    </Svg>
  );
}

/**
 * HelpIcon — support. Ring radius aligned to the circular-glyph family
 * (Clock/Profile/Earnings/Locate at r 8.6) with softer, shorter spokes.
 */
export function HelpIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.6} stroke={color} {...S} />
      <Circle cx={12} cy={12} r={3.4} stroke={color} {...S} />
      <Path d="M6.4 6.4l3.2 3.2M17.6 6.4l-3.2 3.2M6.4 17.6l3.2-3.2M17.6 17.6l-3.2-3.2" stroke={color} {...S} opacity={0.75} />
    </Svg>
  );
}

/**
 * BellIcon — notifications (~24 call sites). Dome is now a true rounded bell
 * with a flared, softly curved skirt instead of the flat-shouldered trapezoid,
 * and the clapper is a bloom dot.
 */
export function BellIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.4a5.6 5.6 0 0 1 5.6 5.6v3.6c0 1.15.42 2.05 1.25 2.9a.85.85 0 0 1-.6 1.45H5.75a.85.85 0 0 1-.6-1.45c.83-.85 1.25-1.75 1.25-2.9V9A5.6 5.6 0 0 1 12 3.4z" stroke={color} {...S} />
      <Path d="M10.1 19.6a2.1 2.1 0 0 0 3.8 0" stroke={color} {...S} />
    </Svg>
  );
}

/**
 * NoteIcon — bookings/notes (~31 call sites). Squircle board (rx 4) matching
 * BriefcaseIcon and CalendarIcon, fully rounded clip, and bloom-dot bullets
 * leading the rules.
 */
export function NoteIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8.4 4.9H6.9a2.2 2.2 0 0 0-2.2 2.2v11.6a2.2 2.2 0 0 0 2.2 2.2h10.2a2.2 2.2 0 0 0 2.2-2.2V7.1a2.2 2.2 0 0 0-2.2-2.2h-1.5" stroke={color} {...S} />
      <Rect x={8.4} y={3.2} width={7.2} height={3.5} rx={1.75} stroke={color} {...S} />
      <Path d="M10.4 11.6h5.2M10.4 15.4h3.4" stroke={color} {...S} />
      <Circle cx={8.3} cy={11.6} r={0.85} fill={color} />
      <Circle cx={8.3} cy={15.4} r={0.85} fill={color} opacity={0.6} />
    </Svg>
  );
}

/** HospitalIcon — medical cross in rounded square (i-cross). */
export function HospitalIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={16} height={16} rx={4.5} stroke={color} {...S} />
      <Path d="M12 8v8M8 12h8" stroke={color} {...S} />
    </Svg>
  );
}

/** PulseIcon — heartbeat line (i-pulse). */
export function PulseIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12.5h3.6l2-5 3.2 10 2.4-7 1.5 2H21" stroke={color} {...S} />
    </Svg>
  );
}

/**
 * ShieldCheckIcon — the Glow Trust badge (~36 call sites: verified artists,
 * trust cards, onboarding). Redrawn as a soft-shouldered shield that tapers to
 * a rounded base, replacing the octagon "seal" which was the most
 * stock-looking glyph in the set and read as a compliance stamp.
 */
export function ShieldCheckIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.1c2 1.35 4.15 2.1 6.45 2.25a.9.9 0 0 1 .85.9v4.9c0 3.85-2.4 6.9-7.05 9.15a.6.6 0 0 1-.5 0C7.1 18.05 4.7 15 4.7 11.15v-4.9a.9.9 0 0 1 .85-.9C7.85 5.2 10 4.45 12 3.1z" stroke={color} {...S} />
      <Path d="M9.1 11.9l2.05 2.05 3.75-3.95" stroke={color} {...S} />
    </Svg>
  );
}

/**
 * PinIcon — the app's most-used location glyph (~26 call sites). Path is now
 * IDENTICAL to LocationIcon/LocationPinIcon in TabIcons: previously the two
 * pins were subtly different shapes and both appeared on the Find Jobs screen.
 */
export function PinIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21.4c-4.3-4.9-6.6-8.4-6.6-11.3A6.6 6.6 0 0 1 18.6 10.1c0 2.9-2.3 6.4-6.6 11.3z" stroke={color} {...S} />
      <Circle cx={12} cy={9.9} r={2.5} stroke={color} {...S} />
    </Svg>
  );
}

/** CreditCardIcon — payment card. Squircle body (rx 4) to match CashIcon. */
export function CreditCardIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.6} y={5.4} width={18.8} height={13.2} rx={4} stroke={color} {...S} />
      <Path d="M2.6 10.1h18.8" stroke={color} {...S} />
      <Path d="M6.4 14.7h3.2" stroke={color} {...S} opacity={0.6} />
    </Svg>
  );
}

/** AccountCheckIcon — verified person. Head/shoulder proportions match PersonIcon. */
export function AccountCheckIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.4} cy={8.1} r={3.6} stroke={color} {...S} />
      <Path d="M4.6 19.6a6 6 0 0 1 10.5-3.9" stroke={color} {...S} />
      <Path d="M15.2 18.7l1.95 1.95 3.45-3.75" stroke={color} {...S} />
    </Svg>
  );
}

/** MedicalBagIcon — medical bag (i-medbag). */
export function MedicalBagIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={8.5} width={18} height={11.5} rx={2} stroke={color} {...S} />
      <Path d="M9 8.5V7a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 7v1.5" stroke={color} {...S} />
      <Path d="M12 12v4M10 14h4" stroke={color} {...S} />
    </Svg>
  );
}

/**
 * CheckDecagramIcon — verified seal. Now a scalloped bloom rosette (eight soft
 * lobes) rather than a duplicate of ShieldCheckIcon's path: the two were
 * pixel-identical before, so "verified" and "trust" looked like the same badge.
 * The scallop echoes the mark's petals.
 */
export function CheckDecagramIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.1c1.05 0 2 .58 2.5 1.44a2.9 2.9 0 0 1 3.82 3.82 2.9 2.9 0 0 1 0 5.28 2.9 2.9 0 0 1-3.82 3.82 2.9 2.9 0 0 1-5 0 2.9 2.9 0 0 1-3.82-3.82 2.9 2.9 0 0 1 0-5.28A2.9 2.9 0 0 1 9.5 4.54 2.9 2.9 0 0 1 12 3.1z"
        stroke={color} {...S} />
      <Path d="M9.3 12.05l1.95 1.95 3.6-3.8" stroke={color} {...S} />
    </Svg>
  );
}

/** EmailIcon — envelope. Squircle body + a softly curved flap. */
export function EmailIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.6} y={5.4} width={18.8} height={13.2} rx={4} stroke={color} {...S} />
      <Path d="M4.2 8.2l6.6 4.5a2.1 2.1 0 0 0 2.4 0l6.6-4.5" stroke={color} {...S} />
    </Svg>
  );
}

/** MonitorDashboardIcon — admin dashboard tab. Squircle screen + soft bars. */
export function MonitorDashboardIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={4.6} width={19} height={11.6} rx={3.6} stroke={color} {...S} />
      <Path d="M9.6 20.2h4.8M12 16.2v4" stroke={color} {...S} />
      <Path d="M6.8 12.6v-1.8M10.3 12.6v-3.8M13.8 12.6v-1.4M17.3 12.6v-3.3" stroke={color} {...S} opacity={0.8} />
    </Svg>
  );
}

/** ChartBoxIcon — stats. Squircle frame (rx 4.5) + round-capped bars. */
export function ChartBoxIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.4} y={3.4} width={17.2} height={17.2} rx={4.5} stroke={color} {...S} />
      <Path d="M8.2 16.2v-2.8M12 16.2v-5.8M15.8 16.2v-3.8" stroke={color} {...S} />
    </Svg>
  );
}

/** PhoneCheckIcon — verified phone. Handset matches CallIcon's silhouette. */
export function PhoneCheckIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4.9 4.3h2.6a1.1 1.1 0 0 1 1.08.92c.09.63.24 1.24.45 1.83a1.1 1.1 0 0 1-.28 1.15L7.5 9.45a12.6 12.6 0 0 0 5.1 5.1l1.25-1.25a1.1 1.1 0 0 1 1.15-.28c.59.21 1.2.36 1.83.45a1.1 1.1 0 0 1 .92 1.1v2.53a1.7 1.7 0 0 1-1.85 1.7C9.4 18.2 3.9 12.7 3.2 6.15A1.7 1.7 0 0 1 4.9 4.3z" stroke={color} {...S} />
      <Path d="M15.1 6.6l1.65 1.65L20.1 4.9" stroke={color} {...S} />
    </Svg>
  );
}

/** CardAccountDetailsIcon — ID card. Squircle body matching the card family. */
export function CardAccountDetailsIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.6} y={4.9} width={18.8} height={14.2} rx={4} stroke={color} {...S} />
      <Circle cx={8.6} cy={10.6} r={2.1} stroke={color} {...S} />
      <Path d="M5.5 16a3.2 3.2 0 0 1 6.2 0" stroke={color} {...S} />
      <Path d="M14.8 9.7h3.8M14.8 12.6h3.8M14.8 15.5h2.4" stroke={color} {...S} opacity={0.65} />
    </Svg>
  );
}

/** BriefcaseAccountIcon — work profile. Squircle bag matching BriefcaseIcon. */
export function BriefcaseAccountIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.9} y={7.6} width={18.2} height={12} rx={4} stroke={color} {...S} />
      <Path d="M8.9 7.6V6.6A2 2 0 0 1 10.9 4.6h2.2a2 2 0 0 1 2 2v1" stroke={color} {...S} />
      <Circle cx={12} cy={12.4} r={1.9} stroke={color} {...S} />
      <Path d="M9 17.4a3.1 3.1 0 0 1 6 0" stroke={color} {...S} />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SERVICE ICONS  (24 × 24) — matched family, i-svc-* from the brand kit.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PersonalCareIcon — the FALLBACK icon for any service with no specific glyph
 * (see ServiceIcon.tsx), so it is far more visible than its single import
 * suggests. Redrawn as a four-petal bloom + core: an unmapped service now
 * falls back to the brand mark itself rather than a person-with-heart, which
 * read as a CareNearby caregiving glyph.
 */
export function PersonalCareIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} {...S}>
        <Path d="M12 3.4c1.6 1.6 2.35 3.1 2.35 4.6S13.4 10.5 12 10.5s-2.35-1-2.35-2.5S10.4 5 12 3.4z" />
        <Path d="M20.6 12c-1.6 1.6-3.1 2.35-4.6 2.35S13.5 13.4 13.5 12s1-2.35 2.5-2.35S19 10.4 20.6 12z" />
        <Path d="M12 20.6c-1.6-1.6-2.35-3.1-2.35-4.6s1-2.5 2.35-2.5 2.35 1 2.35 2.5-.75 3-2.35 4.6z" />
        <Path d="M3.4 12c1.6-1.6 3.1-2.35 4.6-2.35s2.5 1 2.5 2.35-1 2.35-2.5 2.35S5 13.6 3.4 12z" />
      </G>
      <Circle cx={12} cy={12} r={1.1} fill={color} />
    </Svg>
  );
}

/** CompanionIcon — two people (i-svc-companion). */
export function CompanionIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={8} cy={11} r={2.6} stroke={color} {...S} />
      <Circle cx={16} cy={11} r={2.6} stroke={color} {...S} />
      <Path d="M3.5 19.5a4.5 4.5 0 0 1 9 0M11.5 19.5a4.5 4.5 0 0 1 9 0" stroke={color} {...S} />
      <Path d="M12 4.5c-.2-.4-.6-.6-1.05-.6-.6 0-1.05.45-1.05 1.05 0 .75 1 1.35 2.1 2.15 1.1-.8 2.1-1.4 2.1-2.15 0-.6-.45-1.05-1.05-1.05-.45 0-.85.2-1.05.6z" stroke={color} {...S} />
    </Svg>
  );
}

/** MealIcon — covered dish (i-svc-meal). */
export function MealIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3.5 12h17a8.5 8.5 0 0 1-17 0z" stroke={color} {...S} />
      <Path d="M3 12h18" stroke={color} {...S} />
      <Path d="M9 7c0-1.2 1-1.2 1-2.4M12.5 6.6c0-1.2 1-1.2 1-2.4M16 7c0-1.2 1-1.2 1-2.4" stroke={color} {...S} />
    </Svg>
  );
}

/** MedicationIcon — capsule (i-svc-med). */
export function MedicationIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 13l6-6a3.5 3.5 0 0 1 5 5l-6 6a3.5 3.5 0 0 1-5-5z" stroke={color} {...S} />
      <Path d="M10 10l5 5" stroke={color} {...S} />
    </Svg>
  );
}

/** HousekeepingIcon — sparkle / clean (i-svc-house). */
export function HousekeepingIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 3.5l1.6 4.3L17 9.4l-4.4 1.6L11 15.4 9.4 11 5 9.4l4.4-1.6z" stroke={color} {...S} />
      <Path d="M17.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" stroke={color} {...S} />
    </Svg>
  );
}

/** MobilityIcon — walking / mobility assist (i-svc-mobility). */
export function MobilityIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12.5} cy={4.3} r={1.9} stroke={color} {...S} />
      <Path d="M12.5 6.5v6M12.5 12.5l-2 8M12.5 12.5l2.2 5M12.5 8.7l3 2.1" stroke={color} {...S} />
      <Path d="M16 10.8l1 9.7M15.2 20.5h3.4" stroke={color} {...S} />
    </Svg>
  );
}

/** PostSurgeryIcon — bandage (i-svc-bandage). */
export function PostSurgeryIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G transform="rotate(45 12 12)">
        <Rect x={4.5} y={9} width={15} height={6} rx={3} stroke={color} {...S} />
        <Path d="M9.5 12h.01M12 12h.01M14.5 12h.01" stroke={color} {...S} />
      </G>
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PROFILE / INFO-ROW UTILITY ICONS  (24 × 24)
// ─────────────────────────────────────────────────────────────────────────────

/** PhoneMobileIcon — handset. Rounder chassis (rx 4) + bloom-dot home mark. */
export function PhoneMobileIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5.9} y={2.9} width={12.2} height={18.2} rx={4} stroke={color} {...S} />
      <Path d="M10.6 5.9h2.8" stroke={color} {...S} opacity={0.7} />
      <Circle cx={12} cy={17.9} r={0.95} fill={color} />
    </Svg>
  );
}

/**
 * KeyIcon — account/security rows (~6 call sites). Bow is a ring with a bloom
 * core; the shaft runs on the same 45deg diagonal as the search handles.
 */
export function KeyIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={8.3} cy={8.3} r={3.8} stroke={color} {...S} />
      <Path d="M11 11l8.6 8.6M16.6 16.6l1.9-1.9M14.1 14.1l1.6-1.6" stroke={color} {...S} />
      <Circle cx={8.3} cy={8.3} r={1.15} fill={color} />
    </Svg>
  );
}

/**
 * MedalIcon — artist credentials/experience. The inner star is replaced by a
 * bloom core-and-ring (the tiny 5-point star turned to mush below ~18px, which
 * is the size it's actually rendered at in profile rows).
 */
export function MedalIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={14.6} r={5.1} stroke={color} {...S} />
      <Path d="M9 10.2 6.5 3.6M15 10.2l2.5-6.6M9.5 4.1h5" stroke={color} {...S} />
      <Circle cx={12} cy={14.6} r={2.1} stroke={color} strokeWidth={SW_SOFT} fill="none" opacity={0.6} />
      <Circle cx={12} cy={14.6} r={0.95} fill={color} />
    </Svg>
  );
}

/** TranslateIcon — translate (i-translate). */
export function TranslateIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3.5 5.5h7M7 5.5v.5M9 5.7c-.2 4-2.6 7-5.5 8.3M4.6 9.6c1.2 1.7 3 2.9 5.2 3.4" stroke={color} {...S} />
      <Path d="M13 19.5l3.5-8 3.5 8M14.4 16.7h4.2" stroke={color} {...S} />
    </Svg>
  );
}

/**
 * ClockIcon — durations/timing (~23 call sites). Dial matches LocateIcon and
 * ProfileIcon's ring radius so all three circular glyphs share one footprint;
 * hands pivot on a bloom dot.
 */
export function ClockIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.6} stroke={color} {...S} />
      <Path d="M12 7.5V12l3.2 2.1" stroke={color} {...S} />
      <Circle cx={12} cy={12} r={0.9} fill={color} />
    </Svg>
  );
}

/**
 * PackageIcon — service packages on artist profiles. Corners of the box are
 * eased so the silhouette has the set's rounded feel at small sizes.
 */
export function PackageIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 3.35a2 2 0 0 1 2 0l6.5 3.5a2 2 0 0 1 1 1.75v6.8a2 2 0 0 1-1 1.75L13 20.65a2 2 0 0 1-2 0l-6.5-3.5a2 2 0 0 1-1-1.75V8.6a2 2 0 0 1 1-1.75z" stroke={color} {...S} />
      <Path d="M3.8 7.8 12 12.1l8.2-4.3M12 12.1v8.6" stroke={color} {...S} opacity={0.7} />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
/** GoogleLogoIcon — official 4-color "G" mark, fixed brand colors (no `color` prop). */
export function GoogleLogoIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <Path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <Path fill="#FBBC05" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.1 2 20.45 2 24s.85 6.9 2.34 9.88l7.35-5.7z" />
      <Path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </Svg>
  );
}

// Convenience map used by ServiceIcon.tsx internally
// ─────────────────────────────────────────────────────────────────────────────
export type ServiceIconComponent = React.ComponentType<{ size?: number; color?: string }>;

export const SERVICE_ICON_MAP: Record<string, ServiceIconComponent> = {
  'Makeup':        LipstickIcon,
  'Bridal Makeup': CrownIcon,
  'Party Makeup':  SparkleIcon,
  'Threading':     BrushIcon,
  'Hair Styling':  ScissorsIcon,
  'Hair Coloring': HairColorIcon,
  'Facial':        FacialIcon,
  'Waxing':        WaxIcon,
  'Nails':         NailIcon,
  'Manicure':      NailIcon,
  'Pedicure':      PedicureIcon,
  'Mehendi':       HennaIcon,
  'Massage':       LotusIcon,
  'Spa':           SpaBloomIcon,
};
