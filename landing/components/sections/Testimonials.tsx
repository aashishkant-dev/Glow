const promises = [
  {
    title: 'Confidence from day one',
    text: 'Every Provider clears a Vulnerable Sector police check, credential verification, and reference calls before they ever appear in search — so you can book a new caregiver with confidence, not just hope.',
  },
  {
    title: 'No surprises on price',
    text: 'Flat $25/hr, 3-hour minimum, no surge or weekend surcharge. You see the price before you book, and that\'s what you pay.',
  },
  {
    title: 'Built for working caregivers too',
    text: 'Providers keep the majority of every dollar billed — no agency markup eating into their pay. That means better caregivers stay on the platform.',
  },
]

export default function Testimonials() {
  return (
    <section
      style={{
        padding: '160px 0',
        background: 'var(--paper)',
      }}
    >
      <div className="wrap-tight">
        <div className="sec-head" style={{ marginBottom: 64 }}>
          <span className="sec-meta">Section 06 — Our promise</span>
          <h2 className="h2">
            What you can <i>expect.</i>
          </h2>
          <div className="right">
            Glow is new to Greater Sudbury. Here&apos;s exactly what we screen for and what we charge — no inflated numbers.
          </div>
        </div>

        {/* featured statement */}
        <div style={{ marginBottom: 80 }}>
          <p
            style={{
              fontFamily: 'var(--serif)',
              fontWeight: 400,
              fontStyle: 'italic',
              fontSize: 'clamp(32px, 4.4vw, 60px)',
              lineHeight: 1.08,
              letterSpacing: '-0.022em',
              color: 'var(--ink)',
              maxWidth: '26ch',
            }}
          >
            &ldquo;We built the booking experience families expect from modern apps —{' '}
            <em style={{ color: 'var(--green)', fontStyle: 'italic' }}>without</em>{' '}
            the agency wait times or markup.&rdquo;
          </p>
        </div>

        {/* promise cards */}
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}
          className="tst-mini-responsive"
        >
          {promises.map(p => (
            <div
              key={p.title}
              style={{
                background: 'var(--card-2)',
                border: '1px solid rgba(10,10,10,0.10)',
                borderRadius: 18,
                padding: 28,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>{p.title}</h3>
              <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.6, flex: 1 }}>{p.text}</p>
            </div>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) { .tst-grid-responsive { grid-template-columns: 1fr !important; } }
        @media (max-width: 880px) { .tst-mini-responsive { grid-template-columns: 1fr !important; } }
      ` }} />
    </section>
  )
}
