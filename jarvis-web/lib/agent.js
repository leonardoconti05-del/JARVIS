import { createClient } from '@supabase/supabase-js';

const ANTHROPIC_MODEL = 'claude-sonnet-5';
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

export const TOOLS = [
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
Sii sintetico: vai dritto al punto, evita preamboli.`;

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
      if (block.name === 'query_supabase') {
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
