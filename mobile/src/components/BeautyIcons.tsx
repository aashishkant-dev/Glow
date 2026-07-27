/**
 * BeautyIcons — Glow's service glyphs, drawn to the same system as
 * TabIcons/CareIcons so all three files render as ONE set.
 *
 * Rules (from Lucide's icon design guide): 24×24 viewBox, a SINGLE stroke
 * weight of 2, round caps/joins, ≥1px padding inside the canvas, rect radius
 * 2, ≥2px between distinct elements, coordinates on the grid. These were
 * previously strokeWidth 1.5 with per-path opacity fades, which made the
 * beauty glyphs read visibly lighter than the UI icons sitting beside them on
 * the same row — the set looked like two libraries mixed together.
 *
 * NO SVG gradients (url(#id) renders blank in react-native-svg-web/PWA).
 * Every icon: function XIcon({ size = 24, color = Colors.brand }).
 */

import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { Colors } from '../utils/colors';

interface IconProps {
  size?: number;
  color?: string;
}

const S = { strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

/** SparkleIcon — thin four-point star. Glam / featured. */
export function SparkleIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M10 3c.6 3.4 1.4 5.5 2.4 6.6 1 1 3.2 1.9 6.1 2.4-2.9.5-5.1 1.4-6.1 2.4-1 1.1-1.8 3.2-2.4 6.6-.6-3.4-1.4-5.5-2.4-6.6-1-1-3.2-1.9-6.1-2.4 2.9-.5 5.1-1.4 6.1-2.4C8.6 8.5 9.4 6.4 10 3z" />
        <Path d="M19 3v4M17 5h4" />
      </G>
    </Svg>
  );
}

/** LipstickIcon — slanted bullet, slim tube, rounded base. Makeup. */
export function LipstickIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        {/* Slanted bullet, then the tube — the bullet now clears the collar by
            a full 2 units so the two shapes stay separate at SW 2. */}
        <Path d="M10 8V4.6a1 1 0 0 1 .6-.9l2.6-1.2a.5.5 0 0 1 .8.5V8" />
        <Rect x={9} y={8} width={6} height={3.5} rx={1} />
        <Path d="M8.5 13.5h7V19a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z" />
      </G>
    </Svg>
  );
}

/** BrushIcon — angled liner brush with ferrule + bristle breaks. Threading & brows. */
export function BrushIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="m4 20 1.5-4.5 9-9a2.5 2.5 0 0 1 3.5 3.5l-9 9z" />
        <Path d="m13.5 5.5 5 5" />
        <Path d="m6 15 3 3" />
      </G>
    </Svg>
  );
}

/** HennaIcon — hand with mehndi medallion. Mehendi. */
export function HennaIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        {/* Palm + three fingers, spaced 3 units apart so they stay legible at
            SW 2 (four fingers at 3-unit pitch merged into a solid block). */}
        <Path d="M8 12V7a1.5 1.5 0 0 1 3 0v4" />
        <Path d="M11 11V5.5a1.5 1.5 0 0 1 3 0V11" />
        <Path d="M14 11V7.5a1.5 1.5 0 0 1 3 0V14c0 4-2.6 7-6.5 7-1.8 0-3.1-.9-3.9-2.5l-1.9-3.8a1.5 1.5 0 0 1 2.6-1.3L9 16" />
      </G>
      {/* Mehndi medallion — the one bloom accent this glyph carries */}
      <Circle cx={12} cy={16.5} r={1.5} fill={color} />
    </Svg>
  );
}

/** NailIcon — elegant polish bottle: slim cap, rounded flacon, brush stem. Manicure / nails. */
export function NailIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        {/* Polish bottle: narrow cap, then a clearly wider flacon. The old
            neck and body were within 1 unit of each other, so at SW 2 the
            silhouette read as one lumpy column. */}
        <Path d="M11 2h2v3h-2z" />
        <Path d="M8.5 8.5h7c1.5 1.2 2.5 3 2.5 5.5 0 4-2.5 7-6 7s-6-3-6-7c0-2.5 1-4.3 2.5-5.5z" />
        <Path d="M11 5h2v3.5h-2z" />
      </G>
    </Svg>
  );
}

