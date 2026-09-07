import { NextResponse } from 'next/server';

export function proxy(req) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/login' ||
    pathname === '/api/login' ||
    pathname === '/api/cron/daily-summary'
  ) {
    return NextResponse.next();
  }

  const expected = process.env.SITE_PASSWORD;
  const cookie = req.cookies.get('jarvis_auth')?.value;

  if (!expected || cookie !== expected) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!_next/static|_next/image).*)',
};
