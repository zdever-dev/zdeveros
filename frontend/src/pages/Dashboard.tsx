import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersApi, inventoryApi, accountingApi, devtoolsApi } from '../api';
import { useApp } from '../context/AppContext';

const STATUS_CLASS: Record<string, string> = {
  'Přijato': 'badge badge-blue',
  'Diagnostika': 'badge badge-teal',
  'V opravě': 'badge badge-amber',
  'Čeká na díl': 'badge badge-amber',
  'Hotovo': 'badge badge-green',
  'Vydáno': 'badge badge-muted',
  'Stornováno': 'badge badge-red',
};

function fmt(n: number) {
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: 0 });
}

export default function Dashboard() {
  const { settings } = useApp();
  const [stats, setStats] = useState<any>(null);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [accounting, setAccounting] = useState<any>(null);
  const [dbHealth, setDbHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    ordersApi.stats().then(s => { setStats(s); setLoading(false); }).catch(() => setLoading(false));
    if (settings.low_stock_dashboard_alerts !== 'false') {
      inventoryApi.lowStock().then((d: any[]) => setLowStock(d || [])).catch(() => {});
    }
    accountingApi.overview().then(setAccounting).catch(() => {});
    devtoolsApi.dbStats().then(setDbHealth).catch(() => {});
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>;

  const revenue = stats?.revenue || {};
  const byStatus: Record<string, number> = stats?.by_status || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dobrý den 👋</div>
          <div className="page-subtitle">
            {settings.company_name || 'ZdeVer Repair'} — přehled dne
          </div>
        </div>
        <Link to="/orders/new" className="btn btn-primary">+ Nová zakázka</Link>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card" style={{ '--accent': 'var(--blue)' } as any}>
          <div className="stat-label">Otevřené zakázky</div>
          <div className="stat-value">{stats?.open ?? 0}</div>
          <div className="stat-sub">celkem {stats?.total ?? 0} zakázek</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--green)' } as any}>
          <div className="stat-label">Hotovo dnes</div>
          <div className="stat-value">{stats?.done_today ?? 0}</div>
          <div className="stat-sub">dokončených dnes</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--amber)' } as any}>
          <div className="stat-label">Čeká na vyzvednutí</div>
          <div className="stat-value">{stats?.waiting_pickup ?? 0}</div>
          <div className="stat-sub">hotových zakázek</div>
        </div>
        <div className="stat-card" style={{ '--accent': '#0e7490' } as any}>
          <div className="stat-label">Příjmy dnes</div>
          <div className="stat-value">{fmt(revenue.today ?? 0)}</div>
          <div className="stat-sub">{settings.currency || 'Kč'}</div>
        </div>
        <div className="stat-card" style={{ '--accent': '#7c3aed' } as any}>
          <div className="stat-label">Příjmy tento týden</div>
          <div className="stat-value">{fmt(revenue.this_week ?? 0)}</div>
          <div className="stat-sub">{settings.currency || 'Kč'}</div>
        </div>
        <div className="stat-card" style={{ '--accent': '#059669' } as any}>
          <div className="stat-label">Příjmy tento měsíc</div>
          <div className="stat-value">{fmt(revenue.this_month ?? 0)}</div>
          <div className="stat-sub">{settings.currency || 'Kč'}</div>
        </div>
        {(stats?.active_claims ?? 0) > 0 && (
          <div className="stat-card" style={{ '--accent': 'var(--red)' } as any}>
            <div className="stat-label">Aktivní reklamace</div>
            <div className="stat-value">{stats.active_claims}</div>
            <div className="stat-sub"><a href="/warranty" style={{ color:'var(--red)', textDecoration:'none' }}>zobrazit →</a></div>
          </div>
        )}
        {(stats?.warranty_expiring_soon ?? 0) > 0 && (
          <div className="stat-card" style={{ '--accent': 'var(--amber)' } as any}>
            <div className="stat-label">Záruky vyprší do 14 dní</div>
            <div className="stat-value">{stats.warranty_expiring_soon}</div>
            <div className="stat-sub"><a href="/warranty" style={{ color:'var(--amber)', textDecoration:'none' }}>zkontrolovat →</a></div>
          </div>
        )}
      </div>
      

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        {/* Recent orders */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Poslední zakázky</div>
            <Link to="/orders" className="btn btn-ghost btn-sm">Zobrazit vše →</Link>
          </div>
          {stats?.recent_orders?.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Č. zakázky</th>
                    <th>Zákazník</th>
                    <th>Zařízení</th>
                    <th>Status</th>
                    <th>Cena</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_orders.map((o: any) => (
                    <tr key={o.id}>
                      <td><Link to={`/orders/${o.id}`} className="td-mono" style={{ color: 'var(--blue)', textDecoration: 'none' }}>{o.order_number}</Link></td>
                      <td>{o.customer_name}</td>
                      <td className="td-muted">{o.device_type}{o.device_model ? ` — ${o.device_model}` : ''}</td>
                      <td><span className={STATUS_CLASS[o.status] || 'badge badge-muted'}>{o.status}</span></td>
                      <td className="text-money">{fmt(o.total_price)} {settings.currency || 'Kč'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state"><div className="empty-icon">📋</div><p>Žádné zakázky zatím</p></div>
          )}
        </div>

        {/* Status breakdown + quick links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header"><div className="card-title">Zakázky dle statusu</div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(byStatus).filter(([,v]) => v > 0).map(([status, count]) => (
                <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={STATUS_CLASS[status] || 'badge badge-muted'}>{status}</span>
                  <span style={{ fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: 18, color: 'var(--navy)' }}>{count}</span>
                </div>
              ))}
              {Object.values(byStatus).every(v => v === 0) && (
                <p className="text-muted" style={{ fontSize: 13 }}>Žádné zakázky</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Rychlé akce</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link to="/orders/new"    className="btn btn-primary">🔧 Nová zakázka</Link>
              <Link to="/invoicing"     className="btn btn-secondary">🧾 Fakturace</Link>
              <Link to="/inventory"     className="btn btn-secondary">📦 Sklad</Link>
              <Link to="/accounting"    className="btn btn-secondary">📈 Účetnictví</Link>
            </div>
          </div>

          {/* Účetnictví → Dashboard: daňový odhad */}
          {accounting?.tax_estimate && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 10 }}>🧮 Daňový odhad {accounting.year}</div>
              {[
                ['Příjmy celkem', `${fmt(accounting.income?.total || 0)} ${settings.currency || 'Kč'}`],
                ['Odhadovaná daň', `${fmt(accounting.tax_estimate?.estimated_tax || 0)} ${settings.currency || 'Kč'}`],
                ['Odhadovaný čistý příjem', `${fmt(accounting.tax_estimate?.estimated_net || 0)} ${settings.currency || 'Kč'}`],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--rule)' }}>
                  <span style={{ color: 'var(--muted)' }}>{l}</span><span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* DevTools → Dashboard: health widget */}
          {dbHealth && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 10 }}>🖥️ Systém</div>
              <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: 'var(--muted)' }}>Velikost DB</span>
                <span style={{ fontWeight: 600 }}>{dbHealth.db_size}</span>
              </div>
              {(dbHealth.tables || []).filter((t: any) => t.rows > 0).slice(0, 5).map((t: any) => (
                <div key={t.table} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: 'var(--muted)' }}>
                  <span>{t.table}</span><span>{t.rows} záznamů</span>
                </div>
              ))}
            </div>
          )}

          {/* Sklad → Dashboard: low stock alerty */}
          {lowStock.length > 0 && settings.low_stock_dashboard_alerts !== 'false' && (
            <div className="card" style={{ borderLeft: '3px solid var(--amber)' }}>
              <div className="card-title" style={{ marginBottom: 8 }}>⚠️ Nízké zásoby ({lowStock.length})</div>
              {lowStock.slice(0, 5).map((p: any) => (
                <div key={p.id} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--rule)' }}>
                  <span>{p.name}</span>
                  <span style={{ color: 'var(--red)', fontWeight: 600 }}>{p.quantity}/{p.min_quantity} ks</span>
                </div>
              ))}
              {lowStock.length > 5 && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>+{lowStock.length - 5} dalších</div>}
              <Link to="/inventory" style={{ fontSize: 12, color: 'var(--blue)', display: 'block', marginTop: 8 }}>Zobrazit sklad →</Link>
            </div>
          )}

          <div className="card">
            <div className="card-title" style={{ marginBottom: 4 }}>Příjmy rok {new Date().getFullYear()}</div>
            <div style={{ fontFamily: 'var(--font-d)', fontSize: 28, fontWeight: 800, color: 'var(--navy)', marginTop: 8 }}>
              {fmt(revenue.this_year ?? 0)} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}>{settings.currency || 'Kč'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
