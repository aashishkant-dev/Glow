import React, { type ComponentType } from 'react';
import { View, ViewStyle } from 'react-native';
import { Colors, ServiceAccentColors } from '../utils/colors';
import { SERVICE_ICON_MAP, PersonalCareIcon, ServiceIconComponent } from './CareIcons';
import {
  HairdryerIcon, NailPolishIcon, ThreadNeedleIcon, WaxWarmerIcon, LipstickBrushIcon,
  FacialProfileIcon, BrideProfileIcon, HennaConeIcon, MassageHandsIcon,
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
  'Facial':        FacialProfileIcon,
  'Bridal Makeup': BrideProfileIcon,
  'Mehendi':       HennaConeIcon,
  'Massage':       MassageHandsIcon,
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
    return illustrated ? <IconComponent size={size} /> : <IconComponent size={size} color={accent} />;
  }

  const wrap = bubbleSize ?? Math.round(size * 1.9);
  return (
    <View
      style={[
        {
          width: wrap,
          height: wrap,
          borderRadius: wrap * 0.3,
          // Illustrated icons carry their own baked-in color, so their bubble
          // is a neutral tint instead of the service's accent color.
          backgroundColor: illustrated ? 'rgba(0,0,0,0.04)' : accent + '15',
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
