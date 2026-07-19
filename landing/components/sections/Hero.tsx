import Reveal from '@/components/ui/Reveal'
import { SparkleIcon, StarIcon } from '@/components/brand/BeautyIcons'

export default function Hero() {
  return (
    <section
      id="find-glow"
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        background: 'linear-gradient(160deg, var(--paper) 0%, var(--rose-bg) 40%, var(--blush-2) 70%, var(--paper) 100%)',
      }}
    >
      {/* Decorative blobs */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: '60vw', height: '60vw', maxWidth: 800, maxHeight: 800,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(217,122,145,0.12) 0%, transparent 70%)',
        filter: 'blur(60px)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-8%',
        width: '40vw', height: '40vw', maxWidth: 500, maxHeight: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)',
        filter: 'blur(50px)',
        pointerEvents: 'none',
      }} />

      <div className="wrap" style={{ width: '100%', padding: '120px 32px 80px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 64,
          alignItems: 'center',
        }} className="hero-grid">
          {/* Left: Copy */}
          <div>
            <Reveal>
              <div className="eyebrow" style={{ marginBottom: 24 }}>
                <span className="dot" />
                Premium Beauty Marketplace
              </div>
            </Reveal>

            <Reveal delay={100}>
              <h1 className="h1" style={{ marginBottom: 28 }}>
                Look Your Best.<br />
                For <i>Every Moment</i><br />
                That Matters.
              </h1>
            </Reveal>

            <Reveal delay={200}>
              <p className="lead" style={{ marginBottom: 40, maxWidth: '42ch' }}>
                Your personal beauty concierge. Find verified makeup artists, hairstylists, and beauty professionals for weddings, receptions, photoshoots, and life&apos;s biggest celebrations.
              </p>
            </Reveal>

            <Reveal delay={300}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 48 }}>
                <a href="#occasions" className="btn btn-rose btn-lg" style={{ borderRadius: 999 }}>
                  <SparkleIcon size={18} color="#fff" />
                  Find My Glow
                  <svg className="arr" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </a>
                <a href="#artists" className="btn btn-ghost btn-lg" style={{ borderRadius: 999 }}>
                  Become an Artist
                </a>
              </div>
            </Reveal>

            {/* Trust indicators */}
            <Reveal delay={400}>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[...Array(5)].map((_, i) => (
                      <StarIcon key={i} size={14} color="var(--gold)" filled />
                    ))}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginLeft: 4 }}>4.9</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--rose)' }} />
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>10,000+ Happy Clients</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>500+ Verified Artists</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--rose-3)' }} />
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Available Across Nepal</span>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Right: Visual */}
          <Reveal delay={200}>
            <div style={{ position: 'relative' }}>
              {/* Main image placeholder with gradient */}
              <div style={{
                width: '100%',
                aspectRatio: '4/5',
                borderRadius: 32,
                background: 'linear-gradient(145deg, var(--rose-bg) 0%, var(--blush) 50%, var(--rose-3) 100%)',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 24px 80px rgba(217,122,145,0.15), 0 8px 32px rgba(0,0,0,0.06)',
              }}>
                {/* Overlay pattern */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23D97A91\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
                }} />
                {/* Center content */}
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--rose-2)', textAlign: 'center', padding: 40,
                }}>
                  <SparkleIcon size={48} color="var(--rose)" />
                  <p style={{ fontSize: 16, fontWeight: 600, marginTop: 16, color: 'var(--rose-2)' }}>
                    Your beauty moment
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                    Book verified artists
                  </p>
                </div>
              </div>

              {/* Floating card: Rating */}
              <div style={{
                position: 'absolute', top: 40, right: -20,
                background: 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(16px)',
                borderRadius: 16,
                padding: '12px 18px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
                display: 'flex', alignItems: 'center', gap: 10,
                animation: 'float 6s ease-in-out infinite',
              }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[...Array(5)].map((_, i) => (
                    <StarIcon key={i} size={12} color="var(--gold)" filled />
                  ))}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>4.9 Rating</span>
              </div>

              {/* Floating card: Verified */}
              <div style={{
                position: 'absolute', bottom: 60, left: -24,
                background: 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(16px)',
                borderRadius: 16,
                padding: '12px 18px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
                display: 'flex', alignItems: 'center', gap: 10,
                animation: 'float 6s ease-in-out infinite 2s',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'var(--rose-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 3.2 5.5 6v5.2c0 4.4 2.9 7.8 6.5 9 3.6-1.2 6.5-4.6 6.5-9V6L12 3.2z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>Verified Artist</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Government checked</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @media (max-width: 980px) {
          .hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .hero-grid > div:last-child { order: -1; max-width: 420px; margin: 0 auto; }
        }
      ` }} />
    </section>
  )
}
