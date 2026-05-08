import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { invoicingApi, ordersApi, settingsApi } from '../api';
import { useApp } from '../context/AppContext';

const fmt = (n: number) => n?.toLocaleString('cs-CZ') || '0';

// ─── Tab button helper ─────────────────────────────────────────────
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '9px 18px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--rule)',
      background: active ? 'var(--navy)' : 'var(--white)', color: active ? '#fff' : 'var(--muted)',
      fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all .15s',
    }}>{children}</button>
  );
}

export default function Invoicing() {
  const { settings } = useApp();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'generate'|'warranty'|'checklist'|'qr'|'messages'|'history'>('generate');
  const [warrantyDays, setWarrantyDays] = useState('');
  const [repairDescription, setRepairDescription] = useState('');
  // ── Generate invoice ────────────────────────────────────────────
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [invoiceType, setInvoiceType] = useState<'receipt'|'invoice'>('receipt');
  const [payMethod, setPayMethod] = useState('Hotovost');
  const [discount, setDiscount] = useState('0');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  const [error, setError] = useState('');

  // ── Checklist ───────────────────────────────────────────────────
  const [checkOrder, setCheckOrder] = useState('');
  const [checkItems, setCheckItems] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [checkResult, setCheckResult] = useState('');

  // ── QR payment ─────────────────────────────────────────────────
  const [qrAmount, setQrAmount] = useState('');
  const [qrVs, setQrVs] = useState('');
  const [qrData, setQrData] = useState<any>(null);

  // ── Messages ────────────────────────────────────────────────────
  const [msgTemplates, setMsgTemplates] = useState<any[]>([]);
  const [selectedTpl, setSelectedTpl] = useState('');
  const [msgOrder, setMsgOrder] = useState('');
  const [rendered, setRendered] = useState('');
  const [copied, setCopied] = useState(false);

  // ── Invoices list ───────────────────────────────────────────────
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    ordersApi.list({ limit: '200' }).then(r => setOrders(r.data || []));
    invoicingApi.msgTemplates().then(setMsgTemplates);
    if (params.get('order')) { setSelectedOrder(params.get('order')!); setTab('generate'); }
  }, []);

  useEffect(() => {
    if (tab === 'history') {
      invoicingApi.list().then(r => setInvoices(r.data || []));
    }
    if (tab === 'checklist') {
      settingsApi.getChecklists().then(r => {
        if (r[0]) {
          const items = JSON.parse(r[0].items);
          setCheckItems(items);
          setChecked(items.map(() => false));
        }
      });
    }
  }, [tab]);

  // ── Generate invoice ───────────────────────────────────────────
  const generate = async () => {
    if (!selectedOrder) return setError('Vyberte zakázku');
    setGenerating(true); setError(''); setGenResult(null);
    try {
      const r = await invoicingApi.generate({
        order_id: parseInt(selectedOrder),
        type: invoiceType,
        payment_method: payMethod,
        discount: parseFloat(discount) || 0,
      });
      setGenResult(r);
    } catch (e: any) { setError(e.message); }
    setGenerating(false);
  };

  // ── Warranty ───────────────────────────────────────────────────
  const [warrantyOrder, setWarrantyOrder] = useState('');
  const [warrantyResult, setWarrantyResult] = useState('');
  const generateWarranty = async () => {
    if (!warrantyOrder) return;
    const r = await invoicingApi.warranty(parseInt(warrantyOrder), {
      warranty_days: warrantyDays ? parseInt(warrantyDays) : undefined,
      repair_description: repairDescription || undefined,
    });
    setWarrantyResult(r.url);
  };

  // ── Checklist ───────────────────────────────────────────────────
  const generateChecklist = async () => {
    if (!checkOrder) return;
    const r = await invoicingApi.checklist(parseInt(checkOrder), { checked_items: checked });
    setCheckResult(r.url);
  };

  // ── QR ─────────────────────────────────────────────────────────
  const generateQr = async () => {
    const r = await invoicingApi.qrPayment({ amount: parseFloat(qrAmount)||0, variable_symbol: qrVs });
    setQrData(r);
  };

  // ── Messages ───────────────────────────────────────────────────
  const renderMsg = async () => {
    if (!selectedTpl) return;
    const r = await invoicingApi.renderMsg(parseInt(selectedTpl), { order_id: msgOrder ? parseInt(msgOrder) : undefined });
    setRendered(r.rendered);
  };
  const copyMsg = () => {
    navigator.clipboard.writeText(rendered);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Fakturace</div><div className="page-subtitle">Doklady, záruky, QR platby, zprávy</div></div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <TabBtn active={tab==='generate'} onClick={() => setTab('generate')}>🧾 Vystavit doklad</TabBtn>
        <TabBtn active={tab==='warranty'} onClick={() => setTab('warranty')}>🛡️ Záruční list</TabBtn>
        <TabBtn active={tab==='checklist'} onClick={() => setTab('checklist')}>✅ Checklist výdeje</TabBtn>
        <TabBtn active={tab==='qr'} onClick={() => setTab('qr')}>📱 QR platba</TabBtn>
        <TabBtn active={tab==='messages'} onClick={() => setTab('messages')}>💬 Šablony zpráv</TabBtn>
        <TabBtn active={tab==='history'} onClick={() => setTab('history')}>📁 Historie dokladů</TabBtn>
      </div>

      {/* ── TAB: Generate invoice ─────────────────────────────────── */}
      {tab === 'generate' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Vystavit doklad / fakturu</div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-group">
              <label className="form-label">Zakázka *</label>
              <select className="form-select" value={selectedOrder} onChange={e => setSelectedOrder(e.target.value)}>
                <option value="">Vyberte zakázku…</option>
                {orders.filter(o => !['Stornováno'].includes(o.status)).map(o => (
                  <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name} ({o.device_type})</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Typ dokladu</label>
                <select className="form-select" value={invoiceType} onChange={e => setInvoiceType(e.target.value as any)}>
                  <option value="receipt">Příjmový doklad</option>
                  <option value="invoice">Faktura</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Způsob platby</label>
                <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  <option>Hotovost</option>
                  <option>Převodem</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Sleva (Kč)</label>
              <input className="form-input" type="number" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" />
            </div>
            <button className="btn btn-primary" onClick={generate} disabled={generating} style={{ width: '100%' }}>
              {generating ? <><div className="spinner" /> Generuji PDF…</> : '🧾 Vystavit doklad'}
            </button>
          </div>

          {genResult && (
            <div className="card">
              <div className="alert alert-success">✅ Doklad vystaven!</div>
              <div style={{ marginBottom: 12 }}>
                <div className="form-label">Číslo dokladu</div>
                <div className="text-money" style={{ fontSize: 20 }}>{genResult.invoice_number}</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div className="form-label">Celková částka</div>
                <div className="text-money" style={{ fontSize: 24 }}>{fmt(genResult.total)} {settings.currency||'Kč'}</div>
              </div>
              {genResult.pdf_url && (
                <a href={genResult.pdf_url} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  📄 Otevřít doklad (Ctrl+P pro uložení jako PDF)
                </a>
              )}
              {genResult.pdf_error && <div className="alert alert-error" style={{ marginTop: 8 }}>{genResult.pdf_error}</div>}
            </div>
          )}

          {!genResult && <div className="card" style={{ background: 'var(--light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, minHeight: 200, color: 'var(--muted)' }}>
            <div style={{ fontSize: 40 }}>🧾</div>
            <p>Výsledek dokladu se zobrazí zde</p>
          </div>}
        </div>
      )}

      {/* ── TAB: Warranty ───────────────────────────────────────── */}
      {tab === 'warranty' && (
        <div className="card" style={{ maxWidth: 500 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>🛡️ Záruční list</div>
          <div className="form-group">
            <label className="form-label">Zakázka</label>
            <select className="form-select" value={warrantyOrder} onChange={e => setWarrantyOrder(e.target.value)}>
              <option value="">Vyberte zakázku…</option>
              {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Délka záruky (dny)</label>
              <input className="form-input" type="number" value={warrantyDays}
                onChange={e => setWarrantyDays(e.target.value)}
                placeholder="Výchozí z nastavení" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Popis provedené opravy (pro záruční list)</label>
            <textarea className="form-textarea" rows={3} value={repairDescription}
              onChange={e => setRepairDescription(e.target.value)}
              placeholder="Popište co bylo konkrétně opraveno / vyměněno…" />
          </div>
          <button className="btn btn-primary" onClick={generateWarranty}>🛡️ Generovat záruční list</button>
          {warrantyResult && (
            <div style={{ marginTop: 12 }}>
              <div className="alert alert-success">✅ Záruční list vygenerován!</div>
              <a href={warrantyResult} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>📄 Stáhnout záruční list</a>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Checklist ─────────────────────────────────────── */}
      {tab === 'checklist' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>✅ Checklist výdeje zařízení</div>
            <div className="form-group">
              <label className="form-label">Zakázka</label>
              <select className="form-select" value={checkOrder} onChange={e => setCheckOrder(e.target.value)}>
                <option value="">Vyberte zakázku…</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name}</option>)}
              </select>
            </div>
            <div className="checklist" style={{ margin: '14px 0' }}>
              {checkItems.map((item, i) => (
                <div key={i} className={`checklist-item${checked[i] ? ' checked' : ''}`}
                  onClick={() => setChecked(c => { const n=[...c]; n[i]=!n[i]; return n; })}>
                  <input type="checkbox" checked={checked[i]} readOnly />
                  <label>{item}</label>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              {checked.filter(Boolean).length}/{checkItems.length} hotovo
            </div>
            <button className="btn btn-primary" onClick={generateChecklist}>📄 Generovat checklist PDF</button>
            {checkResult && <a href={checkResult} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ marginTop: 8, display: 'block', textAlign: 'center' }}>Stáhnout PDF</a>}
          </div>

          <div className="card" style={{ background: 'var(--green-bg)', border: '1px solid var(--green)' }}>
            <div className="card-title" style={{ color: 'var(--green)', marginBottom: 12 }}>Postup při výdeji</div>
            <ol style={{ paddingLeft: 18, fontSize: 13, lineHeight: 2, color: 'var(--green)' }}>
              <li>Vyberte zakázku zákazníka</li>
              <li>Odškrtejte všechny kroky</li>
              <li>Vytiskněte nebo zobrazte zákazníkovi</li>
              <li>Zákazník potvrdí podpisem</li>
              <li>Vydejte zařízení</li>
            </ol>
          </div>
        </div>
      )}

      {/* ── TAB: QR payment ─────────────────────────────────────── */}
      {tab === 'qr' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>📱 Generátor QR platby (SPAYD)</div>
            <div className="form-group">
              <label className="form-label">Částka (Kč) *</label>
              <input className="form-input" type="number" placeholder="0" value={qrAmount} onChange={e => setQrAmount(e.target.value)} style={{ fontSize: 20, fontWeight: 700 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Variabilní symbol</label>
              <input className="form-input" placeholder="Č. zakázky nebo faktury" value={qrVs} onChange={e => setQrVs(e.target.value)} />
            </div>
            {settings.bank_account ? (
              <div className="form-hint" style={{ marginBottom: 12 }}>Účet: <b>{settings.bank_account}</b></div>
            ) : (
              <div className="alert alert-warning">⚠️ Nastavte číslo účtu v Nastavení</div>
            )}
            <button className="btn btn-primary" onClick={generateQr} disabled={!qrAmount}>📱 Generovat QR kód</button>
          </div>

          {qrData && (
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="card-title" style={{ marginBottom: 16 }}>QR kód pro platbu</div>
              <img src={qrData.qr_data_url} alt="QR platba" style={{ width: 200, height: 200, margin: '0 auto 16px', display: 'block', borderRadius: 8 }} />
              <div className="qr-info" style={{ textAlign: 'center' }}>
                <b>Zákazník naskenuje a potvrdí v bance</b><br />
                Částka: {fmt(parseFloat(qrAmount))} {settings.currency||'Kč'}<br />
                Účet: {settings.bank_account}<br />
                VS: {qrVs || '—'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Messages ───────────────────────────────────────── */}
      {tab === 'messages' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>💬 Šablony zpráv (B-10)</div>
            <div className="form-group">
              <label className="form-label">Situace</label>
              <select className="form-select" value={selectedTpl} onChange={e => setSelectedTpl(e.target.value)}>
                <option value="">Vyberte situaci…</option>
                {msgTemplates.map(t => <option key={t.id} value={t.id}>{t.situation}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Zakázka (pro doplnění dat)</label>
              <select className="form-select" value={msgOrder} onChange={e => setMsgOrder(e.target.value)}>
                <option value="">Bez zakázky</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={renderMsg}>Vygenerovat zprávu</button>
          </div>

          {rendered && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">Vygenerovaná zpráva</div>
                <button className="btn btn-secondary btn-sm" onClick={copyMsg}>
                  {copied ? '✅ Zkopírováno!' : '📋 Kopírovat'}
                </button>
              </div>
              <textarea className="form-textarea" value={rendered} onChange={e => setRendered(e.target.value)} rows={10} style={{ fontFamily: 'inherit', fontSize: 13 }} />
              <div className="form-hint">Zprávu můžete upravit, poté zkopírovat a odeslat přes Messenger/WhatsApp/SMS.</div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: History ────────────────────────────────────────── */}
      {tab === 'history' && (
        <div>
          <div className="card-title" style={{ marginBottom: 12 }}>Historie dokladů</div>
          {invoices.length === 0 ? (
            <div className="empty-state card"><div className="empty-icon">📁</div><p>Žádné doklady</p></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Číslo</th><th>Typ</th><th>Zakázka</th><th>Zákazník</th><th>Datum</th><th>Celkem</th><th>Platba</th><th></th></tr></thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="td-mono" style={{ fontWeight: 600 }}>{inv.invoice_number}</td>
                      <td><span className="badge badge-muted">{inv.type === 'receipt' ? 'Doklad' : 'Faktura'}</span></td>
                      <td className="td-muted">{inv.order_number}</td>
                      <td>{inv.customer_name}</td>
                      <td className="td-muted">{new Date(inv.issue_date).toLocaleDateString('cs-CZ')}</td>
                      <td className="text-money">{fmt(inv.total)} {settings.currency||'Kč'}</td>
                      <td className="td-muted">{inv.payment_method}</td>
                      <td>{inv.pdf_path && <a href={`/pdfs/${inv.pdf_path}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">PDF</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
