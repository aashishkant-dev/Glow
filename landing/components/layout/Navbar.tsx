'use client'

import { useEffect, useState } from 'react'

const BrandMark = (_props?: { id?: string }) => (
  <svg style={{ width: 30, height: 30 }} viewBox="0 0 112 112" aria-hidden="true">
    <path d="M56 6 C32 6 13 25 13 48.5 C13 66 26 80 44 97 L52.5 104.6 C54.5 106.4 57.5 106.4 59.5 104.6 L68 97 C86 80 99 66 99 48.5 C99 25 80 6 56 6 Z" fill="#057A55" />
    <path d="M56 66 C54.9 66 53.8 65.6 53 64.9 C44.4 58 38.5 51.9 38.5 44.3 C38.5 38.2 43 34 48.2 34 C51.3 34 54.1 35.5 56 38 C57.9 35.5 60.7 34 63.8 34 C69 34 73.5 38.2 73.5 44.3 C73.5 51.9 67.6 58 59 64.9 C58.2 65.6 57.1 66 56 66 Z" fill="#FFFFFF" />
  </svg>
)

// Section anchors are prefixed with "/" so they still work from /privacy,
// /terms, /support and /blog — a bare "#how" is dead off the home page.
const navLinks = [
  ['How it works', '/#how'],
  ['Platform', '/#platform'],
  ['Caregivers', '/#directory'],
  ['Pricing', '/#pricing'],
  ['Blog', '/blog'],
  ['Contact', '/#contact'],
  ['For Providers', '/#provider'],
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 60,
          background: scrolled ? 'rgba(244,241,234,0.95)' : 'rgba(244,241,234,0.82)',
          backdropFilter: 'saturate(160%) blur(16px)',
          WebkitBackdropFilter: 'saturate(160%) blur(16px)',
          borderBottom: `1px solid ${scrolled ? 'rgba(10,10,10,0.10)' : 'transparent'}`,
          transition: 'border-color .2s ease, background .2s ease',
        }}
      >
        <div className="wrap" style={{ display: 'flex', alignItems: 'center', gap: 36, height: 72 }}>
          <a
            href="https://ca.glow.app"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--sans)', fontWeight: 300, fontSize: 20, letterSpacing: '-0.02em',
            }}
          >
            <BrandMark />
            Care<strong style={{ fontWeight: 800 }}>Nearby</strong>
          </a>

          <nav
            aria-label="Primary"
            style={{ display: 'flex', alignItems: 'center', gap: 26, marginLeft: 'auto' }}
            className="nav-desktop-links"
          >
            {navLinks.map(([label, href]) => (
              <a
                key={label}
                href={href}
                style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', transition: 'color .15s ease' }}
                onMouseEnter={e => ((e.target as HTMLElement).style.color = 'var(--green-2)')}
                onMouseLeave={e => ((e.target as HTMLElement).style.color = 'var(--ink)')}
              >
                {label}
              </a>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }} className="nav-cta-group">
            <a href="/#provider" className="btn btn-ghost btn-sm nav-ghost-btn">Become a Provider</a>
            <a
              href="https://glow.app"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-warm btn-sm"
              style={{ borderRadius: 12 }}
            >
              Open app
              <svg className="arr" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            className="nav-hamburger"
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            style={{
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 10,
              background: menuOpen ? 'var(--ink)' : 'transparent',
              border: '1px solid rgba(10,10,10,0.12)',
              color: menuOpen ? 'var(--paper)' : 'var(--ink)',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background .2s ease, color .2s ease',
              marginLeft: 'auto',
            }}
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          style={{
            position: 'fixed',
            inset: '72px 0 0 0',
            zIndex: 55,
            background: 'rgba(244,241,234,0.98)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            display: 'flex',
            flexDirection: 'column',
            padding: '32px 24px 40px',
            overflowY: 'auto',
          }}
        >
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {navLinks.map(([label, href]) => (
              <a
                key={label}
                href={href}
                onClick={() => setMenuOpen(false)}
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  letterSpacing: '-0.02em',
                  padding: '14px 0',
                  borderBottom: '1px solid rgba(10,10,10,0.07)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 56,
                }}
              >
                {label}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted-2)" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </a>
            ))}
          </nav>
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <a
              href="https://glow.app"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-warm"
              onClick={() => setMenuOpen(false)}
              style={{ height: 56, fontSize: 16, justifyContent: 'center', borderRadius: 14 }}
            >
              Open app — Book a caregiver
              <svg className="arr" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
            <a
              href="/#provider"
              className="btn btn-ghost"
              onClick={() => setMenuOpen(false)}
              style={{ height: 56, fontSize: 16, justifyContent: 'center', borderRadius: 14 }}
            >
              Become a Provider
            </a>
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-3)' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              247 Providers available · Greater Sudbury, ON
            </span>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) {
          .nav-desktop-links { display: none !important; }
          .nav-ghost-btn { display: none !important; }
          .nav-cta-group { display: none !important; }
          .nav-hamburger { display: inline-flex !important; }
        }
      ` }} />
    </>
  )
}
