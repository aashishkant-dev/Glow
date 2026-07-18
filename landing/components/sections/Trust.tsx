export default function Trust() {
  const logos = [
    { name: 'Vulnerable Sector Police Check', serif: false },
    { name: 'OCSWSSW Credential Verified', serif: false },
    { name: 'Government ID Verified', serif: false },
    { name: 'Bilingual EN / FR', serif: false, style: { letterSpacing: '0.18em', textTransform: 'uppercase' as const, fontSize: 13 } },
    { name: 'Serving Greater Sudbury', serif: false },
  ]

  return (
    <section
      style={{
        padding: '56px 0',
        borderBottom: '1px solid rgba(10,10,10,0.10)',
        background: 'var(--paper-2)',
      }}
    >
      <div className="wrap">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 48,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              maxWidth: '18ch',
              lineHeight: 1.5,
            }}
          >
            Every caregiver, checked the same way
          </div>
          {logos.map(logo => (
            <span
              key={logo.name}
              style={{
                fontWeight: logo.serif ? 400 : 600,
                fontSize: logo.serif ? 22 : 16,
                color: 'var(--muted)',
                opacity: 0.75,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                letterSpacing: '-0.015em',
                fontFamily: logo.serif ? 'var(--serif)' : undefined,
                fontStyle: logo.serif ? 'italic' : undefined,
                transition: 'color .15s ease, opacity .15s ease',
                cursor: 'default',
                ...logo.style,
              }}
            >
              {logo.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
