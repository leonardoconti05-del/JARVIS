import { NextResponse } from 'next/server';
import { firmaSessione } from '../../../lib/session.js';

// FIX (22/9/2026): il cookie jarvis_auth conteneva prima la password del
// sito IN CHIARO (res.cookies.set('jarvis_auth', expected, ...)) — chi
// leggeva il cookie (es. devtools su un dispositivo condiviso, o un XSS)
// otteneva direttamente la password vera, non un token revocabile. Ora il
// cookie contiene una sessione firmata (lib/session.js), verificata da
// middleware.js: nessun segreto riutilizzabile viaggia nel cookie.

export async function POST(req) {
  const { password } = await req.json();
  const expected = process.env.SITE_PASSWORD;
  const SESSION_SECRET = process.env.SESSION_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: 'SITE_PASSWORD non configurata su questo deploy.' },
      { status: 500 }
    );
  }

  if (!SESSION_SECRET) {
    return NextResponse.json(
      { error: 'SESSION_SECRET non configurata su questo deploy.' },
      { status: 500 }
    );
  }

  if (password !== expected) {
    return NextResponse.json({ error: 'Password errata.' }, { status: 401 });
  }

  const maxAgeSecondi = 60 * 60 * 24 * 30; // 30 giorni, come il comportamento precedente
  const sessionToken = firmaSessione({ authenticated: true }, SESSION_SECRET, maxAgeSecondi);

  const res = NextResponse.json({ ok: true });
  res.cookies.set('jarvis_auth', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSecondi,
  });
  return res;
}
