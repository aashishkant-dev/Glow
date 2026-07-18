/**
 * Custom SVG tab icons — no font loading, works on all platforms including web PWA.
 */
import React from 'react';
import Svg, { Path, Rect, Circle, Line, G } from 'react-native-svg';
import { Colors } from '../utils/colors';

interface P { size?: number; color?: string; filled?: boolean }

export function HomeIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {filled ? (
        <Path
          d="M12 3L3 10.5V21H9V15H15V21H21V10.5L12 3Z"
          fill={color}
        />
      ) : (
        <G fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          {/* brand-kit i-home */}
          <Path d="M4 10.5 12 4l8 6.5" />
          <Path d="M6 9.6V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.6" />
          <Path d="M10 20v-4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V20" />
        </G>
      )}
    </Svg>
  );
}

export function CalendarIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3.5" y="5" width="17" height="15.5" rx="2.5"
        stroke={color} strokeWidth={1.6} fill={filled ? color + '22' : 'none'}
      />
      <Path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"
        stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      />
      {filled ? (
        <>
          <Rect x="7" y="13" width="3" height="3" rx="1" fill={color} />
          <Rect x="14" y="13" width="3" height="3" rx="1" fill={color} />
        </>
      ) : (
        <>
          <Rect x="7" y="13" width="3" height="3" rx="1"
            stroke={color} strokeWidth={1.4} fill="none"
          />
          <Rect x="14" y="13" width="3" height="3" rx="1"
            stroke={color} strokeWidth={1.4} fill="none"
          />
        </>
      )}
    </Svg>
  );
}

export function BriefcaseIcon({ size = 24, color = '#000', filled = false }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="8" width="18" height="11.5" rx="2"
        stroke={color} strokeWidth={1.6} fill={filled ? color + '22' : 'none'}
      />
      <Path d="M9 8V6.7A1.7 1.7 0 0 1 10.7 5h2.6A1.7 1.7 0 0 1 15 6.7V8"
        stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      />
      {filled ? (
        <Circle cx="12" cy="12.5" r="1.8" fill={color} />
      ) : (
        <>
          <Circle cx="12" cy="12.5" r="1.8" stroke={color} strokeWidth={1.6} />
          <Path d="M9 17.2a3 3 0 0 1 6 0" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </Svg>
  );
}

export function LocationPinIcon({ size = 24, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        fill={color}
      />
      <Circle cx="12" cy="9" r="2.5" fill="rgba(0,0,0,0.35)" />
    </Svg>
  );
}

export function PlusIcon({ size = 28, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Path d="M14 6v16M6 14h16"
        stroke={color} strokeWidth={1.8} strokeLinecap="round"
      />
    </Svg>
  );
}

export function SearchJobsIcon({ size = 24, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Magnifier */}
      <Circle cx="10" cy="10" r="6" stroke={color} strokeWidth={1.6} />
      <Path d="M15 15l4 4" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      {/* Location pin inside */}
      <Path
        d="M10 7c-1.66 0-3 1.34-3 3 0 2.25 3 5 3 5s3-2.75 3-5c0-1.66-1.34-3-3-3z"
        fill={color}
      />
    </Svg>
  );
}

export function ArrowBackIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill={color} />
    </Svg>
  );
}

export function LocationIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill={color} />
    </Svg>
  );
}

export function CallIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill={color} />
    </Svg>
  );
}

export function ChatIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill={color} />
      <Path d="M7 9h10M7 13h7" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function SearchIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth={1.6} />
      <Path d="M15.5 15.5L20 20" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function CloseCircleIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" fill={color} />
      <Path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function MapIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M9 3v15M15 6v15" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function ListIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 6h18M3 12h18M3 18h18" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function LocateIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.6} />
      <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function RadioOnIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.6} />
      <Circle cx="12" cy="12" r="4" fill={color} />
    </Svg>
  );
}

export function NavigateIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z" fill={color} />
    </Svg>
  );
}

export function StarIcon({ size = 24, color = '#FFB800', filled = true }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={filled ? 0 : 1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function DocumentIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function CashIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="6" width="20" height="12" rx="2" stroke={color} strokeWidth={1.6} />
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.5} />
      <Path d="M6 10v0M18 10v0M6 14v0M18 14v0" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function CheckCircleIcon({ size = 24, color = Colors.onlineGreen }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" fill={color} />
      <Path d="M7 12l3.5 3.5L17 8" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PersonIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={1.6} />
      <Path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronBackIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" fill={color} />
    </Svg>
  );
}

export function ChevronForwardIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" fill={color} />
    </Svg>
  );
}

export function HourglassIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 2h12v6l-4 4 4 4v6H6v-6l4-4-4-4V2z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}

export function FlashIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill={color} />
    </Svg>
  );
}

export function CalendarSVGIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="17" rx="2.5" stroke={color} strokeWidth={1.6} />
      <Path d="M8 2v4M16 2v4M3 9h18" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function HomeSVGIcon({ size = 24, color = '#000' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3L3 10.5V21H9V15H15V21H21V10.5L12 3Z" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CameraIcon({ size = 18, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 8.5a2 2 0 0 1 2-2h1.2l.9-1.6a1.5 1.5 0 0 1 1.3-.8h5.2a1.5 1.5 0 0 1 1.3.8l.9 1.6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8Z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <Circle cx="12" cy="12.5" r="3.2" stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}
