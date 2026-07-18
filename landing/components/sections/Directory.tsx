const ShieldIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2 4 5v7c0 5 4 9 8 10 4-1 8-5 8-10V5l-8-3zM10 16l-4-4 1.5-1.5L10 13l6.5-6.5L18 8l-8 8z" />
  </svg>
)

const StarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
  </svg>
)

type PublicProvider = {
  id: string
  name: string
  photoUrl: string
  rating: number
  ratingCount: number
  completedVisits: number
  qualificationType: string
  experienceYears: number
  bio: string
  specialties: string[]
  languages: string[]
  policeCheckCleared: boolean
  firstAidCertified: boolean
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.glow.app'

const AVATAR_GRADIENTS = [
  { bg: 'linear-gradient(135deg,#1B6F5A,#0EA56F)', text: '#fff' },
  { bg: 'linear-gradient(135deg,#7A5B05,#FFD66B)', text: '#1F1500' },
  { bg: 'linear-gradient(135deg,#3B5BA0,#A0C0F0)', text: '#001530' },
  { bg: 'linear-gradient(135deg,#7A3A1E,#F5B89A)', text: '#fff' },
  { bg: 'linear-gradient(135deg,#4A276A,#C7B0E8)', text: '#fff' },
  { bg: 'linear-gradient(135deg,#0F4A6E,#9FD0EA)', text: '#fff' },
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function providerTags(provider: PublicProvider) {
  const tags: { label: string; warm: boolean }[] = []
  if (provider.policeCheckCleared) tags.push({ label: 'Police check', warm: false })
  if (provider.firstAidCertified) tags.push({ label: 'First aid', warm: false })
  if (provider.languages.some(l => /french|fran/i.test(l))) tags.push({ label: 'Bilingual FR', warm: true })
  for (const s of provider.specialties) tags.push({ label: s, warm: false })
  return tags.slice(0, 4)
}

async function fetchPublicProviders(): Promise<{ total: number; providers: PublicProvider[] } | null> {
  try {
    const res = await fetch(`${API_URL}/public/providers`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default async function Directory() {
  const data = await fetchPublicProviders()

  // No fabricated profiles: if we don't have enough real, approved Providers yet,
  // the section simply doesn't render.
  if (!data || data.providers.length < 3) return null

  const shown = data.providers.slice(0, 6)
  const total = Math.max(data.total, shown.length)

  return (
    <section className="sec" id="directory">
      <div className="wrap">
        <div className="sec-head">
          <span className="sec-meta">Section 03 — Caregivers</span>
          <h2 className="h2">
            Real people. <i>Verified.</i>
            <br />
            Local.
          </h2>
          <div className="right">
            {total} verified Provider{total === 1 ? '' : 's'} across Greater Sudbury. Top rated below —
            every profile is a real caregiver on Glow.
          </div>
        </div>

        {/* grid */}
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}
          className="dir-grid-responsive"
        >
          {shown.map((provider, i) => {
            const grad = AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]
            return (
              <div
                key={provider.id}
                className="dir-card-hover"
                style={{
                  background: 'var(--card-2)',
                  border: '1px solid rgba(10,10,10,0.10)',
                  borderRadius: 18,
                  padding: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  transition: 'transform .2s ease, border-color .2s ease, box-shadow .2s ease',
                }}
              >
                {/* top */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 16,
                      overflow: 'hidden',
                      flexShrink: 0,
                      position: 'relative',
                      background: grad.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {provider.photoUrl ? (
                      <img
                        src={provider.photoUrl}
                        alt={provider.name}
                        width={54}
                        height={54}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ color: grad.text, fontWeight: 800, fontSize: 16 }}>
                        {initials(provider.name)}
                      </span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {provider.name}
                      <span style={{ color: 'var(--green-2)' }}><ShieldIcon /></span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                      {provider.qualificationType}
                      {provider.experienceYears > 0 ? ` · ${provider.experienceYears} yrs experience` : ''}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                  {provider.bio || provider.specialties.join(', ') || 'Personal care and companionship.'}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {providerTags(provider).map(tag => (
                    <span
                      key={tag.label}
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        padding: '4px 8px',
                        background: tag.warm ? '#FFF4D1' : 'var(--mist)',
                        color: tag.warm ? '#7A5B05' : 'var(--green)',
                        borderRadius: 6,
                        border: tag.warm ? '1px solid rgba(122,91,5,0.15)' : '1px solid rgba(3,78,54,0.12)',
                        fontWeight: 500,
                      }}
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, borderTop: '1px solid rgba(10,10,10,0.05)', marginTop: 'auto' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
                    $25<small style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>/hr</small>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                    {provider.ratingCount > 0 ? (
                      <>
                        <span style={{ color: '#E0A92E' }}><StarIcon /></span>
                        {provider.rating.toFixed(1)}
                        {provider.completedVisits > 0 && (
                          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>
                            · {provider.completedVisits} visit{provider.completedVisits === 1 ? '' : 's'}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontWeight: 500 }}>New to Glow</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <a href="/#dl" className="btn btn-ghost btn-lg">
            Browse all {total} caregiver{total === 1 ? '' : 's'} in the app
            <svg className="arr" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 1000px) { .dir-grid-responsive { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 640px) { .dir-grid-responsive { grid-template-columns: 1fr !important; } }
        .dir-card-hover:hover {
          transform: translateY(-2px) !important;
          border-color: rgba(10,10,10,0.18) !important;
          box-shadow: 0 20px 50px -28px rgba(10,10,10,0.15) !important;
        }
      ` }} />
    </section>
  )
}
