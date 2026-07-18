const Provider_PHOTOS = [
  {
    initials: 'Provider', name: 'Personal Support Worker', sub: 'Police-checked · Credential-verified', price: '$25', feat: true,
    bg: 'linear-gradient(135deg,#1B6F5A,#0EA56F)',
  },
  {
    initials: 'Provider', name: 'Personal Support Worker', sub: 'Police-checked · Credential-verified', price: '$25', feat: false,
    bg: 'linear-gradient(135deg,#7A5B05,#FFD66B)',
  },
  {
    initials: 'RPN', name: 'Registered Practical Nurse', sub: 'Police-checked · Credential-verified', price: '$25', feat: false,
    bg: 'linear-gradient(135deg,#3B5BA0,#A0C0F0)',
  },
]

export default function Hero() {
  return (
    <section
      style={{
        padding: '64px 0 96px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* radial gradient bg */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 60% 50% at 12% 18%, rgba(14,165,111,0.10) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 90% 0%, rgba(255,214,107,0.16) 0%, transparent 60%)',
        }}
      />

      <div className="wrap">
        {/* eyebrow row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32, flexWrap: 'wrap', position: 'relative' }}>
          <span className="eyebrow">
            <span className="dot" />
            Verified home care · Greater Sudbury, ON
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 30,
              padding: '0 14px',
              borderRadius: 999,
              background: 'rgba(10,10,10,0.04)',
              border: '1px solid rgba(10,10,10,0.10)',
              fontSize: 12,
              color: 'var(--ink)',
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--green-3)',
                boxShadow: '0 0 0 4px rgba(14,165,111,0.18)',
              }}
              className="animate-pulse-dot"
            />
Now booking in Greater Sudbury
          </span>
        </div>

        {/* hero grid */}
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: '1.15fr 1fr',
            gap: 64,
            alignItems: 'center',
          }}
          className="hero-grid-responsive"
        >
          {/* left col */}
          <div>
            <h1 className="h1" style={{ marginBottom: 28 }}>
              Find &amp; book verified
              <br />
              Providers near you in <i>Greater Sudbury</i>
              <br />
              — you choose, we verify.
            </h1>
            <p className="lead" style={{ marginBottom: 36, fontSize: 19 }}>
              Browse real profiles of police-checked, Provider-certified caregivers in Greater Sudbury
              and pick exactly who cares for your family. Same-day booking in minutes, not
              weeks — flat <b>$25/hr</b>, no surge.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 36 }}>
              <a href="/#dl" className="btn btn-warm btn-lg">
                Book a caregiver
                <svg className="arr" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </a>
              <a href="/#how" className="btn btn-ghost btn-lg">How it works</a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              {['No deposit', 'Cancel free up to 2h', 'Bilingual EN / FR'].map(item => (
                <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, color: 'var(--muted)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green-2)" strokeWidth="2.5" strokeLinecap="round">
                    <path d="m20 6-11 11-5-5" />
                  </svg>
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* right col — phone mockup */}
          <div style={{ position: 'relative' }}>
            {/* float top-left */}
            <div
              className="float-card"
              style={{
                position: 'absolute',
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(14px)',
                border: '1px solid rgba(10,10,10,0.10)',
                borderRadius: 14,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 18px 40px -16px rgba(10,10,10,0.15)',
                top: '8%',
                left: '-8%',
                zIndex: 2,
              }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--mist)', color: 'var(--green)', display: 'grid', placeItems: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <path d="m20 6-11 11-5-5" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>Verified</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Police check · 2w ago</div>
              </div>
            </div>

            {/* device */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 380,
                margin: '0 auto',
                aspectRatio: '9/19',
                background: '#0A0A0A',
                borderRadius: 46,
                border: '1px solid rgba(10,10,10,0.12)',
                padding: 7,
                boxShadow: '0 0 0 1px rgba(255,255,255,0.6) inset, 0 50px 100px -30px rgba(10,10,10,0.35), 0 0 80px -20px rgba(14,165,111,0.18)',
                overflow: 'hidden',
              }}
            >
              {/* notch */}
              <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', width: 104, height: 24, background: '#0A0A0A', borderRadius: 14, zIndex: 5 }} />
              {/* screen */}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 38,
                  background: 'linear-gradient(180deg, #FBFAF6 0%, #F4F1EA 100%)',
                  overflow: 'hidden',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* status bar */}
                <div style={{ padding: '14px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink)', fontWeight: 500 }}>
                  <span>9:41</span>
                  <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18h2v-6H4v6zm5 0h2V8H9v10zm5 0h2v-3h-2v3zm5 0h2V4h-2v14z" /></svg>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 6c3.79 0 7.17 1.78 9.39 4.55l-2.06 2.07A9.95 9.95 0 0 0 12 9.5a9.95 9.95 0 0 0-7.33 3.12L2.61 10.55A11.97 11.97 0 0 1 12 6z" /></svg>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="6" width="18" height="12" rx="2" /></svg>
                  </span>
                </div>

                {/* head */}
                <div style={{ padding: '48px 22px 16px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>Greater Sudbury · Today</div>
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 6 }}>
                    Find a <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--green)', fontWeight: 400 }}>caregiver</i>
                  </div>
                </div>

                {/* search */}
                <div style={{ margin: '14px 22px 0', display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid rgba(10,10,10,0.10)', padding: '10px 12px', borderRadius: 12 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                  <div style={{ fontSize: 13, color: 'var(--ink)' }}><b>Personal care</b> · 3 hours</div>
                </div>

                {/* chips */}
                <div style={{ display: 'flex', gap: 6, padding: '12px 22px 0', flexWrap: 'wrap' }}>
                  {['All', 'Mobility', 'Post-op', 'Dementia'].map((c, i) => (
                    <span key={c} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(10,10,10,0.10)', background: i === 0 ? 'var(--ink)' : '#fff', color: i === 0 ? 'var(--paper)' : 'var(--ink)', fontWeight: i === 0 ? 600 : 500 }}>{c}</span>
                  ))}
                </div>

                {/* list */}
                <div style={{ padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'hidden' }}>
                  {Provider_PHOTOS.map((provider, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '38px 1fr auto', gap: 11, alignItems: 'center', padding: 11, borderRadius: 12, background: provider.feat ? 'linear-gradient(135deg, var(--mist) 0%, #fff 100%)' : '#fff', border: provider.feat ? '1px solid rgba(3,78,54,0.18)' : '1px solid rgba(10,10,10,0.10)' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 11, overflow: 'hidden', flexShrink: 0, background: provider.bg, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                        {provider.initials}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 5 }}>
                          {provider.name}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--green-2)"><path d="M12 2 4 5v7c0 5 4 9 8 10 4-1 8-5 8-10V5l-8-3zM10 16l-4-4 1.5-1.5L10 13l6.5-6.5L18 8l-8 8z" /></svg>
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>{provider.sub}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, textAlign: 'right', letterSpacing: '-0.01em' }}>
                        {provider.price}<small style={{ display: 'block', fontSize: 9.5, color: 'var(--muted)', fontWeight: 500 }}>/hr</small>
                      </div>
                    </div>
                  ))}
                </div>

                {/* cta button */}
                <div style={{ margin: '6px 22px 0', padding: 13, background: 'var(--ink)', color: 'var(--paper)', borderRadius: 12, textAlign: 'center', fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  Book for Today
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </div>

                {/* tab bar */}
                <div style={{ marginTop: 'auto', padding: '12px 22px 22px', display: 'flex', justifyContent: 'space-around', borderTop: '1px solid rgba(10,10,10,0.05)' }}>
                  {[
                    { label: 'Home', on: true },
                    { label: 'Find', on: false },
                    { label: 'Bookings', on: false },
                    { label: 'Profile', on: false },
                  ].map((t, i) => (
                    <div key={t.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: t.on ? 'var(--ink)' : 'var(--muted-2)', fontSize: 9.5, letterSpacing: '0.03em' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        {i === 0 && <path d="M3 12 12 4l9 8M5 10v10h14V10" />}
                        {i === 1 && <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>}
                        {i === 2 && <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>}
                        {i === 3 && <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-7 8-7s8 3 8 7" /></>}
                      </svg>
                      {t.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* float bottom-right */}
            <div
              className="float-card"
              style={{
                position: 'absolute',
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(14px)',
                border: '1px solid rgba(10,10,10,0.10)',
                borderRadius: 14,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 18px 40px -16px rgba(10,10,10,0.15)',
                bottom: '14%',
                right: '-10%',
                zIndex: 2,
              }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 9, background: '#FFF4D1', color: '#7A5B05', display: 'grid', placeItems: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>Confirmed</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Today 2:00 PM · Provider assigned</div>
              </div>
            </div>
          </div>
        </div>

        {/* stats band */}
        <div
          style={{
            marginTop: 96,
            borderTop: '1px solid var(--ink)',
            paddingTop: 32,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 32,
          }}
          className="hero-stats-responsive"
        >
          {[
            { label: 'Hourly rate', value: '$25', suffix: '/hr flat', type: 'bold' },
            { label: 'Booking minimum', value: '3', suffix: 'hrs', type: 'bold' },
            { label: 'Service radius', value: '15', suffix: 'km', type: 'italic' },
            { label: 'Languages', value: 'EN', suffix: '/ FR', type: 'bold' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>{s.label}</div>
              <div style={{ fontSize: 44, fontWeight: 300, letterSpacing: '-0.035em', lineHeight: 0.95 }}>
                {s.type === 'italic'
                  ? <i style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 400, color: 'var(--green)' }}>{s.value}</i>
                  : <b style={{ fontWeight: 800 }}>{s.value}</b>}
                {s.suffix && <small style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--muted)', fontWeight: 500, letterSpacing: '0.08em', marginLeft: 4 }}>{s.suffix}</small>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 1080px) {
          .hero-grid-responsive { grid-template-columns: 1fr !important; gap: 80px !important; }
          .float-card { display: none !important; }
        }
        @media (max-width: 760px) {
          .hero-stats-responsive { grid-template-columns: repeat(2, 1fr) !important; gap: 24px !important; }
          .hero-grid-responsive { gap: 56px !important; }
          .hero-grid-responsive > div:first-child { text-align: center; }
          .hero-grid-responsive > div:first-child > div { justify-content: center; }
          .hero-grid-responsive .lead { margin-left: auto; margin-right: auto; }
        }
      ` }} />
    </section>
  )
}
