import { createClient } from '@supabase/supabase-js';
import { readCoreTenant } from './core-read.js';

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Elenco dei progetti Supabase collegati. Per aggiungerne uno nuovo:
// 1. aggiungi una voce qui con una chiave breve (es. "ordina_ora")
// 2. aggiungi su Vercel le due variabili d'ambiente corrispondenti
export const SUPABASE_PROJECTS = {
  burofacile: {
    label: 'BuroFacile / BuroPass',
    urlEnv: 'SUPABASE_URL_BUROFACILE',
    keyEnv: 'SUPABASE_SERVICE_KEY_BUROFACILE',
  },
  ai_setup_agency: {
    label: 'AI Setup Agency',
    urlEnv: 'SUPABASE_URL_AI_SETUP',
    keyEnv: 'SUPABASE_SERVICE_KEY_AI_SETUP',
  },
};

const PROJECT_KEYS = Object.keys(SUPABASE_PROJECTS);

const AI_SETUP_TENANT_TABLES = new Set([
  'clienti',
  'configurazioni_cliente',
  'richieste_clienti',
  'documents',
  'knowledge_chunks',
  'lacune_conoscenza',
  'servizi_cliente',
  'personale_cliente',
  'whatsapp_conversations',
  'event_log',
  'utilizzo_mensile',
  'ai_action_ledger',
  'approval_requests',
  'tenant_action_policy',
]);

const AI_SETUP_GLOBAL_TABLES = new Set([
  'agent_registry',
  'sector_profiles',
  'sector_faq',
  'sector_test_scenarios',
  'sector_eval_runs',
]);

function authorizedTenantIds() {
  const raw = process.env.JARVIS_AUTHORIZED_TENANT_IDS || '';
  return [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
}

function validateAiSetupReadScope({ table, filters }) {
  if (AI_SETUP_GLOBAL_TABLES.has(table)) return null;
  if (!AI_SETUP_TENANT_TABLES.has(table)) {
    return 'Tabella AI Setup Agency non autorizzata per il read tool.';
  }

  const tenantIds = authorizedTenantIds();
  if (tenantIds.length === 0) return 'Scope tenant Jarvis non configurato.';
  const tenantFilter = Array.isArray(filters)
    ? filters.find((f) => f?.column === 'cliente_id' && f?.op === 'eq')
    : null;
  if (!tenantFilter || !tenantIds.includes(String(tenantFilter.value))) {
    return 'Query tenant AI Setup Agency negata: serve un cliente_id autorizzato dal server.';
  }
  return null;
}

export const TOOLS = [
  { name: 'read_core_tenant', description: 'Legge in sola lettura il quadro operativo di un tenant AI Setup Agency attraverso il Core API.', input_schema: { type: 'object', properties: { cliente_id: { type: 'string' } }, required: ['cliente_id'] } },
  { type: 'web_search_20250305', name: 'web_search' },
  {
    name: 'query_supabase',
    description:
      'Esegue una query di sola lettura (SELECT) su una tabella di uno dei progetti Supabase configurati. Usa questo tool per rispondere a domande sui dati salvati.',
    input_schema: {
      type: 'object',
      properties: {
        project: { type: 'string', enum: PROJECT_KEYS, description: 'Quale progetto Supabase interrogare' },
        table: { type: 'string', description: 'Nome esatto della tabella' },
        select: { type: 'string', description: 'Colonne da selezionare, es "*" o "id,nome,email"' },
        filters: {
          type: 'array',
          description: 'Filtri opzionali da applicare',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              op: { type: 'string', enum: ['eq', 'gt', 'lt', 'ilike'] },
              value: {},
            },
            required: ['column', 'op', 'value'],
          },
        },
        limit: { type: 'integer', description: 'Numero massimo di righe (default 25, max 200)' },
      },
      required: ['project', 'table'],
    },
  },
  {
    name: 'write_supabase',
    description:
      'Inserisce o aggiorna righe (INSERT o UPDATE, mai DELETE) in una tabella di uno dei progetti Supabase configurati. Usa questo tool solo quando l\'utente chiede esplicitamente di salvare, aggiungere o modificare dati.',
    input_schema: {
      type: 'object',
      properties: {
        project: { type: 'string', enum: PROJECT_KEYS, description: 'Quale progetto Supabase scrivere' },
        table: { type: 'string', description: 'Nome esatto della tabella' },
        mode: { type: 'string', enum: ['insert', 'update'], description: 'insert per nuove righe, update per modificarne di esistenti' },
        values: { type: 'object', description: 'Coppie colonna:valore da scrivere' },
        match: {
          type: 'object',
          description: 'Solo per mode=update: coppie colonna:valore per identificare le righe da aggiornare',
        },
      },
      required: ['project', 'table', 'mode', 'values'],
    },
  },
];

