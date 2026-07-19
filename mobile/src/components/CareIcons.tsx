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

// Shared stroke attributes — the brand-kit system (1.9, round, no fill).
const S = { strokeWidth: 1.55, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

/** FindJobsIcon — briefcase + magnifier (i-findjobs). */
export function FindJobsIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={7.5} width={12} height={9} rx={1.9} stroke={color} {...S} />
      <Path d="M5.8 7.5V6.4A1.4 1.4 0 0 1 7.2 5h2.6A1.4 1.4 0 0 1 11.2 6.4V7.5" stroke={color} {...S} />
      <Path d="M2.5 11h12" stroke={color} {...S} />
      <Circle cx={17.3} cy={16.3} r={3.1} stroke={color} {...S} />
      <Path d="m19.6 18.6 2.2 2.2" stroke={color} {...S} />
    </Svg>
  );
}

/** EarningsIcon — two coins, one with $ (i-earnings). */
export function EarningsIcon({ size = 24, color = Colors.brand }: IconProps) {
  // Single clean coin with a $ — reads clearly at 24-26px (the prior two-coin
  // glyph had an incomplete second circle that looked like a stray squiggle).
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.2} stroke={color} {...S} />
      <Path d="M12 7v10" stroke={color} {...S} />
      <Path d="M14.7 9.3c-.6-1-1.7-1.4-2.8-1.4-1.5 0-2.7.8-2.7 2.1 0 1.2 1 1.7 2.7 2.1 1.7.4 2.9.9 2.9 2.2 0 1.3-1.2 2.2-2.9 2.2-1.2 0-2.3-.5-2.9-1.5" stroke={color} {...S} />
    </Svg>
  );
}

/** ProfileIcon — person in a circle (i-account-circle). */
export function ProfileIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} {...S} />
      <Circle cx={12} cy={9.8} r={2.8} stroke={color} {...S} />
      <Path d="M6.7 18.6a5.5 5.5 0 0 1 10.6 0" stroke={color} {...S} />
    </Svg>
  );
}

/** HelpIcon — lifebuoy (i-lifebuoy). */
export function HelpIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.2} stroke={color} {...S} />
      <Circle cx={12} cy={12} r={3.2} stroke={color} {...S} />
      <Path d="M6.3 6.3l3.4 3.4M17.7 6.3l-3.4 3.4M6.3 17.7l3.4-3.4M17.7 17.7l-3.4-3.4" stroke={color} {...S} />
    </Svg>
  );
}

/** BellIcon — notification bell (i-bell). */
export function BellIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6.5 16v-5a5.5 5.5 0 0 1 11 0v5l1.7 2H4.8z" stroke={color} {...S} />
      <Path d="M10 19.5a2 2 0 0 0 4 0" stroke={color} {...S} />
    </Svg>
  );
}

/** NoteIcon — clipboard (i-clipboard). */
export function NoteIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8 5H6.5a1.5 1.5 0 0 0-1.5 1.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V6.5A1.5 1.5 0 0 0 17.5 5H16" stroke={color} {...S} />
      <Rect x={8.5} y={3.3} width={7} height={3.4} rx={1.2} stroke={color} {...S} />
      <Path d="M8.5 11h7M8.5 14.5h4.5" stroke={color} {...S} />
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

/** ShieldCheckIcon — verified seal (i-seal-check). */
export function ShieldCheckIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8.6 3.5h6.8L20.5 8.6v6.8L15.4 20.5H8.6L3.5 15.4V8.6z" stroke={color} {...S} />
      <Path d="M8.7 12l2.3 2.3L15.4 9.6" stroke={color} {...S} />
    </Svg>
  );
}

/** PinIcon — location pin (i-pin). */
export function PinIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21c4-3.8 6.5-7 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 14 8 17.2 12 21z" stroke={color} {...S} />
      <Circle cx={12} cy={10.3} r={2.4} stroke={color} {...S} />
    </Svg>
  );
}

/** CreditCardIcon — payment card (i-card). */
export function CreditCardIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5.5} width={18} height={13} rx={2.5} stroke={color} {...S} />
      <Path d="M3 10h18M6.5 14.5h3" stroke={color} {...S} />
    </Svg>
  );
}

/** AccountCheckIcon — verified person (i-user-check). */
export function AccountCheckIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={8.2} r={3.6} stroke={color} {...S} />
      <Path d="M4.8 19.5a6 6 0 0 1 10.6-3.8" stroke={color} {...S} />
      <Path d="M15.3 18.8l2 2 3.4-3.7" stroke={color} {...S} />
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

/** CheckDecagramIcon — verified seal (i-seal-check). */
export function CheckDecagramIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8.6 3.5h6.8L20.5 8.6v6.8L15.4 20.5H8.6L3.5 15.4V8.6z" stroke={color} {...S} />
      <Path d="M8.7 12l2.3 2.3L15.4 9.6" stroke={color} {...S} />
    </Svg>
  );
}

