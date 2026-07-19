import Reveal from '@/components/ui/Reveal'

const portfolio = [
  { label: 'Bridal', gradient: 'linear-gradient(145deg, #FDF0F3 0%, #F5D5DF 100%)', tall: true },
  { label: 'Party', gradient: 'linear-gradient(145deg, #FDF8E8 0%, #F5E8C0 100%)' },
  { label: 'Editorial', gradient: 'linear-gradient(145deg, #2D2D2F 0%, #4A4A4D 100%)', dark: true },
  { label: 'Natural', gradient: 'linear-gradient(145deg, #F0FAF5 0%, #D4EDE5 100%)' },
  { label: 'Festival', gradient: 'linear-gradient(145deg, #FFF0E8 0%, #F5D4B8 100%)', tall: true },
  { label: 'Soft Glam', gradient: 'linear-gradient(145deg, #F5F0FA 0%, #E8DCF5 100%)' },
  { label: 'K-Beauty', gradient: 'linear-gradient(145deg, #FBF7F0 0%, #F0E8D8 100%)' },
  { label: 'Arabic Glam', gradient: 'linear-gradient(145deg, #1D1D1F 0%, #3D3D3F 60%, #D4AF37 100%)', dark: true, tall: true },
]

export default function ArtistPortfolios() {
  return (
    <section id="portfolios" className="sec" style={{ background: 'var(--paper-2)' }}>
      <div className="wrap">
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="eyebrow" style={{ justifyContent: 'center', marginBottom: 20 }}>
              <span className="dot" />
              Artist Portfolios
            </div>
            <h2 className="h2" style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
              See the <i>artistry</i> for yourself
            </h2>
          </div>
        </Reveal>

        {/* Masonry gallery */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridAutoRows: 200,
          gap: 16,
        }} className="portfolio-grid">
          {portfolio.map((item, i) => (
            <Reveal key={item.label} delay={i * 60}>
              <div
                className="luxury-card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  position: 'relative',
                  gridRow: item.tall ? 'span 2' : 'span 1',
                }}
              >
                {/* Background */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: item.gradient,
                }} />

                {/* Hover overlay */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: item.dark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(4px)',
                  opacity: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'opacity .3s ease',
                }} className="portfolio-overlay">
                  <span style={{
                    fontSize: 14, fontWeight: 600,
                    color: item.dark ? '#fff' : 'var(--ink)',
                  }}>View Portfolio</span>
                </div>

                {/* Label */}
                <div style={{
                  position: 'absolute', bottom: 16, left: 16,
                }}>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: item.dark ? 'rgba(255,255,255,0.8)' : 'var(--ink)',
                    background: item.dark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)',
                    backdropFilter: 'blur(8px)',
                    padding: '6px 12px',
                    borderRadius: 8,
                  }}>{item.label}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .luxury-card:hover .portfolio-overlay { opacity: 1 !important; }
        @media (max-width: 768px) {
          .portfolio-grid { grid-template-columns: repeat(2, 1fr) !important; grid-auto-rows: 180px !important; }
        }
        @media (max-width: 480px) {
          .portfolio-grid { grid-template-columns: 1fr !important; grid-auto-rows: 220px !important; }
          .portfolio-grid > div { grid-row: span 1 !important; }
        }
      ` }} />
    </section>
  )
}
