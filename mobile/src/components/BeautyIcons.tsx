/**
 * BeautyIcons — Glow 2.0 thin-line icon set (Lucide/Phosphor weight).
 *
 * Rules: 24×24 viewBox, strokeWidth 1.5, round caps/joins, minimal geometry,
 * NO SVG gradients (url(#id) renders blank in react-native-svg-web/PWA),
 * every icon: function XIcon({ size = 24, color = Colors.brand }).
 */

import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { Colors } from '../utils/colors';

interface IconProps {
  size?: number;
  color?: string;
}

const S = { strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

/** SparkleIcon — thin four-point star. Glam / featured. */
export function SparkleIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 3.5c.5 3 1.2 4.9 2.1 5.9.9 1 2.8 1.7 5.4 2.1-2.6.4-4.5 1.1-5.4 2.1-.9 1-1.6 2.9-2.1 5.9-.5-3-1.2-4.9-2.1-5.9-.9-1-2.8-1.7-5.4-2.1 2.6-.4 4.5-1.1 5.4-2.1.9-1 1.6-2.9 2.1-5.9z" />
        <Path d="M19 16.5v4M17 18.5h4" opacity={0.55} />
      </G>
    </Svg>
  );
}

/** LipstickIcon — minimal tube geometry. Makeup. */
export function LipstickIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M10 9V5.2a1.6 1.6 0 0 1 1-1.5l2-.9a.7.7 0 0 1 1 .7V9" />
        <Rect x={9} y={9} width={6} height={4.6} rx={1.1} />
        <Rect x={8} y={13.6} width={8} height={7} rx={1.6} />
      </G>
    </Svg>
  );
}

/** BrushIcon — single elegant liner stroke. Threading & brows. */
export function BrushIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M15.2 3.9a2.3 2.3 0 0 1 3.2 3.2l-9.4 9.4-4.3 1.1 1.1-4.3z" />
        <Path d="M13.4 5.7l3.2 3.2" />
      </G>
    </Svg>
  );
}

/** HennaIcon — open hand, minimal. Mehendi. */
export function HennaIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M8 20.5v-7.4a1.6 1.6 0 1 1 3.2 0v2.9M11.2 16v-4.8a1.6 1.6 0 1 1 3.2 0V16M14.4 16v-3.3a1.6 1.6 0 1 1 3.2 0v4.2c0 2.9-1.9 5.3-5.1 5.3h-2.1c-1.6 0-2.6-.8-3.3-2.4l-1.6-3.3a1.3 1.3 0 0 1 2.3-1.1l1.3 2.1" />
      </G>
      <Circle cx={12.6} cy={18.4} r={0.55} fill={color} />
    </Svg>
  );
}

/** NailIcon — polish bottle, minimal. Nails. */
export function NailIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Rect x={10} y={3} width={4} height={2.4} rx={0.8} />
        <Path d="M8.8 6.2h6.4l.6 3c.4 2.2-1.2 4.2-3.4 4.4v5.5a1.4 1.4 0 0 1-2.8 0v-5.5c-2.2-.2-3.8-2.2-3.4-4.4z" />
      </G>
    </Svg>
  );
}

/** ScissorsIcon — thin shears. Hair styling. */
export function ScissorsIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Circle cx={6.3} cy={6.5} r={2.1} />
        <Circle cx={6.3} cy={17.5} r={2.1} />
        <Path d="M19.5 5.5 8.2 12M19.5 18.5 8.2 12" />
      </G>
    </Svg>
  );
}

/** HairColorIcon — droplet. Hair coloring. */
export function HairColorIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 3.6c2.8 3.5 4.2 6 4.2 8.2a4.2 4.2 0 1 1-8.4 0c0-2.2 1.4-4.7 4.2-8.2z" />
        <Path d="M7 20.5h10" opacity={0.55} />
      </G>
    </Svg>
  );
}

/** FacialIcon — calm face outline. Skincare. */
export function FacialIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 20.5a6.8 6.8 0 0 0 6.8-6.8c0-3.8-2.7-9.2-6.8-9.2s-6.8 5.4-6.8 9.2A6.8 6.8 0 0 0 12 20.5z" />
        <Path d="M9.3 13h.01M14.7 13h.01" strokeWidth={2} />
        <Path d="M10.6 16.3c.8.7 2 .7 2.8 0" />
      </G>
    </Svg>
  );
}

/** WaxIcon — two smooth lines. Waxing. */
export function WaxIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M13.8 3.5c1.1 3.1.4 5.7-.9 7.9-1 1.8-2.2 3.5-2.4 5.9L10.2 20.5" />
        <Path d="M17.6 4.1c1.1 3.6.2 6.6-1.4 9.2-.9 1.6-1.8 3.1-2.1 5L13.9 20.5" opacity={0.55} />
      </G>
    </Svg>
  );
}

/** LotusIcon — thin lotus. Massage / spa. */
export function LotusIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 5c1.5 1.8 2.3 3.6 2.3 5.4S13.3 13.6 12 13.6s-2.3-1.4-2.3-3.2S10.5 6.8 12 5z" />
        <Path d="M5.5 9c2.1.6 3.7 1.7 4.6 3.1M18.5 9c-2.1.6-3.7 1.7-4.6 3.1" />
        <Path d="M4 13.7c1.5 3.6 4.3 5.5 8 5.5s6.5-1.9 8-5.5c-2.7-.8-5.3-.8-8 0-2.7-.8-5.3-.8-8 0z" />
      </G>
    </Svg>
  );
}

/** CrownIcon — thin tiara line. Bridal. */
export function CrownIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M4.5 8.8l3.6 3L12 6l3.9 5.8 3.6-3-1.5 8.4a1.5 1.5 0 0 1-1.5 1.3H7.5A1.5 1.5 0 0 1 6 17.2z" />
      </G>
    </Svg>
  );
}

/** MirrorIcon — hand mirror line. Glam. */
export function MirrorIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Circle cx={12} cy={9.2} r={5.2} />
        <Path d="M12 14.4V20.5M9.8 20.5h4.4" />
      </G>
    </Svg>
  );
}
