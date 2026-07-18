const StarGlyph = () => (
  <svg
    style={{ width: 18, height: 18, color: 'var(--green-3)', flexShrink: 0 }}
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
  </svg>
)

const MarqueeContent = () => (
  <span
    style={{
      fontWeight: 700,
      fontSize: 'clamp(24px, 2.8vw, 40px)',
      letterSpacing: '-0.025em',
      lineHeight: 1,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 48,
      flexShrink: 0,
    }}
  >
    Verified <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--warmth)' }}>care</i>
    <StarGlyph />
    Booked in minutes
    <StarGlyph />
    $25/hr <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--warmth)' }}>flat</i>
    <StarGlyph />
    Sudbury &amp; the North
    <StarGlyph />
    Police checked
    <StarGlyph />
    Bilingual <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--warmth)' }}>EN&nbsp;/&nbsp;FR</i>
    <StarGlyph />
  </span>
)

export default function Marquee() {
  return (
    <section
      aria-hidden="true"
      style={{
        background: 'var(--ink)',
        color: 'var(--paper)',
        padding: '22px 0',
        overflow: 'hidden',
        borderTop: '1px solid var(--ink)',
        borderBottom: '1px solid var(--ink)',
      }}
    >
      <div
        className="animate-marquee"
        style={{ display: 'flex', gap: 48, width: 'max-content' }}
      >
        <MarqueeContent />
        <MarqueeContent />
      </div>
    </section>
  )
}
