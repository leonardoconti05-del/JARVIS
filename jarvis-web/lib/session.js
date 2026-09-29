// lib/session.js
//
// Sessione firmata HMAC per l'autenticazione di JARVIS (password unica del
// sito, non multi-tenant come in ai-setup-agency-webhook). Il cookie
// jarvis_auth NON contiene più la password in chiaro (comportamento
// precedente, vedi app/api/login/route.js prima del fix): contiene un
// payload minimo ({ authenticated: true, exp }) + una firma HMAC-SHA256
// che ne garantisce integrità e provenienza. Chi legge il cookie (es. da
// devtools su un dispositivo condiviso) non ottiene la password del sito.
//
// Formato token: base64url(JSON payload) + "." + HMAC-SHA256 (base64url)
// — stesso schema usato in ai-setup-agency-webhook/lib/session.js.
//
// Usato da: app/api/login/route.js (crea la sessione dopo aver verificato
// la password), middleware.js (verifica la sessione su ogni richiesta
// protetta).

import crypto from 'crypto';

export function firmaSessione(payload, secret, ttlSecondi = 60 * 60 * 24 * 30) {
  const corpo = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSecondi };
  const json = Buffer.from(JSON.stringify(corpo)).toString('base64url');
  const firma = crypto.createHmac('sha256', secret).update(json).digest('base64url');
  return `${json}.${firma}`;
}

export function verificaSessione(token, secret) {
  if (!token || typeof token !== 'string' || !secret) return null;
  const punto = token.indexOf('.');
  if (punto === -1) return null;

  const json = token.slice(0, punto);
  const firmaRicevuta = token.slice(punto + 1);
  const firmaAttesa = crypto.createHmac('sha256', secret).update(json).digest('base64url');

  try {
    const a = Buffer.from(firmaAttesa);
    const b = Buffer.from(firmaRicevuta);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }

  if (!payload || typeof payload.exp !== 'number' || Date.now() / 1000 > payload.exp) {
    return null;
  }
  return payload;
}
