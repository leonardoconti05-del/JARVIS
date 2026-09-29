// tests/session.test.mjs
//
// Test per lib/session.js (JARVIS), versione Web Crypto API (Edge-compatibile).
// firmaSessione e verificaSessione sono asincrone: ogni chiamata va awaitata.
//
// Esegui con: node --test tests/session.test.mjs
// (richiede Node >= 18, usa globalThis.crypto.subtle)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { firmaSessione, verificaSessione } from '../lib/session.js';

const SESSION_SECRET = 'secret-di-test-jarvis-non-usare-in-produzione';

describe('firmaSessione + verificaSessione (JARVIS, Web Crypto)', () => {
  test('un token appena firmato si verifica correttamente', async () => {
    const token = await firmaSessione({ authenticated: true }, SESSION_SECRET);
    const payload = await verificaSessione(token, SESSION_SECRET);
    assert.equal(payload.authenticated, true);
    assert.equal(typeof payload.exp, 'number');
  });

  test('il cookie NON contiene mai la password in chiaro', async () => {
    const passwordFinta = 'una-password-segreta-del-sito';
    const token = await firmaSessione({ authenticated: true }, SESSION_SECRET);
    assert.ok(!token.includes(passwordFinta));
    const payload = await verificaSessione(token, SESSION_SECRET);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'password'), false);
  });

  test('verificaSessione rifiuta un token firmato con un secret diverso', async () => {
    const token = await firmaSessione({ authenticated: true }, SESSION_SECRET);
    assert.equal(await verificaSessione(token, 'secret-sbagliato'), null);
  });

  test('verificaSessione rifiuta un token manomesso (payload alterato dopo la firma)', async () => {
    const token = await firmaSessione({ authenticated: true }, SESSION_SECRET);
    const [json, firma] = token.split('.');
    const payloadOriginale = JSON.parse(Buffer.from(json, 'base64url').toString('utf-8'));
    const payloadManomesso = { ...payloadOriginale, extra: 'iniettato' };
    const jsonManomesso = Buffer.from(JSON.stringify(payloadManomesso)).toString('base64url');
    const tokenManomesso = `${jsonManomesso}.${firma}`;
    assert.equal(await verificaSessione(tokenManomesso, SESSION_SECRET), null);
  });

  test('verificaSessione rifiuta un token scaduto', async () => {
    const token = await firmaSessione({ authenticated: true }, SESSION_SECRET, -10);
    assert.equal(await verificaSessione(token, SESSION_SECRET), null);
  });

  test('verificaSessione rifiuta input malformati senza lanciare eccezioni', async () => {
    assert.equal(await verificaSessione(null, SESSION_SECRET), null);
    assert.equal(await verificaSessione(undefined, SESSION_SECRET), null);
    assert.equal(await verificaSessione('', SESSION_SECRET), null);
    assert.equal(await verificaSessione('senza-punto', SESSION_SECRET), null);
    assert.equal(await verificaSessione('a.b', ''), null);
    assert.equal(await verificaSessione('una-vecchia-password-in-chiaro', SESSION_SECRET), null);
  });

  test('la scadenza di default è di circa 30 giorni', async () => {
    const prima = Math.floor(Date.now() / 1000);
    const token = await firmaSessione({ authenticated: true }, SESSION_SECRET);
    const payload = await verificaSessione(token, SESSION_SECRET);
    const attesoCirca = prima + 60 * 60 * 24 * 30;
    assert.ok(Math.abs(payload.exp - attesoCirca) <= 5);
  });

  test('un ttl esplicito viene rispettato', async () => {
    const prima = Math.floor(Date.now() / 1000);
    const token = await firmaSessione({ authenticated: true }, SESSION_SECRET, 60 * 60);
    const payload = await verificaSessione(token, SESSION_SECRET);
    assert.ok(Math.abs(payload.exp - (prima + 60 * 60)) <= 5);
  });
});
