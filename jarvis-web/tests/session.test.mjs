// lib/session.js (JARVIS)
//
// Usa SOLO le Web Crypto API (globalThis.crypto.subtle), NON il modulo
// Node "crypto". Motivo: middleware.js gira sul Vercel Edge Runtime per
// default, che non supporta il modulo Node "crypto" — un import diretto lo
// fa fallire con 500 MIDDLEWARE_INVOCATION_FAILED su ogni pagina. Le Web
// Crypto API funzionano sia su Edge sia su Node, quindi questo file è
// sicuro da importare da middleware.js e da qualunque route API.
//
// Nota: firmaSessione e verificaSessione sono ora funzioni ASINCRONE
// (SubtleCrypto è basata su Promise) — vanno sempre chiamate con "await".

function toBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const binario = atob(s);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function testoToBase64Url(testo) {
  return toBase64Url(new TextEncoder().encode(testo));
}

function base64UrlToTesto(b64) {
  return new TextDecoder().decode(fromBase64Url(b64));
}

async function importaChiaveHmac(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function firmaSessione(payload, secret, ttlSecondi = 60 * 60 * 24 * 30) {
  const corpo = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSecondi };
  const json = testoToBase64Url(JSON.stringify(corpo));
  const chiave = await importaChiaveHmac(secret);
  const firmaBuffer = await crypto.subtle.sign('HMAC', chiave, new TextEncoder().encode(json));
  const firma = toBase64Url(firmaBuffer);
  return `${json}.${firma}`;
}

export async function verificaSessione(token, secret) {
  if (!token || typeof token !== 'string' || !secret) return null;
  const punto = token.indexOf('.');
  if (punto === -1) return null;
  const json = token.slice(0, punto);
  const firmaRicevuta = token.slice(punto + 1);

  let chiave;
  try {
    chiave = await importaChiaveHmac(secret);
  } catch {
    return null;
  }

  let valida = false;
  try {
    const firmaBytes = fromBase64Url(firmaRicevuta);
    // crypto.subtle.verify confronta in tempo costante internamente:
    // stessa proprietà di sicurezza di crypto.timingSafeEqual di Node.
    valida = await crypto.subtle.verify('HMAC', chiave, firmaBytes, new TextEncoder().encode(json));
  } catch {
    return null;
  }
  if (!valida) return null;

  let payload;
  try {
    payload = JSON.parse(base64UrlToTesto(json));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || Date.now() / 1000 > payload.exp) return null;
  return payload;
}
