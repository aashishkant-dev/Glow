import Reveal from '@/components/ui/Reveal'

const journeySteps = [
  { day: '30 Days Before', tasks: ['Skincare Prep', 'Facial Treatment'], color: 'var(--rose)' },
  { day: '14 Days Before', tasks: ['Hair Treatment', 'Eyebrow Shaping'], color: 'var(--gold)' },
  { day: '7 Days Before', tasks: ['Waxing', 'Nail Art'], color: '#9B7DBF' },
  { day: 'The Big Day', tasks: ['Hair Styling', 'Makeup', 'Final Touch'], color: '#5BA88C' },
]

export default function BeautyJourney() {
  return (
    <section className="sec" style={{ background: 'var(--paper)' }}>
      <div className="wrap">
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="eyebrow" style={{ justifyContent: 'center', marginBottom: 20 }}>
              <span className="dot" />
              Beauty Journey
            </div>
            <h2 className="h2" style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
              Your path to <i>perfection</i> starts here
            </h2>
            <p className="lead" style={{ textAlign: 'center', maxWidth: '48ch', margin: '20px auto 0' }}>
              Planning a wedding or special event? Glow helps you prepare with a personalized beauty timeline — so you look absolutely radiant when it matters most.
            </p>
          </div>
        </Reveal>

        {/* Timeline */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 20,
          position: 'relative',
        }} className="journey-grid">
          {/* Connecting line */}
          <div style={{
            position: 'absolute',
            top: 40,
            left: '12%',
            right: '12%',
            height: 2,
            background: 'linear-gradient(to right, var(--rose), var(--gold), #9B7DBF, #5BA88C)',
            borderRadius: 2,
            zIndex: 0,
          }} className="journey-line" />

          {journeySteps.map((step, i) => (
            <Reveal key={step.day} delay={i * 100}>
              <div style={{
                background: 'var(--card)',
                borderRadius: 20,
                border: '1px solid var(--line-2)',
                padding: 28,
                textAlign: 'center',
                position: 'relative',
                zIndex: 1,
              }}>
                {/* Step indicator */}
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: step.color,
                  margin: '0 auto 16px',
                  boxShadow: `0 0 0 4px var(--paper), 0 0 0 6px ${step.color}30`,
                }} />

                <span style={{
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.12em', color: step.color,
                  display: 'block', marginBottom: 12,
                }}>{step.day}</span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {step.tasks.map(task => (
                    <span key={task} style={{
                      fontSize: 14, fontWeight: 500, color: 'var(--ink)',
                      background: `${step.color}08`,
                      padding: '8px 12px',
                      borderRadius: 10,
                    }}>{task}</span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .journey-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .journey-line { display: none !important; }
        }
        @media (max-width: 480px) {
          .journey-grid { grid-template-columns: 1fr !important; }
        }
      ` }} />
    </section>
  )
}