/** PedicureIcon — footprint: sole + toes. Pedicure. */
export function PedicureIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 8c3 0 4.7 2.6 4.5 6-.2 3.7-1.8 7-4.5 7s-4.3-3.3-4.5-7C7.3 10.6 9 8 12 8z" />
        <Circle cx={7.5} cy={5.5} r={1.5} />
      </G>
      {/* Toes — equal radii on one arc, so they read as a set not a fade */}
      <G fill={color}>
        <Circle cx={11} cy={3.5} r={1} />
        <Circle cx={14} cy={3.5} r={1} />
        <Circle cx={17} cy={4.5} r={1} />
      </G>
    </Svg>
  );
}

/** ScissorsIcon — proper shears geometry with pivot. Hair styling. */
export function ScissorsIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Circle cx={6} cy={6} r={3} />
        <Circle cx={6} cy={18} r={3} />
        <Path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
      </G>
    </Svg>
  );
}

/** HairColorIcon — dye droplet with inner shine. Hair coloring. */
export function HairColorIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 3c3 3.8 4.5 6.4 4.5 8.5a4.5 4.5 0 1 1-9 0C7.5 9.4 9 6.8 12 3z" />
        <Path d="M7 21h10" />
      </G>
    </Svg>
  );
}

/** FacialIcon — serene oval face, closed relaxed eyes. Skincare. */
export function FacialIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 3c4 0 6.5 3.4 6.5 7.5 0 5-2.9 9.5-6.5 9.5s-6.5-4.5-6.5-9.5C5.5 6.4 8 3 12 3z" />
        {/* Eyes as short level lashes and a wide smile — the old paired 2-unit
            curves sat 1 unit apart and merged into a single bar at SW 2. */}
        <Path d="M8.5 11h1.5M14 11h1.5" />
        <Path d="M10 15.5c1.2 1 2.8 1 4 0" />
      </G>
    </Svg>
  );
}

/** WaxIcon — two smooth lines. Waxing. */
export function WaxIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M9 3c1.2 3.4.4 6.2-1 8.6C6.9 13.6 5.6 15.4 5.4 18L5.2 21" />
        <Path d="M15 3c1.2 3.4.4 6.2-1 8.6-1.1 2-2.4 3.8-2.6 6.4L11.2 21" />
        <Path d="M21 3c1.2 3.4.4 6.2-1 8.6-1.1 2-2.4 3.8-2.6 6.4L17.2 21" />
      </G>
    </Svg>
  );
}

/** LotusIcon — balanced three-petal lotus over base leaves. Massage / spa. */
export function LotusIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M12 4c2 2.2 3 4.3 3 6.4 0 2.6-1.3 4.3-3 4.3s-3-1.7-3-4.3c0-2.1 1-4.2 3-6.4z" />
        <Path d="M6 8c.4 3.4 2 5.8 4.7 7M18 8c-.4 3.4-2 5.8-4.7 7" />
        <Path d="M3 12.5C4 17.4 7.3 20.4 12 20.4s8-3 9-7.9c-1.8 1.2-3.6 1.8-5.5 1.8-1.3 0-2.4-.2-3.5-.7-1.1.5-2.2.7-3.5.7-1.9 0-3.7-.6-5.5-1.8z" />
      </G>
    </Svg>
  );
}

/** SpaBloomIcon — four-petal bloom echoing the Glow brand mark. Spa / bloom. */
export function SpaBloomIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Geometry is deliberately IDENTICAL to PersonalCareIcon in CareIcons —
          both render the Glow bloom mark, and they previously used two
          slightly different petal constructions. */}
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

/** CrownIcon — tiara with gem points. Bridal. */
export function CrownIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Path d="M3 8l4 3.5L12 5l5 6.5L21 8l-1.7 9.2a2 2 0 0 1-2 1.8H6.7a2 2 0 0 1-2-1.8z" />
        <Path d="M8 15h8" />
      </G>
      {/* Gem points — equal radii, one weight */}
      <G fill={color}>
        <Circle cx={12} cy={3} r={1.2} />
        <Circle cx={3} cy={6.5} r={1.2} />
        <Circle cx={21} cy={6.5} r={1.2} />
      </G>
    </Svg>
  );
}

/** MirrorIcon — hand mirror with catchlight. Glam. */
export function MirrorIcon({ size = 24, color = Colors.brand }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G stroke={color} {...S}>
        <Circle cx={12} cy={9} r={6} />
        <Path d="M12 15v6M9 21h6" />
      </G>
    </Svg>
  );
}
