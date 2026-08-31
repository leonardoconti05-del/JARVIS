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
   - SUPABASE_URL       → URL del progetto (Supabase → Project Settings → API)
   - SUPABASE_SERVICE_KEY → service_role key (stessa pagina, NON la anon key)
   - SITE_PASSWORD      → una password a scelta tua per accedere all'app
5. Premi Deploy. In 1-2 minuti avrai un link tipo jarvis-tuonome.vercel.app.
6. Apri il link, inserisci la SITE_PASSWORD che hai scelto, ed è pronto.

## Note di sicurezza

- La service_role key di Supabase bypassa le Row Level Security policy — sta solo
  sul server (Vercel), mai esposta al browser.
- L'app accetta solo query SELECT verso Supabase, mai scritture.
- Cambia SITE_PASSWORD quando vuoi da Vercel → Settings → Environment Variables,
  poi rideploya (Vercel → Deployments → tre puntini → Redeploy).
