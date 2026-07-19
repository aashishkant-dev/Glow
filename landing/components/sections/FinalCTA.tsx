import Reveal from '@/components/ui/Reveal'
import { SparkleIcon } from '@/components/brand/BeautyIcons'

export default function FinalCTA() {
  return (
    <section className="sec" style={{
      background: 'linear-gradient(160deg, var(--rose-bg) 0%, var(--blush) 40%, var(--rose-3) 80%, var(--rose) 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative blobs */}
      <div style={{
        position: 'absolute', top: '-30%', left: '-15%',
        width: '50vw', height: '50vw', maxWidth: 500, maxHeight: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)',
        filter: 'blur(40px)',
        pointerEvents: 'none',
      }} />

      <div className="wrap" style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <Reveal>
          <SparkleIcon size={48} color="rgba(255,255,255,0.6)" />
        </Reveal>

        <Reveal delay={100}>
          <h2 className="h2" style={{ color: '#fff', textAlign: 'center', maxWidth: 600, margin: '24px auto 20px' }}>
            Ready to Find Your <i style={{ color: '#fff' }}>Glow</i>?
          </h2>
        </Reveal>

        <Reveal delay={200}>
          <p style={{
            fontSize: 17, lineHeight: 1.6,
            color: 'rgba(255,255,255,0.75)',
            maxWidth: '44ch', margin: '0 auto 40px',
            textAlign: 'center',
          }}>
            Whether you&apos;re preparing for the biggest day of your life or simply want to feel your best — Glow is here for you.
          </p>
        </Reveal>

        <Reveal delay={300}>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#find-glow" className="btn btn-lg" style={{
              borderRadius: 999,
              background: '#fff',
              color: 'var(--rose-2)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            }}>
              <SparkleIcon size={18} color="var(--rose)" />
              Find My Glow
              <svg className="arr" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
            <a href="#artists" className="btn btn-ghost-inv btn-lg" style={{ borderRadius: 999 }}>
              Become an Artist
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
