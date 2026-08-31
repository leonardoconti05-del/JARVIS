'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Errore di accesso.');
        setLoading(false);
        return;
      }
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(String(err.message || err));
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.title}>JARVIS</div>
        <div style={styles.sub}>accesso riservato</div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={styles.input}
          autoFocus
        />
        {error && <div style={styles.error}>{error}</div>}
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Verifica…' : 'Entra'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 300,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  title: {
    fontFamily: 'var(--mono)',
    fontSize: 15,
    letterSpacing: '0.16em',
  },
  sub: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: -8,
  },
  input: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 5,
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'var(--mono)',
  },
  error: {
    color: 'var(--err)',
    fontSize: 12.5,
  },
  button: {
    background: 'var(--accent)',
    color: '#1a1206',
    border: 'none',
    borderRadius: 5,
    padding: '10px 0',
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
