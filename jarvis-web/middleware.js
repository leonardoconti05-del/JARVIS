import { NextResponse } from 'next/server';
import { verificaSessione } from './lib/session.js';

// FIX (22/9/2026): questo file sostituisce proxy.js, che NON veniva mai
// eseguito. Next.js cerca specificamente un file chiamato "middleware.js"
// (o .ts) alla root del progetto, con una funzione esportata chiamata
// "middleware" (o export default) — proxy.js aveva sia il nome del file
// sia il nome della funzione sbagliati ("proxy" invece di "middleware"),
// quindi Next.js lo ignorava silenziosamente: nessun errore, nessuna
// protezione delle route applicata. Bug "silenzioso" nel senso letterale:
// l'app funzionava (nessun crash), semplicemente senza alcuna
// autenticazione reale sulle route protette.
//
// Oltre a correggere nome file/funzione, verifica ora una sessione firmata
// (lib/session.js) invece di confrontare il cookie con la password in
// chiaro — coerente con il fix di app/api/login/route.js.

export function middleware(req) {
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
  const sessione = SESSION_SECRET ? verificaSessione(cookie, SESSION_SECRET) : null;

  if (!sessione || sessione.authenticated !== true) {
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