const projectListText = PROJECT_KEYS.map((k) => `- "${k}" = ${SUPABASE_PROJECTS[k].label}`).join('\n');

export const SYSTEM_PROMPT = `Sei Jarvis, l'assistente personale operativo di Heheh, un imprenditore italiano che gestisce più progetti (BuroPass, Ordina Ora, Real One Hub, AI Setup Agency, un servizio video AI per host Airbnb, e altre iniziative in corso).
Rispondi sempre in italiano, in modo diretto e concreto, come un capo staff efficiente.
Usa il tool "web_search" quando serve un'informazione aggiornata o esterna.
Usa il tool "query_supabase" per leggere dati, e "write_supabase" solo quando l'utente chiede esplicitamente di salvare/aggiungere/modificare qualcosa. Non scrivere mai dati di tua iniziativa senza che sia stato chiesto.
Progetti Supabase disponibili (usa la chiave esatta nel campo "project"):
${projectListText}
Se l'utente non specifica il progetto e dal contesto non è ovvio quale intende, chiediglielo prima di eseguire query o scritture.
Se un tool restituisce un errore, spiegalo in una riga e proponi come risolverlo.
Sii sintetico: vai dritto al punto, evita preamboli.

RUOLO DI "OPERATIONS MANAGER" per il progetto ai_setup_agency (agenzia di setup agenti AI per PMI locali):
Oltre a rispondere a domande dirette, quando l'utente ti chiede di analizzare l'andamento del business, trovare problemi o capire perché qualcosa non ha funzionato, sai che nel progetto "ai_setup_agency" esistono queste tabelle utili, oltre a quelle già note:
- event_log: una riga per ogni fase di elaborazione di un messaggio WhatsApp (fase, stato "ok"/"errore", cliente_id, dettaglio jsonb, created_at). Usala per rispondere a domande come "quanti errori abbiamo avuto ieri", "dove si blocca di più il bot", "quali clienti hanno più problemi tecnici" — raggruppa per "fase" o "cliente_id" con query mirate.
- richieste_clienti: una riga per conversazione WhatsApp per cliente. Lo stato "in_corso" fermo da tanto tempo (confronta updated_at con la data attuale) indica un lead probabilmente perso; dati_raccolti->>'_fase' = 'confermato' indica un appuntamento confermato via Google Calendar.
- configurazioni_cliente: contiene anche i parametri dei follow-up automatici (follow_up_attivo, follow_up_dopo_ore, ecc.) e il limite mensile di messaggi (limite_messaggi_mese) — utile per capire quali clienti hanno automazioni attive o rischiano di raggiungere il limite.
- utilizzo_mensile: conteggio messaggi per cliente per mese (colonne cliente_id, mese "YYYY-MM", conteggio) — incrocia con limite_messaggi_mese per capire chi è vicino al tetto.
Quando l'utente chiede un'analisi (non solo un dato singolo), non limitarti a un numero: individua pattern (es. "il 60% degli errori è nella fase claude, concentrati sul cliente X"), proponi un'ipotesi concreta sul perché, e chiedi conferma prima di agire se la soluzione implica una scrittura sui dati.`;

