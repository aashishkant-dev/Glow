export default function FinalCTA() {
  return (
    <section id="dl" style={{ padding: '140px 0', position: 'relative', overflow: 'hidden' }}>
      <div className="wrap">
        <div
          style={{
            position: 'relative',
            background: 'var(--ink)',
            color: 'var(--paper)',
            borderRadius: 32,
            padding: '80px 64px',
            display: 'grid',
            gridTemplateColumns: '1.3fr 1fr',
            gap: 64,
            alignItems: 'center',
            overflow: 'hidden',
          }}
          className="dl-card-responsive"
        >
          {/* card glow */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 85% 80%, rgba(14,165,111,0.28) 0%, transparent 50%), radial-gradient(circle at 15% 20%, rgba(255,214,107,0.08) 0%, transparent 60%)',
              pointerEvents: 'none',
            }}
          />

          {/* left */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <span className="eyebrow" style={{ color: 'var(--paper)' }}>
              <span className="dot" />
              Download the app
            </span>
            <h2 className="h2" style={{ color: 'var(--paper)', marginTop: 18 }}>
              Care at your door,
              <br />
              <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--warmth)' }}>this afternoon.</i>
            </h2>
            <p style={{ fontSize: 17, color: '#B8C7BF', margin: '18px 0 32px', maxWidth: '42ch' }}>
              Free to download. No subscription. You only pay for the visits you book.
            </p>
            <a
              href="https://glow.app"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                marginBottom: 20, fontSize: 13, fontFamily: 'var(--mono)',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--green-3)', textDecoration: 'none', fontWeight: 600,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-3)', boxShadow: '0 0 0 4px rgba(14,165,111,0.25)' }} className="animate-pulse-dot" />
              Open web app at glow.app
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', position: 'relative', zIndex: 1 }} className="store-btns-row">
              <a href="https://apps.apple.com/ca/app/glow/id6779246235" target="_blank" rel="noopener noreferrer" className="store-btn">
                <svg width="22" height="22" viewBox="0 0 814 1000" fill="currentColor">
                  <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-37.8-155.5-127.4C46 790.6 0 663.8 0 541.4c0-194.3 127.4-297.5 252.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
                </svg>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', lineHeight: 1 }}>Download on the</div>
                  <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', marginTop: 2, textTransform: 'uppercase' }}>App Store</div>
                </div>
              </a>
              <a href="https://glow.app" target="_blank" rel="noopener noreferrer" className="store-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2c2.7 2.9 4 6.4 4 10s-1.3 7.1-4 10c-2.7-2.9-4-6.4-4-10s1.3-7.1 4-10z" />
                </svg>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', lineHeight: 1 }}>Android &amp; desktop</div>
                  <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', marginTop: 2, textTransform: 'uppercase' }}>Web App</div>
                </div>
              </a>
            </div>
          </div>

          {/* right — QR */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              style={{
                width: 240,
                height: 240,
                borderRadius: 24,
                background: 'var(--paper)',
                padding: 20,
                position: 'relative',
                marginLeft: 'auto',
                boxShadow: '0 30px 80px -20px rgba(0,0,0,0.5)',
              }}
              className="qr-center-responsive"
            >
              {/* Real, scannable QR (qrcode npm, error correction M) → https://glow.app.
                  The previous hand-drawn decorative QR didn't scan — anyone pointing a
                  camera at it got nothing, which reads as a fake site. */}
              <svg viewBox="0 0 33 33" shapeRendering="crispEdges" style={{ width: '100%', height: '100%' }} role="img" aria-label="QR code linking to glow.app">
                <path fill="#FFFFFF" d="M0 0h33v33H0z" />
                <path stroke="#0A0A0A" d="M4 4.5h7m1 0h1m1 0h2m6 0h7M4 5.5h1m5 0h1m1 0h1m1 0h2m1 0h2m3 0h1m5 0h1M4 6.5h1m1 0h3m1 0h1m1 0h1m4 0h2m1 0h1m1 0h1m1 0h3m1 0h1M4 7.5h1m1 0h3m1 0h1m2 0h1m1 0h1m1 0h2m1 0h1m1 0h1m1 0h3m1 0h1M4 8.5h1m1 0h3m1 0h1m1 0h1m3 0h3m1 0h1m1 0h1m1 0h3m1 0h1M4 9.5h1m5 0h1m2 0h2m1 0h3m1 0h1m1 0h1m5 0h1M4 10.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M13 11.5h1m1 0h5M4 12.5h1m2 0h6m2 0h1m2 0h2m1 0h1m2 0h1m1 0h3M5 13.5h2m1 0h2m2 0h1m1 0h2m2 0h2m3 0h5M5 14.5h3m1 0h2m1 0h1m1 0h1m1 0h1m1 0h6m1 0h1m2 0h1M4 15.5h1m2 0h3m3 0h1m2 0h1m1 0h1m1 0h1m1 0h1m2 0h4M5 16.5h1m1 0h1m2 0h1m1 0h2m5 0h2m1 0h2m4 0h1M4 17.5h2m1 0h3m6 0h2m1 0h3m2 0h1m2 0h1M4 18.5h3m1 0h1m1 0h1m1 0h1m1 0h1m2 0h1m1 0h1m2 0h1m1 0h5M4 19.5h1m3 0h1m2 0h2m1 0h1m1 0h1m1 0h1m4 0h1m1 0h2m1 0h1M4 20.5h1m1 0h2m1 0h3m1 0h1m1 0h3m1 0h6m1 0h2M12 21.5h4m2 0h1m1 0h1m3 0h1m1 0h2M4 22.5h7m1 0h3m1 0h3m1 0h1m1 0h1m1 0h1m3 0h1M4 23.5h1m5 0h1m1 0h2m1 0h1m1 0h4m3 0h1M4 24.5h1m1 0h3m1 0h1m1 0h4m1 0h1m1 0h6m2 0h2M4 25.5h1m1 0h3m1 0h1m1 0h1m3 0h3m2 0h2m4 0h2M4 26.5h1m1 0h3m1 0h1m3 0h2m1 0h1m2 0h2m2 0h5M4 27.5h1m5 0h1m2 0h1m1 0h3m4 0h3m1 0h3M4 28.5h7m1 0h6m2 0h1m1 0h1m2 0h1m2 0h1" />
              </svg>
            </div>
            <div
              style={{
                marginTop: 14,
                textAlign: 'right',
                fontFamily: 'var(--mono)',
                fontSize: 10.5,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#B8C7BF',
              }}
              className="qr-label-responsive"
            >
              Scan or visit
              <br />
              <b style={{ color: 'var(--warmth)' }}>glow.app</b>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) {
          .dl-card-responsive { grid-template-columns: 1fr !important; padding: 56px 32px !important; gap: 48px !important; }
          .qr-center-responsive { margin: 0 auto !important; }
          .qr-label-responsive { text-align: center !important; }
        }
        .store-btn {
          display: inline-flex; align-items: center; gap: 11px; height: 56px; padding: 0 20px;
          border-radius: 12px; background: rgba(255,255,255,0.12); color: var(--paper);
          border: 1px solid rgba(255,255,255,0.15);
          transition: background .2s ease, color .2s ease, transform .2s ease; text-decoration: none;
          min-width: 44px; touch-action: manipulation;
        }
        .store-btn:hover { background: var(--warmth); color: var(--ink); transform: translateY(-1px); }
        @media (max-width: 640px) {
          .store-btns-row { flex-direction: column !important; }
          .store-btn { width: 100%; justify-content: center; height: 60px; font-size: 16px; }
        }
      ` }} />
    </section>
  )
}
