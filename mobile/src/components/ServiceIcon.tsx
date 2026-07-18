import React, { type ComponentType } from 'react';
import { View, ViewStyle } from 'react-native';
import { Colors, ServiceAccentColors } from '../utils/colors';
import { SERVICE_ICON_MAP, PersonalCareIcon, ServiceIconComponent } from './CareIcons';

// Fallback for any service type not in the map.
const FallbackIcon = PersonalCareIcon;

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
  const IconComponent: React.ComponentType<{ size?: number; color?: string }> =
    SERVICE_ICON_MAP[serviceType ?? ''] ?? FallbackIcon;

  if (!bubble) {
    return <IconComponent size={size} color={accent} />;
  }

  const wrap = bubbleSize ?? Math.round(size * 1.9);
  return (
    <View
      style={[
        {
          width: wrap,
          height: wrap,
          borderRadius: wrap * 0.3,
          backgroundColor: accent + '15',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <IconComponent size={size} color={accent} />
    </View>
  );
}
