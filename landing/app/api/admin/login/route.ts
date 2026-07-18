import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'cn_admin_session'

// Simple env-based credential gate for the landing analytics dashboard (MVP — no DB).
// Separate from the main Glow Admin model used by the mobile/backend admin panel.
export async function POST(req: NextRequest) {
  const { username, password } = await req.json().catch(() => ({ username: '', password: '' }))

  const expectedUser = process.env.ADMIN_USERNAME
  const expectedPass = process.env.ADMIN_PASSWORD

  if (!expectedUser || !expectedPass) {
    return NextResponse.json(
      { error: 'Admin dashboard is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD.' },
      { status: 503 }
    )
  }

  if (username !== expectedUser || password !== expectedPass) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
