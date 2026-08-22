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
// files render as ONE set. Now Lucide's 24px/2px ratio: a single weight for
// every stroke in every glyph. The previous 1.7 + 1.45 "soft" pair meant
// primary and secondary detail in the SAME icon sat at different weights,
// which is the clearest giveaway of a hand-drawn set and is something no
// professional library does (Lucide ships zero secondary weights).
const SW = 2;
const S = { strokeWidth: SW, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

/**
 * FindJobsIcon — kit bag + lens. Bag now uses the same squircle + rounded
 * handle as BriefcaseIcon, and the lens/handle angle matches SearchIcon, so
 * this composite reads as two Glow glyphs rather than a third variant of each.
 */
export function FindJobsIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={7} width={12} height={9} rx={2} stroke={color} {...S} />
      <Path d="M6 7V5.5A1.5 1.5 0 0 1 7.5 4h3A1.5 1.5 0 0 1 12 5.5V7" stroke={color} {...S} />
      <Circle cx={17} cy={16} r={4} stroke={color} {...S} />
      <Path d="m20 19 2 2" stroke={color} {...S} />
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
      <Circle cx={12} cy={12} r={10} stroke={color} {...S} />
      <Path d="M12 6v12" stroke={color} {...S} />
      <Path d="M15 9.5A2.5 2.5 0 0 0 12.5 8h-1a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 1 0 5h-1A2.5 2.5 0 0 1 9 16.5" stroke={color} {...S} />
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
      <Circle cx={12} cy={12} r={10} stroke={color} {...S} />
      <Circle cx={12} cy={10} r={3} stroke={color} {...S} />
      <Path d="M5.5 19.2a7 7 0 0 1 13 0" stroke={color} {...S} />
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
      <Circle cx={12} cy={12} r={10} stroke={color} {...S} />
      <Circle cx={12} cy={12} r={4} stroke={color} {...S} />
      <Path d="m4.9 4.9 4.2 4.2M19.1 4.9l-4.2 4.2M4.9 19.1l4.2-4.2M19.1 19.1l-4.2-4.2" stroke={color} {...S} />
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
      <Path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" stroke={color} {...S} />
      <Path d="M10.268 21a2 2 0 0 0 3.464 0" stroke={color} {...S} />
    </Svg>
  );
}

// ShareIcon/PencilIcon/TrashIcon — a real icon set for card action rows
// (look card Share/Edit/Remove) that previously used plain Unicode glyphs
// (↗ ✎) rendered as Text, inconsistent with every other icon in the app.
export function ShareIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3v13" stroke={color} {...S} />
      <Path d="M7 8l5-5 5 5" stroke={color} {...S} />
      <Path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" stroke={color} {...S} />
    </Svg>
  );
}

export function DownloadIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3v13" stroke={color} {...S} />
      <Path d="M7 11l5 5 5-5" stroke={color} {...S} />
      <Path d="M5 19h14" stroke={color} {...S} />
    </Svg>
  );
}

export function PencilIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke={color} {...S} />
    </Svg>
  );
}

export function TrashIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16" stroke={color} {...S} />
      <Path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke={color} {...S} />
      <Path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke={color} {...S} />
      <Path d="M10 11v6M14 11v6" stroke={color} {...S} />
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
      <Path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" stroke={color} {...S} />
      <Rect x={8} y={2} width={8} height={4} rx={1} stroke={color} {...S} />
      <Path d="M9 12h6M9 16h4" stroke={color} {...S} />
    </Svg>
  );
}

/** HospitalIcon — medical cross in rounded square (i-cross). */
export function HospitalIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={4} width={16} height={16} rx={2} stroke={color} {...S} />
      <Path d="M12 8v8M8 12h8" stroke={color} {...S} />
    </Svg>
  );
}

/** PulseIcon — heartbeat line (i-pulse). */
export function PulseIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12h4l2-6 4 12 2-6h6" stroke={color} {...S} />
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
      <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" stroke={color} {...S} />
      <Path d="m9 12 2 2 4-4" stroke={color} {...S} />
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
      <Path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" stroke={color} {...S} />
      <Circle cx={12} cy={10} r={3} stroke={color} {...S} />
    </Svg>
  );
}

/** CreditCardIcon — payment card. Squircle body (rx 4) to match CashIcon. */
export function CreditCardIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={5} width={20} height={14} rx={2} stroke={color} {...S} />
      <Path d="M2 10h20" stroke={color} {...S} />
      <Path d="M6 15h4" stroke={color} {...S} />
    </Svg>
  );
}

/** AccountCheckIcon — verified person. Head/shoulder proportions match PersonIcon. */
export function AccountCheckIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={10} cy={8} r={4} stroke={color} {...S} />
      <Path d="M4 21v-1a5 5 0 0 1 5-5h1.5" stroke={color} {...S} />
      <Path d="m15 18 2 2 4-4" stroke={color} {...S} />
    </Svg>
  );
}

