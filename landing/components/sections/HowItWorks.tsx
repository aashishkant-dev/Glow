const steps = [
  {
    num: '01',
    tag: '≈ 2 min',
    title: 'Tell us what\'s needed',
    desc: 'Pick the type of care, date, and how long. Personal care, mobility, post-op, dementia, companionship — the app maps it to the right caregiver.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    num: '02',
    tag: 'Instant',
    title: 'Browse & select your Provider',
    desc: 'Browse verified caregivers near you with photos, reviews, and credentials in plain view, and choose exactly who you book. Every Provider is police-checked and credential-confirmed.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 4-7 8-7s8 3 8 7" />
        <path d="m17 13 2 2 4-4" />
      </svg>
    ),
  },
  {
    num: '03',
    tag: 'Today',
    title: 'Confirm & track live',
    desc: 'Pay in-app, get live arrival updates and photo notes, and rate the visit. Re-book the same Provider with one tap next time.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M3 12 12 4l9 8M5 10v10h14V10" />
      </svg>
    ),
  },
]

export default function HowItWorks() {
  return (
    <section className="sec" id="how">
      <div className="wrap">
        <div className="sec-head">
          <span className="sec-meta">Section 01 — Process</span>
          <h2 className="h2">
            Three steps.
            <br />
            <i>No</i> phone tag.
          </h2>
          <div className="right">Book in minutes — most requests are confirmed the same day.</div>
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}
          className="steps-responsive"
        >
          {steps.map(step => (
            <div
              key={step.num}
              style={{
                background: 'var(--card-2)',
                border: '1px solid rgba(10,10,10,0.10)',
                borderRadius: 20,
                padding: '36px 32px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                transition: 'transform .25s ease, border-color .25s ease, box-shadow .25s ease',
              }}
              className="step-card-hover"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontFamily: 'var(--serif)',
                    fontStyle: 'italic',
                    fontWeight: 400,
                    fontSize: 48,
                    lineHeight: 0.85,
                    letterSpacing: '-0.025em',
                    color: 'var(--green)',
                  }}
                >
                  {step.num}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10.5,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--green-2)',
                    background: 'var(--mist)',
                    border: '1px solid rgba(3,78,54,0.15)',
                    padding: '3px 8px',
                    borderRadius: 6,
                  }}
                >
                  {step.tag}
                </span>
              </div>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 13,
                  background: 'var(--paper-2)',
                  border: '1px solid rgba(10,10,10,0.10)',
                  color: 'var(--green)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {step.icon}
              </div>
              <h3 style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.018em' }}>{step.title}</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--muted)', maxWidth: '34ch' }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 880px) {
          .steps-responsive { grid-template-columns: 1fr !important; }
        }
        .step-card-hover:hover {
          transform: translateY(-3px) !important;
          border-color: rgba(10,10,10,0.2) !important;
          box-shadow: 0 24px 60px -28px rgba(10,10,10,0.18) !important;
        }
      ` }} />
    </section>
  )
}
