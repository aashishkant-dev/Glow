import Reveal from '@/components/ui/Reveal'
import {
  RingIcon, PartyIcon, MoonIcon, CakeIcon,
  FestivalIcon, GradCapIcon, BuildingIcon, CameraIcon, SparkleIcon,
} from '@/components/brand/BeautyIcons'

const occasions = [
  { name: 'Wedding', icon: RingIcon, gradient: 'linear-gradient(135deg, #FDF0F3 0%, #F5E1E8 100%)', accent: 'var(--rose)' },
  { name: 'Reception', icon: PartyIcon, gradient: 'linear-gradient(135deg, #FDF8E8 0%, #F5EDD4 100%)', accent: 'var(--gold)' },
  { name: 'Date Night', icon: MoonIcon, gradient: 'linear-gradient(135deg, #F0E8F5 0%, #E8DCF5 100%)', accent: '#9B7DBF' },
  { name: 'Birthday', icon: CakeIcon, gradient: 'linear-gradient(135deg, #E8F5F0 0%, #D4EDE5 100%)', accent: '#5BA88C' },
  { name: 'Festival', icon: FestivalIcon, gradient: 'linear-gradient(135deg, #FFF0E8 0%, #F5E0D0 100%)', accent: '#D48B5B' },
  { name: 'Graduation', icon: GradCapIcon, gradient: 'linear-gradient(135deg, #E8EFF5 0%, #D4E0ED 100%)', accent: '#5B7DA8' },
  { name: 'Office Event', icon: BuildingIcon, gradient: 'linear-gradient(135deg, #F5F0E8 0%, #EDE5D8 100%)', accent: '#8B7D5B' },
  { name: 'Photoshoot', icon: CameraIcon, gradient: 'linear-gradient(135deg, #FDF0F3 0%, #F8E5EC 100%)', accent: 'var(--rose)' },
  { name: 'Everyday Glow', icon: SparkleIcon, gradient: 'linear-gradient(135deg, #FDF8E8 0%, #FBF3DC 100%)', accent: 'var(--gold)' },
]

export default function Occasions() {
  return (
    <section id="occasions" className="sec" style={{ background: 'var(--paper)' }}>
      <div className="wrap">
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="eyebrow" style={{ justifyContent: 'center', marginBottom: 20 }}>
              <span className="dot" />
              Occasions
            </div>
            <h2 className="h2" style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
              What are you <i>getting ready</i> for?
            </h2>
          </div>
        </Reveal>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 20,
        }} className="occasions-grid">
          {occasions.map((occ, i) => (
            <Reveal key={occ.name} delay={i * 60}>
              <a
                href="#find-glow"
                className="luxury-card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Image area */}
                <div style={{
                  height: 180,
                  background: occ.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <occ.icon size={48} color={occ.accent} />
                  {/* Decorative circle */}
                  <div style={{
                    position: 'absolute',
                    width: 120, height: 120,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${occ.accent}15 0%, transparent 70%)`,
                    top: -20, right: -20,
                  }} />
                </div>
                {/* Label */}
                <div style={{ padding: '20px 24px' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{occ.name}</span>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .occasions-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .occasions-grid { grid-template-columns: 1fr !important; }
        }
      ` }} />
    </section>
  )
}
