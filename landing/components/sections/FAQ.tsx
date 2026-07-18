'use client'

import { useState } from 'react'

const faqs = [
  {
    q: 'How do I find a Provider near me in Sudbury?',
    a: 'Open glow.app, enter your address, and browse verified Providers near you — sorted by distance, with photos, credentials, and reviews. Every caregiver serves Greater Sudbury within 15 km, so anyone you see can reach you.',
  },
  {
    q: 'How much does Glow cost?',
    a: 'A flat $25/hr with a 3-hour minimum booking. Specialty care (RPN, dementia) is $28/hr. No booking fees, deposits, surge pricing, or weekend / evening surcharges.',
  },
  {
    q: 'Do I choose my Provider, or are they matched for me?',
    a: 'You choose. Browse verified Provider profiles — photos, experience, reviews, credentials — and pick exactly who books your care. We handle all the verification; you handle the selection.',
  },
  {
    q: 'How are Providers verified?',
    a: 'Every Provider completes Vulnerable Sector police screening, government ID verification, Provider credential review against the OCSWSSW registry, and reference checks before appearing in search.',
  },
  {
    q: 'How fast can I book a Provider in Sudbury?',
    a: 'Most bookings confirm the same day — on-demand requests often within the hour of opening the app.',
  },
  {
    q: 'Which Sudbury neighbourhoods do you serve?',
    a: 'All of Greater Sudbury within a 15 km radius — Downtown, New Sudbury, the Donovan, Garson, Lively, Val Caron, Hanmer, Valley East, Chelmsford, Coniston, Copper Cliff, and Capreol.',
  },
  {
    q: 'Can I cancel or reschedule?',
    a: 'Free up to 2 hours before. Within 2 hours, a 1-hour fee goes to the Provider for held time. Reschedules are always free if a new time is set.',
  },
  {
    q: 'Is the app available?',
    a: 'Yes — the iOS app is live on the App Store in Canada, and the web app at glow.app works on any phone or computer (including Android). Family accounts and Provider applications are open now in Greater Sudbury.',
  },
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number>(0)

  return (
    <section
      id="faq"
      style={{ padding: '160px 0', background: 'var(--paper)' }}
    >
      <div className="wrap-tight">
        <div
          style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.4fr', gap: 96, alignItems: 'start' }}
          className="faq-grid-responsive"
        >
          {/* left */}
          <div>
            <span className="eyebrow">
              <span className="dot" />
              Section 08 — FAQ
            </span>
            <h2 className="h2" style={{ marginTop: 18 }}>
              Questions, <i>answered.</i>
            </h2>
            <p className="lead" style={{ marginTop: 18 }}>
              If you don&apos;t see your answer here, our team answers every email — usually the same day.
            </p>
            <a href="mailto:support@glow.app" className="btn btn-ghost" style={{ marginTop: 24 }}>
              Email the team
              <svg className="arr" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* right — accordion */}
          <div>
            {faqs.map((faq, i) => (
              <div
                key={i}
                style={{ borderTop: '1px solid rgba(10,10,10,0.10)', borderBottom: i === faqs.length - 1 ? '1px solid rgba(10,10,10,0.10)' : 'none' }}
              >
                <button
                  onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '26px 0',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.018em', lineHeight: 1.25 }}>{faq.q}</span>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      border: '1px solid rgba(10,10,10,0.10)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      transition: 'all .25s ease',
                      background: openIndex === i ? 'var(--ink)' : 'transparent',
                      color: openIndex === i ? 'var(--paper)' : 'var(--ink)',
                      borderColor: openIndex === i ? 'var(--ink)' : 'rgba(10,10,10,0.10)',
                      transform: openIndex === i ? 'rotate(45deg)' : 'none',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </button>
                <div
                  style={{
                    maxHeight: openIndex === i ? 260 : 0,
                    overflow: 'hidden',
                    transition: 'max-height .35s ease',
                  }}
                >
                  <div style={{ padding: '0 0 28px', fontSize: 15, lineHeight: 1.65, color: 'var(--muted)', maxWidth: '60ch' }}>
                    {faq.a}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) { .faq-grid-responsive { grid-template-columns: 1fr !important; gap: 48px !important; } }
      ` }} />
    </section>
  )
}