/** MedicalBagIcon — medical bag (i-medbag). */
export function MedicalBagIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={8} width={20} height={12} rx={2} stroke={color} {...S} />
      <Path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke={color} {...S} />
      <Path d="M12 11v6M9 14h6" stroke={color} {...S} />
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
      <Path d="M12 2.5a2.6 2.6 0 0 1 2.16 1.15 2.6 2.6 0 0 1 3.4 1.79 2.6 2.6 0 0 1 1.79 3.4A2.6 2.6 0 0 1 20.5 11a2.6 2.6 0 0 1-1.15 2.16 2.6 2.6 0 0 1-1.79 3.4 2.6 2.6 0 0 1-3.4 1.79 2.6 2.6 0 0 1-4.32 0 2.6 2.6 0 0 1-3.4-1.79 2.6 2.6 0 0 1-1.79-3.4A2.6 2.6 0 0 1 3.5 11a2.6 2.6 0 0 1 1.15-2.16 2.6 2.6 0 0 1 1.79-3.4 2.6 2.6 0 0 1 3.4-1.79A2.6 2.6 0 0 1 12 2.5z"
        stroke={color} {...S} />
      <Path d="m9 11 2 2 4-4" stroke={color} {...S} />
    </Svg>
  );
}

/** EmailIcon — envelope. Squircle body + a softly curved flap. */
export function EmailIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={4} width={20} height={16} rx={2} stroke={color} {...S} />
      <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" stroke={color} {...S} />
    </Svg>
  );
}

/** InstagramIcon — rounded-square camera glyph, same outline language as the rest of this set. */
export function InstagramIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={5} stroke={color} {...S} />
      <Circle cx={12} cy={12} r={4} stroke={color} {...S} />
      <Circle cx={17.2} cy={6.8} r={0.6} fill={color} />
    </Svg>
  );
}

/** MonitorDashboardIcon — admin dashboard tab. Squircle screen + soft bars. */
export function MonitorDashboardIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={4} width={20} height={12} rx={2} stroke={color} {...S} />
      <Path d="M9 20h6M12 16v4" stroke={color} {...S} />
      <Path d="M7 12v-2M11 12v-4M15 12v-1M19 12v-3" stroke={color} {...S} />
    </Svg>
  );
}

/** ChartBoxIcon — stats. Squircle frame (rx 4.5) + round-capped bars. */
export function ChartBoxIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={2} stroke={color} {...S} />
      <Path d="M8 16v-3M12 16v-6M16 16v-4" stroke={color} {...S} />
    </Svg>
  );
}

/** PhoneCheckIcon — verified phone. Handset matches CallIcon's silhouette. */
export function PhoneCheckIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12.5 16.2a1 1 0 0 0 1.2-.3l.3-.4a2 2 0 0 1 1.6-.8h1.4a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A17 17 0 0 1 2 5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.4a2 2 0 0 1-.8 1.6l-.4.3a1 1 0 0 0-.3 1.2 13 13 0 0 0 5 5" stroke={color} {...S} />
      <Path d="m15 6 2 2 4-4" stroke={color} {...S} />
    </Svg>
  );
}

/** CardAccountDetailsIcon — ID card. Squircle body matching the card family. */
export function CardAccountDetailsIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={4} width={20} height={16} rx={2} stroke={color} {...S} />
      <Circle cx={8.5} cy={10} r={2.5} stroke={color} {...S} />
      <Path d="M5 16a3.5 3.5 0 0 1 7 0" stroke={color} {...S} />
      <Path d="M15 9h4M15 13h4M15 16h2" stroke={color} {...S} />
    </Svg>
  );
}

/** BriefcaseAccountIcon — work profile. Squircle bag matching BriefcaseIcon. */
export function BriefcaseAccountIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={7} width={20} height={13} rx={2} stroke={color} {...S} />
      <Path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke={color} {...S} />
      <Circle cx={12} cy={12} r={2} stroke={color} {...S} />
      <Path d="M9 17.5a3.5 3.5 0 0 1 6 0" stroke={color} {...S} />
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
      {/* Four equal petals about the exact centre, each spanning 3 grid units
          from the core — snapped to the grid so opposing petals are true
          mirrors (they were 4.6/4.6/4.6/4.6 off-centre before). */}
      <G stroke={color} {...S}>
        <Path d="M12 3c1.7 1.7 2.5 3.3 2.5 4.9S13.4 10.5 12 10.5s-2.5-1-2.5-2.6S10.3 4.7 12 3z" />
        <Path d="M21 12c-1.7 1.7-3.3 2.5-4.9 2.5S13.5 13.4 13.5 12s1-2.5 2.6-2.5S19.3 10.3 21 12z" />
        <Path d="M12 21c-1.7-1.7-2.5-3.3-2.5-4.9s1-2.6 2.5-2.6 2.5 1 2.5 2.6S13.7 19.3 12 21z" />
        <Path d="M3 12c1.7-1.7 3.3-2.5 4.9-2.5s2.6 1 2.6 2.5-1 2.5-2.6 2.5S4.7 13.7 3 12z" />
      </G>
      <Circle cx={12} cy={12} r={1.5} fill={color} />
    </Svg>
  );
}

