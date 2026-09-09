'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'agent',
      text: "Pronto. Posso cercare informazioni sul web o interrogare il tuo database Supabase.",
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('ready');
  const [activity, setActivity] = useState([]);
  const [dailySummary, setDailySummary] = useState(null);
  const historyRef = useRef([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    fetch('/api/summary')
      .then((r) => r.json())
      .then((d) => {
        if (d.summary) setDailySummary(d);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setMessages((m) => [...m, { role: 'user', text }]);
    historyRef.current.push({ role: 'user', content: text });
    setInput('');
    setBusy(true);
    setStatus('busy');
    setMessages((m) => [...m, { role: 'agent', text: '', pending: true }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: historyRef.current }),
      });
      const data = await res.json();

      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = data.error
          ? { role: 'agent', text: data.error, error: true }
          : { role: 'agent', text: data.text || '(nessuna risposta)' };
        return copy;
      });

      if (!data.error) {
        historyRef.current.push({ role: 'assistant', content: data.text || '' });
        if (data.toolLog?.length) {
          setActivity((a) => [...data.toolLog.map((t) => ({ ...t, id: Math.random() })).reverse(), ...a]);
        }
        setStatus('ready');
      } else {
        setStatus('error');
      }
    } catch (err) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'agent', text: String(err.message || err), error: true };
        return copy;
      });
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.frame}>
      <header style={styles.topbar}>
        <div style={styles.brand}>
          <span style={{ ...styles.dot, ...(status === 'ready' ? styles.dotReady : status === 'busy' ? styles.dotBusy : styles.dotError) }} />
          <span style={styles.brandName}>JARVIS</span>
          <span style={styles.brandSub}>agente operativo</span>
        </div>
      </header>

      <div style={styles.body}>
        <aside style={styles.rail}>
          <div style={styles.railTitle}>Attività</div>
          {activity.length === 0 ? (
            <div style={styles.railEmpty}>Nessuna azione ancora. Chiedi qualcosa a Jarvis.</div>
          ) : (
            activity.map((a) => (
              <div key={a.id} style={styles.railItem}>
                <div style={styles.railItemTool}>{a.tool}</div>
                <div style={styles.railItemDetail}>{JSON.stringify(a.input)}</div>
              </div>
            ))
          )}
        </aside>

        <main style={styles.chat}>
          <div style={styles.messages}>
            {dailySummary && (
              <div style={styles.summaryBanner}>
                <div style={styles.summaryTitle}>Controllo automatico — ai-setup-agency</div>
                <div style={styles.summaryBody}>{dailySummary.summary}</div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ ...styles.msg, ...(m.role === 'user' ? styles.msgUser : {}) }}>
                <div style={{ ...styles.msgRole, ...(m.role === 'user' ? { textAlign: 'right' } : {}) }}>
                  {m.role === 'user' ? 'Tu' : 'Jarvis'}
                </div>
                <div
                  style={{
                    ...styles.msgBody,
                    ...(m.role === 'user' ? styles.msgBodyUser : {}),
                    ...(m.error ? styles.msgBodyError : {}),
                  }}
                >
                  {m.pending ? '…' : m.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSubmit} style={styles.composer}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Chiedi a Jarvis di cercare, verificare o controllare qualcosa…"
              style={styles.composerInput}
              autoFocus
            />
            <button type="submit" disabled={busy} style={styles.composerButton}>
              Invia
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

const styles = {
  frame: { display: 'flex', flexDirection: 'column', height: '100vh' },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  brand: { display: 'flex', alignItems: 'baseline', gap: 8 },
  brandName: { fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '0.14em' },
  brandSub: { fontSize: 12, color: 'var(--text-muted)' },
  dot: { width: 7, height: 7, borderRadius: '50%', display: 'inline-block' },
  dotReady: { background: 'var(--ok)', boxShadow: '0 0 6px var(--ok)' },
  dotBusy: { background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' },
  dotError: { background: 'var(--err)', boxShadow: '0 0 6px var(--err)' },
  body: { display: 'flex', flex: 1, minHeight: 0 },
  rail: {
    width: 230,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    background: 'var(--panel)',
    padding: '16px 14px',
    overflowY: 'auto',
  },
  railTitle: { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 10 },
  railEmpty: { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 },
  railItem: { border: '1px solid var(--border)', borderRadius: 5, padding: '8px 9px', marginBottom: 8, background: 'var(--panel-2)' },
  railItemTool: { fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', marginBottom: 4 },
  railItemDetail: { fontSize: 11.5, color: 'var(--text-muted)', wordBreak: 'break-word' },
  chat: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  messages: { flex: 1, overflowY: 'auto', padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 18 },
  summaryBanner: {
    border: '1px solid var(--accent-dim)',
    background: 'var(--panel-2)',
    borderRadius: 5,
    padding: '10px 13px',
    maxWidth: 620,
  },
  summaryTitle: {
    fontFamily: 'var(--mono)',
    fontSize: 10.5,
    letterSpacing: '0.08em',
    color: 'var(--accent)',
    marginBottom: 6,
  },
  summaryBody: {
    fontSize: 13.5,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    color: 'var(--text)',
  },
  msg: { maxWidth: 620 },
  msgUser: { alignSelf: 'flex-end' },
  msgRole: { fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 },
  msgBody: {
    fontSize: 14.5,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    padding: '10px 13px',
    borderRadius: 5,
    border: '1px solid var(--border)',
    background: 'var(--panel)',
  },
  msgBodyUser: { background: 'var(--panel-2)', borderColor: 'var(--accent-dim)' },
  msgBodyError: { borderColor: 'var(--err)', color: '#f2b6ae' },
  composer: { display: 'flex', gap: 10, padding: '14px 26px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 },
  composerInput: {
    flex: 1,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 5,
    padding: '11px 13px',
    fontSize: 14,
    fontFamily: 'var(--sans)',
  },
  composerButton: {
    background: 'var(--accent)',
    color: '#1a1206',
    border: 'none',
    borderRadius: 5,
    padding: '0 20px',
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
  },
};