/** EmailIcon — envelope (i-mail). */
export function EmailIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5.5} width={18} height={13} rx={2.5} stroke={color} {...S} />
      <Path d="M4 7.5l8 5.5 8-5.5" stroke={color} {...S} />
    </Svg>
  );
}

/** MonitorDashboardIcon — dashboard screen (i-dashboard). */
export function MonitorDashboardIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={5} width={19} height={11} rx={2} stroke={color} {...S} />
      <Path d="M9.5 20h5M12 16v4" stroke={color} {...S} />
      <Path d="M6.5 12.5v-2M10 12.5v-4M13.5 12.5v-1.5M17 12.5v-3.5" stroke={color} {...S} />
    </Svg>
  );
}

/** ChartBoxIcon — bar chart in box (i-chart). */
export function ChartBoxIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={3.5} width={17} height={17} rx={3.5} stroke={color} {...S} />
      <Path d="M8 16v-3M12 16v-6M16 16v-4" stroke={color} {...S} />
    </Svg>
  );
}

/** PhoneCheckIcon — phone + check (i-phone-check). */
export function PhoneCheckIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 4.4 7.2 4.9l1 3.3-1.7 1.5a10 10 0 0 0 4.5 4.5l1.5-1.7 3.3 1 .4 2.2a1.7 1.7 0 0 1-1.8 1.9A14 14 0 0 1 3.4 5.9 1.7 1.7 0 0 1 5 4.4z" stroke={color} {...S} />
      <Path d="M15 6.5l1.7 1.7L20 4.9" stroke={color} {...S} />
    </Svg>
  );
}

/** CardAccountDetailsIcon — ID card (i-idcard). */
export function CardAccountDetailsIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5} width={18} height={14} rx={2.5} stroke={color} {...S} />
      <Circle cx={8.5} cy={10.5} r={2} stroke={color} {...S} />
      <Path d="M5.5 15.8a3 3 0 0 1 6 0M14.5 9.5h4M14.5 12.5h4M14.5 15.5h2.5" stroke={color} {...S} />
    </Svg>
  );
}

/** BriefcaseAccountIcon — briefcase + person (i-briefcase). */
export function BriefcaseAccountIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={8} width={18} height={11.5} rx={2} stroke={color} {...S} />
      <Path d="M9 8V6.7A1.7 1.7 0 0 1 10.7 5h2.6A1.7 1.7 0 0 1 15 6.7V8" stroke={color} {...S} />
      <Circle cx={12} cy={12.5} r={1.8} stroke={color} {...S} />
      <Path d="M9 17.2a3 3 0 0 1 6 0" stroke={color} {...S} />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SERVICE ICONS  (24 × 24) — matched family, i-svc-* from the brand kit.
// ─────────────────────────────────────────────────────────────────────────────

/** PersonalCareIcon — person + heart (i-svc-personal). */
export function PersonalCareIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9.5} cy={8} r={3} stroke={color} {...S} />
      <Path d="M4 19.2a5.5 5.5 0 0 1 11 0" stroke={color} {...S} />
      <Path d="M18 4.4c-.3-.5-.8-.8-1.4-.8-.85 0-1.5.65-1.5 1.5 0 1.05 1.35 1.9 2.9 3.1 1.55-1.2 2.9-2.05 2.9-3.1 0-.85-.65-1.5-1.5-1.5-.6 0-1.1.3-1.4.8z" stroke={color} {...S} />
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

/** PhoneMobileIcon — mobile phone (i-mobile). */
export function PhoneMobileIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={6} y={3} width={12} height={18} rx={2.5} stroke={color} {...S} />
      <Path d="M10.5 5.5h3M12 18h.01" stroke={color} {...S} />
    </Svg>
  );
}

/** KeyIcon — key (i-key). */
export function KeyIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={8} cy={8} r={3.6} stroke={color} {...S} />
      <Path d="M10.6 10.6 20 20M16.5 16.5l2-2M14 14l1.6-1.6" stroke={color} {...S} />
    </Svg>
  );
}

/** MedalIcon — medal (i-medal). */
export function MedalIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={14.5} r={5} stroke={color} {...S} />
      <Path d="M9 10 6.5 3.5M15 10l2.5-6.5M9.5 4h5" stroke={color} {...S} />
      <Path d="M12 12.3l.8 1.6 1.7.2-1.3 1.2.4 1.7-1.6-.9-1.6.9.4-1.7-1.3-1.2 1.7-.2z" stroke={color} {...S} />
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

/** ClockIcon — clock (i-clock). */
export function ClockIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.2} stroke={color} {...S} />
      <Path d="M12 7.4V12l3.4 2.2" stroke={color} {...S} />
    </Svg>
  );
}

/** PackageIcon — package box (i-package). */
export function PackageIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3 20.5 7.5v9L12 21 3.5 16.5v-9z" stroke={color} {...S} />
      <Path d="M3.7 7.7 12 12l8.3-4.3M12 12v9M7.8 5.2 16.2 9.6" stroke={color} {...S} />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
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
