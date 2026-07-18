// Server-only helper that keeps a fresh backend admin JWT for the dashboard
// proxy routes. Replaces the old static ADMIN_API_TOKEN (a 30-day JWT that
// silently expired). Logs into POST /admin/login with BACKEND_ADMIN_USERNAME /
// BACKEND_ADMIN_PASSWORD and caches the token in module memory until it is
// within 24h of expiry.

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://api.glow.app').replace(/\/$/, '')

const RENEW_MARGIN_MS = 24 * 60 * 60 * 1000

let cachedToken: string | null = null
let cachedExpiry = 0 // epoch ms

export class BackendAuthError extends Error {}

async function login(): Promise<string> {
  const username = process.env.BACKEND_ADMIN_USERNAME
  const password = process.env.BACKEND_ADMIN_PASSWORD
  if (!username || !password) {
    // Legacy fallback: static token (30-day JWT). Works until it expires —
    // set BACKEND_ADMIN_USERNAME / BACKEND_ADMIN_PASSWORD for auto-renewal.
    const staticToken = process.env.ADMIN_API_TOKEN
    if (staticToken) {
      cachedToken = staticToken
      cachedExpiry = Date.now() + RENEW_MARGIN_MS + 60 * 60 * 1000 // recheck hourly
      return staticToken
    }
    throw new BackendAuthError('Set BACKEND_ADMIN_USERNAME and BACKEND_ADMIN_PASSWORD on the landing project.')
  }

  const res = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.token) {
    throw new BackendAuthError(data.error || `Backend admin login failed (${res.status})`)
  }

  cachedToken = data.token
  const expiresInSec = typeof data.expiresIn === 'number' ? data.expiresIn : 30 * 24 * 3600
  cachedExpiry = Date.now() + expiresInSec * 1000
  return data.token
}

export async function getAdminToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < cachedExpiry - RENEW_MARGIN_MS) {
    return cachedToken
  }
  return login()
}

// fetch() against the backend with the admin token; retries once on 401
// (e.g. token revoked or JWT secret rotated).
export async function backendAdminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = async (token: string) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

  let res = await doFetch(await getAdminToken())
  if (res.status === 401) {
    res = await doFetch(await getAdminToken(true))
  }
  return res
}