/** CompanionIcon — two people (i-svc-companion). */
export function CompanionIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Two figures with heads a full 9 units apart and non-overlapping
          shoulder arcs — at 8/16 with r=3 the two heads nearly touched. */}
      <Circle cx={7.5} cy={12} r={2.5} stroke={color} {...S} />
      <Circle cx={16.5} cy={12} r={2.5} stroke={color} {...S} />
      <Path d="M3 20.5a4.5 4.5 0 0 1 9 0M12 20.5a4.5 4.5 0 0 1 9 0" stroke={color} {...S} />
      <Path d="M12 8c1.6-1.3 2.5-2.2 2.5-3.2A1.6 1.6 0 0 0 12 3.5a1.6 1.6 0 0 0-2.5 1.3C9.5 5.8 10.4 6.7 12 8z" stroke={color} {...S} />
    </Svg>
  );
}

/** MealIcon — covered dish (i-svc-meal). */
export function MealIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Cloche + a plate rule that extends past the dome on both sides, so
          the dish reads as covered rather than as a plain half-circle. */}
      <Path d="M5 14a7 7 0 0 1 14 0" stroke={color} {...S} />
      <Path d="M3 14h18" stroke={color} {...S} />
      <Path d="M12 7V5" stroke={color} {...S} />
      <Circle cx={12} cy={4} r={1.2} fill={color} />
    </Svg>
  );
}

/** MedicationIcon — capsule (i-svc-med). */
export function MedicationIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m10.5 20.5-7-7a4.95 4.95 0 1 1 7-7l7 7a4.95 4.95 0 1 1-7 7z" stroke={color} {...S} />
      <Path d="m8.5 8.5 7 7" stroke={color} {...S} />
    </Svg>
  );
}

/** HousekeepingIcon — sparkle / clean (i-svc-house). */
export function HousekeepingIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Large sparkle given more spread between points, small one moved fully
          clear of it — the two previously overlapped around 15,14. */}
      <Path d="M9.5 2.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" stroke={color} {...S} />
      <Path d="M18 14.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" stroke={color} {...S} />
    </Svg>
  );
}

/** MobilityIcon — walking / mobility assist (i-svc-mobility). */
export function MobilityIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={4} r={2} stroke={color} {...S} />
      <Path d="M12 6v7M12 13l-2 8M12 13l3 5M12 9l3 2" stroke={color} {...S} />
      <Path d="M16 11v10M14 21h4" stroke={color} {...S} />
    </Svg>
  );
}

/** PostSurgeryIcon — bandage (i-svc-bandage). */
export function PostSurgeryIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G transform="rotate(45 12 12)">
        <Rect x={3} y={9} width={18} height={6} rx={3} stroke={color} {...S} />
        <Path d="M9 12h.01M12 12h.01M15 12h.01" stroke={color} {...S} />
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
      <Rect x={5} y={2} width={14} height={20} rx={2} stroke={color} {...S} />
      <Path d="M12 18h.01" stroke={color} {...S} />
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
      <Circle cx={7.5} cy={15.5} r={4.5} stroke={color} {...S} />
      <Path d="m21 2-9.6 9.6M15.5 7.5l3 3" stroke={color} {...S} />
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
      {/* Ribbon tails clear the disc by 2 units before it starts, so the medal
          reads as ribbon-then-disc rather than one fused shape. */}
      <Circle cx={12} cy={15.5} r={5.5} stroke={color} {...S} />
      <Path d="M8.5 10.2 5.5 3M15.5 10.2 18.5 3M8.5 3h7" stroke={color} {...S} />
      {/* Bloom core — the brand accent, kept because a 5-point star at this
          scale (rendered ~18px in profile rows) collapses into a blob. */}
      <Circle cx={12} cy={15.5} r={2} fill={color} />
    </Svg>
  );
}

/** TranslateIcon — translate (i-translate). */
export function TranslateIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 5h8M6 3v2M9 5c0 4-2.5 7-7 8M4 9c1 2 3 3.5 6 4" stroke={color} {...S} />
      <Path d="m12 20 4-9 4 9M13.5 17h5" stroke={color} {...S} />
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
      <Circle cx={12} cy={12} r={10} stroke={color} {...S} />
      <Path d="M12 6v6l4 2" stroke={color} {...S} />
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
      <Path d="M11 2.4a2 2 0 0 1 2 0l7 4a2 2 0 0 1 1 1.73v7.74a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4a2 2 0 0 1-1-1.73V8.13a2 2 0 0 1 1-1.73z" stroke={color} {...S} />
      <Path d="m3.3 7 8.7 5 8.7-5M12 22V12" stroke={color} {...S} />
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
