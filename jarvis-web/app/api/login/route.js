import { NextResponse } from 'next/server';

export async function POST(req) {
  const { password } = await req.json();
  const expected = process.env.SITE_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { error: 'SITE_PASSWORD non configurata su questo deploy.' },
      { status: 500 }
    );
  }

  if (password !== expected) {
    return NextResponse.json({ error: 'Password errata.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('jarvis_auth', expected, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
