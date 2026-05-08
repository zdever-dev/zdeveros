// frontend/src/pages/Inventory.tsx — C-07 QR skenování + štítky + tag input
import { useEffect, useState, useCallback, useRef } from 'react';
import { inventoryApi } from '../api';
import { useApp } from '../context/AppContext';

const fmt = (n: number) => n?.toLocaleString('cs-CZ') || '0';

// ─── Tag input pro compatible_models ────────────────────────────
function TagInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [input, setInput] = useState('');
  const tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];

  const add = () => {
    const v = input.trim();
    if (!v || tags.includes(v)) { setInput(''); return; }
    onChange([...tags, v].join(', '));
    setInput('');
  };

  const remove = (tag: string) => {
    onChange(tags.filter(t => t !== tag).join(', '));
  };

  return (
    <div style={{ border: '1.5px solid var(--rule)', borderRadius: 'var(--r-sm)', padding: '6px 8px', background: 'var(--white)', minHeight: 38 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: tags.length ? 6 : 0 }}>
        {tags.map(t => (
          <span key={t} style={{ background: 'var(--light)', border: '1px solid var(--rule)', borderRadius: 99, padding: '2px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            {t}
            <button onClick={() => remove(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          style={{ border: 'none', outline: 'none', flex: 1, fontSize: 13, background: 'transparent', minWidth: 100 }}
          placeholder="Přidat model…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        />
        {input && <button onClick={add} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 12, padding: '0 4px' }}>+ Přidat</button>}
      </div>
    </div>
  );
}

// ─── QR Scanner (Camera API + jsQR-lite inline decode) ──────────
// Používá jsQR z CDN přes dynamický script load
function QrScanner({ onScan, onClose }: { onScan: (data: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState('');
  const [jsqrLoaded, setJsqrLoaded] = useState(false);

  useEffect(() => {
    // Dynamicky načti jsQR z CDN
    if ((window as any).jsQR) { setJsqrLoaded(true); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
    script.onload = () => setJsqrLoaded(true);
    script.onerror = () => setError('Nepodařilo se načíst QR scanner. Zkontroluj připojení.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!jsqrLoaded) return;
    let active = true;

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          tick();
        }
      })
      .catch(() => setError('Kamera není dostupná nebo nebyl udělen přístup.'));

    function tick() {
      if (!active || !videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = (window as any).jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            onScan(code.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [jsqrLoaded]);

  return (
    <div style={{ background: 'var(--navy)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>📷 QR Scanner — namiř kameru na QR kód dílu</div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ color: '#fff' }}>✕ Zavřít</button>
      </div>
      {error ? (
        <div style={{ color: '#f87171', padding: '16px 14px', fontSize: 13 }}>{error}</div>
      ) : (
        <div style={{ position: 'relative' }}>
          <video ref={videoRef} style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }} muted playsInline />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {!jsqrLoaded && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)' }}>
              <div className="spinner" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Inventory() {
  const { settings } = useApp();
  const [parts, setParts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editPart, setEditPart] = useState<any>(null);
  const [showCalc, setShowCalc] = useState(false);
  const [calcResult, setCalcResult] = useState<any>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [qrModal, setQrModal] = useState<any>(null); // { part, qr_data_url }
  const [form, setForm] = useState({ name:'',sku:'',category:'',compatible_models:'',purchase_price:'',margin_percent:'20',quantity:'0',min_quantity:'2',supplier:'',notes:'' });
  const [calcForm, setCalcForm] = useState({ purchase_price: '', margin_percent: '20', work_price: '' });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setC = (k: string, v: string) => setCalcForm(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    const q: Record<string,string> = {};
    if (search) q.search = search;
    if (catFilter) q.category = catFilter;
    if (lowOnly) q.low_stock = 'true';
    const r = await inventoryApi.list(q);
    setParts(r.data || []);
    setStats(r.stats || {});
    const cats = await inventoryApi.categories();
    setCategories(cats);
  }, [search, catFilter, lowOnly]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ name:'',sku:'',category:'',compatible_models:'',purchase_price:'',margin_percent:'20',quantity:'0',min_quantity:'2',supplier:'',notes:'' });
    setEditPart(null); setShowForm(true);
  };

  const openEdit = (p: any) => {
    setForm({ name:p.name,sku:p.sku||'',category:p.category||'',compatible_models:p.compatible_models||'',
      purchase_price:String(p.purchase_price),margin_percent:String(p.margin_percent),
      quantity:String(p.quantity),min_quantity:String(p.min_quantity),supplier:p.supplier||'',notes:p.notes||'' });
    setEditPart(p); setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, purchase_price: parseFloat(form.purchase_price)||0, margin_percent: parseFloat(form.margin_percent)||0, quantity: parseInt(form.quantity)||0, min_quantity: parseInt(form.min_quantity)||2 };
      if (editPart) await inventoryApi.update(editPart.id, payload);
      else await inventoryApi.create(payload);
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const deletePart = async (id: number) => {
    if (!confirm('Smazat díl?')) return;
    await inventoryApi.delete(id);
    load();
  };

  const calcMargin = async () => {
    const r = await inventoryApi.calcMargin({
      purchase_price: parseFloat(calcForm.purchase_price)||0,
      margin_percent: parseFloat(calcForm.margin_percent)||20,
      work_price: parseFloat(calcForm.work_price)||0,
    });
    setCalcResult(r);
  };

  const openQr = async (part: any) => {
    const r = await inventoryApi.getQr(part.id);
    setQrModal({ part, ...r });
  };

  const printLabel = async (part: any) => {
    const r = await inventoryApi.getLabel(part.id);
    if (r.url) window.open(r.url, '_blank');
  };

  // QR scanner callback — parsuje payload z dílu
  const handleScan = (data: string) => {
    setShowScanner(false);
    try {
      const parsed = JSON.parse(data);
      if (parsed.part_id) {
        // Najdi díl v seznamu a otevři detail
        const found = parts.find(p => p.id === parsed.part_id);
        if (found) {
          openEdit(found);
        } else {
          alert(`Díl ID ${parsed.part_id} (${parsed.name || parsed.sku || ''}) nenalezen v aktuálním filtru. Zkus bez filtrů.`);
        }
      }
    } catch {
      alert(`Naskenováno: ${data}\n\nNejde parsovat jako ZdeVer díl.`);
    }
  };

  const cur = settings.currency || 'Kč';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Sklad dílů</div>
          <div className="page-subtitle">
            {stats.total || 0} položek · {stats.low_stock || 0} pod minimem · Hodnota skladu: {fmt(stats.total_value || 0)} {cur}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${showScanner ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowScanner(s => !s)}>
            📷 QR Scanner
          </button>
          <button className={`btn btn-sm ${showCalc ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowCalc(c => !c)}>
            🧮 Kalkulačka
          </button>
          <button className="btn btn-primary" onClick={openNew}>+ Nový díl</button>
        </div>
      </div>

      {/* QR Scanner */}
      {showScanner && (
        <QrScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}

      {/* QR modal */}
      {qrModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setQrModal(null)}>
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', padding: 24, maxWidth: 320, width: '100%', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)', marginBottom: 4 }}>{qrModal.part.name}</div>
            {qrModal.part.sku && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>SKU: {qrModal.part.sku}</div>}
            <img src={qrModal.qr_data_url} alt="QR" style={{ width: 180, height: 180, margin: '0 auto 16px', display: 'block' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-primary btn-sm" onClick={() => printLabel(qrModal.part)}>🖨️ Tisk štítku</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setQrModal(null)}>Zavřít</button>
            </div>
          </div>
        </div>
      )}

      {/* Kalkulačka marže */}
      {showCalc && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>🧮 Kalkulačka marže</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nákupní cena ({cur})</label>
              <input className="form-input" type="number" placeholder="0" value={calcForm.purchase_price} onChange={e => setC('purchase_price', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Marže (%)</label>
              <input className="form-input" type="number" placeholder="20" value={calcForm.margin_percent} onChange={e => setC('margin_percent', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Cena práce ({cur})</label>
              <input className="form-input" type="number" placeholder="0" value={calcForm.work_price} onChange={e => setC('work_price', e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={calcMargin}>Spočítat</button>
          {calcResult && (
            <div style={{ marginTop: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                ['Prodejní cena dílu', fmt(calcResult.sale_price) + ' ' + cur],
                ['Zisk z dílu', fmt(calcResult.profit) + ' ' + cur],
                ['Celkem zákazník', fmt(calcResult.total_customer) + ' ' + cur],
              ].map(([l, v]) => (
                <div key={l} style={{ background: 'var(--light)', padding: '10px 14px', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{l}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filtry */}
      <div className="filter-bar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input className="form-input" placeholder="Hledat díly…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 160 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">Všechny kategorie</option>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} />
          Pod minimem
        </label>
        <button className="btn btn-secondary btn-sm" onClick={load}>Obnovit</button>
      </div>

      {/* Formulář */}
      {showForm && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--blue)' }}>
          <div className="card-title" style={{ marginBottom: 14 }}>{editPart ? 'Upravit díl' : 'Nový díl'}</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Název *</label>
              <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">SKU / kód</label>
              <input className="form-input" value={form.sku} onChange={e => set('sku', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Kategorie</label>
              <input className="form-input" list="inv-cats" value={form.category} onChange={e => set('category', e.target.value)} />
              <datalist id="inv-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Kompatibilní modely (tag input — Enter pro přidání)</label>
            <TagInput value={form.compatible_models} onChange={v => set('compatible_models', v)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nákupní cena ({cur})</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Marže (%)</label>
              <input className="form-input" type="number" min="0" value={form.margin_percent} onChange={e => set('margin_percent', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Množství (ks)</label>
              <input className="form-input" type="number" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Minimum (ks)</label>
              <input className="form-input" type="number" min="0" value={form.min_quantity} onChange={e => set('min_quantity', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Dodavatel</label>
              <input className="form-input" value={form.supplier} onChange={e => set('supplier', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Poznámky</label>
              <input className="form-input" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving || !form.name}>
              {saving ? <div className="spinner" /> : '💾 Uložit'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Zrušit</button>
          </div>
        </div>
      )}

      {/* Tabulka */}
      {parts.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">📦</div>
          <p>Žádné díly nenalezeny</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openNew}>Přidat první díl</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Název</th><th>SKU</th><th>Kategorie</th><th>Kompatibilita</th>
                <th style={{ textAlign: 'right' }}>Nák. cena</th>
                <th style={{ textAlign: 'right' }}>Marže</th>
                <th style={{ textAlign: 'right' }}>Prod. cena</th>
                <th style={{ textAlign: 'right' }}>Sklad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parts.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>
                    {p.quantity <= p.min_quantity && (
                      <span title="Pod minimem" style={{ color: 'var(--red)', marginRight: 4 }}>⚠️</span>
                    )}
                    {p.name}
                  </td>
                  <td className="td-mono td-muted">{p.sku || '—'}</td>
                  <td className="td-muted">{p.category || '—'}</td>
                  <td style={{ maxWidth: 160 }}>
                    {p.compatible_models ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {p.compatible_models.split(',').map((m: string) => m.trim()).filter(Boolean).map((m: string) => (
                          <span key={m} style={{ background: 'var(--light)', borderRadius: 99, padding: '1px 6px', fontSize: 10, border: '1px solid var(--rule)' }}>{m}</span>
                        ))}
                      </div>
                    ) : <span className="td-muted">—</span>}
                  </td>
                  <td style={{ textAlign: 'right' }} className="text-money">{fmt(p.purchase_price)} {cur}</td>
                  <td style={{ textAlign: 'right' }}>{p.margin_percent}%</td>
                  <td style={{ textAlign: 'right' }} className="text-money">{fmt(p.sale_price)} {cur}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: p.quantity <= p.min_quantity ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                      {p.quantity}
                    </span>
                    <span className="td-muted"> / {p.min_quantity}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(p)} title="Upravit">✏️</button>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openQr(p)} title="QR kód">📷</button>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => printLabel(p)} title="Tisk štítku">🏷️</button>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => deletePart(p.id)} title="Smazat">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}