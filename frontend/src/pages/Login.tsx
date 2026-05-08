// frontend/src/pages/Login.tsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      await login(username.trim(), password);
      // Po loginu React Router přesměruje přes RequireAuth → Navigate
      // Settings se načtou automaticky v AppContext po přesměrování
    } catch (err: any) {
      setError(err.message || 'Přihlášení selhalo');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1C2A4A',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', right: -60, bottom: -120,
        fontSize: 500, fontWeight: 900, color: 'rgba(255,255,255,.025)',
        fontFamily: 'serif', userSelect: 'none', lineHeight: 1,
      }}>Z</div>

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, background: '#4A7CC7',
            borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(74,124,199,.4)',
          }}>
            <span style={{ fontSize: 38, fontWeight: 900, color: '#fff' }}>Z</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>
            ZdeVer OS
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', letterSpacing: 4, textTransform: 'uppercase', marginTop: 4 }}>
            Repair · Management System
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,.06)',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 16,
          padding: 32,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 24 }}>
            Přihlášení do systému
          </div>

          {error && (
            <div style={{
              background: 'rgba(220,38,38,.15)',
              border: '1px solid rgba(220,38,38,.3)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
              color: '#fca5a5', fontSize: 13,
            }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 700,
                letterSpacing: 1.5, textTransform: 'uppercase',
                color: 'rgba(255,255,255,.45)', marginBottom: 6,
              }}>
                Uživatelské jméno
              </label>
              <input
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="username"
                style={{
                  width: '100%', padding: '11px 14px',
                  background: 'rgba(255,255,255,.08)',
                  border: '1.5px solid rgba(255,255,255,.15)',
                  borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(74,124,199,.8)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,.15)')}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 700,
                letterSpacing: 1.5, textTransform: 'uppercase',
                color: 'rgba(255,255,255,.45)', marginBottom: 6,
              }}>
                Heslo
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '11px 14px',
                  background: 'rgba(255,255,255,.08)',
                  border: '1.5px solid rgba(255,255,255,.15)',
                  borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(74,124,199,.8)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,.15)')}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              style={{
                width: '100%', padding: 13, background: '#4A7CC7',
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 700,
                cursor: loading || !username || !password ? 'not-allowed' : 'pointer',
                opacity: loading || !username || !password ? 0.6 : 1,
              }}
            >
              {loading ? '⏳ Přihlašuji…' : '🔐 Přihlásit se'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,.2)' }}>
          ZdeVer OS · Repair Management
        </div>
      </div>
    </div>
  );
}