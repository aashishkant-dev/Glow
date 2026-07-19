'use client'

import { GlowMark } from '@/components/brand/GlowMark'

const footCols = [
  {
    title: 'Discover',
    links: [
      ['Occasions', '/#occasions'],
      ['How it Works', '/#how'],
      ['Trending Looks', '/#looks'],
      ['Glow Match', '/#match'],
      ['Blog', '/blog'],
    ],
  },
  {
    title: 'For Artists',
    links: [
      ['Join Glow', '/#artists'],
      ['Artist Portfolios', '/#portfolios'],
      ['Grow Your Business', '/#artists'],
      ['Support', '/support'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['About', '/'],
      ['Contact', '/#contact'],
      ['Privacy Policy', '/privacy'],
      ['Terms of Service', '/terms'],
    ],
  },
]

export default function Footer() {
  return (
    <footer
      style={{
        background: 'var(--ink)',
        color: '#fff',
        padding: '80px 0 36px',
      }}
    >
      <div className="wrap">
        {/* mega wordmark */}
        <div
          style={{
            fontWeight: 700,
            fontSize: 'clamp(80px, 15vw, 220px)',
            lineHeight: 0.78,
            letterSpacing: '-0.05em',
            color: '#fff',
            marginBottom: 56,
          }}
        >
          Glow<i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--rose)', letterSpacing: '-0.03em' }}>.</i>
        </div>

        {/* grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
            gap: 48,
            paddingTop: 56,
            borderTop: '1px solid rgba(255,255,255,0.10)',
          }}
          className="foot-grid-responsive"
        >
          {/* brand col */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <GlowMark size={28} inverted />
              <span style={{ fontFamily: 'var(--sans)', fontWeight: 300, fontSize: 20, letterSpacing: '-0.02em', color: '#fff' }}>
                Glow
              </span>
            </div>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, maxWidth: '34ch' }}>
              Premium beauty marketplace connecting you with verified makeup artists, hairstylists, and beauty professionals across Nepal.
            </p>
            <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
              {['Instagram', 'TikTok', 'Facebook'].map(social => (
                <a
                  key={social}
                  href="#"
                  style={{
                    fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.4)',
                    transition: 'color .15s ease',
                  }}
                  onMouseEnter={e => ((e.target as HTMLElement).style.color = 'var(--rose)')}
                  onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.4)')}
                >
                  {social}
                </a>
              ))}
            </div>
          </div>

          {/* link cols */}
          {footCols.map(col => (
            <div key={col.title}>
              <h4
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.35)',
                  marginBottom: 18,
                  fontWeight: 600,
                }}
              >
                {col.title}
              </h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="foot-link"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* bottom bar */}
        <div
          style={{
            marginTop: 64,
            paddingTop: 24,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          <span>&copy; 2026 Glow Inc. · Nepal</span>
          <span>Made with love for beauty</span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 880px) {
          .foot-grid-responsive { grid-template-columns: 1fr 1fr !important; gap: 36px !important; }
        }
        @media (max-width: 520px) {
          .foot-grid-responsive { grid-template-columns: 1fr !important; }
        }
        .foot-link { font-size: 14.5px; font-weight: 500; color: rgba(255,255,255,0.6); transition: color .15s ease; }
        .foot-link:hover { color: #fff; }
      ` }} />
    </footer>
  )
}
