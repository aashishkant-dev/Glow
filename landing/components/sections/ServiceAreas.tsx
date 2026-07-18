const NEIGHBOURHOODS = [
  { name: 'Sudbury (Downtown)', lat: 46.4917, lng: -80.9930 },
  { name: 'New Sudbury', lat: 46.5145, lng: -80.9550 },
  { name: 'Hanmer', lat: 46.5619, lng: -80.9550 },
  { name: 'Valley East', lat: 46.5186, lng: -81.1236 },
  { name: 'Capreol', lat: 46.7458, lng: -81.0164 },
  { name: 'Lively', lat: 46.4500, lng: -81.1500 },
  { name: 'Coniston', lat: 46.4828, lng: -80.8500 },
  { name: 'Copper Cliff', lat: 46.4633, lng: -81.0550 },
  { name: 'Garson', lat: 46.5453, lng: -80.8700 },
  { name: 'Val Caron', lat: 46.5589, lng: -80.9989 },
  { name: 'Chelmsford', lat: 46.5833, lng: -81.1833 },
  { name: 'The Donovan', lat: 46.4750, lng: -81.0100 },
]

export default function ServiceAreas() {
  return (
    <section
      className="sec"
      id="service-areas"
      style={{
        background: 'var(--paper-2)',
        borderTop: '1px solid rgba(10,10,10,0.10)',
        borderBottom: '1px solid rgba(10,10,10,0.10)',
      }}
    >
      <div className="wrap">
        <div className="sec-head">
          <span className="sec-meta">Section 03 — Coverage</span>
          <h2 className="h2">
            Serving all of <i>Greater Sudbury.</i>
          </h2>
          <div className="right">
            Verified Providers available within a 15&nbsp;km radius of downtown Sudbury — book a
            caregiver near you, wherever you live in the city.
          </div>
        </div>

        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}
          className="area-grid-responsive"
        >
          {NEIGHBOURHOODS.map(area => (
            <div
              key={area.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '16px 18px',
                background: 'var(--card-2)',
                border: '1px solid rgba(10,10,10,0.10)',
                borderRadius: 14,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'var(--mist)',
                  color: 'var(--green)',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 2 4 5v7c0 5 4 9 8 10 4-1 8-5 8-10V5l-8-3z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{area.name}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 20,
            fontFamily: 'var(--mono)',
            fontSize: 11.5,
            letterSpacing: '0.06em',
            color: 'var(--muted)',
          }}
        >
          Don&apos;t see your area? We&apos;re expanding — <a href="/#contact" style={{ color: 'var(--green)', fontWeight: 600 }}>reach out</a> and we&apos;ll let you know when we cover it.
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) { .area-grid-responsive { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 560px) { .area-grid-responsive { grid-template-columns: 1fr !important; } }
      ` }} />
    </section>
  )
}
