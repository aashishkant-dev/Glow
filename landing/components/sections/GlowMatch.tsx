import Reveal from '@/components/ui/Reveal'
import { SparkleIcon, MapPinIcon, WalletIcon, CalendarIcon, HeartIcon } from '@/components/brand/BeautyIcons'

export default function GlowMatch() {
  return (
    <section id="match" className="sec" style={{ background: 'linear-gradient(180deg, var(--paper) 0%, var(--rose-bg) 50%, var(--paper) 100%)' }}>
      <div className="wrap">
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 80,
          alignItems: 'center',
        }} className="match-grid">
          {/* Left: Copy */}
          <div>
            <Reveal>
              <div className="eyebrow" style={{ marginBottom: 20 }}>
                <span className="dot" />
                Glow Match
              </div>
            </Reveal>

            <Reveal delay={100}>
              <h2 className="h2" style={{ marginBottom: 24 }}>
                We find your <i>perfect</i> artist
              </h2>
            </Reveal>

            <Reveal delay={200}>
              <p className="lead" style={{ marginBottom: 40 }}>
                No more scrolling through hundreds of profiles. <b>Glow Match</b> intelligently recommends the best beauty professionals based on what matters to you.
              </p>
            </Reveal>

            <Reveal delay={300}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {[
                  { icon: HeartIcon, label: 'Occasion', desc: 'Wedding, reception, date, or party' },
                  { icon: WalletIcon, label: 'Budget', desc: 'Artists that match your price range' },
                  { icon: MapPinIcon, label: 'Location', desc: 'At-home or salon near you' },
                  { icon: CalendarIcon, label: 'Availability', desc: 'Confirmed for your date' },
                  { icon: SparkleIcon, label: 'Preferred Style', desc: 'Soft glam, natural, editorial, or bold' },
                ].map((item, i) => (
                  <div key={item.label} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12,
                      background: 'var(--card)',
                      border: '1px solid var(--line-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <item.icon size={20} color="var(--rose)" />
                    </div>
                    <div>
                      <span style={{ fontSize: 15, fontWeight: 600, display: 'block', marginBottom: 2 }}>{item.label}</span>
                      <span style={{ fontSize: 14, color: 'var(--muted)' }}>{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Right: Phone mockup */}
          <Reveal delay={200}>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
              {/* Phone frame */}
              <div style={{
                width: 300,
                height: 600,
                borderRadius: 36,
                background: 'var(--ink)',
                padding: 12,
                boxShadow: '0 32px 80px rgba(0,0,0,0.15), 0 12px 40px rgba(0,0,0,0.08)',
              }}>
                <div style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 26,
                  background: 'var(--card)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  {/* Status bar */}
                  <div style={{
                    height: 44,
                    background: 'var(--rose-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderBottom: '1px solid var(--line-2)',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--rose)' }}>Glow Match</span>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Match score */}
                    <div style={{
                      background: 'var(--rose-bg)',
                      borderRadius: 16,
                      padding: 16,
                      textAlign: 'center',
                    }}>
                      <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--rose)', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>98%</span>
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Match Score</p>
                    </div>

                    {/* Artist card */}
                    <div style={{
                      background: 'var(--paper)',
                      borderRadius: 14,
                      padding: 14,
                    }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 12,
                          background: 'linear-gradient(135deg, var(--rose-bg), var(--blush))',
                        }} />
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>Priya Sharma</span>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Bridal Specialist</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                        {[1,2,3,4,5].map(s => (
                          <div key={s} style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gold)' }} />
                        ))}
                        <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>4.9</span>
                      </div>
                      <div style={{
                        height: 40,
                        borderRadius: 10,
                        background: 'var(--rose)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>Book Now</span>
                      </div>
                    </div>

                    {/* Tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {['Bridal', 'Soft Glam', 'At-Home'].map(tag => (
                        <span key={tag} style={{
                          fontSize: 10, fontWeight: 500, color: 'var(--rose)',
                          background: 'var(--rose-bg)',
                          padding: '4px 10px', borderRadius: 8,
                        }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative circles */}
              <div style={{
                position: 'absolute', top: -30, right: -30,
                width: 100, height: 100, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(217,122,145,0.15) 0%, transparent 70%)',
              }} />
              <div style={{
                position: 'absolute', bottom: -20, left: -20,
                width: 80, height: 80, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(212,175,55,0.12) 0%, transparent 70%)',
              }} />
            </div>
          </Reveal>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) {
          .match-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
          .match-grid > div:last-child { order: -1; }
        }
      ` }} />
    </section>
  )
}
