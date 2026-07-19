import Reveal from '@/components/ui/Reveal'
import { SparkleIcon, HeartIcon, StarIcon, CalendarIcon } from '@/components/brand/BeautyIcons'

const items = [
  {
    icon: SparkleIcon,
    title: 'Trending Looks',
    desc: 'Discover the latest beauty trends and get inspired for your next look.',
    gradient: 'linear-gradient(135deg, var(--rose-bg) 0%, var(--blush-2) 100%)',
    color: 'var(--rose)',
  },
  {
    icon: HeartIcon,
    title: 'Beauty Tips',
    desc: 'Expert skincare advice and beauty tips from verified professionals.',
    gradient: 'linear-gradient(135deg, var(--gold-bg) 0%, #F5EDD4 100%)',
    color: 'var(--gold)',
  },
  {
    icon: StarIcon,
    title: 'Expert Advice',
    desc: 'Professional guidance on choosing the right look for your occasion.',
    gradient: 'linear-gradient(135deg, #F5F0FA 0%, #E8DCF5 100%)',
    color: '#9B7DBF',
  },
  {
    icon: CalendarIcon,
    title: 'Customer Stories',
    desc: 'Real stories from real clients about their Glow experience.',
    gradient: 'linear-gradient(135deg, #F0FAF5 0%, #D4EDE5 100%)',
    color: '#5BA88C',
  },
]

export default function Community() {
  return (
    <section className="sec" style={{ background: 'var(--paper-2)' }}>
      <div className="wrap">
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="eyebrow" style={{ justifyContent: 'center', marginBottom: 20 }}>
              <span className="dot" />
              Community
            </div>
            <h2 className="h2" style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
              Beauty <i>inspiration</i> and more
            </h2>
          </div>
        </Reveal>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 20,
        }} className="community-grid">
          {items.map((item, i) => (
            <Reveal key={item.title} delay={i * 80}>
              <a href="/blog" className="luxury-card" style={{ padding: 0, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Gradient header */}
                <div style={{
                  height: 140,
                  background: item.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <item.icon size={36} color={item.color} />
                </div>

                <div style={{ padding: '24px 24px 28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 8 }}>{item.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--muted)', flex: 1 }}>{item.desc}</p>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 13, fontWeight: 600, color: item.color, marginTop: 16,
                  }}>
                    Explore
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .community-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .community-grid { grid-template-columns: 1fr !important; }
        }
      ` }} />
    </section>
  )
}
