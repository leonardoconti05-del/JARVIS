// tests/session.test.mjs
//
// Test per lib/session.js (JARVIS). Stesso schema di firma usato in
// ai-setup-agency-webhook, adattato al caso d'uso di JARVIS: qui il
// payload di sessione è solo { authenticated: true, exp } (password
// unica del sito, nessun cliente_id).
//
// Esegui con: node --test tests/session.test.mjs
// (richiede Node >= 18)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { firmaSessione, verificaSessione } from '../lib/session.js';

const SESSION_SECRET = 'secret-di-test-jarvis-non-usare-in-produzione';

describe('firmaSessione + verificaSessione (JARVIS)', () => {
  test('un token appena firmato si verifica correttamente', () => {
    const token = firmaSessione({ authenticated: true }, SESSION_SECRET);
    const payload = verificaSessione(token, SESSION_SECRET);
    assert.equal(payload.authenticated, true);
    assert.equal(typeof payload.exp, 'number');
  });

  test('il cookie NON contiene mai la password in chiaro', () => {
    // Verifica di regressione specifica per il fix del 22/9/2026: il vecchio
    // comportamento metteva la password direttamente nel cookie.
    const passwordFinta = 'una-password-segreta-del-sito';
    const token = firmaSessione({ authenticated: true }, SESSION_SECRET);
    assert.ok(!token.includes(passwordFinta));
    // Anche codificando la password in base64url non deve comparire —
    // il payload non contiene affatto la password, a prescindere.
    const payload = verificaSessione(token, SESSION_SECRET);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'password'), false);
  });

  test('verificaSessione rifiuta un token firmato con un secret diverso', () => {
    const token = firmaSessione({ authenticated: true }, SESSION_SECRET);
    assert.equal(verificaSessione(token, 'secret-sbagliato'), null);
  });

  test('verificaSessione rifiuta un token manomesso (es. authenticated forzato a true su un payload alterato)', () => {
    const token = firmaSessione({ authenticated: true }, SESSION_SECRET);
    const [json, firma] = token.split('.');
    const payloadOriginale = JSON.parse(Buffer.from(json, 'base64url').toString('utf-8'));
    const payloadManomesso = { ...payloadOriginale, extra: 'iniettato' };
    const jsonManomesso = Buffer.from(JSON.stringify(payloadManomesso)).toString('base64url');
    const tokenManomesso = `${jsonManomesso}.${firma}`;
    assert.equal(verificaSessione(tokenManomesso, SESSION_SECRET), null);
  });

  test('verificaSessione rifiuta un token scaduto', () => {
    const token = firmaSessione({ authenticated: true }, SESSION_SECRET, -10);
    assert.equal(verificaSessione(token, SESSION_SECRET), null);
  });

  test('verificaSessione rifiuta input malformati senza lanciare eccezioni', () => {
    assert.equal(verificaSessione(null, SESSION_SECRET), null);
    assert.equal(verificaSessione(undefined, SESSION_SECRET), null);
    assert.equal(verificaSessione('', SESSION_SECRET), null);
    assert.equal(verificaSessione('senza-punto', SESSION_SECRET), null);
    assert.equal(verificaSessione('a.b', ''), null);
    // Un vecchio cookie col vecchio schema (la password in chiaro, senza
    // punto/firma) non deve mai essere accettato come sessione valida.
    assert.equal(verificaSessione('una-vecchia-password-in-chiaro', SESSION_SECRET), null);
  });

  test('la scadenza di default è di circa 30 giorni', () => {
    const prima = Math.floor(Date.now() / 1000);
    const token = firmaSessione({ authenticated: true }, SESSION_SECRET);
    const payload = verificaSessione(token, SESSION_SECRET);
    const attesoCirca = prima + 60 * 60 * 24 * 30;
    assert.ok(Math.abs(payload.exp - attesoCirca) <= 5);
  });

  test('un ttl esplicito viene rispettato', () => {
    const prima = Math.floor(Date.now() / 1000);
    const token = firmaSessione({ authenticated: true }, SESSION_SECRET, 60 * 60);
    const payload = verificaSessione(token, SESSION_SECRET);
    assert.ok(Math.abs(payload.exp - (prima + 60 * 60)) <= 5);
  });
});
