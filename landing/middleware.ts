import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'cn_admin_session'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/admin/dashboard')) {
    const session = req.cookies.get(SESSION_COOKIE)?.value
    if (session !== '1') {
      const loginUrl = new URL('/admin/login', req.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/dashboard/:path*'],
}
