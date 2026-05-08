// frontend/src/pages/Orders.tsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { ordersApi, customersApi, inventoryApi, settingsApi, fieldVisitsApi } from '../api';
import { useApp } from '../context/AppContext';

const STATUSES = ['Přijato','Diagnostika','V opravě','Čeká na díl','Hotovo','Vydáno','Stornováno'];
const DEVICE_TYPES = ['Notebook','PC','Telefon','Tablet','Tiskárna','Herní konzole','Monitor','Jiné'];
const STATUS_BADGE: Record<string,string> = {
  'Přijato':'badge badge-blue','Diagnostika':'badge badge-teal',
  'V opravě':'badge badge-amber','Čeká na díl':'badge badge-amber',
  'Hotovo':'badge badge-green','Vydáno':'badge badge-muted','Stornováno':'badge badge-red',
};
const fmt = (n: number) => n?.toLocaleString('cs-CZ') || '0';

// ─── Timer widget (B-07) ─────────────────────────────────────────
function TimerWidget({ orderId, initialMinutes }: { orderId: number; initialMinutes: number }) {
  const storageKey = `zdever-timer-${orderId}`;

  const getStored = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw) as { startedAt: number; baseMinutes: number };
    } catch { return null; }
  };

  const stored = getStored();
  const [running, setRunning] = useState(!!stored);
  const [elapsed, setElapsed] = useState(() => {
    if (stored) {
      const diffSec = Math.floor((Date.now() - stored.startedAt) / 1000);
      return stored.baseMinutes * 60 + diffSec;
    }
    return (initialMinutes || 0) * 60;
  });
  const [saved, setSaved] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        const s = getStored();
        if (s) {
          const diffSec = Math.floor((Date.now() - s.startedAt) / 1000);
          setElapsed(s.baseMinutes * 60 + diffSec);
        }
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const start = () => {
    const base = Math.floor(elapsed / 60);
    localStorage.setItem(storageKey, JSON.stringify({ startedAt: Date.now(), baseMinutes: base }));
    setRunning(true);
    setSaved(false);
  };

  const stop = () => {
    localStorage.removeItem(storageKey);
    setRunning(false);
  };

  const reset = () => {
    stop();
    setElapsed((initialMinutes || 0) * 60);
  };

  const save = async () => {
    stop();
    const minutes = Math.floor(elapsed / 60);
    await ordersApi.saveTimer(orderId, minutes);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const display = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  return (
    <div style={{ background: 'var(--light)', border: '1px solid var(--rule)', borderRadius: 'var(--r)', padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 10 }}>
        ⏱️ Timer opravy
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 36, fontWeight: 800, color: running ? 'var(--green)' : 'var(--navy)', letterSpacing: 3, marginBottom: 12, lineHeight: 1 }}>
        {display}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!running ? (
          <button className="btn btn-primary btn-sm" onClick={start}>▶ Start</button>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={stop}>⏸ Pauza</button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={reset}>↺ Reset</button>
        <button className="btn btn-sm" onClick={save} style={{ background: saved ? 'var(--green)' : 'var(--navy)', color: '#fff' }}>
          {saved ? '✅ Uloženo' : '💾 Uložit'}
        </button>
      </div>
      {Math.floor(elapsed / 60) !== (initialMinutes || 0) && !running && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          Uloženo: {initialMinutes || 0} min · Aktuální: {Math.floor(elapsed / 60)} min
        </div>
      )}
    </div>
  );
}

