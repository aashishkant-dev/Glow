import Reveal from '@/components/ui/Reveal'
import {
  ShieldCheckIcon, BadgeIcon, CameraIcon, StarIcon, HeartIcon, SparkleIcon,
} from '@/components/brand/BeautyIcons'

const trustItems = [
  {
    icon: ShieldCheckIcon,
    title: 'Government Verified',
    desc: 'Official identity verification for every artist on the platform.',
    color: 'var(--rose)',
  },
  {
    icon: BadgeIcon,
    title: 'Background Checked',
    desc: 'Comprehensive background screening before joining Glow.',
    color: '#5BA88C',
  },
  {
    icon: CameraIcon,
    title: 'Portfolio Reviewed',
    desc: 'Every portfolio is curated and reviewed by our team for quality.',
    color: '#9B7DBF',
  },
  {
    icon: StarIcon,
    title: 'Trusted Reviews',
    desc: 'Only verified client reviews — no fake ratings, ever.',
    color: 'var(--gold)',
  },
  {
    icon: HeartIcon,
    title: 'Professional Standards',
    desc: 'Artists must meet our quality and hygiene standards.',
    color: 'var(--rose)',
  },
  {
    icon: SparkleIcon,
    title: 'Beauty Certified',
    desc: 'Certified professionals with proven skills and training.',
    color: '#D48B5B',
  },
]

export default function TrustSection() {
  return (
    <section className="sec" style={{
      background: 'linear-gradient(180deg, var(--paper) 0%, var(--rose-bg) 50%, var(--paper) 100%)',
    }}>
      <div className="wrap">
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="eyebrow" style={{ justifyContent: 'center', marginBottom: 20 }}>
              <span className="dot" />
              Glow Trust
            </div>
            <h2 className="h2" style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
              Trust is not a feature.<br />It&apos;s our <i>foundation</i>.
            </h2>
          </div>
        </Reveal>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 20,
          maxWidth: 900,
          margin: '0 auto',
        }} className="trust-grid">
          {trustItems.map((item, i) => (
            <Reveal key={item.title} delay={i * 60}>
              <div style={{
                background: 'var(--card)',
                borderRadius: 20,
                border: '1px solid var(--line-2)',
                padding: 28,
                textAlign: 'center',
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16,
                  background: `${item.color}10`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                }}>
                  <item.icon size={26} color={item.color} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 6 }}>{item.title}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--muted)' }}>{item.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .trust-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .trust-grid { grid-template-columns: 1fr !important; }
        }
      ` }} />
    </section>
  )
}
