import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JARVIS_AUTHORIZED_TENANT_IDS = 'tenant-a';

const { runSupabaseQuery, writeSupabase } = await import('../jarvis-web/lib/agent.js');

test('AI Setup tenant read requires a server-authorized cliente_id filter', async () => {
  const result = await runSupabaseQuery({
    project: 'ai_setup_agency',
    table: 'lacune_conoscenza',
    filters: [],
  });
  assert.match(result.error, /cliente_id autorizzato/);
});

test('AI Setup tenant read denies a tenant outside server scope', async () => {
  const result = await runSupabaseQuery({
    project: 'ai_setup_agency',
    table: 'lacune_conoscenza',
    filters: [{ column: 'cliente_id', op: 'eq', value: 'tenant-b' }],
  });
  assert.match(result.error, /cliente_id autorizzato/);
});

test('AI Setup tenant read accepts a tenant inside server scope and reaches data layer', async () => {
  const result = await runSupabaseQuery({
    project: 'ai_setup_agency',
    table: 'lacune_conoscenza',
    filters: [{ column: 'cliente_id', op: 'eq', value: 'tenant-a' }],
  });
  assert.doesNotMatch(result.error || '', /Query tenant AI Setup Agency negata/);
});

test('AI Setup global tables remain readable without tenant filter', async () => {
  const result = await runSupabaseQuery({
    project: 'ai_setup_agency',
    table: 'sector_profiles',
    filters: [],
  });
  assert.doesNotMatch(result.error || '', /cliente_id autorizzato/);
});

test('unknown AI Setup tables are denied', async () => {
  const result = await runSupabaseQuery({
    project: 'ai_setup_agency',
    table: 'some_secret_table',
    filters: [{ column: 'cliente_id', op: 'eq', value: 'tenant-a' }],
  });
  assert.match(result.error, /Tabella AI Setup Agency non autorizzata/);
});

test('direct AI Setup writes are denied pending Action Gateway', async () => {
  const result = await writeSupabase({
    project: 'ai_setup_agency',
    table: 'configurazioni_cliente',
    mode: 'update',
    values: { attivo: true },
    match: { cliente_id: 'tenant-a' },
  });
  assert.match(result.error, /Action Gateway governato/);
});
