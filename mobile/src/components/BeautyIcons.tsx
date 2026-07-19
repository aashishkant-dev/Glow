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

/** LipstickIcon — slanted bullet, slim tube, rounded base. Makeup. */
export function LipstickIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M10.1 9.5V5.6c0-.5.3-1 .8-1.2l2.3-1.1c.4-.2.7.1.7.5v5.7" />
        <Rect x={9.2} y={9.5} width={5.6} height={3.6} rx={0.9} />
        <Path d="M8.1 13.1h7.8v5.5a1.8 1.8 0 0 1-1.8 1.8H9.9a1.8 1.8 0 0 1-1.8-1.8z" />
        <Path d="M10.3 15.2v2.3" opacity={0.5} />
      </G>
    </Svg>
  );
}

/** BrushIcon — angled liner brush with ferrule + bristle breaks. Threading & brows. */
export function BrushIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="m4.6 19.4 1.2-4.2 9-9a2.25 2.25 0 0 1 3.2 3.2l-9 9z" />
        <Path d="m13.5 5.5 3.2 3.2" />
        <Path d="m6.6 14.4 3.2 3.2" opacity={0.5} />
      </G>
    </Svg>
  );
}

/** HennaIcon — hand with mehndi medallion. Mehendi. */
export function HennaIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M7.8 12.8V6.3a1.45 1.45 0 0 1 2.9 0v4.4M10.7 10.7V4.9a1.45 1.45 0 0 1 2.9 0v5.8M13.6 10.7V6.3a1.45 1.45 0 0 1 2.9 0v7.2c0 4-2.4 7-6.2 7-1.6 0-2.9-.8-3.6-2.3l-1.9-3.9a1.35 1.35 0 0 1 2.4-1.2l1.4 2.6" />
        <Circle cx={12.4} cy={15.4} r={1.7} />
      </G>
      <Circle cx={12.4} cy={15.4} r={0.42} fill={color} />
      <Circle cx={9.4} cy={17.6} r={0.42} fill={color} opacity={0.6} />
      <Circle cx={15.4} cy={17.4} r={0.42} fill={color} opacity={0.6} />
    </Svg>
  );
}

/** NailIcon — elegant polish bottle: slim cap, rounded flacon, brush stem. Manicure / nails. */
export function NailIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Rect x={10.3} y={2.8} width={3.4} height={4.6} rx={1.2} />
        <Path d="M8.9 9.4h6.2c1.8.9 2.9 2.5 2.9 4.6 0 3.9-2.7 6.5-6 6.5s-6-2.6-6-6.5c0-2.1 1.1-3.7 2.9-4.6z" />
        <Path d="M12 9.4v5.2" opacity={0.5} />
      </G>
      <Circle cx={12} cy={15.4} r={0.6} fill={color} opacity={0.5} />
    </Svg>
  );
}

/** PedicureIcon — footprint: sole + toes. Pedicure. */
export function PedicureIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12.6 8.4c2.7 0 4.4 2.4 4.2 5.5-.2 3.5-1.7 7-4.2 7s-4-3.5-4.2-7c-.2-3.1 1.5-5.5 4.2-5.5z" />
        <Circle cx={8.6} cy={5.3} r={1.35} />
      </G>
      <Circle cx={11.5} cy={3.9} r={0.75} fill={color} />
      <Circle cx={13.9} cy={3.6} r={0.7} fill={color} />
      <Circle cx={16.1} cy={4.1} r={0.65} fill={color} />
      <Circle cx={17.9} cy={5.2} r={0.6} fill={color} />
    </Svg>
  );
}

/** ScissorsIcon — proper shears geometry with pivot. Hair styling. */
export function ScissorsIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Circle cx={6} cy={6.2} r={2.5} />
        <Circle cx={6} cy={17.8} r={2.5} />
        <Path d="M19.8 4.4 8.2 16M14.4 14.5l5.4 5.1M8.2 8 12 11.8" />
      </G>
      <Circle cx={12} cy={12} r={0.5} fill={color} />
    </Svg>
  );
}

