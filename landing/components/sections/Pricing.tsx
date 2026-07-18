export default function Pricing() {
  return (
    <section className="sec" id="pricing" style={{ paddingTop: 0 }}>
      <div className="wrap-tight">
        <div className="sec-head">
          <span className="sec-meta">Section 04 — Pricing</span>
          <h2 className="h2">
            One <i>fair</i> price.
            <br />
            For everyone.
          </h2>
          <div className="right">The agency model is broken. We pay caregivers more — and charge families less.</div>
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 18 }}
          className="price-grid-responsive"
        >
          {/* Agency card */}
          <div
            style={{
              borderRadius: 24,
              padding: '44px 38px',
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
              position: 'relative',
              overflow: 'hidden',
              background: 'var(--card-2)',
              border: '1px solid rgba(10,10,10,0.10)',
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Traditional agency
              </div>
              <div style={{ fontWeight: 700, fontSize: 'clamp(60px, 7vw, 96px)', lineHeight: 0.9, letterSpacing: '-0.04em', marginTop: 10 }}>
                $45<small style={{ fontSize: '0.2em', color: 'var(--muted)', fontWeight: 500, fontFamily: 'var(--mono)', letterSpacing: '0.1em', marginLeft: 8, textTransform: 'uppercase' }}>– 55 / hr</small>
              </div>
              <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.55, maxWidth: '38ch', marginTop: 8 }}>
                What Sudbury families typically pay through a private home-care agency. Most of it doesn&apos;t reach the caregiver.
              </div>
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[
                '2–4 week scheduling delays',
                'Different caregiver every visit',
                'Booking, cancellation & weekend surcharges',
                'Providers take home roughly $14–18/hr',
              ].map(item => (
                <li key={item} style={{ display: 'flex', gap: 11, fontSize: 14.5, alignItems: 'flex-start' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B7472A" strokeWidth="2.6" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 3 }}>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Glow card */}
          <div
            style={{
              borderRadius: 24,
              padding: '44px 38px',
              display: 'flex',
              flexDirection: 'column',
              gap: 22,
              position: 'relative',
              overflow: 'hidden',
              background: 'var(--ink)',
              color: 'var(--paper)',
            }}
          >
            {/* glow */}
            <div style={{
              position: 'absolute',
              inset: 'auto -30% -50% auto',
              width: 520,
              height: 520,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(14,165,111,0.22) 0%, transparent 60%)',
              pointerEvents: 'none',
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--green-3)' }}>
                Glow
              </div>
              <div style={{ fontWeight: 700, fontSize: 'clamp(60px, 7vw, 96px)', lineHeight: 0.9, letterSpacing: '-0.04em', marginTop: 10 }}>
                $25<small style={{ fontSize: '0.2em', color: '#9FB7AA', fontWeight: 500, fontFamily: 'var(--mono)', letterSpacing: '0.1em', marginLeft: 8, textTransform: 'uppercase' }}>/ hr · flat</small>
              </div>
              <div style={{ fontSize: 15, color: '#9FB7AA', lineHeight: 1.55, maxWidth: '38ch', marginTop: 8 }}>
                3-hour minimum, paid in-app, with Providers keeping the majority of every dollar you spend.
              </div>
            </div>

            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 11, position: 'relative', zIndex: 1 }}>
              {[
                'Same-day booking — most under 1 hour',
                'Re-book the same Provider with one tap',
                'No fees · no surge · no deposit',
                'Providers earn $20–24/hr — highest in the North',
              ].map(item => (
                <li key={item} style={{ display: 'flex', gap: 11, fontSize: 14.5, alignItems: 'flex-start' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-3)" strokeWidth="2.6" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 3 }}>
                    <path d="m20 6-11 11-5-5" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>

            <div style={{ marginTop: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 8, position: 'relative', zIndex: 1 }}>
              <a href="/#dl" className="btn btn-warm">
                Book a Provider
                <svg className="arr" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </a>
              <a href="/#how" className="btn btn-ghost-inv">Full pricing</a>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) { .price-grid-responsive { grid-template-columns: 1fr !important; } }
      ` }} />
    </section>
  )
}
