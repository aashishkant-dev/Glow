// Client-side GA4 event helper. No-ops when GA isn't loaded (dev, ad blockers).
export function trackEvent(name: string, params: Record<string, string | number> = {}) {
  if (typeof window === 'undefined') return
  const gtag = (window as any).gtag
  if (typeof gtag === 'function') {
    gtag('event', name, params)
  }
}
