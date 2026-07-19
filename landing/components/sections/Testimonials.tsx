import Reveal from '@/components/ui/Reveal'
import { StarIcon } from '@/components/brand/BeautyIcons'

const testimonials = [
  {
    quote: 'I felt absolutely amazing on my wedding day. My artist understood exactly what I wanted and made it even more beautiful than I imagined.',
    name: 'Anita Rai',
    occasion: 'Wedding',
    rating: 5,
    gradient: 'linear-gradient(135deg, var(--rose-bg) 0%, var(--blush-2) 100%)',
  },
  {
    quote: 'Booking was effortless. Glow matched me with the perfect artist for my reception — the whole experience felt premium from start to finish.',
    name: 'Srijana Thapa',
    occasion: 'Reception',
    rating: 5,
    gradient: 'linear-gradient(135deg, var(--gold-bg) 0%, #F5EDD4 100%)',
  },
  {
    quote: 'I used Glow for my graduation photoshoot. The artist was professional, punctual, and the results were stunning. I got so many compliments!',
    name: 'Prerana Shrestha',
    occasion: 'Graduation',
    rating: 5,
    gradient: 'linear-gradient(135deg, #F5F0FA 0%, #E8DCF5 100%)',
  },
]

export default function Testimonials() {
  return (
    <section className="sec" style={{ background: 'var(--paper)' }}>
      <div className="wrap">
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="eyebrow" style={{ justifyContent: 'center', marginBottom: 20 }}>
              <span className="dot" />
              Client Stories
            </div>
            <h2 className="h2" style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
              Moments that <i>matter</i>, remembered beautifully
            </h2>
          </div>
        </Reveal>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
        }} className="testimonials-grid">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 100}>
              <div className="luxury-card" style={{ padding: 0, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Top gradient */}
                <div style={{
                  height: 8,
                  background: t.gradient,
                }} />

                <div style={{ padding: '32px 28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* Stars */}
                  <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
                    {[...Array(t.rating)].map((_, j) => (
                      <StarIcon key={j} size={16} color="var(--gold)" filled />
                    ))}
                  </div>

                  {/* Quote */}
                  <blockquote style={{
                    fontSize: 16,
                    lineHeight: 1.6,
                    color: 'var(--ink)',
                    fontStyle: 'italic',
                    fontFamily: 'var(--serif)',
                    flex: 1,
                    marginBottom: 24,
                  }}>
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>

                  {/* Author */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 'auto' }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12,
                      background: t.gradient,
                    }} />
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, display: 'block' }}>{t.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.occasion}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .testimonials-grid { grid-template-columns: 1fr !important; max-width: 480px; margin: 0 auto; }
        }
      ` }} />
    </section>
  )
}
