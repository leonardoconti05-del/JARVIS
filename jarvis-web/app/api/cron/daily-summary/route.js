import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Jarvis Operations Manager — riepilogo giornaliero su ai-setup-agency.
//
// Prima versione: contava solo le nuove richieste. Questa versione aggiunge
// tre fonti in più, tutte reali (nessun numero stimato o inventato):
// 1. Errori registrati in event_log nelle ultime 24h (migrations/004_observability.sql
//    del progetto ai-setup-agency-webhook) — così un problema tecnico si vede
//    qui invece che solo scoprendolo da un cliente che si lamenta.
// 2. Conversazioni ferme da oltre 72 ore senza completarsi — potenziali lead
//    persi, utile per un follow-up manuale mirato anche se i follow-up
//    automatici (migrations/006_follow_up.sql) non sono attivi per quel cliente.
// 3. Clienti vicini al proprio limite mensile di messaggi (rischio di
//    interruzione del servizio o di costo imprevisto).
//
// Ogni sezione è in un try/catch separato: se una fonte fallisce (es. una
// tabella non ancora presente su un deploy non aggiornato), le altre
// continuano comunque a essere calcolate — un riepilogo parziale è meglio
// di nessun riepilogo.

const SUMMARY_ID = 'ai_setup_agency_daily';

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

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sezioni = [];

  // ===== 1. Nuove richieste nelle ultime 24h =====
  try {
    const { data, error, count } = await source
      .from('richieste_clienti')
      .select('*, clienti(nome_attivita)', { count: 'exact' })
      .gte('updated_at', since24h)
      .order('updated_at', { ascending: false })
      .limit(5);
    if (error) throw error;

    const totale = count ?? data?.length ?? 0;
    if (totale === 0) {
      sezioni.push('Nessuna nuova richiesta nelle ultime 24 ore.');
    } else {
      const preview = (data || [])
        .map((row) => {
          const nomeAttivita = row.clienti?.nome_attivita || 'Attività sconosciuta';
          const dati = row.dati_raccolti || {};
          const campiTesto = Object.entries(dati)
            .filter(([k]) => k !== 'urgente' && !k.startsWith('_'))
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          const statoLabel = row.stato === 'urgente' ? '🚨 URGENTE' : row.stato === 'completata' ? '✅ Completata' : '⏳ In corso';
          return `  - [${nomeAttivita}] ${statoLabel} — ${campiTesto || 'nessun dato'} (tel: ${row.numero_utente || '?'})`;
        })
        .join('\n');
      sezioni.push(`📋 ${totale} richiesta/e nelle ultime 24 ore:\n${preview}`);
    }
  } catch (e) {
    console.error('daily-summary richieste error:', e);
    sezioni.push(`⚠️ Impossibile leggere richieste_clienti: ${String(e.message || e)}`);
  }

  // ===== 2. Errori in event_log (observability) =====
  try {
    const { data: errori, error: errEventLog } = await source
      .from('event_log')
      .select('fase, cliente_id, created_at')
      .gte('created_at', since24h)
      .eq('stato', 'errore')
      .order('created_at', { ascending: false })
      .limit(200);
    if (errEventLog) throw errEventLog;

    if (errori && errori.length > 0) {
      const perFase = {};
      for (const e of errori) perFase[e.fase] = (perFase[e.fase] || 0) + 1;
      const dettagli = Object.entries(perFase)
        .sort((a, b) => b[1] - a[1])
        .map(([fase, n]) => `${fase} (${n})`)
        .join(', ');
      sezioni.push(`🔴 ${errori.length} errore/i registrato/i nelle ultime 24 ore, per fase: ${dettagli}.`);
    } else {
      sezioni.push('🟢 Nessun errore registrato nelle ultime 24 ore (event_log).');
    }
  } catch (e) {
    // Non bloccante: la tabella event_log potrebbe non esistere ancora su
    // un deploy non aggiornato — il resto del riepilogo prosegue comunque.
    console.error('daily-summary event_log error (sezione saltata):', e);
  }

  // ===== 3. Lead fermi da oltre 72 ore (potenziali conversioni perse) =====
  try {
    const da72oreFa = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { data: fermi, error: errFermi } = await source
      .from('richieste_clienti')
      .select('numero_utente, updated_at, clienti(nome_attivita)')
      .eq('stato', 'in_corso')
      .lt('updated_at', da72oreFa)
      .order('updated_at', { ascending: true })
      .limit(20);
    if (errFermi) throw errFermi;

    if (fermi && fermi.length > 0) {
      const esempi = fermi.slice(0, 3).map((f) => f.clienti?.nome_attivita || 'Attività sconosciuta').join(', ');
      sezioni.push(`🟡 ${fermi.length} conversazione/i ferma/e da oltre 72 ore senza completarsi (possibili lead persi) — es. ${esempi}.`);
    }
  } catch (e) {
    console.error('daily-summary lead fermi error (sezione saltata):', e);
  }

  // ===== 4. Clienti vicini al limite mensile di messaggi =====
  try {
    const meseCorrente = new Date().toISOString().slice(0, 7);
    const { data: configurazioni, error: errConfig } = await source
      .from('configurazioni_cliente')
      .select('cliente_id, limite_messaggi_mese, clienti(nome_attivita)')
      .not('limite_messaggi_mese', 'is', null);
    if (errConfig) throw errConfig;

    if (configurazioni && configurazioni.length > 0) {
      const { data: utilizzi } = await source
        .from('utilizzo_mensile')
        .select('cliente_id, conteggio')
        .eq('mese', meseCorrente);
      const utilizzoPerCliente = Object.fromEntries((utilizzi || []).map((u) => [u.cliente_id, u.conteggio]));
      const vicini = configurazioni
        .map((c) => ({ ...c, conteggio: utilizzoPerCliente[c.cliente_id] || 0 }))
        .filter((c) => c.limite_messaggi_mese > 0 && c.conteggio / c.limite_messaggi_mese >= 0.7);
      if (vicini.length > 0) {
        const dettagli = vicini
          .map((c) => `${c.clienti?.nome_attivita || 'Attività sconosciuta'} (${c.conteggio}/${c.limite_messaggi_mese})`)
          .join(', ');
        sezioni.push(`🟡 Clienti vicini al limite mensile di messaggi (≥70%): ${dettagli}.`);
      }
    }
  } catch (e) {
    console.error('daily-summary limite mensile error (sezione saltata):', e);
  }

  const summary = sezioni.join('\n\n');

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
