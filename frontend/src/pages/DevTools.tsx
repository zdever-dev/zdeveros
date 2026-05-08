// frontend/src/pages/DevTools.tsx
import { useEffect, useState, useCallback } from 'react';
import { devtoolsApi } from '../api';
import { useAuth } from '../context/AuthContext';

const STATUS_COLOR = (s: number) => {
  if (s < 300) return 'var(--green)';
  if (s < 400) return 'var(--blue)';
  if (s < 500) return 'var(--amber)';
  return 'var(--red)';
};

export default function DevTools() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'logs'|'db'|'system'|'api-test'>('logs');
  const [logs, setLogs] = useState<any[]>([]);
  const [dbStats, setDbStats] = useState<any>(null);
  const [sysInfo, setSysInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // API test
  const [testMethod, setTestMethod] = useState('GET');
  const [testPath, setTestPath] = useState('/api/health');
  const [testBody, setTestBody] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const loadLogs = useCallback(async () => {
    const r = await devtoolsApi.logs(200);
    setLogs(r.data || []);
  }, []);

  const loadDbStats = useCallback(async () => {
    const r = await devtoolsApi.dbStats();
    setDbStats(r);
  }, []);

  const loadSystem = useCallback(async () => {
    const r = await devtoolsApi.system();
    setSysInfo(r);
  }, []);

  useEffect(() => {
    if (tab === 'logs')   loadLogs();
    if (tab === 'db')     loadDbStats();
    if (tab === 'system') loadSystem();
  }, [tab]);

  // Auto-refresh logů
  useEffect(() => {
    if (!autoRefresh || tab !== 'logs') return;
    const interval = setInterval(loadLogs, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh, tab, loadLogs]);

  const clearLogs = async () => {
    await devtoolsApi.clearLogs();
    setLogs([]); flash('✅ Logy vymazány');
  };

  const seedDemo = async () => {
    setLoading(true);
    try {
      const r = await devtoolsApi.seedDemo();
      flash(r.message || `✅ Vytvořeno ${r.created} demo zakázek`);
    } catch (e: any) { flash(`⚠️ ${e.message}`); }
    setLoading(false);
  };

  const runApiTest = async () => {
    setTestLoading(true);
    const start = Date.now();
    try {
      const token = localStorage.getItem('zdever-auth-token');
      const res = await fetch(testPath, {
        method: testMethod,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: ['POST','PUT','PATCH'].includes(testMethod) && testBody ? testBody : undefined,
      });
      const data = await res.json().catch(() => res.text());
      setTestResult({ status: res.status, ok: res.ok, data, duration: Date.now() - start });
    } catch (e: any) {
      setTestResult({ error: e.message, duration: Date.now() - start });
    }
    setTestLoading(false);
  };

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button onClick={() => setTab(id)} style={{
      padding: '8px 16px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--rule)',
      background: tab===id ? 'var(--navy)' : 'var(--white)', color: tab===id ? '#fff' : 'var(--muted)',
      fontWeight: 600, fontSize: 13, cursor: 'pointer',
    }}>{label}</button>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dev nástroje</div>
          <div className="page-subtitle">Přístup jen pro: {user?.username} 🔐</div>
        </div>
        <button className="btn btn-secondary" onClick={seedDemo} disabled={loading}>
          {loading ? <div className="spinner" /> : '🧪 Vložit demo data'}
        </button>
      </div>

      {msg && <div className="alert alert-success" style={{ marginBottom: 16 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <TabBtn id="logs"     label="📋 API Logy" />
        <TabBtn id="db"       label="💾 Databáze" />
        <TabBtn id="system"   label="🖥️ Systém" />
        <TabBtn id="api-test" label="🔧 API Test" />
      </div>

      {/* ─── LOGY ──────────────────────────────────────────────── */}
      {tab === 'logs' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={loadLogs}>🔄 Obnovit</button>
            <button className="btn btn-danger btn-sm" onClick={clearLogs}>🗑️ Vymazat logy</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              Auto-refresh (2s)
            </label>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{logs.length} záznamů</span>
          </div>

          {logs.length === 0 ? (
            <div className="empty-state card"><div className="empty-icon">📋</div><p>Žádné logy</p></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                <thead>
                  <tr><th>#</th><th>Čas</th><th>Metoda</th><th>Path</th><th>Status</th><th>ms</th><th>User</th><th>IP</th></tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id}>
                      <td style={{ color: 'var(--muted)', fontSize: 10 }}>{l.id}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 10 }}>{new Date(l.ts).toLocaleTimeString('cs-CZ')}</td>
                      <td><span style={{ color: l.method === 'GET' ? 'var(--blue)' : l.method === 'DELETE' ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>{l.method}</span></td>
                      <td style={{ color: 'var(--text)' }}>{l.path}</td>
                      <td><span style={{ color: STATUS_COLOR(l.status), fontWeight: 700 }}>{l.status}</span></td>
                      <td style={{ color: l.duration_ms > 200 ? 'var(--amber)' : 'var(--muted)' }}>{l.duration_ms}</td>
                      <td style={{ color: 'var(--muted)' }}>{l.user}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 10 }}>{l.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── DB STATS ──────────────────────────────────────────── */}
      {tab === 'db' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <button className="btn btn-secondary btn-sm" onClick={loadDbStats}>🔄 Obnovit</button>
            {dbStats?.db_size && (
              <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                💾 Velikost DB: <b style={{ color: 'var(--navy)' }}>{dbStats.db_size}</b>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 10 }}>
            {dbStats?.tables?.map((t: any) => (
              <div key={t.table} style={{ background: 'var(--white)', border: '1px solid var(--rule)', borderRadius: 'var(--r-sm)', padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{t.table}</div>
                <div style={{ fontFamily: 'var(--font-d)', fontSize: 28, fontWeight: 800, color: t.rows > 0 ? 'var(--navy)' : 'var(--muted)' }}>
                  {t.rows === -1 ? '—' : t.rows}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>řádků</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── SYSTEM ────────────────────────────────────────────── */}
      {tab === 'system' && sysInfo && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>🖥️ Proces</div>
            {[
              ['Node.js', sysInfo.node_version],
              ['Platform', `${sysInfo.platform} (${sysInfo.arch})`],
              ['Uptime', sysInfo.uptime_human],
              ['PID', sysInfo.pid],
              ['Environment', sysInfo.env],
            ].map(([l,v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>
                <span className="td-muted">{l}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>💾 Paměť</div>
            {[
              ['RSS', `${sysInfo.memory?.rss_mb} MB`],
              ['Heap použito', `${sysInfo.memory?.heap_used_mb} MB`],
              ['Heap celkem', `${sysInfo.memory?.heap_total_mb} MB`],
              ['RAM celkem', `${sysInfo.os?.total_mem_mb} MB`],
              ['RAM volná', `${sysInfo.os?.free_mem_mb} MB`],
            ].map(([l,v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>
                <span className="td-muted">{l}</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title" style={{ marginBottom: 14 }}>🌐 Síťová rozhraní (LAN adresy)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sysInfo.network?.map((n: any) => (
                <div key={n.address} style={{ background: 'var(--light)', padding: '8px 14px', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)', marginRight: 8 }}>{n.name}</span>
                  <b style={{ fontFamily: 'monospace', color: 'var(--navy)' }}>{n.address}</b>
                  <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>({n.family})</span>
                </div>
              ))}
            </div>
            <div className="form-hint" style={{ marginTop: 10 }}>
              📱 Na LAN přistupuj přes: <b>http://[IP adresa]:3001</b> (z telefonu/tabletu)
            </div>
          </div>
        </div>
      )}

      {/* ─── API TEST ───────────────────────────────────────────── */}
      {tab === 'api-test' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>🔧 Test API endpointu</div>
            <div className="form-row" style={{ marginBottom: 10 }}>
              <div className="form-group">
                <label className="form-label">Metoda</label>
                <select className="form-select" value={testMethod} onChange={e => setTestMethod(e.target.value)}>
                  {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">URL / Path</label>
                <input className="form-input" value={testPath} onChange={e => setTestPath(e.target.value)} placeholder="/api/..." style={{ fontFamily: 'monospace' }} />
              </div>
            </div>
            {['POST','PUT','PATCH'].includes(testMethod) && (
              <div className="form-group">
                <label className="form-label">Body (JSON)</label>
                <textarea className="form-textarea" rows={5} value={testBody} onChange={e => setTestBody(e.target.value)}
                  placeholder='{"key": "value"}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
              </div>
            )}
            <button className="btn btn-primary" onClick={runApiTest} disabled={testLoading}>
              {testLoading ? <div className="spinner" /> : '▶ Odeslat request'}
            </button>

            {/* Quick links */}
            <div style={{ marginTop: 16 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>Rychlé testy:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  ['/api/health','GET'],
                  ['/api/auth/me','GET'],
                  ['/api/orders/stats','GET'],
                  ['/api/devtools/system','GET'],
                ].map(([path, method]) => (
                  <button key={path} className="btn btn-ghost btn-sm" style={{ fontFamily: 'monospace', fontSize: 11 }}
                    onClick={() => { setTestPath(path); setTestMethod(method); }}>
                    {method} {path}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>📨 Odpověď</div>
            {testResult ? (
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: STATUS_COLOR(testResult.status || 0), fontSize: 20 }}>
                    {testResult.status || 'ERR'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
                    {testResult.duration}ms
                  </span>
                  {testResult.error && <span style={{ color: 'var(--red)', fontSize: 12 }}>⚠️ {testResult.error}</span>}
                </div>
                <pre style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, fontSize: 11, overflowX: 'auto', maxHeight: 400, lineHeight: 1.5, fontFamily: 'monospace', color: 'var(--text)' }}>
                  {JSON.stringify(testResult.data, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 20 }}>
                <div className="empty-icon">📭</div>
                <p style={{ fontSize: 13 }}>Odešli request pro zobrazení odpovědi</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}