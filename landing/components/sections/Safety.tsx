const pillars = [
  {
    num: '01',
    title: 'Police record check',
    desc: 'Vulnerable Sector Screening. Renewed annually. Mandatory before any first booking.',
    stat: { label: 'Renewal', value: 'Annual' },
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2 4 5v7c0 5 4 9 8 10 4-1 8-5 8-10V5l-8-3z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Government ID',
    desc: 'Government photo ID verified before any caregiver is approved.',
    stat: { label: 'Checked', value: 'Photo ID' },
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M8 12h.01M12 12h4" />
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Provider credentials',
    desc: 'Confirmed against OCSWSSW and recognized Provider credential programs.',
    stat: { label: 'Registry', value: 'OCSWSSW' },
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c0 1 4 3 6 3s6-2 6-3v-5" />
      </svg>
    ),
  },
  {
    num: '04',
    title: 'References & review',
    desc: 'Two professional references called personally. Family ratings are reviewed after every visit.',
    stat: { label: 'Flag threshold', value: '3 reports' },
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M17 11a5 5 0 1 0-10 0M12 2v3M2 18h20" />
      </svg>
    ),
  },
]

export default function Safety() {
  return (
    <section
      className="sec"
      style={{
        background: 'var(--ink)',
        color: 'var(--paper)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* background glow */}
      <div
        style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(14,165,111,0.14) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
        <div className="sec-head">
          <span className="sec-meta" style={{ color: 'rgba(255,255,255,0.5)' }}>Section 05 — Trust &amp; Safety</span>
          <h2 className="h2">
            Vetted like a <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--warmth)' }}>hospital.</i>
            <br />
            Booked like an app.
          </h2>
          <div className="right" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Every caregiver clears four mandatory checks before they&apos;re shown to a family.
          </div>
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}
          className="pillar-grid-responsive"
        >
          {pillars.map(p => (
            <div
              key={p.num}
              className="pillar-hover"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 20,
                padding: '30px 28px 32px',
                transition: 'border-color .25s ease, background .25s ease',
              }}
            >
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.5)' }}>{p.num}</div>
              <div
                style={{
                  margin: '18px 0 22px',
                  display: 'inline-flex',
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(14,165,111,0.14)',
                  color: 'var(--green-3)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(14,165,111,0.2)',
                }}
              >
                {p.icon}
              </div>
              <h3 style={{ color: 'var(--paper)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', marginBottom: 8 }}>{p.title}</h3>
              <p style={{ color: '#9AA5B4', fontSize: 14, lineHeight: 1.55 }}>{p.desc}</p>
              <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--mono)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                <span>{p.stat.label}</span>
                <b style={{ color: '#fff', fontFamily: 'var(--sans)', letterSpacing: '-0.01em', fontWeight: 700, fontSize: 13 }}>{p.stat.value}</b>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 1000px) { .pillar-grid-responsive { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 560px) { .pillar-grid-responsive { grid-template-columns: 1fr !important; } }
        .pillar-hover:hover {
          border-color: rgba(14,165,111,0.4) !important;
          background: rgba(14,165,111,0.04) !important;
        }
      ` }} />
    </section>
  )
}
