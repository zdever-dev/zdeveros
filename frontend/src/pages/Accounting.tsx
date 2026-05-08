// frontend/src/pages/Accounting.tsx
import { useEffect, useState } from 'react';
import { accountingApi } from '../api';
import { useApp } from '../context/AppContext';

const fmt = (n: number) => n?.toLocaleString('cs-CZ') || '0';
const CATEGORIES_INCOME = ['Oprava','Výjezd','Konzultace','Prodej dílu','Jiné'];
const CATEGORIES_EXPENSE = ['Náhradní díly','Nástroje','Doprava','Telefon/internet','Kancelář','Marketing','Jiné'];
const MONTH_NAMES = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--rule)',
      background: active ? 'var(--navy)' : 'var(--white)', color: active ? '#fff' : 'var(--muted)',
      fontWeight: 600, fontSize: 13, cursor: 'pointer',
    }}>{children}</button>
  );
}

// Inline SVG bar chart — C-03 graf příjmů
function MonthlyChart({ monthly, cur }: { monthly: any[]; cur: string }) {
  if (!monthly.length) return <div style={{ color: 'var(--muted)', fontSize: 13, padding: 8 }}>Žádná data pro tento rok</div>;
  const maxVal = Math.max(...monthly.map(m => m.income || 0), 1);
  const H = 100, barW = 22, gap = 12;
  const W = monthly.length * (barW + gap);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={Math.max(W, 300)} height={H + 50} style={{ display: 'block' }}>
        {monthly.map((m, i) => {
          const barH = Math.max(((m.income || 0) / maxVal) * H, 2);
          const expH = Math.max(((m.expense || 0) / maxVal) * H, 0);
          const x = i * (barW + gap) + 4;
          const monthIdx = parseInt(m.month?.slice(5, 7)) - 1;
          const label = MONTH_NAMES[monthIdx]?.slice(0, 3) || m.month;
          return (
            <g key={i}>
              {/* income bar */}
              <rect x={x} y={H - barH} width={barW} height={barH} fill="#4A7CC7" rx={3} opacity={0.85} />
              {/* expense bar overlay */}
              {expH > 0 && (
                <rect x={x + 2} y={H - expH} width={barW - 4} height={expH} fill="#b91c1c" rx={2} opacity={0.5} />
              )}
              <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize={9} fill="var(--muted)">{label}</text>
              {(m.income || 0) > 0 && (
                <text x={x + barW / 2} y={H - barH - 3} textAnchor="middle" fontSize={8} fill="#4A7CC7" fontWeight="700">
                  {Math.round((m.income || 0) / 1000)}k
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, background: '#4A7CC7', borderRadius: 2, display: 'inline-block' }} /> Příjmy
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, background: '#b91c1c', opacity: 0.6, borderRadius: 2, display: 'inline-block' }} /> Výdaje
        </span>
      </div>
    </div>
  );
}

// CSV export — C-03
function exportCsv(transactions: any[], overview: any, cur: string) {
  const rows: string[] = [
    `"ZdeVer OS — Export transakcí"`,
    `"Rok:","${new Date().getFullYear()}"`,
    `"Příjmy celkem:","${fmt(overview?.income?.total)} ${cur}"`,
    `"Výdaje celkem:","${fmt(overview?.expense?.total)} ${cur}"`,
    `"Zisk:","${fmt(overview?.profit?.total)} ${cur}"`,
    ``,
    `"Datum","Typ","Kategorie","Popis","Částka (${cur})"`,
    ...transactions.map(tx =>
      `"${tx.transaction_date}","${tx.type === 'income' ? 'Příjem' : 'Výdaj'}","${tx.category || ''}","${(tx.description || '').replace(/"/g, '""')}","${(tx.amount || 0).toFixed(2)}"`
    ),
  ];
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zdever-transactions-${new Date().getFullYear()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Accounting() {
  const { settings } = useApp();
  const [tab, setTab] = useState<'overview'|'transactions'|'tax'|'closings'>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txFilter, setTxFilter] = useState('');
  const [closings, setClosings] = useState<any[]>([]);
  const [closingLoading, setClosingLoading] = useState(false);
  const [closingMsg, setClosingMsg] = useState('');
  const [selectedClosing, setSelectedClosing] = useState<any>(null);

  const [taxIncome, setTaxIncome] = useState('');
  const [taxResult, setTaxResult] = useState<any>(null);
  const [taxLoading, setTaxLoading] = useState(false);

  const [showAddTx, setShowAddTx] = useState(false);
  const [txForm, setTxForm] = useState({ type: 'income', category: 'Oprava', amount: '', description: '', transaction_date: new Date().toISOString().slice(0,10) });
  const setTx = (k: string, v: string) => setTxForm(f => ({ ...f, [k]: v }));
  const [txSaving, setTxSaving] = useState(false);

  const cur = settings.currency || 'Kč';

  useEffect(() => { accountingApi.overview().then(setOverview); }, []);

  useEffect(() => {
    if (tab === 'transactions') {
      const q: Record<string,string> = {};
      if (txFilter) q.type = txFilter;
      accountingApi.transactions(q).then(r => setTransactions(r.data || []));
    }
    if (tab === 'closings') {
      accountingApi.closings().then(r => setClosings(r.data || []));
    }
  }, [tab, txFilter]);

  const addTransaction = async () => {
    setTxSaving(true);
    await accountingApi.addTx({ ...txForm, amount: parseFloat(txForm.amount)||0 });
    setShowAddTx(false);
    setTxSaving(false);
    accountingApi.transactions({}).then(r => setTransactions(r.data || []));
    accountingApi.overview().then(setOverview);
  };

  const delTx = async (id: number) => {
    if (!confirm('Smazat transakci?')) return;
    await accountingApi.delTx(id);
    accountingApi.transactions({}).then(r => setTransactions(r.data || []));
    accountingApi.overview().then(setOverview);
  };

  const calcTax = async () => {
    setTaxLoading(true);
    const r = await accountingApi.taxCalc({ gross_income: parseFloat(taxIncome)||0 });
    setTaxResult(r);
    setTaxLoading(false);
  };

  const doManualClosing = async () => {
    setClosingLoading(true);
    try {
      const r = await accountingApi.manualClosing();
      setClosingMsg(`✅ Manuální uzávěrka za ${r.period_month}/${r.period_year} vytvořena`);
      accountingApi.closings().then(d => setClosings(d.data || []));
    } catch (e: any) {
      setClosingMsg(`⚠️ ${e.message}`);
    } finally {
      setClosingLoading(false);
      setTimeout(() => setClosingMsg(''), 5000);
    }
  };

  const doMonthlyClosing = async () => {
    setClosingLoading(true);
    try {
      const r = await accountingApi.monthlyClosing();
      setClosingMsg(`✅ Měsíční uzávěrka za ${r.period_month}/${r.period_year} vytvořena`);
      accountingApi.closings().then(d => setClosings(d.data || []));
      printClosing(r);
    } catch (e: any) {
      setClosingMsg(`⚠️ ${e.message}`);
    } finally {
      setClosingLoading(false);
      setTimeout(() => setClosingMsg(''), 5000);
    }
  };

  const openClosingDetail = async (id: number) => {
    const r = await accountingApi.closingDetail(id);
    setSelectedClosing(r);
  };

  const printClosing = (cl: any) => {
    const txRows = (cl.transactions || []).map((tx: any) => `
      <tr>
        <td>${tx.transaction_date}</td>
        <td>${tx.type === 'income' ? '🟢 Příjem' : '🔴 Výdaj'}</td>
        <td>${tx.category || ''}</td>
        <td>${tx.description || ''}</td>
        <td style="text-align:right;font-weight:600">${fmt(tx.amount)} ${cur}</td>
      </tr>`).join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Uzávěrka ${cl.period_month}/${cl.period_year}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;padding:20px;color:#1a1f2e}
        h1{font-size:18px;color:#1C2A4A;margin-bottom:4px}
        .sub{color:#6b7a99;font-size:11px;margin-bottom:16px}
        .kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
        .kpi-box{background:#eef1f8;border-radius:6px;padding:10px}
        .kpi-val{font-size:18px;font-weight:800;color:#1C2A4A}
        .kpi-lbl{font-size:9px;color:#6b7a99;text-transform:uppercase;letter-spacing:1px}
        table{width:100%;border-collapse:collapse}
        th{font-size:9px;text-transform:uppercase;color:#6b7a99;padding:6px 4px;border-bottom:1.5px solid #1C2A4A;text-align:left}
        td{padding:5px 4px;border-bottom:1px solid #d8dde8}
        @media print{@page{margin:15mm}}
      </style></head><body>
      <h1>Uzávěrka ${cl.period_month}/${cl.period_year}</h1>
      <div class="sub">Typ: ${cl.type === 'monthly' ? 'Měsíční' : 'Manuální'} · Vytvořeno: ${new Date(cl.created_at || Date.now()).toLocaleDateString('cs-CZ')}</div>
      <div class="kpi">
        <div class="kpi-box"><div class="kpi-val" style="color:#0a6a55">${fmt(cl.income_total)} ${cur}</div><div class="kpi-lbl">Příjmy</div></div>
        <div class="kpi-box"><div class="kpi-val" style="color:#b91c1c">${fmt(cl.expense_total)} ${cur}</div><div class="kpi-lbl">Výdaje</div></div>
        <div class="kpi-box"><div class="kpi-val">${fmt(cl.profit_total)} ${cur}</div><div class="kpi-lbl">Zisk</div></div>
      </div>
      <table><thead><tr><th>Datum</th><th>Typ</th><th>Kategorie</th><th>Popis</th><th>Částka</th></tr></thead>
      <tbody>${txRows}</tbody></table>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Účetnictví</div>
          <div className="page-subtitle">A-08 · Příjmy, výdaje, daně OSVČ</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tab === 'transactions' && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                const q: Record<string,string> = {};
                if (txFilter) q.type = txFilter;
                accountingApi.transactions(q).then(r => exportCsv(r.data || [], overview, cur));
              }}>⬇️ CSV export</button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddTx(t => !t)}>+ Přidat transakci</button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <TabBtn active={tab==='overview'}     onClick={() => setTab('overview')}>📊 Přehled</TabBtn>
        <TabBtn active={tab==='transactions'} onClick={() => setTab('transactions')}>💳 Transakce</TabBtn>
        <TabBtn active={tab==='tax'}          onClick={() => setTab('tax')}>🧮 Kalkulačka daní</TabBtn>
        <TabBtn active={tab==='closings'}     onClick={() => setTab('closings')}>📁 Uzávěrky</TabBtn>
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────── */}
      {tab === 'overview' && overview && (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>Příjmy (YTD)</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--green)' }}>{fmt(overview.income.total)} {cur}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Tento měsíc: {fmt(overview.income.this_month)} {cur}</div>
            </div>
            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>Výdaje (YTD)</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--red)' }}>{fmt(overview.expense.total)} {cur}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Tento měsíc: {fmt(overview.expense.this_month)} {cur}</div>
            </div>
            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>Zisk (YTD)</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)' }}>{fmt(overview.profit.total)} {cur}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Tento měsíc: {fmt(overview.profit.this_month)} {cur}</div>
            </div>
            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>Odhadovaná daň</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--amber)' }}>{fmt(overview.tax_estimate.estimated_tax)} {cur}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Čistý výdělek: {fmt(overview.tax_estimate.estimated_net)} {cur}</div>
            </div>
          </div>

          {/* Graf příjmů — C-03 */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="card-title">📊 Příjmy vs. výdaje po měsících ({overview.year})</div>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                accountingApi.transactions({}).then(r => exportCsv(r.data || [], overview, cur));
              }}>⬇️ CSV</button>
            </div>
            <MonthlyChart monthly={overview.monthly || []} cur={cur} />
          </div>

          {/* Daňový přehled */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 14 }}>🧮 Daňový odhad {overview.year}</div>
            {[
              ['Hrubé příjmy', fmt(overview.tax_estimate.gross_income) + ' ' + cur, 'var(--navy)'],
              ['Daň z příjmu', fmt(overview.tax_estimate.income_tax) + ' ' + cur, 'var(--amber)'],
              ['Zdravotní pojistné', fmt(overview.tax_estimate.health) + ' ' + cur, 'var(--amber)'],
              ['Sociální pojistné', fmt(overview.tax_estimate.social) + ' ' + cur, 'var(--amber)'],
              ['Celkové odvody', fmt(overview.tax_estimate.estimated_tax) + ' ' + cur, 'var(--red)'],
              ['Čistý výdělek', fmt(overview.tax_estimate.estimated_net) + ' ' + cur, 'var(--green)'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>{l}</span>
                <span style={{ fontWeight: 700, color: c as string }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
              ⚠️ Orientační výpočet — konzultujte s účetní. Paušální výdaje 60%, sleva na poplatníka.
            </div>
          </div>
        </>
      )}

      {/* ── TRANSACTIONS ─────────────────────────────────────────── */}
      {tab === 'transactions' && (
        <>
          {showAddTx && (
            <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--blue)' }}>
              <div className="card-title" style={{ marginBottom: 14 }}>Nová transakce</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Typ</label>
                  <select className="form-select" value={txForm.type} onChange={e => setTx('type', e.target.value)}>
                    <option value="income">Příjem</option>
                    <option value="expense">Výdaj</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Kategorie</label>
                  <select className="form-select" value={txForm.category} onChange={e => setTx('category', e.target.value)}>
                    {(txForm.type === 'income' ? CATEGORIES_INCOME : CATEGORIES_EXPENSE).map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Částka ({cur})</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={txForm.amount} onChange={e => setTx('amount', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Datum</label>
                  <input className="form-input" type="date" value={txForm.transaction_date} onChange={e => setTx('transaction_date', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Popis</label>
                <input className="form-input" placeholder="Popis transakce…" value={txForm.description} onChange={e => setTx('description', e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={addTransaction} disabled={txSaving}>
                  {txSaving ? <div className="spinner" /> : '💾 Přidat'}
                </button>
                <button className="btn btn-ghost" onClick={() => setShowAddTx(false)}>Zrušit</button>
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="form-select" style={{ width: 160 }} value={txFilter} onChange={e => setTxFilter(e.target.value)}>
                <option value="">Všechny typy</option>
                <option value="income">Příjmy</option>
                <option value="expense">Výdaje</option>
              </select>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                const q: Record<string,string> = {};
                if (txFilter) q.type = txFilter;
                accountingApi.transactions(q).then(r => exportCsv(r.data || [], overview, cur));
              }}>⬇️ Exportovat CSV</button>
            </div>
            {transactions.length === 0 ? (
              <div style={{ color: 'var(--muted)', padding: 20, textAlign: 'center' }}>Žádné transakce</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Datum</th><th>Typ</th><th>Kategorie</th><th>Popis</th><th style={{ textAlign: 'right' }}>Částka</th><th></th></tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id}>
                        <td className="td-muted">{tx.transaction_date}</td>
                        <td>
                          <span className={tx.type === 'income' ? 'badge badge-green' : 'badge badge-red'}>
                            {tx.type === 'income' ? '↑ Příjem' : '↓ Výdaj'}
                          </span>
                        </td>
                        <td className="td-muted">{tx.category}</td>
                        <td>{tx.description}</td>
                        <td style={{ textAlign: 'right' }} className="text-money">{fmt(tx.amount)} {cur}</td>
                        <td><button className="btn btn-danger btn-sm btn-icon" onClick={() => delTx(tx.id)}>🗑️</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TAX CALCULATOR ───────────────────────────────────────── */}
      {tab === 'tax' && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>🧮 Kalkulačka daní OSVČ</div>
          <div style={{ maxWidth: 400 }}>
            <div className="form-group">
              <label className="form-label">Hrubé příjmy za rok ({cur})</label>
              <input className="form-input" type="number" placeholder="např. 150000" value={taxIncome}
                onChange={e => setTaxIncome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && calcTax()} />
            </div>
            <button className="btn btn-primary" onClick={calcTax} disabled={taxLoading || !taxIncome}>
              {taxLoading ? <div className="spinner" /> : 'Spočítat'}
            </button>
          </div>
          {taxResult && (
            <div style={{ marginTop: 24 }}>
              {[
                ['Hrubé příjmy', fmt(taxResult.gross_income) + ' ' + cur, 'var(--navy)'],
                ['Paušální výdaje (' + taxResult.flat_expense_rate + '%)', fmt(taxResult.expenses) + ' ' + cur, 'var(--muted)'],
                ['Základ daně', fmt(taxResult.tax_base) + ' ' + cur, 'var(--navy)'],
                ['Daň ' + taxResult.tax_rate + '%', fmt(taxResult.tax_gross) + ' ' + cur, 'var(--amber)'],
                ['Sleva na poplatníka', '−' + fmt(taxResult.taxpayer_relief) + ' ' + cur, 'var(--green)'],
                ['Daň k zaplacení', fmt(taxResult.tax_net) + ' ' + cur, 'var(--red)'],
                ['Zdravotní pojistné', fmt(taxResult.health_insurance) + ' ' + cur, 'var(--amber)'],
                ['Sociální pojistné', fmt(taxResult.social_insurance) + ' ' + cur, 'var(--amber)'],
                ['Celkové odvody', fmt(taxResult.total_deductions) + ' ' + cur, 'var(--red)'],
                ['Čistý výdělek', fmt(taxResult.net_income) + ' ' + cur, 'var(--green)'],
                ['Efektivní sazba', taxResult.effective_rate + '%', 'var(--muted)'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{l}</span>
                  <span style={{ fontWeight: 700, color: c as string }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                {(taxResult.notes || []).map((n: string, i: number) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{n}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CLOSINGS ─────────────────────────────────────────────── */}
      {tab === 'closings' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={doManualClosing} disabled={closingLoading}>
              {closingLoading ? <div className="spinner" /> : '📁 Manuální uzávěrka'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={doMonthlyClosing} disabled={closingLoading}>
              {closingLoading ? <div className="spinner" /> : '📅 Měsíční uzávěrka (minulý měsíc)'}
            </button>
          </div>
          {closingMsg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{closingMsg}</div>}

          {selectedClosing && (
            <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--blue)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="card-title">Detail uzávěrky {selectedClosing.period_month}/{selectedClosing.period_year}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => printClosing(selectedClosing)}>🖨️ Tisk</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedClosing(null)}>✕</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                {[
                  ['Příjmy', fmt(selectedClosing.income_total) + ' ' + cur, 'var(--green)'],
                  ['Výdaje', fmt(selectedClosing.expense_total) + ' ' + cur, 'var(--red)'],
                  ['Zisk', fmt(selectedClosing.profit_total) + ' ' + cur, 'var(--navy)'],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ background: 'var(--light)', padding: '10px 14px', borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{l}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: c as string }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            {closings.length === 0 ? (
              <div style={{ color: 'var(--muted)', padding: 20, textAlign: 'center' }}>Žádné uzávěrky</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Období</th><th>Typ</th><th style={{ textAlign: 'right' }}>Příjmy</th><th style={{ textAlign: 'right' }}>Výdaje</th><th style={{ textAlign: 'right' }}>Zisk</th><th></th></tr>
                  </thead>
                  <tbody>
                    {closings.map(cl => (
                      <tr key={cl.id}>
                        <td style={{ fontWeight: 600 }}>{cl.period_month}/{cl.period_year}</td>
                        <td><span className="badge badge-blue">{cl.type === 'monthly' ? 'Měsíční' : 'Manuální'}</span></td>
                        <td style={{ textAlign: 'right' }} className="text-money">{fmt(cl.income_total)} {cur}</td>
                        <td style={{ textAlign: 'right' }} className="text-money">{fmt(cl.expense_total)} {cur}</td>
                        <td style={{ textAlign: 'right' }} className="text-money">{fmt(cl.profit_total)} {cur}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openClosingDetail(cl.id)}>Detail</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => openClosingDetail(cl.id).then(() => printClosing(selectedClosing))}>🖨️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}