function getSupabaseClient(projectKey) {
  const cfg = SUPABASE_PROJECTS[projectKey];
  if (!cfg) return { error: `Progetto Supabase sconosciuto: "${projectKey}".` };
  const url = process.env[cfg.urlEnv];
  const key = process.env[cfg.keyEnv];
  if (!url || !key) {
    return { error: `Progetto "${cfg.label}" non configurato su questo deploy (variabili ${cfg.urlEnv} / ${cfg.keyEnv} mancanti).` };
  }
  return { client: createClient(url, key) };
}

export async function runSupabaseQuery({ project, table, select, filters, limit }) {
  if (project === 'ai_setup_agency') {
    const scopeError = validateAiSetupReadScope({ table, filters });
    if (scopeError) return { error: scopeError };
  }
  const { client, error } = getSupabaseClient(project);
  if (error) return { error };
  try {
    let q = client.from(table).select(select || '*');
    if (Array.isArray(filters)) {
      for (const f of filters) {
        if (f.op === 'eq') q = q.eq(f.column, f.value);
        else if (f.op === 'gt') q = q.gt(f.column, f.value);
        else if (f.op === 'lt') q = q.lt(f.column, f.value);
        else if (f.op === 'ilike') q = q.ilike(f.column, f.value);
      }
    }
    q = q.limit(limit && limit > 0 && limit <= 200 ? limit : 25);
    const { data, error: qErr } = await q;
    if (qErr) return { error: qErr.message };
    return { data };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

export async function writeSupabase({ project, table, mode, values, match }) {
  if (project === 'ai_setup_agency') {
    return { error: 'Scritture dirette su AI Setup Agency disabilitate: usare il Core/Action Gateway governato.' };
  }
  const { client, error } = getSupabaseClient(project);
  if (error) return { error };
  try {
    if (mode === 'insert') {
      const { data, error: wErr } = await client.from(table).insert(values).select();
      if (wErr) return { error: wErr.message };
      return { data, ok: true };
    }
    if (mode === 'update') {
      if (!match || Object.keys(match).length === 0) {
        return { error: 'Per un update serve almeno un criterio "match" per identificare le righe da modificare.' };
      }
      let q = client.from(table).update(values);
      for (const [col, val] of Object.entries(match)) {
        q = q.eq(col, val);
      }
      const { data, error: wErr } = await q.select();
      if (wErr) return { error: wErr.message };
      return { data, ok: true };
    }
    return { error: `Modalità di scrittura sconosciuta: "${mode}".` };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function callAnthropic(messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurata su questo deploy.');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Errore API Anthropic (${res.status})`);
  return data;
}

export async function runAgent(history) {
  let messages = history.map((m) => ({ role: m.role, content: m.content }));
  const toolLog = [];

  for (let turn = 0; turn < 6; turn++) {
    const data = await callAnthropic(messages);
    const content = data.content || [];
    const toolUses = content.filter((b) => b.type === 'tool_use');

    if (toolUses.length === 0) {
      const text = content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return { text, toolLog };
    }

    messages.push({ role: 'assistant', content });

    const toolResults = [];
    for (const block of toolUses) {
      if (block.name === 'read_core_tenant') {
        toolLog.push({ tool: 'read_core_tenant', input: block.input });
        const result = await readCoreTenant(block.input.cliente_id);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      } else if (block.name === 'query_supabase') {
        toolLog.push({ tool: 'query_supabase', input: block.input });
        const result = await runSupabaseQuery(block.input);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      } else if (block.name === 'write_supabase') {
        toolLog.push({ tool: 'write_supabase', input: block.input });
        const result = await writeSupabase(block.input);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
    }

    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }
  }

  throw new Error('Troppi passaggi tool senza una risposta finale.');
}