/** HairColorIcon — dye droplet with inner shine. Hair coloring. */
export function HairColorIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 3.6c2.8 3.5 4.2 6 4.2 8.2a4.2 4.2 0 1 1-8.4 0c0-2.2 1.4-4.7 4.2-8.2z" />
        <Path d="M9.9 11.6c0 1.2.7 2.1 1.7 2.4" opacity={0.5} />
        <Path d="M7 20.5h10" opacity={0.55} />
      </G>
    </Svg>
  );
}

/** FacialIcon — serene oval face, closed relaxed eyes. Skincare. */
export function FacialIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 3.8c3.9 0 6.5 3.3 6.5 7.3 0 4.8-2.8 9.1-6.5 9.1s-6.5-4.3-6.5-9.1c0-4 2.6-7.3 6.5-7.3z" />
        <Path d="M8.9 12.1c.5.5 1.2.5 1.7 0M13.4 12.1c.5.5 1.2.5 1.7 0" />
        <Path d="M10.7 15.7c.8.6 1.8.6 2.6 0" />
      </G>
      <Circle cx={17.9} cy={5.4} r={0.55} fill={color} opacity={0.6} />
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

/** LotusIcon — balanced three-petal lotus over base leaves. Massage / spa. */
export function LotusIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 4.5c1.8 2 2.7 4 2.7 6 0 2.4-1.2 4-2.7 4s-2.7-1.6-2.7-4c0-2 .9-4 2.7-4z" />
        <Path d="M6.2 8.3c.4 3.2 1.9 5.4 4.4 6.5M17.8 8.3c-.4 3.2-1.9 5.4-4.4 6.5" />
        <Path d="M3.5 12.6c.9 4.6 4 7.4 8.5 7.4s7.6-2.8 8.5-7.4c-1.7 1.1-3.4 1.7-5.2 1.7-1.2 0-2.3-.2-3.3-.7-1 .5-2.1.7-3.3.7-1.8 0-3.5-.6-5.2-1.7z" />
      </G>
    </Svg>
  );
}

/** SpaBloomIcon — four-petal bloom echoing the Glow brand mark. Spa / bloom. */
export function SpaBloomIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 3.2c1.5 1.5 2.2 3 2.2 4.4S13.3 10 12 10s-2.2-1-2.2-2.4.7-2.9 2.2-4.4z" />
        <Path d="M20.8 12c-1.5 1.5-3 2.2-4.4 2.2S14 13.3 14 12s1-2.2 2.4-2.2 2.9.7 4.4 2.2z" />
        <Path d="M12 20.8c-1.5-1.5-2.2-3-2.2-4.4S10.7 14 12 14s2.2 1 2.2 2.4-.7 2.9-2.2 4.4z" />
        <Path d="M3.2 12c1.5-1.5 3-2.2 4.4-2.2S10 10.7 10 12s-1 2.2-2.4 2.2S4.7 13.5 3.2 12z" />
      </G>
      <Circle cx={12} cy={12} r={1.05} fill={color} />
    </Svg>
  );
}

/** CrownIcon — tiara with gem points. Bridal. */
export function CrownIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M4.5 8.8l3.6 3L12 6l3.9 5.8 3.6-3-1.5 8.4a1.5 1.5 0 0 1-1.5 1.3H7.5A1.5 1.5 0 0 1 6 17.2z" />
        <Path d="M8.6 15.6h6.8" opacity={0.5} />
      </G>
      <Circle cx={12} cy={4.6} r={0.55} fill={color} />
      <Circle cx={4} cy={7.3} r={0.5} fill={color} opacity={0.7} />
      <Circle cx={20} cy={7.3} r={0.5} fill={color} opacity={0.7} />
    </Svg>
  );
}

/** MirrorIcon — hand mirror with catchlight. Glam. */
export function MirrorIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Circle cx={12} cy={9.2} r={5.2} />
        <Path d="M9.9 7.2a3 3 0 0 1 1.6-1.1" opacity={0.5} />
        <Path d="M12 14.4V20.5M9.8 20.5h4.4" />
      </G>
    </Svg>
  );
}