// ─── Message generator (B-10) ────────────────────────────────────
function MessageGenerator({ order }: { order: any }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [preview, setPreview] = useState('');
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    settingsApi.getMsgTemplates().then(setTemplates);
  }, []);

  const VARS: Record<string, string> = {
    '{jméno}': order.customer_name || '',
    '{jmeno}': order.customer_name || '',
    '{zařízení}': `${order.device_type}${order.device_model ? ' ' + order.device_model : ''}`,
    '{zarizeni}': `${order.device_type}${order.device_model ? ' ' + order.device_model : ''}`,
    '{číslo}': order.order_number || '',
    '{cislo}': order.order_number || '',
    '{cislo_zakazky}': order.order_number || '',
    '{cena}': fmt(order.total_price),
    '{telefon}': order.customer_phone || '',
    '{termín}': '—',
    '{datum_zaruky}': order.warranty_expires ? new Date(order.warranty_expires).toLocaleDateString('cs-CZ') : '—',
    '{číslo_účtu}': '',
    '{číslo_faktury}': '',
    '{splatnost}': '',
  };

  const substitute = (text: string) => {
  let out = text;
  for (const [k, v] of Object.entries(VARS)) {
    out = out.split(k).join(v);
  }
  return out;
};

  const selectTemplate = (tpl: any) => {
    setSelected(tpl);
    setPreview(substitute(tpl.content));
    setCopied(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = preview;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!open) {
    return (
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        💬 Vygenerovat zprávu
      </button>
    );
  }

  return (
    <div style={{ background: 'var(--white)', border: '1.5px solid var(--blue)', borderRadius: 'var(--r)', padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>💬 Generátor zprávy</div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setSelected(null); setPreview(''); }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {templates.map(t => (
          <button key={t.id}
            className={`btn btn-sm ${selected?.id === t.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => selectTemplate(t)}>
            {t.situation}
          </button>
        ))}
      </div>
      {selected && (
        <>
          <textarea
            className="form-textarea"
            rows={6}
            value={preview}
            onChange={e => setPreview(e.target.value)}
            style={{ fontFamily: 'inherit', fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={copy}
              style={{ minWidth: 110, background: copied ? 'var(--green)' : undefined }}
            >
              {copied ? '✅ Zkopírováno!' : '📋 Kopírovat'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>
              Zkopíruj a odešli přes WhatsApp / SMS / Messenger
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Order list ───────────────────────────────────────────────────
function OrderList() {
  const { settings } = useApp();
  const nav = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanMode, setScanMode] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const q: Record<string,string> = {};
    if (search) q.search = search;
    if (statusFilter) q.status = statusFilter;
    const r = await ordersApi.list(q);
    setOrders(r.data || []);
    setTotal(r.total || 0);
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Barcode scanner — po aktivaci čeká na scan
  useEffect(() => {
    if (scanMode && scanRef.current) scanRef.current.focus();
  }, [scanMode]);

  const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scanInput.trim()) {
      try {
        const order = await ordersApi.byBarcode(scanInput.trim());
        nav(`/orders/${order.id}`);
      } catch {
        alert(`Zakázka "${scanInput.trim()}" nenalezena`);
      }
      setScanInput('');
      setScanMode(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Zakázky</div>
          <div className="page-subtitle">Celkem {total} zakázek</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${scanMode ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setScanMode(m => !m)}
            title="Naskenovat čárový kód zakázky"
          >
            📷 Skenovat kód
          </button>
          <Link to="/orders/new" className="btn btn-primary">+ Nová zakázka</Link>
        </div>
      </div>

      {/* Scan input — zobrazí se jen ve scan módu */}
      {scanMode && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--blue)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🔍</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
              Naskenujte čárový kód nebo zadejte číslo zakázky ručně a stiskněte Enter
            </div>
            <input
              ref={scanRef}
              className="form-input"
              placeholder="např. 2025-001"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={handleScan}
              autoFocus
            />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setScanMode(false)}>✕ Zrušit</button>
        </div>
      )}

      <div className="filter-bar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input className="form-input" placeholder="Hledat zakázky…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 160 }}
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Všechny statusy</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={load}>Obnovit</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : orders.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">📋</div>
          <p>Žádné zakázky nenalezeny</p>
          <Link to="/orders/new" className="btn btn-primary" style={{ marginTop: 12 }}>Přidat první zakázku</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Č. zakázky</th><th>Zákazník</th><th>Zařízení</th>
                <th>Závada</th><th>Status</th><th>Přijato</th><th>Cena</th><th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td><Link to={`/orders/${o.id}`} className="td-mono" style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>{o.order_number}</Link></td>
                  <td><div>{o.customer_name}</div><div className="td-muted">{o.customer_phone}</div></td>
                  <td><div>{o.device_type}</div><div className="td-muted">{o.device_model}</div></td>
                  <td className="td-muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.problem_description}</td>
                  <td><span className={STATUS_BADGE[o.status] || 'badge badge-muted'}>{o.status}</span></td>
                  <td className="td-muted">{new Date(o.received_at).toLocaleDateString('cs-CZ')}</td>
                  <td className="text-money">{fmt(o.total_price)} {settings.currency||'Kč'}</td>
                  <td><Link to={`/orders/${o.id}`} className="btn btn-ghost btn-sm">Detail →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── New Order Form ───────────────────────────────────────────────
function NewOrder() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', customer_email: '',
    device_type: 'Notebook', device_model: '', device_serial: '',
    problem_description: '', technician: '', estimated_price: '', internal_notes: '',
    customer_id: '', customer_ico: '', customer_dic: '', customer_pin: '', source: ''
  });
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { settings } = useApp();

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (form.customer_phone.length >= 3) {
      customersApi.lookup(form.customer_phone).then(r => setSuggestions(r)).catch(() => {});
    } else setSuggestions([]);
  }, [form.customer_phone]);

  const fillCustomer = (c: any) => {
    setForm(f => ({
      ...f,
      customer_id: String(c.id),
      customer_name: c.name,
      customer_phone: c.phone || '',
      customer_email: c.email || '',
      customer_ico: c.ico || '',
      customer_dic: c.dic || '',
      source: c.source || '',
    }));
    setSuggestions([]);
  };

  const submit = async () => {
    if (!form.customer_name.trim()) return setError('Jméno zákazníka je povinné');
    if (!form.problem_description.trim()) return setError('Popis závady je povinný');
    setSaving(true); setError('');
    try {
      let customerId = form.customer_id ? parseInt(form.customer_id) : undefined;
      if (!customerId) {
        try {
          const newCust = await customersApi.create({
            name: form.customer_name.trim(),
            phone: form.customer_phone.trim() || undefined,
            email: form.customer_email.trim() || undefined,
            ico: form.customer_ico.trim() || undefined,
            dic: form.customer_dic.trim() || undefined,
          });
          customerId = newCust.id;
        } catch {
          if (form.customer_phone.trim().length >= 3) {
            try {
              const existing = await customersApi.lookup(form.customer_phone.trim());
              if (existing.length > 0) customerId = existing[0].id;
            } catch {}
          }
        }
      }

      const o = await ordersApi.create({
        ...form,
        customer_id: customerId,
        estimated_price: parseFloat(form.estimated_price) || 0,
        technician: form.technician || settings.technician_name,
        customer_pin: form.customer_pin || undefined,
      });
      nav(`/orders/${o.id}`);
    } catch (e: any) { setError(e.message); setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Nová zakázka</div>
          <div className="page-subtitle">Vyplňte informace o zakázce</div>
        </div>
        <Link to="/orders" className="btn btn-ghost">← Zpět</Link>
      </div>

      {error && <div className="alert alert-error">⚠️ {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Zákazník</div>
          <div style={{ position: 'relative' }}>
            <div className="form-group">
              <label className="form-label">Telefon</label>
              <input className="form-input" placeholder="603 123 456" value={form.customer_phone}
                onChange={e => set('customer_phone', e.target.value)} />
              {suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--white)', border: '1px solid var(--rule)', borderRadius: 'var(--r-sm)', zIndex: 100, boxShadow: 'var(--shadow-md)' }}>
                  {suggestions.map((c: any) => (
                    <div key={c.id} onClick={() => fillCustomer(c)}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}
                      onMouseOver={e => (e.currentTarget.style.background = 'var(--light)')}
                      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <b>{c.name}</b> — {c.phone}
                      {c.total_orders > 0 && <span className="tag" style={{ marginLeft: 6 }}>{c.total_orders} zakázek</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Jméno *</label>
            <input className="form-input" placeholder="Jméno zákazníka" value={form.customer_name}
              onChange={e => set('customer_name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">E-mail</label>
            <input className="form-input" type="email" placeholder="email@priklad.cz" value={form.customer_email}
              onChange={e => set('customer_email', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">IČO (firma)</label>
              <input className="form-input" placeholder="Pouze pro firemní zákazníky" value={form.customer_ico}
                onChange={e => set('customer_ico', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">DIČ (firma)</label>
              <input className="form-input" placeholder="CZ12345678" value={form.customer_dic}
                onChange={e => set('customer_dic', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">PIN zákazníka <span style={{ fontSize: 11, color: 'var(--muted)' }}>(volitelné — ukládá se šifrovaně)</span></label>
            <input className="form-input" type="password" placeholder="Zákazník ho svěřil pro ověření totožnosti" value={form.customer_pin}
              onChange={e => set('customer_pin', e.target.value)} maxLength={20} />
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Zařízení</div>
          <div className="form-group">
            <label className="form-label">Typ zařízení *</label>
            <select className="form-select" value={form.device_type} onChange={e => set('device_type', e.target.value)}>
              {DEVICE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Model / výrobce</label>
            <input className="form-input" placeholder="např. Lenovo IdeaPad 3" value={form.device_model}
              onChange={e => set('device_model', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Sériové číslo (S/N)</label>
            <input className="form-input" placeholder="Nepovinné" value={form.device_serial}
              onChange={e => set('device_serial', e.target.value)} />
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title" style={{ marginBottom: 16 }}>Oprava</div>
          <div className="form-group">
            <label className="form-label">Popis závady *</label>
            <textarea className="form-textarea" rows={3} placeholder="Co zákazník popisuje? Co nefunguje?"
              value={form.problem_description} onChange={e => set('problem_description', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Odhadovaná cena ({settings.currency||'Kč'})</label>
              <input className="form-input" type="number" placeholder="0" value={form.estimated_price}
                onChange={e => set('estimated_price', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Technik</label>
              <input className="form-input" placeholder={settings.technician_name || 'Jméno technika'} value={form.technician}
                onChange={e => set('technician', e.target.value)} />
            </div>
          </div>
            <div className="form-group">
                <label className="form-label">Zdroj zákazníka</label>
                <select className="form-select"
                  value={form.source || ''}
                  onChange={e => setForm((f: any) => ({ ...f, source: e.target.value }))}>
                  <option value="">— nevyplněno —</option>
                  {['Facebook','Bazoš','Google','Doporučení','Letáček','Jiné'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
          <div className="form-group">
            <label className="form-label">Odkud zákazník přišel</label>
            <select className="form-select" value={form.source} onChange={e => set('source', e.target.value)}>
              <option value="">— nevyplněno —</option>
              {['Facebook','Bazoš','Google','Doporučení','Letáček','Jiné'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Interní poznámky</label>
            <textarea className="form-textarea" rows={2} placeholder="Interní info (zákazník neuvidí)"
              value={form.internal_notes} onChange={e => set('internal_notes', e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? <><div className="spinner" /> Ukládám…</> : '✅ Vytvořit zakázku'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Item Modal (práce / díl / materiál) ──────────────────────
function AddItemPanel({ orderId, onAdded, settings }: { orderId: number; onAdded: () => void; settings: Record<string,string> }) {
  const [itemType, setItemType] = useState<'work'|'part'|'material'>('work');
  const [desc, setDesc] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [marginPct, setMarginPct] = useState(settings.default_margin || '20');
  const [partId, setPartId] = useState<number|null>(null);
  const [partSearch, setPartSearch] = useState('');
  const [partResults, setPartResults] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Vypočítej cenu práce z hodin
  const workPriceCalc = (() => {
    const h = parseFloat(hours) || 0;
    const m = parseFloat(minutes) || 0;
    const r = parseFloat(hourlyRate) || 0;
    return ((h * 60 + m) / 60 * r).toFixed(0);
  })();

  // Hledej díly v inventuře
  useEffect(() => {
    if (itemType === 'part' && partSearch.length >= 2) {
      inventoryApi.list({ search: partSearch, limit: '10' }).then((r: any) => setPartResults(r.data || [])).catch(() => {});
    } else setPartResults([]);
  }, [partSearch, itemType]);

  const handleAdd = async () => {
    const description = desc.trim();
    if (!description && itemType !== 'work') return;
    setSaving(true);
    try {
      const payload: any = { type: itemType, description: description || 'Práce', quantity: parseInt(quantity) || 1 };

      if (itemType === 'work') {
        payload.hours = parseInt(hours) || 0;
        payload.minutes = parseInt(minutes) || 0;
        payload.hourly_rate = parseFloat(hourlyRate) || 0;
        payload.unit_price = parseFloat(workPriceCalc) || 0;
      } else if (itemType === 'part') {
        payload.unit_price = parseFloat(unitPrice) || 0;
        payload.margin_percent = parseFloat(marginPct) || 0;
        if (partId) payload.part_id = partId;
      } else {
        // material
        payload.unit_price = parseFloat(unitPrice) || 0;
        payload.margin_percent = 0;
      }

      await ordersApi.addItem(orderId, payload);
      // reset
      setDesc(''); setHours(''); setMinutes(''); setHourlyRate('');
      setUnitPrice(''); setQuantity('1'); setPartId(null); setPartSearch('');
      onAdded();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background: 'var(--light)', padding: 16, borderRadius: 'var(--r-sm)', marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>Přidat položku</div>

      {/* Typ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['work','part','material'] as const).map(t => (
          <button key={t}
            className={`btn btn-sm ${itemType === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setItemType(t)}
          >
            {t === 'work' ? '🔧 Práce' : t === 'part' ? '🔩 Díl' : '🧴 Spotřební materiál'}
          </button>
        ))}
      </div>

      {/* PRÁCE */}
      {itemType === 'work' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 120px auto', gap: 8, alignItems: 'flex-end' }}>
          <div>
            <label className="form-label">Popis práce</label>
            <input className="form-input" placeholder="Výměna baterie, diagnostika…" value={desc}
              onChange={e => setDesc(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Hodiny</label>
            <input className="form-input" type="number" min={0} placeholder="0" value={hours}
              onChange={e => setHours(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Minuty</label>
            <input className="form-input" type="number" min={0} max={59} placeholder="0" value={minutes}
              onChange={e => setMinutes(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Sazba ({settings.currency||'Kč'}/hod)</label>
            <input className="form-input" type="number" placeholder="350" value={hourlyRate}
              onChange={e => setHourlyRate(e.target.value)} />
          </div>
          <div>
            <label className="form-label" style={{ color: 'var(--blue)' }}>= {workPriceCalc} {settings.currency||'Kč'}</label>
            <button className="btn btn-primary" onClick={handleAdd} disabled={saving} style={{ width: '100%' }}>
              {saving ? '…' : '+ Přidat'}
            </button>
          </div>
        </div>
      )}

      {/* DÍL */}
      {itemType === 'part' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 100px 80px auto', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ position: 'relative' }}>
            <label className="form-label">Díl (hledej v inventuře nebo napiš)</label>
            <input className="form-input" placeholder="Název dílu…" value={partSearch || desc}
              onChange={e => { setPartSearch(e.target.value); setDesc(e.target.value); setPartId(null); }} />
            {partResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--white)', border: '1px solid var(--rule)', borderRadius: 'var(--r-sm)', zIndex: 50, boxShadow: 'var(--shadow-md)', maxHeight: 200, overflowY: 'auto' }}>
                {partResults.map((p: any) => (
                  <div key={p.id} onClick={() => {
                    setPartId(p.id);
                    setDesc(p.name);
                    setPartSearch(p.name);
                    setUnitPrice(String(p.purchase_price));
                    setMarginPct(String(p.margin_percent || settings.default_margin || 20));
                    setPartResults([]);
                  }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12 }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--light)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <b>{p.name}</b> <span style={{ color: 'var(--muted)' }}>— nák. {p.purchase_price} {settings.currency||'Kč'} · sklad: {p.quantity} ks</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="form-label">Nákupní cena ({settings.currency||'Kč'})</label>
            <input className="form-input" type="number" placeholder="0" value={unitPrice}
              onChange={e => setUnitPrice(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Ks</label>
            <input className="form-input" type="number" min={1} value={quantity}
              onChange={e => setQuantity(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Marže %</label>
            <input className="form-input" type="number" placeholder="20" value={marginPct}
              onChange={e => setMarginPct(e.target.value)} />
          </div>
          <div>
            <label className="form-label" style={{ color: 'var(--blue)', fontSize: 10 }}>
              Prod. {((parseFloat(unitPrice)||0) * (1 + (parseFloat(marginPct)||0)/100)).toFixed(0)} {settings.currency||'Kč'}
            </label>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>za ks</div>
          </div>
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
            {saving ? '…' : '+ Přidat'}
          </button>
        </div>
      )}

      {/* MATERIÁL */}
      {itemType === 'material' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px auto', gap: 8, alignItems: 'flex-end' }}>
          <div>
            <label className="form-label">Popis spotřebního materiálu</label>
            <input className="form-input" placeholder="Termopasta, izopropylalkohol, pájecí cín…" value={desc}
              onChange={e => setDesc(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Cena celkem ({settings.currency||'Kč'})</label>
            <input className="form-input" type="number" placeholder="0" value={unitPrice}
              onChange={e => setUnitPrice(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Ks</label>
            <input className="form-input" type="number" min={1} value={quantity}
              onChange={e => setQuantity(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
            {saving ? '…' : '+ Přidat'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Order Detail ─────────────────────────────────────────────────
function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { settings } = useApp();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [editField, setEditField] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [showBarcode, setShowBarcode] = useState(false);
  const [showPinEdit, setShowPinEdit] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [visitModal, setVisitModal] = useState(false);
  const [visitForm, setVisitForm] = useState({ visit_date: '', visit_time: '', description: '', distance_km: '', notes: '' });
  const [visitSaving, setVisitSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const o = await ordersApi.get(Number(id));
    setOrder(o);
    setItems(o.items || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  const changeStatus = async (s: string) => {
    await ordersApi.status(Number(id), s);
    setMsg(`Status změněn na: ${s}`);
    load();
    setTimeout(() => setMsg(''), 3000);
  };

  const doEditField = async (field: string) => {
    await ordersApi.update(Number(id), { [field]: editVal });
    setEditField(null);
    load();
  };

  const savePin = async () => {
    await ordersApi.update(Number(id), { customer_pin: newPin });
    setPinMsg(newPin ? '✅ PIN uložen' : '✅ PIN odstraněn');
    setShowPinEdit(false);
    setNewPin('');
    load();
    setTimeout(() => setPinMsg(''), 3000);
  };

  const removeItem = async (itemId: number) => {
    await ordersApi.delItem(Number(id), itemId);
    load();
  };

  const deleteOrder = async () => {
    if (!confirm('Opravdu smazat zakázku?')) return;
    await ordersApi.delete(Number(id));
    nav('/orders');
  };

  const createVisitFromOrder = async () => {
    if (!order || !visitForm.visit_date) return;
    setVisitSaving(true);
    try {
      await ordersApi.createVisit(order.id, visitForm);
      setVisitModal(false);
      setVisitForm({ visit_date: '', visit_time: '', description: '', distance_km: '', notes: '' });
      alert('Výjezd vytvořen! Najdeš ho v modulu Výjezdy.');
    } catch { 
      alert('Chyba při vytváření výjezdu.'); 
    } finally { 
      setVisitSaving(false); 
    }
  };

  // Nahraď stávající printBarcode funkci tímto:
const printBarcode = (mode: 'a4' | 'thermal') => {
  if (!order?.barcode_url) return;
  const win = window.open('', '_blank');
  if (!win) return;

  const a4Style = `
    body {
      margin: 0; padding: 40px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      min-height: 100vh; background: #fff;
      font-family: Arial, sans-serif;
    }
    img { width: 200px; height: 200px; }
    .num { font-size: 22px; font-weight: 700; letter-spacing: 4px; margin-top: 12px; font-family: monospace; }
    .info { font-size: 14px; color: #666; margin-top: 6px; }
    @media print { body { padding: 20px; min-height: auto; } }
  `;

  const thermalStyle = `
    body {
      margin: 0; padding: 4px;
      width: 62mm;
      font-family: Arial, sans-serif;
      background: #fff;
    }
    img { width: 54mm; height: 54mm; display: block; margin: 0 auto; }
    .num { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-align: center; margin-top: 3px; font-family: monospace; }
    .info { font-size: 9px; color: #444; text-align: center; margin-top: 2px; }
    @media print {
      @page { size: 62mm auto; margin: 0; }
      body { width: 62mm; }
    }
  `;

  win.document.write(`
    <!DOCTYPE html><html><head>
    <title>${mode === 'thermal' ? 'Etiketa' : 'QR kód'} ${order.order_number}</title>
    <style>${mode === 'thermal' ? thermalStyle : a4Style}</style>
    </head><body>
      <img src="${order.barcode_url}" alt="${order.order_number}" />
      <div class="num">${order.order_number}</div>
      <div class="info">${order.customer_name} · ${order.device_type}${order.device_model ? ` · ${order.device_model}` : ''}</div>
      <script>window.onload=()=>{ window.print(); window.onafterprint=()=>window.close(); }<\/script>
    </body></html>
  `);
  win.document.close();
};

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>;
  if (!order) return <div className="alert alert-error">Zakázka nenalezena</div>;

  const canInvoice = ['Hotovo', 'Vydáno'].includes(order.status);

  // Editovatelná pole zákazníka — včetně IČO/DIČ
  const customerFields = [
    ['Jméno', 'customer_name', order.customer_name],
    ['Telefon', 'customer_phone', order.customer_phone || '—'],
    ['E-mail', 'customer_email', order.customer_email || '—'],
    ['IČO', 'customer_ico', order.customer_ico || '—'],
    ['DIČ', 'customer_dic', order.customer_dic || '—'],
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="page-title">{order.order_number}</div>
            <span className={STATUS_BADGE[order.status] || 'badge badge-muted'}>{order.status}</span>
          </div>
          <div className="page-subtitle">{order.device_type} — {order.customer_name}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/orders" className="btn btn-ghost">← Zpět</Link>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowBarcode(b => !b)} title="Zobrazit / vytisknout QR kód">
            📷 QR kód
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setVisitModal(true)}>🚗 Výjezd</button>
          {canInvoice && <Link to={`/invoicing?order=${id}`} className="btn btn-primary">🧾 Vystavit doklad</Link>}
          <button className="btn btn-danger btn-sm" onClick={deleteOrder}>🗑️</button>
        </div>
      </div>

      {msg && <div className="alert alert-success">✅ {msg}</div>}
      {pinMsg && <div className="alert alert-success">{pinMsg}</div>}

      {/* QR kód panel */}
      {showBarcode && order.barcode_url && (
  <div className="card" style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <img src={order.barcode_url} alt={order.order_number}
        style={{ width: 140, height: 140, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, letterSpacing: 3, marginBottom: 4 }}>
          {order.order_number}
        </div>
        <div className="td-muted" style={{ fontSize: 12, marginBottom: 16 }}>
          Naskenuj QR readerem nebo USB scannerem
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>
              Tisk
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => printBarcode('a4')}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 14px', gap: 2 }}>
                <span style={{ fontSize: 18 }}>🖨️</span>
                <span style={{ fontSize: 11 }}>A4</span>
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => printBarcode('thermal')}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 14px', gap: 2 }}>
                <span style={{ fontSize: 18 }}>🏷️</span>
                <span style={{ fontSize: 11 }}>Termotisk</span>
              </button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'flex-end', maxWidth: 200 }}>
            A4 — celá stránka<br/>
            Termotisk — etiketa 62mm (Brother, Dymo…)
          </div>
        </div>
      </div>
    </div>
  </div>
)}

      {/* ── STATUS BAR — HNED NAHOŘE ─────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Změna statusu</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {STATUSES.map(s => (
            <button key={s}
              className={`btn btn-sm ${order.status === s ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => changeStatus(s)}>
              {s}
            </button>
          ))}
        </div>
        <MessageGenerator order={order} />
      </div>

      {/* ── TIMER (B-07) ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <TimerWidget orderId={Number(id)} initialMinutes={order.work_duration_minutes || 0} />
      </div>

      {/* ── POLOŽKY — HNED POD STATUSEM ──────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="card-title">Položky zakázky</div>
          <div className="text-money" style={{ fontSize: 18 }}>
            Celkem: {fmt(order.total_price)} {settings.currency||'Kč'}
          </div>
        </div>

        {items.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 10 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Typ</th><th>Popis</th><th>Ks</th><th>Jedn. cena</th><th>Marže %</th><th>Celkem</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id}>
                    <td>
                      <span className="tag">
                        {it.type === 'work' ? '🔧 Práce' : it.type === 'material' ? '🧴 Materiál' : '🔩 Díl'}
                      </span>
                    </td>
                    <td>{it.description}</td>
                    <td>{it.quantity}</td>
                    <td>{fmt(it.unit_price)} {settings.currency||'Kč'}</td>
                    <td>{it.type === 'material' ? '—' : `${it.margin_percent}%`}</td>
                    <td className="text-money">{fmt(it.total_price)} {settings.currency||'Kč'}</td>
                    <td><button className="btn btn-danger btn-sm btn-icon" onClick={() => removeItem(it.id)}>🗑️</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <AddItemPanel orderId={Number(id)} onAdded={load} settings={settings} />
      </div>

      {/* ── INFO SEKCE ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Zákazník */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="card-title">Zákazník</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {order.has_pin && <span className="badge badge-green" style={{ fontSize: 10 }}>🔒 PIN nastaven</span>}
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPinEdit(p => !p)}>
                🔑 {order.has_pin ? 'Změnit PIN' : 'Přidat PIN'}
              </button>
            </div>
          </div>

          {showPinEdit && (
            <div style={{ background: 'var(--light)', padding: 10, borderRadius: 'var(--r-sm)', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Nový PIN zákazníka (prázdné = odebrat)</label>
                <input className="form-input" type="password" placeholder="PIN…" value={newPin}
                  onChange={e => setNewPin(e.target.value)} maxLength={20} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={savePin}>Uložit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPinEdit(false)}>Zrušit</button>
            </div>
          )}

          {customerFields.map(([label, field, val]) => (
            <div key={field} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--rule)' }}>
              <span className="text-muted" style={{ fontSize: 12 }}>{label}</span>
              {editField === field ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="form-input" style={{ width: 160 }} value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus />
                  <button className="btn btn-primary btn-sm" onClick={() => doEditField(field as string)}>✓</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditField(null)}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>{val as string}</span>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditField(field as string); setEditVal(val as string === '—' ? '' : val as string); }}>✏️</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Zařízení & termíny */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Zařízení & termíny</div>
          {[
            ['Typ', order.device_type],
            ['Model', order.device_model || '—'],
            ['S/N', order.device_serial || '—'],
            ['Přijato', new Date(order.received_at).toLocaleDateString('cs-CZ')],
            ['Dokončeno', order.completed_at ? new Date(order.completed_at).toLocaleDateString('cs-CZ') : '—'],
            ['Vydáno', order.issued_at ? new Date(order.issued_at).toLocaleDateString('cs-CZ') : '—'],
            ['Záruka do', order.warranty_expires ? new Date(order.warranty_expires).toLocaleDateString('cs-CZ') : '—'],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>
              <span className="text-muted" style={{ fontSize: 12 }}>{l}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>

        {/* Diagnóza */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Popis závady</div>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>{order.problem_description}</p>
          {order.diagnosis && <><hr className="divider" /><p style={{ fontSize: 13 }}><b>Diagnóza:</b> {order.diagnosis}</p></>}
        </div>

        {/* Platba */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Platba</div>
          {[
            ['Práce', order.work_price],
            ['Díly & materiál', order.parts_price],
            ['Celkem', order.total_price],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--rule)' }}>
              <span className="text-muted" style={{ fontSize: 12 }}>{l}</span>
              <span className="text-money" style={{ fontSize: l === 'Celkem' ? 20 : 14 }}>{fmt(v as number)} {settings.currency||'Kč'}</span>
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <span className={order.paid ? 'badge badge-green' : 'badge badge-amber'}>
              {order.paid ? '✅ Zaplaceno' : '⏳ Nezaplaceno'}
            </span>
          </div>
        </div>
      </div>
      {visitModal && order && (
        <div className="modal-backdrop" onClick={() => setVisitModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">🚗 Vytvořit výjezd ze zakázky #{order.order_number}</div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setVisitModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group"><label className="form-label">Datum výjezdu *</label>
                <input className="form-input" type="date" value={visitForm.visit_date} onChange={e => setVisitForm(f => ({...f, visit_date: e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Čas</label>
                <input className="form-input" type="time" value={visitForm.visit_time} onChange={e => setVisitForm(f => ({...f, visit_time: e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Vzdálenost (km)</label>
                <input className="form-input" type="number" step="0.1" value={visitForm.distance_km} onChange={e => setVisitForm(f => ({...f, distance_km: e.target.value}))} placeholder="0 = Višňové" /></div>
              <div className="form-group"><label className="form-label">Popis</label>
                <textarea className="form-textarea" rows={2} value={visitForm.description} onChange={e => setVisitForm(f => ({...f, description: e.target.value}))} placeholder={order.problem_description} /></div>
              <div className="form-group"><label className="form-label">Poznámka</label>
                <input className="form-input" value={visitForm.notes} onChange={e => setVisitForm(f => ({...f, notes: e.target.value}))} /></div>
            </div>
            <div className="modal-footer" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setVisitModal(false)}>Zrušit</button>
              <button className="btn btn-primary" onClick={createVisitFromOrder} disabled={visitSaving || !visitForm.visit_date}>
                {visitSaving ? 'Ukládám...' : '🚗 Vytvořit výjezd'}
              </button>
            </div>
          </div>
        </div>
        )}
    </div>
  );
}



export default function Orders() {
  return (
    <Routes>
      <Route index element={<OrderList />} />
      <Route path="new" element={<NewOrder />} />
      <Route path=":id" element={<OrderDetail />} />
    </Routes>
  );
}