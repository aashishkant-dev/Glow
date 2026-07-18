// Server-only GA4 Data API client. Uses a Google service account
// (GA_SERVICE_ACCOUNT_KEY = full JSON key, GA4_PROPERTY_ID = numeric property
// id) and signs the OAuth JWT with node:crypto — no Google SDK dependency.
// Results are cached in module memory for 10 minutes to stay inside quota.

import { createSign } from 'crypto'

const CACHE_TTL_MS = 10 * 60 * 1000
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

export interface Ga4Summary {
  today: { visitors: number; pageviews: number }
  last7: { visitors: number; pageviews: number }
  last30: { visitors: number; pageviews: number }
  topPages: { path: string; views: number }[]
  sources: { source: string; sessions: number }[]
  blogViews: Record<string, number> // path -> views (30d)
}

let cached: { at: number; data: Ga4Summary } | null = null
let accessToken: { token: string; expiry: number } | null = null

export function ga4Configured(): boolean {
  return Boolean(process.env.GA4_PROPERTY_ID && process.env.GA_SERVICE_ACCOUNT_KEY)
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < accessToken.expiry - 60_000) return accessToken.token

  const key = JSON.parse(process.env.GA_SERVICE_ACCOUNT_KEY as string)
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(key.private_key, 'base64url')
  const assertion = `${header}.${claims}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    cache: 'no-store',
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || 'GA4 token exchange failed')
  }
  accessToken = { token: data.access_token, expiry: Date.now() + (data.expires_in || 3600) * 1000 }
  return accessToken.token
}

async function runReport(body: object): Promise<any> {
  const propertyId = process.env.GA4_PROPERTY_ID
  const token = await getAccessToken()
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'GA4 report failed')
  return data
}

function totals(report: any): { visitors: number; pageviews: number } {
  const row = report.rows?.[0]
  return {
    visitors: Number(row?.metricValues?.[0]?.value || 0),
    pageviews: Number(row?.metricValues?.[1]?.value || 0),
  }
}

export async function getGa4Summary(): Promise<Ga4Summary> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data

  const metrics = [{ name: 'totalUsers' }, { name: 'screenPageViews' }]
  const [today, last7, last30, pages, sources] = await Promise.all([
    runReport({ dateRanges: [{ startDate: 'today', endDate: 'today' }], metrics }),
    runReport({ dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], metrics }),
    runReport({ dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }], metrics }),
    runReport({
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 50,
    }),
    runReport({
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
  ])

  const pageRows: { path: string; views: number }[] = (pages.rows || []).map((r: any) => ({
    path: r.dimensionValues[0].value,
    views: Number(r.metricValues[0].value),
  }))

  const blogViews: Record<string, number> = {}
  for (const p of pageRows) {
    if (p.path.startsWith('/blog/')) blogViews[p.path] = (blogViews[p.path] || 0) + p.views
  }

  const data: Ga4Summary = {
    today: totals(today),
    last7: totals(last7),
    last30: totals(last30),
    topPages: pageRows.slice(0, 10),
    sources: (sources.rows || []).map((r: any) => ({
      source: r.dimensionValues[0].value,
      sessions: Number(r.metricValues[0].value),
    })),
    blogViews,
  }
  cached = { at: Date.now(), data }
  return data
}
