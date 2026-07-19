import Reveal from '@/components/ui/Reveal'

const looks = [
  { name: 'Soft Glam', category: 'Most Popular', gradient: 'linear-gradient(145deg, #FDF0F3 0%, #F5D5DF 60%, #E9A0B1 100%)' },
  { name: 'Glass Skin', category: 'K-Beauty', gradient: 'linear-gradient(145deg, #F5F0FA 0%, #E8DCF5 60%, #C4B0E0 100%)' },
  { name: 'Luxury Bridal', category: 'Bridal', gradient: 'linear-gradient(145deg, #FDF8E8 0%, #F5E8C0 60%, #D4AF37 100%)' },
  { name: 'Korean Beauty', category: 'Trending', gradient: 'linear-gradient(145deg, #F0FAF5 0%, #D4EDE5 60%, #5BA88C 100%)' },
  { name: 'Festival Glow', category: 'Festival', gradient: 'linear-gradient(145deg, #FFF0E8 0%, #F5D4B8 60%, #D48B5B 100%)' },
  { name: 'Natural Glow', category: 'Everyday', gradient: 'linear-gradient(145deg, #FBF7F0 0%, #F0E8D8 60%, #C4B090 100%)' },
  { name: 'Arabic Glam', category: 'Bold', gradient: 'linear-gradient(145deg, #2D2D2F 0%, #4A4A4D 60%, #D4AF37 100%)', dark: true },
]

export default function TrendingLooks() {
  return (
    <section id="looks" className="sec" style={{ background: 'var(--paper)' }}>
      <div className="wrap">
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="eyebrow" style={{ justifyContent: 'center', marginBottom: 20 }}>
              <span className="dot" />
              Trending Looks
            </div>
            <h2 className="h2" style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
              Get <i>inspired</i> for your moment
            </h2>
          </div>
        </Reveal>

        {/* Pinterest-style masonry */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridAutoRows: 160,
          gap: 16,
        }} className="looks-grid">
          {looks.map((look, i) => {
            const tall = i === 0 || i === 2 || i === 6
            const wide = i === 3 || i === 5
            return (
              <Reveal key={look.name} delay={i * 60}>
                <div
                  className="luxury-card"
                  style={{
                    gridRow: tall ? 'span 2' : 'span 1',
                    gridColumn: wide ? 'span 2' : 'span 1',
                    padding: 0,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  {/* Gradient background */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: look.gradient,
                  }} />

                  {/* Content */}
                  <div style={{
                    position: 'relative',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    padding: 24,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '0.12em', color: look.dark ? 'rgba(255,255,255,0.6)' : 'var(--muted)',
                      marginBottom: 6,
                    }}>{look.category}</span>
                    <span style={{
                      fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em',
                      color: look.dark ? '#fff' : 'var(--ink)',
                    }}>{look.name}</span>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .looks-grid { grid-template-columns: repeat(2, 1fr) !important; grid-auto-rows: 140px !important; }
          .looks-grid > div:nth-child(3),
          .looks-grid > div:nth-child(5) { grid-column: span 2 !important; }
        }
        @media (max-width: 480px) {
          .looks-grid { grid-template-columns: 1fr !important; grid-auto-rows: 180px !important; }
          .looks-grid > div { grid-column: span 1 !important; grid-row: span 1 !important; }
        }
      ` }} />
    </section>
  )
}
