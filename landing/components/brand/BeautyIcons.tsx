/**
 * Glow landing icon set — thin-line, luxury beauty (24 viewBox, 1.5 stroke).
 * Matches the mobile BeautyIcons language from the Figma brand identity.
 */

type IconProps = {
  size?: number
  color?: string
  className?: string
}

const S = {
  fill: 'none',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 1.5,
}

export function SparkleIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M12 3.5c.5 3 1.2 4.9 2.1 5.9.9 1 2.8 1.7 5.4 2.1-2.6.4-4.5 1.1-5.4 2.1-.9 1-1.6 2.9-2.1 5.9-.5-3-1.2-4.9-2.1-5.9-.9-1-2.8-1.7-5.4-2.1 2.6-.4 4.5-1.1 5.4-2.1.9-1 1.6-2.9 2.1-5.9z" />
        <path d="M19 16.5v4M17 18.5h4" opacity={0.55} />
      </g>
    </svg>
  )
}

export function LipstickIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M10.1 9.5V5.6c0-.5.3-1 .8-1.2l2.3-1.1c.4-.2.7.1.7.5v5.7" />
        <rect x={9.2} y={9.5} width={5.6} height={3.6} rx={0.9} />
        <path d="M8.1 13.1h7.8v5.5a1.8 1.8 0 0 1-1.8 1.8H9.9a1.8 1.8 0 0 1-1.8-1.8z" />
        <path d="M10.3 15.2v2.3" opacity={0.5} />
      </g>
    </svg>
  )
}

export function ScissorsIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <circle cx={6} cy={6.2} r={2.5} />
        <circle cx={6} cy={17.8} r={2.5} />
        <path d="M19.8 4.4 8.2 16M14.4 14.5l5.4 5.1M8.2 8 12 11.8" />
      </g>
      <circle cx={12} cy={12} r={0.5} fill={color} />
    </svg>
  )
}

export function NailIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <rect x={10.3} y={2.8} width={3.4} height={4.6} rx={1.2} />
        <path d="M8.9 9.4h6.2c1.8.9 2.9 2.5 2.9 4.6 0 3.9-2.7 6.5-6 6.5s-6-2.6-6-6.5c0-2.1 1.1-3.7 2.9-4.6z" />
        <path d="M12 9.4v5.2" opacity={0.5} />
      </g>
      <circle cx={12} cy={15.4} r={0.6} fill={color} opacity={0.5} />
    </svg>
  )
}

export function FacialIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M12 3.8c3.9 0 6.5 3.3 6.5 7.3 0 4.8-2.8 9.1-6.5 9.1s-6.5-4.3-6.5-9.1c0-4 2.6-7.3 6.5-7.3z" />
        <path d="M8.9 12.1c.5.5 1.2.5 1.7 0M13.4 12.1c.5.5 1.2.5 1.7 0" />
        <path d="M10.7 15.7c.8.6 1.8.6 2.6 0" />
      </g>
      <circle cx={17.9} cy={5.4} r={0.55} fill={color} opacity={0.6} />
    </svg>
  )
}

export function LotusIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M12 20c-2.2-1.8-5.5-4.8-5.5-8.2C6.5 8.5 9 6.5 12 6.5s5.5 2 5.5 5.3C17.5 15.2 14.2 18.2 12 20z" />
        <path d="M12 6.5C10.2 4.2 8 3.2 6.2 3.5c.4 2.2 1.8 3.8 3.6 4.6" opacity={0.7} />
        <path d="M12 6.5c1.8-2.3 4-3.3 5.8-3  -.4 2.2-1.8 3.8-3.6 4.6" opacity={0.7} />
        <path d="M7 14.5c-2 .2-3.8-.4-4.8-1.6 1.6-1.4 3.6-1.8 5.4-1.2" opacity={0.55} />
        <path d="M17 14.5c2 .2 3.8-.4 4.8-1.6-1.6-1.4-3.6-1.8-5.4-1.2" opacity={0.55} />
      </g>
    </svg>
  )
}

export function ShieldCheckIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M12 3.2 5.5 6v5.2c0 4.4 2.9 7.8 6.5 9 3.6-1.2 6.5-4.6 6.5-9V6L12 3.2z" />
        <path d="m9 12 2 2 4-4" />
      </g>
    </svg>
  )
}

export function StarIcon({ size = 24, color = 'currentColor', className, filled }: IconProps & { filled?: boolean }) {
  if (filled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
        <path
          fill={color}
          d="M12 3.2l2.4 5.4 5.9.5-4.5 3.9 1.4 5.7L12 15.8 6.8 18.7l1.4-5.7-4.5-3.9 5.9-.5L12 3.2z"
        />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        stroke={color}
        {...S}
        d="M12 3.2l2.4 5.4 5.9.5-4.5 3.9 1.4 5.7L12 15.8 6.8 18.7l1.4-5.7-4.5-3.9 5.9-.5L12 3.2z"
      />
    </svg>
  )
}

export function CalendarIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <rect x={3.5} y={5} width={17} height={15.5} rx={2.5} />
        <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
      </g>
    </svg>
  )
}

