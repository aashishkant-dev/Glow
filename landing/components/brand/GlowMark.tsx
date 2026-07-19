/** Glow Bloom mark — luxury beauty brand identity (rose petals + champagne gold core). */

type GlowMarkProps = {
  size?: number
  className?: string
  petal?: string
  petalInner?: string
  core?: string
  inverted?: boolean
}

export function GlowMark({
  size = 36,
  className,
  petal = '#D97A91',
  petalInner = '#E9A0B1',
  core = '#D4AF37',
  inverted = false,
}: GlowMarkProps) {
  const p = inverted ? '#FFFFFF' : petal
  const pi = inverted ? 'rgba(255,255,255,0.45)' : petalInner
  const c = inverted ? '#D4AF37' : core
  const PETAL = 'M56 12 C46 24 42 33 42 40 C42 49 48 54 56 54 C64 54 70 49 70 40 C70 33 66 24 56 12 Z'
  const PETAL_IN = 'M56 20 C50 28 47.5 34 47.5 39 C47.5 45.5 51 49 56 49 C61 49 64.5 45.5 64.5 39 C64.5 34 62 28 56 20 Z'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 112 112"
      className={className}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {[0, 90, 180, 270].map((r) => (
        <g key={r} transform={`rotate(${r} 56 56)`}>
          <path d={PETAL} fill={p} />
          <path d={PETAL_IN} fill={pi} opacity={0.55} />
        </g>
      ))}
      <circle cx={56} cy={56} r={9} fill={c} />
      <circle cx={53.4} cy={53.4} r={2.6} fill="#FFFFFF" opacity={0.75} />
      <circle cx={92} cy={26} r={3.4} fill={c} opacity={0.9} />
      <circle cx={22} cy={88} r={2.6} fill={p} opacity={0.75} />
      <circle cx={96} cy={78} r={2} fill={p} opacity={0.55} />
      <circle cx={18} cy={30} r={1.8} fill={c} opacity={0.6} />
    </svg>
  )
}

export function GlowWordmark({ size = 36, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" style={{ letterSpacing: '-0.02em' }}>
      <GlowMark size={size} inverted={inverted} />
      <span
        className="font-display font-medium"
        style={{
          fontSize: Math.round(size * 0.58),
          color: inverted ? '#FFFFFF' : '#1D1D1F',
          lineHeight: 1,
        }}
      >
        Glow
      </span>
    </span>
  )
}
