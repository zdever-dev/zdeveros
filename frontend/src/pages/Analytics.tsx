// frontend/src/pages/Analytics.tsx — C-06 Analytics & Reporting
import { useEffect, useState } from 'react';
import { analyticsApi } from '../api';
import { useApp } from '../context/AppContext';
import { useCallback } from 'react';

const fmt = (n: number) => Math.round(n || 0).toLocaleString('cs-CZ');
const fmtDec = (n: number) => (n || 0).toFixed(1);

const MONTH_NAMES = ['Leden','Únor','Březen','Duben','Květen','Červen',
  'Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];

function StatCard({ label, value, sub, color = 'var(--blue)' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1, marginBottom: sub ? 4 : 0 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Inline SVG bar chart — no external deps
function BarChart({ data, color = '#4A7CC7' }: {
  data: { label: string; value: number }[]; color?: string;
}) {
  if (!data.length) return <div style={{ color: 'var(--muted)', fontSize: 13, padding: 12 }}>Žádná data</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const H = 120, W = Math.max(data.length * 40, 300), barW = 28;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H + 40} style={{ display: 'block' }}>
        {data.map((d, i) => {
          const barH = Math.max((d.value / max) * H, 2);
          const x = i * 40 + 6;
          return (
            <g key={i}>
              <rect x={x} y={H - barH} width={barW} height={barH} fill={color} rx={3} opacity={0.85} />
              <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize={9} fill="var(--muted)">{d.label}</text>
              {d.value > 0 && (
                <text x={x + barW / 2} y={H - barH - 3} textAnchor="middle" fontSize={8} fill={color} fontWeight="700">
                  {fmt(d.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Analytics() {
  const { settings } = useApp();
  const cur = settings.currency || 'Kč';
  const now = new Date();

  const [period, setPeriod] = useState<'month' | 'year' | 'custom'>('year');
  const [from, setFrom] = useState(now.getFullYear() + '-01-01');
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [techData, setTechData] = useState<any>(null);
  const [sourcesData, setSourcesData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [fieldData, setFieldData] = useState<any>(null);
  const [profitData, setProfitData] = useState<any>(null);
  const [custStats, setCustStats] = useState<any>(null);
  const [extTab, setExtTab] = useState<'technicians'|'sources'|'inventory'|'fieldvisits'|'profit'|'customers'>('technicians');
  const [extLoading, setExtLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const q: Record<string, string> = { from, to };
      const r = await analyticsApi.overview(q);
      setData(r);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    const n = new Date();
    if (period === 'year') {
      setFrom(n.getFullYear() + '-01-01');
      setTo(n.toISOString().slice(0, 10));
    } else if (period === 'month') {
      setFrom(n.toISOString().slice(0, 7) + '-01');
      setTo(n.toISOString().slice(0, 10));
    }
  }, [period]);

  useEffect(() => { load(); }, [from, to]);

  const loadExtended = useCallback(async () => {
    setExtLoading(true);
    try {
      const [t, s, iv, fv, pr, cs] = await Promise.all([
        analyticsApi.technicians({ from, to }),
        analyticsApi.sources({ from, to }),
        analyticsApi.inventoryTurnover(),
        analyticsApi.fieldVisits({ from, to }),
        analyticsApi.profitability({ year: from.slice(0, 4) }),
        analyticsApi.customerStats(),
      ]);
      setTechData(t);
      setSourcesData(s);
      setInventoryData(iv || []);
      setFieldData(fv);
      setProfitData(pr);
      setCustStats(cs);
    } catch {}
    setExtLoading(false);
  }, [from, to]);

  useEffect(() => { loadExtended(); }, [from, to]);

  const generateReport = async () => {
    setReportLoading(true);
    try {
      const r = await analyticsApi.report({ from, to });
      if (r.url) window.open(r.url, '_blank');
    } catch {}
    setReportLoading(false);
  };

  // Build monthly bar chart data
  const monthlyChartData = (data?.monthly_avg || []).map((m: any) => ({
    label: MONTH_NAMES[parseInt(m.month?.slice(5, 7)) - 1]?.slice(0, 3) || m.month,
    value: m.revenue || 0,
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Analytics & Reporting</div>
          <div className="page-subtitle">C-06 — Přehledy a statistiky</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Period quick buttons */}
          {(['month', 'year'] as const).map(p => (
            <button key={p} className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPeriod(p)}>
              {p === 'month' ? 'Tento měsíc' : 'Tento rok'}
            </button>
          ))}
          <button className={`btn btn-sm ${period === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPeriod('custom')}>
            Vlastní
          </button>
          <button className="btn btn-primary btn-sm" onClick={generateReport} disabled={reportLoading}>
            {reportLoading ? <div className="spinner" /> : '🖨️ Tisk reportu'}
          </button>
        </div>
      </div>

      {/* Custom date range */}
      {period === 'custom' && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Od</label>
            <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Do</label>
            <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={load}>Načíst</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : !data ? (
        <div className="alert alert-error">Chyba načítání dat</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="stat-grid" style={{ marginBottom: 20 }}>
            <StatCard label="Zakázek celkem" value={fmt(data.summary?.total_orders)} color="var(--navy)" />
            <StatCard label="Tržby (zaplaceno)" value={`${fmt(data.summary?.total_revenue)} ${cur}`} color="var(--green)" />
            <StatCard label="Prům. hodnota zakázky" value={`${fmt(data.summary?.avg_order_value)} ${cur}`} />
            <StatCard label="Otevřené zakázky" value={fmt(data.summary?.open_orders)} color="var(--amber)" />
            <StatCard label="Průměrná délka opravy"
              value={`${fmtDec(data.duration_stats?.avg_days)} dní`}
              sub={`Min: ${fmtDec(data.duration_stats?.min_days)}d · Max: ${fmtDec(data.duration_stats?.max_days)}d`} />
            <StatCard label="Odpracovaný čas (timer)"
              value={data.timer_stats?.total_minutes > 0
                ? `${Math.floor((data.timer_stats?.total_minutes || 0) / 60)}h ${(data.timer_stats?.total_minutes || 0) % 60}min`
                : '—'}
              sub={data.timer_stats?.timed_count ? `${data.timer_stats.timed_count} zakázek s timerem` : undefined} />
          </div>

          {/* Monthly revenue chart */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>📊 Měsíční tržby</div>
            {monthlyChartData.length ? (
              <BarChart data={monthlyChartData} color="#4A7CC7" />
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Žádná data pro vybrané období</div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Popular repairs */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>🔧 Nejpopulárnější opravy</div>
              {(data.popular_repairs || []).length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>Žádná data</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr><th>Typ zařízení</th><th style={{ textAlign: 'right' }}>Počet</th><th style={{ textAlign: 'right' }}>Tržby</th></tr>
                    </thead>
                    <tbody>
                      {(data.popular_repairs || []).map((r: any, i: number) => (
                        <tr key={i}>
                          <td>{r.device_type}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.count}</td>
                          <td style={{ textAlign: 'right' }} className="text-money">{fmt(r.revenue)} {cur}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Top customers */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>👥 Top zákazníci</div>
              {(data.top_customers || []).length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>Žádná data</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr><th>Zákazník</th><th style={{ textAlign: 'right' }}>Zak.</th><th style={{ textAlign: 'right' }}>Celkem</th></tr>
                    </thead>
                    <tbody>
                      {(data.top_customers || []).map((c: any, i: number) => (
                        <tr key={i}>
                          <td>{c.customer_name}</td>
                          <td style={{ textAlign: 'right' }}>{c.order_count}</td>
                          <td style={{ textAlign: 'right' }} className="text-money">{fmt(c.total_spent)} {cur}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Monthly table */}
          {(data.monthly_avg || []).length > 0 && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>📅 Přehled po měsících</div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Měsíc</th><th style={{ textAlign: 'right' }}>Zakázek</th><th style={{ textAlign: 'right' }}>Tržby</th><th style={{ textAlign: 'right' }}>Zaplaceno</th><th style={{ textAlign: 'right' }}>Prům. cena</th></tr>
                  </thead>
                  <tbody>
                    {(data.monthly_avg || []).map((m: any) => {
                      const monthIdx = parseInt(m.month?.slice(5, 7)) - 1;
                      const label = `${MONTH_NAMES[monthIdx] || m.month} ${m.month?.slice(0, 4)}`;
                      return (
                        <tr key={m.month}>
                          <td style={{ fontWeight: 600 }}>{label}</td>
                          <td style={{ textAlign: 'right' }}>{m.count}</td>
                          <td style={{ textAlign: 'right' }} className="text-money">{fmt(m.total_revenue)} {cur}</td>
                          <td style={{ textAlign: 'right' }} className="text-money">{fmt(m.paid_revenue)} {cur}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(m.avg_price)} {cur}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {/* ── Rozšířené analýzy ─────────────────────────────────── */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--rule)', marginBottom: 16 }}>
              {([
                ['technicians', '👷 Technici'],
                ['sources', '📣 Zdroje zákazníků'],
                ['inventory', '📦 Sklad & obrátkovost'],
                ['fieldvisits', '🚗 Výjezdy'],
                ['profit', '💰 Ziskovost'],
                ['customers', '👥 Zákazníci LTV'],
              ] as const).map(([k, l]) => (
                <button key={k} onClick={() => setExtTab(k)} style={{
                  padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  color: extTab === k ? 'var(--blue)' : 'var(--muted)',
                  borderBottom: extTab === k ? '2px solid var(--blue)' : '2px solid transparent',
                  marginBottom: -2, whiteSpace: 'nowrap',
                }}>{l}</button>
              ))}
            </div>

            {extLoading ? <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div> : (
              <>
                {/* Technici */}
                {extTab === 'technicians' && (
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 14 }}>👷 Výkon techniků</div>
                    {!(techData?.technicians?.length) ? <div className="text-muted" style={{ fontSize: 13 }}>Žádní technici s přiřazenými zakázkami</div> : (
                      <div className="table-wrap"><table className="data-table">
                        <thead><tr><th>Technik</th><th style={{textAlign:'right'}}>Zakázek</th><th style={{textAlign:'right'}}>Tržby</th><th style={{textAlign:'right'}}>Prům. čas</th><th style={{textAlign:'right'}}>Reklamace</th></tr></thead>
                        <tbody>
                          {techData.technicians.map((t: any, i: number) => (
                            <tr key={i}>
                              <td><b>{t.technician}</b></td>
                              <td style={{textAlign:'right'}}>{t.order_count}</td>
                              <td style={{textAlign:'right'}} className="text-money">{fmt(t.total_revenue)} {cur}</td>
                              <td style={{textAlign:'right'}}>{t.avg_minutes ? `${Math.round(t.avg_minutes)} min` : '—'}</td>
                              <td style={{textAlign:'right', color: t.claim_count > 0 ? 'var(--red)' : 'inherit'}}>{t.claim_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                    )}
                  </div>
                )}

                {/* Zdroje ROI */}
                {extTab === 'sources' && (
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 14 }}>📣 ROI per zdroj zákazníka</div>
                    {!(sourcesData?.sources?.length) ? <div className="text-muted" style={{ fontSize: 13 }}>Žádná data o zdrojích</div> : (
                      <div className="table-wrap"><table className="data-table">
                        <thead><tr><th>Zdroj</th><th style={{textAlign:'right'}}>Zakázek</th><th style={{textAlign:'right'}}>Zákazníků</th><th style={{textAlign:'right'}}>Tržby</th><th style={{textAlign:'right'}}>Prům. zakázka</th></tr></thead>
                        <tbody>
                          {sourcesData.sources.map((s: any, i: number) => (
                            <tr key={i}>
                              <td><b>{s.source}</b></td>
                              <td style={{textAlign:'right'}}>{s.order_count}</td>
                              <td style={{textAlign:'right'}}>{s.unique_customers}</td>
                              <td style={{textAlign:'right'}} className="text-money">{fmt(s.total_revenue)} {cur}</td>
                              <td style={{textAlign:'right'}}>{fmt(s.avg_order_value)} {cur}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                    )}
                  </div>
                )}

                {/* Sklad — obrátkovost */}
                {extTab === 'inventory' && (
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 14 }}>📦 Obrátkovost skladu</div>
                    {!inventoryData.length ? <div className="text-muted" style={{ fontSize: 13 }}>Žádné díly na skladu</div> : (
                      <div className="table-wrap"><table className="data-table">
                        <thead><tr><th>Díl</th><th style={{textAlign:'right'}}>Skladem</th><th style={{textAlign:'right'}}>Prodáno</th><th style={{textAlign:'right'}}>V 30 dnech</th><th style={{textAlign:'right'}}>Tržby</th></tr></thead>
                        <tbody>
                          {inventoryData.slice(0, 20).map((p: any) => (
                            <tr key={p.id}>
                              <td><b>{p.name}</b>{p.sku ? <span className="td-muted"> {p.sku}</span> : null}</td>
                              <td style={{textAlign:'right', color: p.quantity <= p.min_quantity ? 'var(--red)' : 'inherit'}}>{p.quantity}</td>
                              <td style={{textAlign:'right'}}>{p.units_sold}</td>
                              <td style={{textAlign:'right', fontWeight: p.used_30d > 0 ? 700 : 400}}>{p.used_30d}</td>
                              <td style={{textAlign:'right'}} className="text-money">{fmt(p.revenue)} {cur}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                    )}
                  </div>
                )}

                {/* Výjezdy */}
                {extTab === 'fieldvisits' && fieldData && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="card">
                      <div className="card-title" style={{ marginBottom: 12 }}>🚗 Souhrn výjezdů</div>
                      {[
                        ['Celkem výjezdů', fieldData.summary?.total],
                        ['Dokončeno', fieldData.summary?.completed],
                        ['Zrušeno', fieldData.summary?.cancelled],
                        ['Průměrná vzdálenost', fieldData.summary?.avg_distance ? `${fieldData.summary.avg_distance} km` : '—'],
                        ['Celkové příjmy z výjezdů', fieldData.summary?.total_fees ? `${fmt(fieldData.summary.total_fees)} ${cur}` : '0 Kč'],
                        ['Prům. délka výjezdu', fieldData.summary?.avg_duration_min ? `${fieldData.summary.avg_duration_min} min` : '—'],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>
                          <span className="text-muted">{l}</span><span style={{ fontWeight: 600 }}>{v ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                    <div className="card">
                      <div className="card-title" style={{ marginBottom: 12 }}>📅 Výjezdy po měsících</div>
                      {(fieldData.by_month || []).map((m: any) => (
                        <div key={m.month} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--rule)' }}>
                          <span>{m.month}</span>
                          <span>{m.count} výjezdů · <b className="text-money">{fmt(m.fees)} {cur}</b></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ziskovost */}
                {extTab === 'profit' && profitData && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="card">
                      <div className="card-title" style={{ marginBottom: 12 }}>💰 Ziskovost dle zařízení</div>
                      <div className="table-wrap"><table className="data-table">
                        <thead><tr><th>Typ</th><th style={{textAlign:'right'}}>Tržby</th><th style={{textAlign:'right'}}>Práce</th><th style={{textAlign:'right'}}>Díly</th></tr></thead>
                        <tbody>
                          {(profitData.by_device_type || []).map((d: any, i: number) => (
                            <tr key={i}>
                              <td>{d.device_type}</td>
                              <td style={{textAlign:'right'}} className="text-money">{fmt(d.revenue)} {cur}</td>
                              <td style={{textAlign:'right'}}>{fmt(d.labor_revenue)} {cur}</td>
                              <td style={{textAlign:'right'}}>{fmt(d.parts_revenue)} {cur}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table></div>
                    </div>
                    <div className="card">
                      <div className="card-title" style={{ marginBottom: 12 }}>📊 Výdaje dle kategorie</div>
                      {(profitData.expenses_by_category || []).map((e: any, i: number) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--rule)' }}>
                          <span>{e.category}</span>
                          <span className="text-money" style={{ color: 'var(--red)' }}>-{fmt(e.total)} {cur}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Zákazníci LTV */}
                {extTab === 'customers' && custStats && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="card">
                      <div className="card-title" style={{ marginBottom: 12 }}>👥 Lifetime Value</div>
                      {[
                        ['Průměrné LTV', custStats.avg_ltv ? `${fmt(custStats.avg_ltv)} ${cur}` : '—'],
                        ['Maximální LTV', custStats.max_ltv ? `${fmt(custStats.max_ltv)} ${cur}` : '—'],
                        ['Celkem zákazníků', custStats.total_customers],
                        ['Vracející se zákazníci', custStats.returning_customers],
                        ['Retention rate', `${custStats.retention_rate ?? 0} %`],
                        ['Prům. zakázek / zákazník', custStats.avg_orders_per_customer],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>
                          <span className="text-muted">{l}</span><span style={{ fontWeight: 600 }}>{v ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                    <div className="card">
                      <div className="card-title" style={{ marginBottom: 12 }}>📊 Segmentace aktivity</div>
                      {[
                        ['Aktivní (posledních 30 dní)', custStats.segments?.active_30d],
                        ['Aktivní (posledních 90 dní)', custStats.segments?.active_90d],
                        [`Neaktivní (>${custStats.inactive_threshold_days} dní)`, custStats.segments?.inactive],
                      ].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>
                          <span className="text-muted">{l}</span><span style={{ fontWeight: 700 }}>{v ?? 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
    </div>
  );
}

