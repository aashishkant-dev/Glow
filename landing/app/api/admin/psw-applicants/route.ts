import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { backendAdminFetch, BackendAuthError } from '@/lib/backendAuth'

// Proxies GET /provider-applicants on the Glow backend using the same
// self-renewing admin JWT as the leads proxy (see lib/backendAuth.ts).
export async function GET(req: NextRequest) {
  const session = cookies().get('cn_admin_session')?.value
  if (session !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = searchParams.get('page') || '1'
  const limit = searchParams.get('limit') || '50'
  const status = searchParams.get('status') || ''
  const screenResult = searchParams.get('screenResult') || ''

  try {
    const qs = new URLSearchParams({ page, limit, ...(status ? { status } : {}), ...(screenResult ? { screenResult } : {}) })
    const res = await backendAdminFetch(`/provider-applicants?${qs.toString()}`)
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'Failed to fetch applicants' }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BackendAuthError) {
      return NextResponse.json({ applicants: [], total: 0, page: 1, pages: 0, warning: err.message })
    }
    console.error('Admin provider-applicants proxy error:', err)
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}

// Proxies PATCH /provider-applicants/:id — status updates from the dashboard.
export async function PATCH(req: NextRequest) {
  const session = cookies().get('cn_admin_session')?.value
  if (session !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, ...patch } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const res = await backendAdminFetch(`/provider-applicants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'Failed to update applicant' }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BackendAuthError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    console.error('Admin provider-applicants PATCH proxy error:', err)
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
