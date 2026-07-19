'use client'

import { useEffect, useState } from 'react'
import { GlowMark } from '@/components/brand/GlowMark'

const navLinks = [
  ['Occasions', '/#occasions'],
  ['How it Works', '/#how'],
  ['Trending Looks', '/#looks'],
  ['For Artists', '/#artists'],
  ['Blog', '/blog'],
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
          background: scrolled ? 'rgba(251,247,240,0.95)' : 'rgba(251,247,240,0.82)',
          backdropFilter: 'saturate(160%) blur(16px)',
          WebkitBackdropFilter: 'saturate(160%) blur(16px)',
          borderBottom: `1px solid ${scrolled ? 'rgba(29,29,31,0.06)' : 'transparent'}`,
          transition: 'border-color .3s ease, background .3s ease',
        }}
      >
        <div className="wrap" style={{ display: 'flex', alignItems: 'center', gap: 36, height: 72 }}>
          <a
            href="/"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--sans)', fontWeight: 300, fontSize: 22, letterSpacing: '-0.02em',
            }}
          >
            <GlowMark size={32} />
            <span style={{ fontWeight: 300 }}>Glow</span>
          </a>

          <nav
            aria-label="Primary"
            style={{ display: 'flex', alignItems: 'center', gap: 28, marginLeft: 'auto' }}
            className="nav-desktop-links"
          >
            {navLinks.map(([label, href]) => (
              <a
                key={label}
                href={href}
                style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', transition: 'color .15s ease' }}
                onMouseEnter={e => ((e.target as HTMLElement).style.color = 'var(--rose)')}
                onMouseLeave={e => ((e.target as HTMLElement).style.color = 'var(--ink)')}
              >
                {label}
              </a>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }} className="nav-cta-group">
            <a href="/#artists" className="btn btn-ghost btn-sm nav-ghost-btn">Join as Artist</a>
            <a
              href="#find-glow"
              className="btn btn-rose btn-sm"
              style={{ borderRadius: 999 }}
            >
              Find My Glow
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
              borderRadius: 12,
              background: menuOpen ? 'var(--ink)' : 'transparent',
              border: '1px solid rgba(29,29,31,0.08)',
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
            background: 'rgba(251,247,240,0.98)',
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
                  borderBottom: '1px solid rgba(29,29,31,0.06)',
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
              href="#find-glow"
              className="btn btn-rose"
              onClick={() => setMenuOpen(false)}
              style={{ height: 56, fontSize: 16, justifyContent: 'center', borderRadius: 14 }}
            >
              Find My Glow
              <svg className="arr" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
            <a
              href="/#artists"
              className="btn btn-ghost"
              onClick={() => setMenuOpen(false)}
              style={{ height: 56, fontSize: 16, justifyContent: 'center', borderRadius: 14 }}
            >
              Join as an Artist
            </a>
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--rose)' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              500+ Verified Artists · Available Across Nepal
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
