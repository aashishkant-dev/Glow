import React, { type ComponentType } from 'react';
import { View, ViewStyle } from 'react-native';
import { Colors, ServiceAccentColors } from '../utils/colors';
import { SERVICE_ICON_MAP, PersonalCareIcon, ServiceIconComponent } from './CareIcons';
import {
  HairdryerIcon, NailPolishIcon, ThreadNeedleIcon, WaxWarmerIcon, LipstickBrushIcon,
  FacialProfileIcon, BrideProfileIcon, HennaConeIcon, MassageHandsIcon, HairDyeIcon,
} from './IllustratedIcons';

// Fallback for any service type not in the map.
const FallbackIcon = PersonalCareIcon;

// Service types with a matching illustrated (fixed-color) icon from the
// custom set — these render without color pass-through, since the artwork's
// color is baked in rather than driven by the `color` prop.
const ILLUSTRATED_SERVICE_ICON_MAP: Record<string, ServiceIconComponent> = {
  'Hair Styling':  HairdryerIcon,
  'Nails':         NailPolishIcon,
  'Threading':     ThreadNeedleIcon,
  'Waxing':        WaxWarmerIcon,
  'Makeup':        LipstickBrushIcon,
  // Was missing — the only one of the 11 seeded catalog services (see
  // scripts/seed-catalog.js) not in this map, so it fell through to
  // SERVICE_ICON_MAP's plain SparkleIcon: a generic glyph that doesn't
  // match the illustrated linework style every other service type gets.
  // Same icon as "Makeup" — Party Makeup is a makeup variant, not a
  // different service, so it should read as visually related, not
  // arbitrary.
  'Party Makeup':  LipstickBrushIcon,
  'Facial':        FacialProfileIcon,
  'Bridal Makeup': BrideProfileIcon,
  'Mehendi':       HennaConeIcon,
  'Massage':       MassageHandsIcon,
  'Hair Coloring': HairDyeIcon,
};

/**
 * serviceGlyph — kept for backwards compatibility with call sites that use the
 * string key (e.g., NearbyJobsScreen filter chips render the icon directly via
 * ServiceIcon, not via the glyph string). Returns the service type itself so
 * callers can pass it straight to <ServiceIcon serviceType={...} />.
 *
 * The old MCI glyphMap lookup is gone; this now just acts as an identity
 * function and is no longer needed at most call sites, but removing it would
 * be a breaking change to the public API. Keep it.
 */
export function serviceGlyph(serviceType?: string): string {
  return serviceType ?? 'Makeup';
}

/**
 * ServiceIcon — a brand-consistent service glyph, optionally inside a tinted bubble.
 *
 *   <ServiceIcon serviceType="Makeup" />                // bubble (default)
 *   <ServiceIcon serviceType="Makeup" bubble={false} /> // bare glyph
 *
 * Public API unchanged from the MCI version — all call sites work without changes.
 */
export function ServiceIcon({
  serviceType,
  size = 24,
  color,
  bubble = true,
  bubbleSize,
  style,
}: {
  serviceType?: string;
  size?: number;
  color?: string;
  bubble?: boolean;
  bubbleSize?: number;
  style?: ViewStyle;
}) {
  const accent = color || (serviceType && ServiceAccentColors[serviceType]) || Colors.brand;
  const illustrated = serviceType ? ILLUSTRATED_SERVICE_ICON_MAP[serviceType] : undefined;
  const IconComponent: React.ComponentType<{ size?: number; color?: string }> =
    illustrated ?? SERVICE_ICON_MAP[serviceType ?? ''] ?? FallbackIcon;

  if (!bubble) {
    // Illustrated icons have no `color` prop at all — their linework is
    // baked into fixed muted rose-brown fills (see IllustratedIcons.tsx),
    // so a caller passing `color` here (e.g. white, for a dark hero) was
    // silently ignored and the icon rendered in its fixed colors directly
    // on whatever background sat behind it. On a similarly dark/rose
    // background that reads as barely visible or outright blank — this hit
    // JobDetailScreen's hero and TrackingScreen's booking card. A small
    // light backing (no border, tighter than the bubble mode's) keeps
    // `bubble={false}` visually "bare" while still giving illustrated
    // icons the light surface they need to actually be legible; icons that
    // DO take a real `color` prop are unaffected and still render bare.
    if (illustrated) {
      const wrap = Math.round(size * 1.5);
      return (
        <View style={[{ width: wrap, height: wrap, borderRadius: wrap * 0.3, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }, style]}>
          <IconComponent size={size * 0.72} />
        </View>
      );
    }
    return <IconComponent size={size} color={accent} />;
  }

  const wrap = bubbleSize ?? Math.round(size * 1.7);
  return (
    <View
      style={[
        {
          width: wrap,
          height: wrap,
          borderRadius: wrap * 0.3,
          // Illustrated icons carry their own baked-in muted rose-brown color —
          // a near-transparent-black tint left them washed out/low-contrast
          // against it (same issue fixed on the Home services grid). White
          // gives the linework something to actually stand out against.
          backgroundColor: illustrated ? '#fff' : accent + '15',
          ...(illustrated ? { borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' } : null),
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {illustrated ? <IconComponent size={size} /> : <IconComponent size={size} color={accent} />}
    </View>
  );
}
