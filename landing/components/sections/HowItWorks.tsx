import Reveal from '@/components/ui/Reveal'

const steps = [
  {
    num: '01',
    title: 'Choose Your Occasion',
    desc: 'Tell us what you\'re getting ready for — wedding, reception, date, photoshoot, or any moment that matters.',
    color: 'var(--rose)',
    bg: 'var(--rose-bg)',
  },
  {
    num: '02',
    title: 'Glow Matches You',
    desc: 'Our intelligent matching system recommends the best verified artists based on your style, budget, and location.',
    color: 'var(--gold)',
    bg: 'var(--gold-bg)',
  },
  {
    num: '03',
    title: 'Compare & Book',
    desc: 'Review portfolios, read real client reviews, and book your perfect artist in seconds — all transparent pricing.',
    color: '#9B7DBF',
    bg: '#F5F0FA',
  },
  {
    num: '04',
    title: 'Enjoy Your Glow',
    desc: 'Relax and enjoy a premium beauty experience. Your verified artist comes to you — at home or at the salon.',
    color: '#5BA88C',
    bg: '#F0FAF5',
  },
]

export default function HowItWorks() {
  return (
    <section id="how" className="sec" style={{ background: 'var(--paper)' }}>
      <div className="wrap">
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <div className="eyebrow" style={{ justifyContent: 'center', marginBottom: 20 }}>
              <span className="dot" />
              How it Works
            </div>
            <h2 className="h2" style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
              From booking to <i>beautiful</i> in minutes
            </h2>
          </div>
        </Reveal>

        {/* Timeline */}
        <div style={{ position: 'relative', maxWidth: 800, margin: '0 auto' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute',
            left: 39,
            top: 40,
            bottom: 40,
            width: 2,
            background: 'linear-gradient(to bottom, var(--rose), var(--gold), #9B7DBF, #5BA88C)',
            borderRadius: 2,
          }} className="timeline-line" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
            {steps.map((step, i) => (
              <Reveal key={step.num} delay={i * 100}>
                <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
                  {/* Number circle */}
                  <div style={{
                    width: 80,
                    height: 80,
                    borderRadius: 20,
                    background: step.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    position: 'relative',
                    zIndex: 1,
                  }}>
                    <span style={{
                      fontFamily: 'var(--serif)',
                      fontSize: 28,
                      fontStyle: 'italic',
                      color: step.color,
                      fontWeight: 400,
                    }}>{step.num}</span>
                  </div>

                  {/* Content */}
                  <div style={{ paddingTop: 8 }}>
                    <h3 style={{
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: '-0.02em',
                      marginBottom: 8,
                      color: 'var(--ink)',
                    }}>{step.title}</h3>
                    <p style={{
                      fontSize: 15.5,
                      lineHeight: 1.6,
                      color: 'var(--muted)',
                      maxWidth: '44ch',
                    }}>{step.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 640px) {
          .timeline-line { left: 23px !important; }
        }
      ` }} />
    </section>
  )
}
