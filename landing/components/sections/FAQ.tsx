'use client'

import { useState } from 'react'
import Reveal from '@/components/ui/Reveal'

const faqs = [
  {
    q: 'What is Glow?',
    a: 'Glow is a premium beauty marketplace that connects you with verified makeup artists, hairstylists, and beauty professionals for weddings, receptions, photoshoots, and every moment that matters. We\'re your personal beauty concierge.',
  },
  {
    q: 'How does Glow Match work?',
    a: 'Glow Match intelligently recommends the best beauty professionals based on your occasion, budget, location, availability, and preferred style. Instead of scrolling through hundreds of profiles, we bring the perfect artists to you.',
  },
  {
    q: 'Are beauty professionals on Glow verified?',
    a: 'Yes. Every beauty professional on Glow undergoes government verification, background checks, portfolio review, and credential validation before joining the platform. Your safety and satisfaction are our top priorities.',
  },
  {
    q: 'Can I book at-home beauty services?',
    a: 'Absolutely. Many of our verified artists offer at-home services for weddings, parties, and special events. You can filter by location and service type when booking through the app.',
  },
  {
    q: 'How do I become a beauty artist on Glow?',
    a: 'Join Glow as a beauty professional by completing our verification process. Showcase your portfolio, receive bookings, manage your calendar, and grow your beauty business with us. Click "Join as Artist" to get started.',
  },
  {
    q: 'What occasions can I book for?',
    a: 'Glow covers every beauty moment — weddings, receptions, date nights, birthdays, festivals, graduations, office events, photoshoots, and everyday glow-ups. If it matters to you, we have the perfect artist for it.',
  },
  {
    q: 'How much does Glow cost?',
    a: 'Pricing varies by artist and service. All pricing is transparent — you\'ll see the exact cost before you book. There are no hidden fees or surprise charges.',
  },
]

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section className="sec" style={{ background: 'var(--paper)' }}>
      <div className="wrap">
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="eyebrow" style={{ justifyContent: 'center', marginBottom: 20 }}>
              <span className="dot" />
              FAQ
            </div>
            <h2 className="h2" style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
              Frequently <i>asked</i> questions
            </h2>
          </div>
        </Reveal>

        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {faqs.map((faq, i) => (
            <Reveal key={i} delay={i * 40}>
              <div style={{
                borderBottom: '1px solid var(--line)',
              }}>
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '24px 0',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{
                    fontSize: 17,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    color: 'var(--ink)',
                  }}>{faq.q}</span>
                  <svg
                    width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"
                    style={{
                      transform: open === i ? 'rotate(45deg)' : 'rotate(0)',
                      transition: 'transform .3s ease',
                      flexShrink: 0,
                      marginLeft: 16,
                    }}
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <div style={{
                  maxHeight: open === i ? 200 : 0,
                  overflow: 'hidden',
                  transition: 'max-height .35s cubic-bezier(0.16, 1, 0.3, 1)',
                }}>
                  <p style={{
                    fontSize: 15,
                    lineHeight: 1.65,
                    color: 'var(--muted)',
                    paddingBottom: 24,
                  }}>{faq.a}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
