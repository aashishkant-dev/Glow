'use client'
import { useEffect, useState } from 'react'
import { trackEvent } from '@/lib/gtag'

// Mobile-only sticky bottom bar: call now + book care. Hides itself while the
// contact form is on screen so it never covers the real CTA.
export default function StickyCallBar() {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const target = document.getElementById('contact')
    if (!target || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting), { threshold: 0.15 })
    obs.observe(target)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      className="sticky-call-bar"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        display: 'flex',
        gap: 10,
        padding: '10px 14px calc(10px + env(safe-area-inset-bottom))',
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid rgba(10,10,10,0.10)',
        transform: hidden ? 'translateY(110%)' : 'translateY(0)',
        transition: 'transform .25s ease',
      }}
    >
      <a
        href="tel:+16476209243"
        onClick={() => trackEvent('call_click', { location: 'sticky_bar' })}
        style={{
          flex: 1,
          textAlign: 'center',
          padding: '13px 0',
          borderRadius: 12,
          fontWeight: 700,
          fontSize: 15,
          border: '1.5px solid rgba(3,78,54,0.35)',
          color: 'var(--green, #034E36)',
          background: '#fff',
        }}
      >
        📞 Call now
      </a>
      <a
        href="#contact"
        onClick={() => trackEvent('book_care_click', { location: 'sticky_bar' })}
        style={{
          flex: 1,
          textAlign: 'center',
          padding: '13px 0',
          borderRadius: 12,
          fontWeight: 700,
          fontSize: 15,
          color: '#fff',
          background: 'var(--green, #034E36)',
        }}
      >
        Book care →
      </a>
      <style
        dangerouslySetInnerHTML={{
          __html: `@media (min-width: 768px) { .sticky-call-bar { display: none !important; } }`,
        }}
      />
    </div>
  )
}
