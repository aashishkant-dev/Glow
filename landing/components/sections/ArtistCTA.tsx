import Reveal from '@/components/ui/Reveal'
import {
  CalendarIcon, WalletIcon, CameraIcon, ChartIcon, ShieldCheckIcon, SparkleIcon,
} from '@/components/brand/BeautyIcons'

const perks = [
  { icon: CalendarIcon, label: 'Receive Bookings', desc: 'Get booked by clients looking for your exact style.' },
  { icon: ChartIcon, label: 'Manage Calendar', desc: 'Control your availability and schedule effortlessly.' },
  { icon: CameraIcon, label: 'Showcase Portfolio', desc: 'Display your best work to attract premium clients.' },
  { icon: WalletIcon, label: 'Grow Your Income', desc: 'Set your own rates and earn what you deserve.' },
  { icon: ShieldCheckIcon, label: 'Secure Payments', desc: 'Get paid reliably with protected, timely payouts.' },
  { icon: SparkleIcon, label: 'Build Reputation', desc: 'Collect verified reviews and grow your brand.' },
]

export default function ArtistCTA() {
  return (
    <section id="artists" className="sec" style={{ background: 'var(--ink)', color: '#fff', overflow: 'hidden', position: 'relative' }}>
      {/* Decorative elements */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%',
        width: '50vw', height: '50vw', maxWidth: 600, maxHeight: 600,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(217,122,145,0.1) 0%, transparent 70%)',
        filter: 'blur(60px)',
        pointerEvents: 'none',
      }} />

      <div className="wrap">
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 80,
          alignItems: 'center',
        }} className="artist-grid">
          {/* Left: Copy */}
          <div>
            <Reveal>
              <div className="eyebrow" style={{ marginBottom: 20, color: 'var(--rose-3)' }}>
                <span className="dot" style={{ background: 'var(--rose)' }} />
                For Beauty Artists
              </div>
            </Reveal>

            <Reveal delay={100}>
              <h2 className="h2" style={{ marginBottom: 24, color: '#fff' }}>
                Grow Your Beauty Business <i>with Glow</i>
              </h2>
            </Reveal>

            <Reveal delay={200}>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: 'rgba(255,255,255,0.55)', marginBottom: 40, maxWidth: '44ch' }}>
                Join Nepal&apos;s premium beauty marketplace. Reach clients who value your artistry, manage your bookings seamlessly, and grow your career on your own terms.
              </p>
            </Reveal>

            <Reveal delay={300}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <a href="#" className="btn btn-rose btn-lg" style={{ borderRadius: 999 }}>
                  <SparkleIcon size={18} color="#fff" />
                  Join Glow Today
                  <svg className="arr" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </a>
                <a href="#" className="btn btn-ghost-inv btn-lg" style={{ borderRadius: 999 }}>
                  Learn More
                </a>
              </div>
            </Reveal>
          </div>

          {/* Right: Benefits grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
          }}>
            {perks.map((perk, i) => (
              <Reveal key={perk.label} delay={200 + i * 80}>
                <div style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20,
                  padding: 24,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: 'rgba(217,122,145,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 14,
                  }}>
                    <perk.icon size={20} color="var(--rose-3)" />
                  </div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4, color: '#fff' }}>{perk.label}</h4>
                  <p style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.45)' }}>{perk.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) {
          .artist-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
        }
      ` }} />
    </section>
  )
}
