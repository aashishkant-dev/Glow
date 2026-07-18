const BrandMark = () => (
  <svg style={{ width: 30, height: 30 }} viewBox="0 0 112 112" aria-hidden="true">
    <path d="M56 6 C32 6 13 25 13 48.5 C13 66 26 80 44 97 L52.5 104.6 C54.5 106.4 57.5 106.4 59.5 104.6 L68 97 C86 80 99 66 99 48.5 C99 25 80 6 56 6 Z" fill="#057A55" />
    <path d="M56 66 C54.9 66 53.8 65.6 53 64.9 C44.4 58 38.5 51.9 38.5 44.3 C38.5 38.2 43 34 48.2 34 C51.3 34 54.1 35.5 56 38 C57.9 35.5 60.7 34 63.8 34 C69 34 73.5 38.2 73.5 44.3 C73.5 51.9 67.6 58 59 64.9 C58.2 65.6 57.1 66 56 66 Z" fill="#FFFFFF" />
  </svg>
)

// Section anchors are prefixed with "/" so they still work from /privacy,
// /terms, /support and /blog — a bare "#how" is dead off the home page.
const footCols = [
  {
    title: 'Product',
    links: [
      ['How it works', '/#how'],
      ['Platform', '/#platform'],
      ['Caregivers', '/#directory'],
      ['Pricing', '/#pricing'],
      ['Blog', '/blog'],
      ['Download', '/#dl'],
    ],
  },
  {
    title: 'For Providers',
    links: [
      ['Apply', '/#provider'],
      ['Pay & payouts', '/#pricing'],
      ['Support', '/support'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['Contact', '/#contact'],
      ['Support', '/support'],
      ['Privacy policy', '/privacy'],
      ['Terms of service', '/terms'],
    ],
  },
]

export default function Footer() {
  return (
    <footer
      style={{
        background: 'var(--paper-2)',
        color: 'var(--ink)',
        padding: '80px 0 36px',
        borderTop: '1px solid rgba(10,10,10,0.10)',
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
            color: 'var(--ink)',
            marginBottom: 56,
          }}
        >
          Care<i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--green)', letterSpacing: '-0.03em' }}>Nearby.</i>
        </div>

        {/* grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
            gap: 48,
            paddingTop: 56,
            borderTop: '1px solid rgba(10,10,10,0.10)',
          }}
          className="foot-grid-responsive"
        >
          {/* brand col */}
          <div>
            <a
              href="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'var(--sans)',
                fontWeight: 300,
                fontSize: 20,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
              }}
            >
              <BrandMark />
              Care<strong style={{ fontWeight: 800 }}>Nearby</strong>
            </a>
            <p
              style={{
                fontSize: 14.5,
                color: 'var(--muted)',
                lineHeight: 1.6,
                maxWidth: '34ch',
                marginTop: 18,
              }}
            >
              Verified home care in Greater Sudbury, Ontario. Book a Personal Support Worker in minutes — flat $25/hr, no surprises.
            </p>
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
                  color: 'var(--muted)',
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
            borderTop: '1px solid rgba(10,10,10,0.10)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          <span>&copy; 2026 Glow Inc. · Greater Sudbury, ON</span>
          <span>Made with care in Northern Ontario 🇨🇦</span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 880px) {
          .foot-grid-responsive { grid-template-columns: 1fr 1fr !important; gap: 36px !important; }
        }
        .foot-link { font-size: 14.5px; font-weight: 500; color: var(--ink); transition: color .15s ease; }
        .foot-link:hover { color: var(--green-2); }
      ` }} />
    </footer>
  )
}
