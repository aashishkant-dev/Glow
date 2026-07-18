const photos = [
  {
    src: 'https://images.unsplash.com/photo-1576765608622-067973a79f53?w=600&h=400&fit=crop&auto=format&q=80',
    alt: 'Provider helping senior with mobility',
    caption: 'In-home mobility support',
  },
  {
    src: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=600&h=400&fit=crop&auto=format&q=80',
    alt: 'Verified caregiver',
    caption: 'Verified, local caregivers',
  },
  {
    src: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&h=400&fit=crop&auto=format&q=80',
    alt: 'Senior and caregiver sharing a meal',
    caption: 'Meal prep & companionship',
  },
  {
    src: 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=600&h=400&fit=crop&auto=format&q=80',
    alt: 'Family reviewing care plan on tablet',
    caption: 'Family peace of mind',
  },
]

export default function PhotoStrip() {
  return (
    <section
      style={{
        padding: '0 0 80px',
        overflow: 'hidden',
      }}
    >
      <div className="wrap" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <span className="eyebrow muted">Real care. Real Sudbury families.</span>
            <p style={{ marginTop: 8, fontSize: 15, color: 'var(--muted)', maxWidth: '52ch' }}>
              Every visit matters. Glow caregivers show up prepared, verified, and ready.
            </p>
          </div>
          <a href="/#dl" className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
            Book care today
            <svg className="arr" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          padding: '0 32px',
          maxWidth: 1320,
          margin: '0 auto',
        }}
        className="photo-strip-responsive"
      >
        {photos.map((photo, i) => (
          <div
            key={i}
            style={{
              borderRadius: 18,
              overflow: 'hidden',
              aspectRatio: '4/3',
              position: 'relative',
              background: 'var(--paper-3)',
            }}
            className="photo-strip-item"
          >
            <img
              src={photo.src}
              alt={photo.alt}
              loading="lazy"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                transition: 'transform .4s ease',
              }}
              className="photo-strip-img"
            />
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '28px 16px 14px',
                background: 'linear-gradient(transparent, rgba(10,10,10,0.55))',
                color: '#fff',
                fontSize: 12,
                fontFamily: 'var(--mono)',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                fontWeight: 500,
              }}
            >
              {photo.caption}
            </div>
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) { .photo-strip-responsive { grid-template-columns: repeat(2, 1fr) !important; padding: 0 20px !important; } }
        @media (max-width: 560px) { .photo-strip-responsive { grid-template-columns: 1fr 1fr !important; gap: 8px !important; } }
        .photo-strip-item:hover .photo-strip-img { transform: scale(1.04); }
      ` }} />
    </section>
  )
}
