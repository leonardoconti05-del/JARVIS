# Jarvis — web app

Assistente personale che cerca sul web e interroga Supabase in sola lettura.
Deploy su Vercel, protetto da password. Nessuna installazione richiesta.

## Deploy (tutto dal browser, nessun Terminale)

1. Vai su github.com, crea un nuovo repository (es. "jarvis"), pubblico o privato.
2. Nella pagina del repo vuoto, usa "uploading an existing file" e trascina dentro
   tutto il contenuto di questa cartella (tranne node_modules, che non esiste qui).
3. Vai su vercel.com, accedi con GitHub, "Add New Project", scegli il repo "jarvis".
4. Prima di premere Deploy, apri "Environment Variables" e aggiungi:
   - ANTHROPIC_API_KEY  → la tua chiave da console.anthropic.com
   - SITE_PASSWORD      → una password a scelta tua per accedere all'app
   - Per ogni progetto Supabase che vuoi collegare (vedi lib/agent.js → SUPABASE_PROJECTS
     per l'elenco), aggiungi la coppia di variabili corrispondente, es:
     SUPABASE_URL_BUROFACILE / SUPABASE_SERVICE_KEY_BUROFACILE
     SUPABASE_URL_AI_SETUP / SUPABASE_SERVICE_KEY_AI_SETUP
     (service_role key, NON la anon key — la trovi in Supabase → Project Settings → API)

Per aggiungere un nuovo progetto in futuro, basta aggiungere una voce nell'oggetto
SUPABASE_PROJECTS in lib/agent.js con un nome breve e i nomi delle due variabili
d'ambiente, poi aggiungere quelle variabili su Vercel.
5. Premi Deploy. In 1-2 minuti avrai un link tipo jarvis-tuonome.vercel.app.
6. Apri il link, inserisci la SITE_PASSWORD che hai scelto, ed è pronto.

## Note di sicurezza

- La service_role key di Supabase bypassa le Row Level Security policy — sta solo
  sul server (Vercel), mai esposta al browser.
- Jarvis può leggere (SELECT) e scrivere (INSERT/UPDATE) sulle tabelle dei progetti
  configurati, ma non può mai cancellare righe (nessun DELETE è implementato).
- Cambia SITE_PASSWORD quando vuoi da Vercel → Settings → Environment Variables,
  poi rideploya (Vercel → Deployments → tre puntini → Redeploy).
