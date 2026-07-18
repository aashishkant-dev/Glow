import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { backendAdminFetch, BackendAuthError } from '@/lib/backendAuth'

// Proxies PATCH /leads/:id — mark a lead contacted / not contacted.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = cookies().get('cn_admin_session')?.value
  if (session !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const res = await backendAdminFetch(`/leads/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacted: body.contacted !== false }),
    })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'Failed to update lead' }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BackendAuthError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    console.error('Admin lead PATCH proxy error:', err)
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
