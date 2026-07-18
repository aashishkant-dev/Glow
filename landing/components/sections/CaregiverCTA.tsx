'use client'
import { useState } from 'react'
import ProviderApplyForm from './ProviderApplyForm'

const stats = [
  {
    value: '$20–24',
    suffix: '/HR',
    label: 'You keep the majority of every booking — no agency markup.',
    italic: false,
  },
  {
    value: 'Fast',
    suffix: 'PAYOUTS',
    label: 'Paid after completed visits. No two-week agency waits.',
    italic: true,
  },
  {
    value: '0',
    suffix: 'REQ HRS',
    label: 'Work the shifts that fit your life. Accept or decline.',
    italic: false,
  },
  {
    value: '24',
    suffix: '/ 7',
    label: 'Real human support from a local team.',
    italic: false,
  },
]

export default function CaregiverCTA() {
  const [applyOpen, setApplyOpen] = useState(false)

  return (
    <section
      id="provider"
      style={{
        background: 'linear-gradient(180deg, #052A1F 0%, #034E36 50%, #052A1F 100%)',
        color: 'var(--paper)',
        padding: '160px 0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* background glows */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 85% 10%, rgba(14,165,111,0.35) 0%, transparent 50%), radial-gradient(circle at 5% 95%, rgba(255,214,107,0.10) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <div className="wrap" style={{ position: 'relative' }}>
        <span
          className="eyebrow"
          style={{ color: 'var(--warmth)' }}
        >
          <span
            className="dot"
            style={{ background: 'var(--warmth)', boxShadow: '0 0 12px var(--warmth)' }}
          />
          Section 07 — For Personal Support Workers
        </span>

        <div
          style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 64, alignItems: 'end', marginTop: 48 }}
          className="provider-grid-responsive"
        >
          <div>
            <h2
              className="h2"
              style={{ color: 'var(--paper)' }}
            >
              Set your hours.
              <br />
              Earn <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--warmth)' }}>what you&apos;re worth.</i>
            </h2>
            <p style={{ fontSize: 18, color: '#B8D4C8', lineHeight: 1.55, maxWidth: '48ch', marginTop: 24, marginBottom: 32 }}>
              Northern Ontario Providers deserve better than $14/hr through an agency that takes most of the cheque. Glow pays among the highest local rates, weekly — and you choose every booking you accept.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setApplyOpen(true)} className="btn btn-warm btn-lg">
                Apply as a Provider
                <svg className="arr" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </button>
              <a href="tel:+16476209243" className="btn btn-ghost-inv btn-lg">Call us instead</a>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {stats.map(s => (
              <div
                key={s.value}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 16,
                  padding: 24,
                }}
              >
                <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1, color: 'var(--paper)' }}>
                  {s.italic
                    ? <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--warmth)' }}>{s.value}</i>
                    : s.value}
                  {s.suffix && (
                    <small style={{ fontSize: 13, color: '#9FB7AA', fontWeight: 500, fontFamily: 'var(--mono)', letterSpacing: '0.06em', marginLeft: 4 }}>
                      {s.suffix}
                    </small>
                  )}
                </div>
                <div style={{ marginTop: 10, fontSize: 13, color: '#B8D4C8', lineHeight: 1.5 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {applyOpen && (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setApplyOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 999,
              background: 'rgba(5,42,31,0.72)',
              // Scrollable overlay: the form is taller than a phone viewport.
              // align-items:center clipped the top/bottom fields with no way to
              // reach them — margin:auto on the child centers when it fits and
              // scrolls when it doesn't.
              display: 'flex', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              padding: '32px 20px',
            }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, position: 'relative', margin: 'auto' }}>
              <button
                type="button"
                onClick={() => setApplyOpen(false)}
                aria-label="Close"
                style={{
                  position: 'absolute', top: -14, right: -14, zIndex: 1,
                  width: 32, height: 32, borderRadius: '50%',
                  background: '#fff', border: 'none', cursor: 'pointer',
                  fontSize: 16, fontWeight: 700, color: '#374151',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                }}
              >
                ✕
              </button>
              <ProviderApplyForm onClose={() => setApplyOpen(false)} />
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) { .provider-grid-responsive { grid-template-columns: 1fr !important; gap: 48px !important; } }
      ` }} />
    </section>
  )
}
