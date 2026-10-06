const CORE_CONTRACT_VERSION = 'core-read-1';

export async function readCoreTenant(clienteId) {
  if (!clienteId) return { error: 'cliente_id obbligatorio.' };
  const baseUrl = process.env.AI_SETUP_CORE_URL;
  const token = process.env.JARVIS_CORE_TOKEN;
  if (!baseUrl || !token) return { error: 'AI Setup Agency Core non configurato su questo deploy.' };
  try {
    const url = new URL('/api/internal/jarvis-read', baseUrl);
    url.searchParams.set('cliente_id', String(clienteId));
    const res = await fetch(url, { method: 'GET', headers: { authorization: 'Bearer ' + token }, cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) return { error: data?.error || ('Core HTTP ' + res.status) };
    if (data?.contract_version !== CORE_CONTRACT_VERSION) return { error: 'Versione contratto Core non supportata.' };
    return { data, read_only: true };
  } catch (error) {
    return { error: String(error.message || error) };
  }
}
