import Reveal from '@/components/ui/Reveal'
import {
  ShieldCheckIcon, StarIcon, HomeIcon, CalendarIcon,
  ClockIcon, WalletIcon, CameraIcon, HeartIcon, SparkleIcon,
} from '@/components/brand/BeautyIcons'

const benefits = [
  {
    icon: ShieldCheckIcon,
    title: 'Verified Professionals',
    desc: 'Every artist undergoes government verification, background checks, and portfolio review.',
    color: 'var(--rose)',
    bg: 'var(--rose-bg)',
  },
  {
    icon: StarIcon,
    title: 'Luxury Beauty Brands',
    desc: 'Artists use premium, professional-grade products for flawless results.',
    color: 'var(--gold)',
    bg: 'var(--gold-bg)',
  },
  {
    icon: HomeIcon,
    title: 'At Home or Salon',
    desc: 'Choose convenience — your artist comes to you, or visit their premium salon.',
    color: '#5BA88C',
    bg: '#F0FAF5',
  },
  {
    icon: CalendarIcon,
    title: 'Quick Booking',
    desc: 'Book your perfect artist in seconds with transparent pricing.',
    color: '#9B7DBF',
    bg: '#F5F0FA',
  },
  {
    icon: HeartIcon,
    title: 'Trusted Reviews',
    desc: 'Real reviews from real clients help you choose with confidence.',
    color: 'var(--rose)',
    bg: 'var(--rose-bg)',
  },
  {
    icon: SparkleIcon,
    title: 'Premium Experience',
    desc: 'From booking to the final look, every detail is crafted for luxury.',
    color: 'var(--gold)',
    bg: 'var(--gold-bg)',
  },
  {
    icon: ClockIcon,
    title: 'Beauty Timeline',
    desc: 'Plan your entire beauty journey — from skincare prep to the big day.',
    color: '#5B7DA8',
    bg: '#EEF3FA',
  },
  {
    icon: WalletIcon,
    title: 'Transparent Pricing',
    desc: 'No surprises. See exactly what you\'ll pay before you book.',
    color: '#D48B5B',
    bg: '#FFF5F0',
  },
]

export default function WhyGlow() {
  return (
    <section className="sec" style={{ background: 'var(--paper)' }}>
      <div className="wrap">
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="eyebrow" style={{ justifyContent: 'center', marginBottom: 20 }}>
              <span className="dot" />
              Why Glow
            </div>
            <h2 className="h2" style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
              The beauty experience you <i>deserve</i>
            </h2>
          </div>
        </Reveal>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 20,
        }} className="benefits-grid">
          {benefits.map((b, i) => (
            <Reveal key={b.title} delay={i * 60}>
              <div className="luxury-card" style={{ padding: 28, height: '100%' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: b.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 20,
                }}>
                  <b.icon size={24} color={b.color} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 8 }}>{b.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--muted)' }}>{b.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) {
          .benefits-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .benefits-grid { grid-template-columns: 1fr !important; }
        }
      ` }} />
    </section>
  )
}
