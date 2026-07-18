const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <path d="m20 6-11 11-5-5" />
  </svg>
)

export default function Features() {
  return (
    <section
      className="sec"
      id="platform"
      style={{
        background: 'var(--paper-2)',
        borderTop: '1px solid rgba(10,10,10,0.10)',
        borderBottom: '1px solid rgba(10,10,10,0.10)',
      }}
    >
      <div className="wrap">
        <div className="sec-head">
          <span className="sec-meta">Section 02 — Platform</span>
          <h2 className="h2">
            Everything families need.
            <br />
            <i>Nothing</i> they don&apos;t.
          </h2>
          <div className="right">
            Six things we built to make home care feel less like 1995 and more like the apps you already use.
          </div>
        </div>

        {/* Bento grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gridAutoRows: 'minmax(220px, auto)',
            gap: 14,
          }}
          className="bento-responsive"
        >
          {/* Verification — span-3 row-2 */}
          <div
            className="bx-hover"
            style={{
              gridColumn: 'span 3',
              gridRow: 'span 2',
              background: 'var(--card-2)',
              border: '1px solid rgba(10,10,10,0.10)',
              borderRadius: 22,
              padding: 28,
              position: 'relative',
              overflow: 'hidden',
              transition: 'border-color .25s ease, transform .25s ease, box-shadow .25s ease',
            }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green-2)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              Verification
            </div>
            <h3 style={{ marginTop: 14, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Every caregiver vetted <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--green)' }}>before</i> day one.
            </h3>
            <p style={{ marginTop: 10, fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.55, maxWidth: '42ch' }}>
              Police record check, government ID, Provider credentials, two reference calls. We renew clearance annually and re-verify after any incident report.
            </p>
            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: <path d="M12 2 4 5v7c0 5 4 9 8 10 4-1 8-5 8-10V5l-8-3z" />, label: 'Vulnerable Sector police check' },
                { icon: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 12h6" /></>, label: 'Government photo ID' },
                { icon: <><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 1 4 3 6 3s6-2 6-3v-5" /></>, label: 'Provider credentials · OCSWSSW' },
                { icon: <path d="M17 11a5 5 0 1 0-10 0M12 2v3M2 18h20" />, label: '2× professional references' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', background: 'var(--paper-2)', border: '1px solid rgba(10,10,10,0.10)', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--mist)', color: 'var(--green)', display: 'grid', placeItems: 'center' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">{row.icon}</svg>
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{row.label}</span>
                  </div>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--green)', color: '#fff', display: 'grid', placeItems: 'center' }}>
                    <CheckIcon />
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing — span-3 */}
          <div
            className="bx-hover"
            style={{ gridColumn: 'span 3', background: 'var(--card-2)', border: '1px solid rgba(10,10,10,0.10)', borderRadius: 22, padding: 28, position: 'relative', overflow: 'hidden', transition: 'border-color .25s ease, transform .25s ease, box-shadow .25s ease' }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green-2)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              Pricing
            </div>
            <h3 style={{ marginTop: 14, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Flat <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--green)' }}>$25/hr.</i> Always.
            </h3>
            <p style={{ marginTop: 10, fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.55 }}>
              What you see is what you pay. No surge, no weekend, evening, or stat-holiday surcharges.
            </p>
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Glow', pct: '36%', value: '$25', green: true },
                { label: 'Agency avg.', pct: '78%', value: '$48', green: false },
              ].map(bar => (
                <div key={bar.label} style={{ display: 'grid', gridTemplateColumns: '96px 1fr auto', gap: 12, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{bar.label}</span>
                  <div style={{ height: 10, borderRadius: 999, background: 'rgba(10,10,10,0.06)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: 999,
                      background: bar.green ? 'linear-gradient(90deg, var(--green-3) 0%, var(--green-2) 100%)' : 'rgba(10,10,10,0.25)',
                      width: bar.pct,
                    }} />
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{bar.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live arrival — span-3 */}
          <div
            className="bx-hover"
            style={{ gridColumn: 'span 3', background: 'var(--card-2)', border: '1px solid rgba(10,10,10,0.10)', borderRadius: 22, padding: 28, position: 'relative', overflow: 'hidden', transition: 'border-color .25s ease, transform .25s ease, box-shadow .25s ease' }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green-2)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              Live arrival
            </div>
            <h3 style={{ marginTop: 14, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Track your Provider <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--green)' }}>door-to-door.</i>
            </h3>
            <p style={{ marginTop: 10, fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.55, maxWidth: '42ch' }}>
              Real-time GPS, ETA updates, and arrival notifications — so the family knows exactly when care is on the way.
            </p>
            {/* map */}
            <div style={{
              marginTop: 24, height: 160, borderRadius: 14, position: 'relative', overflow: 'hidden',
              border: '1px solid rgba(10,10,10,0.10)',
              backgroundImage: 'linear-gradient(rgba(3,78,54,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(3,78,54,0.07) 1px, transparent 1px), linear-gradient(180deg, #F2EFE7 0%, #ECE7D8 100%)',
              backgroundSize: '32px 32px, 32px 32px, 100% 100%',
            }}>
              <div style={{ position: 'absolute', top: 14, right: 14, fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)', background: 'var(--mist)', border: '1px solid rgba(3,78,54,0.18)', padding: '4px 8px', borderRadius: 6 }}>ETA 12 MIN</div>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 400 160" preserveAspectRatio="none">
                <path d="M88 60 C 150 30, 200 90, 256 100" stroke="#034E36" strokeWidth="2" fill="none" strokeDasharray="4 5" opacity="0.6" />
              </svg>
              {/* you pin */}
              <div style={{ position: 'absolute', top: '36%', left: '22%', width: 16, height: 16, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 0 4px rgba(3,78,54,0.18)' }}>
                <div className="animate-ping-pin" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--green)' }} />
              </div>
              {/* provider pin */}
              <div style={{ position: 'absolute', top: '62%', left: '64%', width: 16, height: 16, borderRadius: '50%', background: '#9A5B05', boxShadow: '0 0 0 4px rgba(154,91,5,0.2)' }}>
                <div className="animate-ping-pin" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#9A5B05' }} />
              </div>
            </div>
          </div>

          {/* Bilingual — span-2 */}
          <div
            className="bx-hover"
            style={{ gridColumn: 'span 2', background: 'var(--card-2)', border: '1px solid rgba(10,10,10,0.10)', borderRadius: 22, padding: 28, position: 'relative', overflow: 'hidden', transition: 'border-color .25s ease, transform .25s ease, box-shadow .25s ease' }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--mist)', color: 'var(--green)', display: 'grid', placeItems: 'center', border: '1px solid rgba(3,78,54,0.12)', marginBottom: 14 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Bilingual EN / FR</h3>
            <p style={{ marginTop: 10, fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.55 }}>Filter caregivers by language. Full app support in both English and French.</p>
          </div>

          {/* Stripe — span-2 */}
          <div
            className="bx-hover"
            style={{ gridColumn: 'span 2', background: 'var(--card-2)', border: '1px solid rgba(10,10,10,0.10)', borderRadius: 22, padding: 28, position: 'relative', overflow: 'hidden', transition: 'border-color .25s ease, transform .25s ease, box-shadow .25s ease' }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--mist)', color: 'var(--green)', display: 'grid', placeItems: 'center', border: '1px solid rgba(3,78,54,0.12)', marginBottom: 14 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
              </svg>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Stripe secure pay</h3>
            <p style={{ marginTop: 10, fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.55 }}>Card on file, in-app receipts, no cash, no awkward conversations.</p>
          </div>

          {/* Messaging — span-2 */}
          <div
            className="bx-hover"
            style={{ gridColumn: 'span 2', background: 'var(--card-2)', border: '1px solid rgba(10,10,10,0.10)', borderRadius: 22, padding: 28, position: 'relative', overflow: 'hidden', transition: 'border-color .25s ease, transform .25s ease, box-shadow .25s ease' }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--mist)', color: 'var(--green)', display: 'grid', placeItems: 'center', border: '1px solid rgba(3,78,54,0.12)', marginBottom: 14 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M21 11c0 4-4 7-9 7-1.5 0-3-.3-4-.7L3 19l1.7-3.3C3.6 14.4 3 13 3 11c0-4 4-7 9-7s9 3 9 7z" />
              </svg>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>In-app messaging</h3>
            <p style={{ marginTop: 10, fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.55 }}>Chat directly with your Provider. Photo notes after every visit.</p>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) {
          .bento-responsive { grid-template-columns: repeat(2, 1fr) !important; }
          .bento-responsive > div[style*="span 4"],
          .bento-responsive > div[style*="span 3"],
          .bento-responsive > div[style*="span 2"] { grid-column: span 2 !important; }
          .bento-responsive > div[style*="span 2"] { grid-row: auto !important; }
        }
        .bx-hover:hover {
          border-color: rgba(10,10,10,0.18) !important;
          transform: translateY(-2px) !important;
          box-shadow: 0 24px 50px -24px rgba(10,10,10,0.12) !important;
        }
      ` }} />
    </section>
  )
}
