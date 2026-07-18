import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { backendAdminFetch, BackendAuthError } from '@/lib/backendAuth'

// Proxies GET /leads on the Glow backend. Auth against the backend is a
// self-renewing admin JWT (see lib/backendAuth.ts). Requires the
// cn_admin_session cookie set by /api/admin/login (env-credential MVP gate).
export async function GET(req: NextRequest) {
  const session = cookies().get('cn_admin_session')?.value
  if (session !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = searchParams.get('page') || '1'
  const limit = searchParams.get('limit') || '50'

  try {
    const res = await backendAdminFetch(`/leads?page=${page}&limit=${limit}`)
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'Failed to fetch leads' }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BackendAuthError) {
      return NextResponse.json({ leads: [], total: 0, page: 1, pages: 0, warning: err.message })
    }
    console.error('Admin leads proxy error:', err)
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
