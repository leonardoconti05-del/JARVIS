import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUMMARY_ID = 'ai_setup_agency_daily';
const TABLE = 'richieste_pazienti';
const TIMESTAMP_COLUMN = 'created_at';

function getClient(urlEnv, keyEnv) {
  const url = process.env[urlEnv];
  const key = process.env[keyEnv];
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Non autorizzato.' }, { status: 401 });
    }
  }

  const source = getClient('SUPABASE_URL_AI_SETUP', 'SUPABASE_SERVICE_KEY_AI_SETUP');
  if (!source) {
    return NextResponse.json({ error: 'Progetto ai-setup-agency non configurato.' }, { status: 500 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let summary;

  try {
    const { data, error, count } = await source
      .from(TABLE)
      .select('*', { count: 'exact' })
      .gte(TIMESTAMP_COLUMN, since)
      .order(TIMESTAMP_COLUMN, { ascending: false })
      .limit(5);

    if (error) throw error;

    const total = count ?? data?.length ?? 0;
    if (total === 0) {
      summary = 'Nessuna nuova richiesta su ai-setup-agency nelle ultime 24 ore.';
    } else {
      const preview = (data || [])
        .map((row) => {
          const bits = Object.entries(row)
            .filter(([k]) => k !== TIMESTAMP_COLUMN)
            .slice(0, 4)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          return `- ${bits}`;
        })
        .join('\n');
      summary = `${total} nuova/e richiesta/e nelle ultime 24 ore su ai-setup-agency.\nUltime:\n${preview}`;
    }
  } catch (e) {
    console.error('daily-summary query error:', e);
    summary = `Controllo automatico fallito: ${String(e.message || e)}. Controlla che la tabella "${TABLE}" e la colonna "${TIMESTAMP_COLUMN}" esistano con questo nome esatto.`;
  }

  try {
    const { error: upsertErr } = await source
      .from('jarvis_summaries')
      .upsert({ id: SUMMARY_ID, summary, generated_at: new Date().toISOString() });
    if (upsertErr) throw upsertErr;
  } catch (e) {
    console.error('daily-summary upsert error:', e);
    return NextResponse.json({ error: `Riepilogo generato ma non salvato: ${String(e.message || e)}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, summary });
}