export function MapPinIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M12 21s-6.5-5.2-6.5-10.2A6.5 6.5 0 0 1 12 4.3a6.5 6.5 0 0 1 6.5 6.5C18.5 15.8 12 21 12 21z" />
        <circle cx={12} cy={10.8} r={2.2} />
      </g>
    </svg>
  )
}

export function WalletIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M3.5 8.5h17v10a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10z" />
        <path d="M3.5 8.5 5.2 5.2A2 2 0 0 1 7 4h10a2 2 0 0 1 1.8 1.2L20.5 8.5" />
        <circle cx={16.5} cy={13.5} r={1} fill={color} stroke="none" />
      </g>
    </svg>
  )
}

export function UsersIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <circle cx={9} cy={8} r={3} />
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <circle cx={16.5} cy={8.5} r={2.3} opacity={0.7} />
        <path d="M15 14.2c2.2.4 4 2 4.5 4.3" opacity={0.7} />
      </g>
    </svg>
  )
}

export function HeartIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        stroke={color}
        {...S}
        d="M12 20.5s-7-4.4-7-9.6A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7 3.7c0 5.2-7 9.6-7 9.6z"
      />
    </svg>
  )
}

export function CameraIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M4 8.5h3.2l1.3-2.2h7l1.3 2.2H20a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 8.5z" />
        <circle cx={12} cy={13.5} r={3.2} />
      </g>
    </svg>
  )
}

export function ClockIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <circle cx={12} cy={12} r={8.5} />
        <path d="M12 7.5V12l3 2" />
      </g>
    </svg>
  )
}

export function CheckIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path stroke={color} {...S} d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  )
}

export function ArrowRightIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path stroke={color} {...S} d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  )
}

export function BriefcaseIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <rect x={3} y={7.5} width={18} height={12.5} rx={2} />
        <path d="M8 7.5V5.8A1.8 1.8 0 0 1 9.8 4h4.4A1.8 1.8 0 0 1 16 5.8V7.5M3 13h18" />
      </g>
    </svg>
  )
}

export function ChartIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M4 19.5h16M7 16.5v-5M12 16.5V8M17 16.5v-8" />
      </g>
    </svg>
  )
}

export function HomeIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5.5v-6h-3v6H5a1 1 0 0 1-1-1v-9.5z" />
      </g>
    </svg>
  )
}

export function BadgeIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <circle cx={12} cy={10} r={6} />
        <path d="m8.5 15.5-1 5.5 4.5-2.5 4.5 2.5-1-5.5" />
        <path d="m10 10 1.5 1.5L14.5 8" />
      </g>
    </svg>
  )
}

export function PhoneIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <rect x={7} y={2.5} width={10} height={19} rx={2.5} />
        <path d="M10 18.5h4" />
      </g>
    </svg>
  )
}

export function RingIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <circle cx={12} cy={14} r={6} />
        <path d="M9 8.5 12 4l3 4.5" />
        <path d="M10.5 4h3" opacity={0.5} />
      </g>
    </svg>
  )
}

export function PartyIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M4 20 9.5 8.5 15 20z" />
        <path d="M6.5 15h6" opacity={0.5} />
        <path d="M15 6.5c1.5-1.5 3.5-1.5 4.5 0M17.5 4v2.5M20.5 6.5 18.5 8" opacity={0.7} />
      </g>
    </svg>
  )
}

export function GradCapIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M3 10 12 5l9 5-9 5-9-5z" />
        <path d="M7 12.5v4.2c0 .8 2.2 2.3 5 2.3s5-1.5 5-2.3v-4.2" />
        <path d="M21 10v6" />
      </g>
    </svg>
  )
}

export function MoonIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        stroke={color}
        {...S}
        d="M19 14.5A7.5 7.5 0 0 1 9.5 5 7.5 7.5 0 1 0 19 14.5z"
      />
    </svg>
  )
}

export function FestivalIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M12 3v18M5 8l7-3 7 3M6 14l6-2.5L18 14" />
        <path d="M8 20h8" opacity={0.5} />
      </g>
    </svg>
  )
}

export function BuildingIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <rect x={4} y={3.5} width={16} height={17} rx={1.5} />
        <path d="M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2" />
      </g>
    </svg>
  )
}

export function CakeIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M4 20h16v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6z" />
        <path d="M4 14c1.5 1 3 1 4 0s2.5-1 4 0 2.5 1 4 0 2.5-1 4 0" />
        <path d="M8 12V9.5M12 12V9.5M16 12V9.5" />
        <path d="M8 9.5c0-1 .5-1.5 1.2-2M12 9.5c0-1 .5-1.5 1.2-2M16 9.5c0-1 .5-1.5 1.2-2" opacity={0.6} />
      </g>
    </svg>
  )
}

export function DropIcon({ size = 24, color = 'currentColor', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke={color} {...S}>
        <path d="M12 3.6c2.8 3.5 4.2 6 4.2 8.2a4.2 4.2 0 1 1-8.4 0c0-2.2 1.4-4.7 4.2-8.2z" />
        <path d="M9.9 11.6c0 1.2.7 2.1 1.7 2.4" opacity={0.5} />
      </g>
    </svg>
  )
}
