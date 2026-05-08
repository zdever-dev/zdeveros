// frontend/src/pages/FieldVisits.tsx — A-09 + B-09
import { useEffect, useState } from 'react';
import { fieldVisitsApi, ordersApi, invoicingApi } from '../api';

const STATUSES = ['Naplánován', 'Probíhá', 'Hotovo', 'Zrušen'];
const STATUS_BADGE: Record<string, string> = {
  'Naplánován': 'badge badge-blue',
  'Probíhá':   'badge badge-amber',
  'Hotovo':    'badge badge-green',
  'Zrušen':    'badge badge-red',
};

function fmt(n: number) { return Math.round(n).toLocaleString('cs-CZ'); }

// ─── Kalkulačka ───────────────────────────────────────────────────────────────
function FeeCalc() {
  const [km, setKm] = useState('');
  const [result, setResult] = useState<{ km: number; fee: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function calc() {
    const d = parseFloat(km);
    if (isNaN(d)) return;
    setLoading(true);
    try {
      const r = await fieldVisitsApi.calcFee({ distance_km: d });
      setResult(r);
    } catch {}
    setLoading(false);
  }

  const zones = [
    { label: '0–5 km',  fee: '0 Kč' },
    { label: '5–15 km', fee: '150 Kč' },
    { label: '15–30 km', fee: '300 Kč' },
    { label: '30+ km',  fee: '500 Kč + 15 Kč/km nad 30' },
  ];

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>🧮 B-09 Kalkulačka výjezdního poplatku</h3>
      <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Vzdálenost (km)</label>
          <input type="number" className="form-input" value={km}
            onChange={e => setKm(e.target.value)} placeholder="Zadej km"
            style={{ width:140 }} />
        </div>
        <button className="btn btn-primary" onClick={calc} disabled={loading || !km}>
          Spočítat
        </button>
        {result && (
          <div style={{ background:'var(--light)', borderRadius:'var(--r-sm)', padding:'10px 16px' }}>
            <span style={{ fontSize:13, color:'var(--muted)' }}>{result.km} km → </span>
            <span style={{ fontSize:18, fontWeight:800, color: result.fee===0?'var(--green)':'var(--navy)' }}>
              {result.fee===0 ? 'Zdarma' : `${fmt(result.fee)} Kč`}
            </span>
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
        {zones.map(z => (
          <div key={z.label} style={{ fontSize:11, background:'var(--bg)', border:'1px solid var(--rule)',
            borderRadius:6, padding:'4px 10px', color:'var(--muted)' }}>
            <b style={{ color:'var(--navy)' }}>{z.label}</b> → {z.fee}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Formulář výjezdu ─────────────────────────────────────────────────────────
function VisitForm({ visit, onClose, onSave }: {
  visit?: any; onClose: () => void; onSave: () => void;
}) {
  const [form, setForm] = useState({
    customer_name: visit?.customer_name || '',
    address: visit?.address || '',
    visit_date: visit?.visit_date || new Date().toISOString().slice(0,10),
    visit_time: visit?.visit_time || '',
    description: visit?.description || '',
    distance_km: visit?.distance_km?.toString() || '',
    notes: visit?.notes || '',
    order_id: visit?.order_id?.toString() || '',
  });
  const [fee, setFee] = useState<number | null>(visit?.fee_czk ?? null);
  const [saving, setSaving] = useState(false);

  async function calcFee(km: string) {
    const d = parseFloat(km);
    if (!isNaN(d) && d >= 0) {
      try {
        const r = await fieldVisitsApi.calcFee({ distance_km: d });
        setFee(r.fee);
      } catch {}
    }
  }

  function upd(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    if (k === 'distance_km') calcFee(v);
  }

  async function save() {
    if (!form.customer_name || !form.address || !form.visit_date) return;
    setSaving(true);
    try {
      const payload = { ...form, distance_km: parseFloat(form.distance_km)||0, order_id: form.order_id||null };
      if (visit) {
        await fieldVisitsApi.update(visit.id, payload);
      } else {
        await fieldVisitsApi.create(payload);
      }
      onSave();
    } catch {}
    setSaving(false);
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' }}>
      <div className="card" style={{ width:520, maxWidth:'95vw', padding:28, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
          <h3 style={{ margin:0,fontSize:16 }}>{visit ? 'Upravit výjezd' : 'Nový výjezd'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div className="form-group" style={{ gridColumn:'1/-1' }}>
            <label className="form-label">Zákazník *</label>
            <input className="form-input" value={form.customer_name}
              onChange={e => upd('customer_name',e.target.value)} placeholder="Jméno zákazníka" />
          </div>
          <div className="form-group" style={{ gridColumn:'1/-1' }}>
            <label className="form-label">Adresa *</label>
            <input className="form-input" value={form.address}
              onChange={e => upd('address',e.target.value)} placeholder="Ulice, město" />
          </div>
          <div className="form-group">
            <label className="form-label">Datum *</label>
            <input type="date" className="form-input" value={form.visit_date}
              onChange={e => upd('visit_date',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Čas</label>
            <input type="time" className="form-input" value={form.visit_time}
              onChange={e => upd('visit_time',e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Vzdálenost (km)</label>
            <input type="number" className="form-input" value={form.distance_km}
              onChange={e => upd('distance_km',e.target.value)} placeholder="0" min="0" step="0.5" />
          </div>
          <div className="form-group">
            <label className="form-label">Výjezdní poplatek</label>
            <div className="form-control" style={{ background:'var(--bg)', cursor:'default' }}>
              {fee !== null ? (fee === 0 ? 'Zdarma' : `${fmt(fee)} Kč`) : '—'}
            </div>
          </div>
          <div className="form-group" style={{ gridColumn:'1/-1' }}>
            <label className="form-label">Co se bude řešit</label>
            <textarea className="form-textarea" rows={2} value={form.description}
              onChange={e => upd('description',e.target.value)} placeholder="Popis závady..." />
          </div>
          <div className="form-group">
            <label className="form-label">Číslo zakázky (ID)</label>
            <input className="form-input" value={form.order_id}
              onChange={e => upd('order_id',e.target.value)} placeholder="ID zakázky (volitelné)" />
          </div>
          <div className="form-group">
            <label className="form-label">Poznámky</label>
            <input className="form-input" value={form.notes}
              onChange={e => upd('notes',e.target.value)} placeholder="Interní poznámka..." />
          </div>
        </div>

        <div style={{ display:'flex',gap:8,justifyContent:'flex-end',marginTop:20 }}>
          <button className="btn btn-ghost" onClick={onClose}>Zrušit</button>
          <button className="btn btn-primary" onClick={save}
            disabled={saving || !form.customer_name || !form.address || !form.visit_date}>
            {saving ? 'Ukládám…' : (visit ? 'Uložit' : 'Přidat výjezd')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hlavní stránka ───────────────────────────────────────────────────────────
export default function FieldVisits() {
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editVisit, setEditVisit] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fieldVisitsApi.list(filterStatus || undefined);
      setVisits(r.data || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [filterStatus]);

  async function changeStatus(visit: any, status: string) {
    await fieldVisitsApi.update(visit.id, { status });
    load();
  }

  async function del(visit: any) {
    if (!confirm(`Smazat výjezd k ${visit.customer_name}?`)) return;
    await fieldVisitsApi.delete(visit.id);
    load();
  }

  const totalFee = visits.filter(v => v.status==='Hotovo').reduce((s,v) => s + (v.fee_czk||0), 0);
  const planned = visits.filter(v => v.status==='Naplánován').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Výjezdy</div>
          <div className="page-subtitle">A-09 — plánování výjezdů k zákazníkům</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <a href={fieldVisitsApi.exportCsv()} className="btn btn-ghost btn-sm">⬇️ Export CSV</a>
          <button className="btn btn-primary" onClick={() => { setEditVisit(null); setShowForm(true); }}>
            + Nový výjezd
          </button>
        </div>
      </div>

      <FeeCalc />

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom:20 }}>
        <div className="stat-card" style={{ '--accent':'var(--blue)' } as any}>
          <div className="stat-label">Naplánované výjezdy</div>
          <div className="stat-value">{planned}</div>
          <div className="stat-sub">čeká na realizaci</div>
        </div>
        <div className="stat-card" style={{ '--accent':'var(--green)' } as any}>
          <div className="stat-label">Tržby z výjezdů</div>
          <div className="stat-value">{fmt(totalFee)} Kč</div>
          <div className="stat-sub">dokončené výjezdy</div>
        </div>
        <div className="stat-card" style={{ '--accent':'var(--navy)' } as any}>
          <div className="stat-label">Celkem výjezdů</div>
          <div className="stat-value">{visits.length}</div>
          <div className="stat-sub">v aktuálním filtru</div>
        </div>
      </div>

      {/* Filter */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', gap:8, padding:'12px 18px', flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:13, color:'var(--muted)' }}>Filtr:</span>
          <button onClick={() => setFilterStatus('')}
            className={`btn btn-sm ${filterStatus==='' ? 'btn-primary' : 'btn-ghost'}`}>Vše</button>
          {STATUSES.map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`btn btn-sm ${filterStatus===s ? 'btn-primary' : 'btn-ghost'}`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ padding:40,textAlign:'center' }}><div className="spinner" /></div>
        ) : visits.length===0 ? (
          <div style={{ padding:40,textAlign:'center',color:'var(--muted)',fontSize:14 }}>
            Žádné výjezdy{filterStatus ? ` se statusem ${filterStatus}` : ''}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
                <thead>
                    <tr>
                    <th>Zákazník</th>
                    <th>Adresa</th>
                    <th>Datum / Čas</th>
                    <th>Popis</th>
                    <th>Km / Poplatek</th>
                    <th>Status</th>
                    <th></th>
              </tr>
            </thead>
            <tbody>
              {visits.map(v => (
                <tr key={v.id}>
                  <td>
                    <div style={{ fontWeight:600 }}>{v.customer_name}</div>
                    {v.order_number && <div style={{ fontSize:11,color:'var(--muted)' }}>#{v.order_number}</div>}
                  </td>
                  <td style={{ fontSize:13 }}>{v.address}</td>
                  <td style={{ whiteSpace:'nowrap', fontSize:13 }}>
                    {v.visit_date}<br />
                    {v.visit_time && <span style={{ color:'var(--muted)' }}>{v.visit_time}</span>}
                  </td>
                  <td style={{ fontSize:12, maxWidth:160 }}>{v.description || '—'}</td>
                  <td style={{ whiteSpace:'nowrap' }}>
                    {v.distance_km > 0 && <div style={{ fontSize:12 }}>{v.distance_km} km</div>}
                    <div style={{ fontWeight:700, color: v.fee_czk===0?'var(--green)':'var(--navy)' }}>
                      {v.fee_czk===0 ? 'Zdarma' : `${fmt(v.fee_czk)} Kč`}
                    </div>
                  </td>
                  <td>
                    <select value={v.status}
                      onChange={e => changeStatus(v, e.target.value)}
                      className="form-select" style={{ fontSize:12, padding:'3px 6px', width:'auto' }}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="btn btn-ghost btn-sm" title="Generovat doklad za výjezd"
                        onClick={async () => {
                          if (!confirm('Generovat příjmový doklad za tento výjezd?')) return;
                          try {
                            await invoicingApi.fromVisit(v.id);
                            alert('✅ Doklad vygenerován — najdeš ho ve Fakturaci.');
                          } catch { alert('Chyba při generování dokladu.'); }
                        }}>🧾</button>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => { setEditVisit(v); setShowForm(true); }}>✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => del(v)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {showForm && (
        <VisitForm
          visit={editVisit}
          onClose={() => { setShowForm(false); setEditVisit(null); }}
          onSave={() => { setShowForm(false); setEditVisit(null); load(); }}
        />
      )}
    </div>
  );
}