import { createClient } from '@supabase/supabase-js';

const ANTHROPIC_MODEL = 'claude-sonnet-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export const TOOLS = [
  { type: 'web_search_20250305', name: 'web_search' },
  {
    name: 'query_supabase',
    description:
      'Esegue una query di sola lettura (SELECT) su una tabella Supabase del progetto configurato. Usa questo tool per rispondere a domande sui dati salvati (clienti, ordini, utenti, ecc).',
    input_schema: {
      type: 'object',
      properties: {
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
      required: ['table'],
    },
  },
];

export const SYSTEM_PROMPT = `Sei Jarvis, l'assistente personale operativo di Heheh, un imprenditore italiano che gestisce più progetti (BuroPass, Ordina Ora, Real One Hub, un servizio video AI per host Airbnb, e altre iniziative in corso).
Rispondi sempre in italiano, in modo diretto e concreto, come un capo staff efficiente.
Usa il tool "web_search" quando serve un'informazione aggiornata o esterna.
Usa il tool "query_supabase" quando la richiesta riguarda dati salvati nel suo database (solo letture, mai scritture).
Se un tool restituisce un errore, spiegalo in una riga e proponi come risolverlo.
Sii sintetico: vai dritto al punto, evita preamboli.`;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function runSupabaseQuery({ table, select, filters, limit }) {
  const client = getSupabaseClient();
  if (!client) {
    return { error: 'Supabase non configurato su questo deploy (variabili SUPABASE_URL / SUPABASE_SERVICE_KEY mancanti).' };
  }
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
    const { data, error } = await q;
    if (error) return { error: error.message };
    return { data };
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
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
    }

    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }
  }

  throw new Error('Troppi passaggi tool senza una risposta finale.');
}
