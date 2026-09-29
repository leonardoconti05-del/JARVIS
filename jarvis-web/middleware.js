import { NextResponse } from 'next/server';
import { verificaSessione } from './lib/session.js';

export async function middleware(req) {
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

  const SESSION_SECRET = process.env.SESSION_SECRET;
  const cookie = req.cookies.get('jarvis_auth')?.value;
  const sessione = SESSION_SECRET ? await verificaSessione(cookie, SESSION_SECRET) : null;

  if (!sessione || sessione.authenticated !== true) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = { matcher: '/((?!_next/static|_next/image).*)' };
