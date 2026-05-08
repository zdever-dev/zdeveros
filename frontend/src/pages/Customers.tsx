import { useEffect, useState, useCallback } from 'react';
import { customersApi, invoicingApi, accountingApi } from '../api';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export default function Customers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', city: '', notes: '', ico: '', dic: '' });
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    const r = await customersApi.list(search ? { search } : {});
    setCustomers(r.data || []);
    setTotal(r.total || 0);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ name: '', phone: '', email: '', address: '', city: '', notes: '', ico: '', dic: ''  });
    setEditId(null); setError(''); setShowForm(true);
  };

  const openEdit = (c: any) => {
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', city: c.city || '', notes: c.notes || '', ico: c.ico || '', dic: c.dic || '' });
    setEditId(c.id); setError(''); setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return setError('Jméno je povinné');
    setSaving(true); setError('');
    try {
      if (editId) await customersApi.update(editId, form);
      else await customersApi.create(form);
      setShowForm(false);
      load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const del = async (id: number) => {
    if (!confirm('Smazat zákazníka? Zakázky zůstanou.')) return;
    await customersApi.delete(id);
    if (selected?.id === id) setSelected(null);
    load();
  };

  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [customerCredit, setCustomerCredit] = useState<any>(null);

  const viewDetail = async (c: any) => {
    const full = await customersApi.get(c.id);
    setSelected(full);
    // Fakturace → Zákazníci: doklady zákazníka
    invoicingApi.byCustomer(c.id).then((d: any) => setCustomerInvoices(d?.data || [])).catch(() => {});
    // Zákazníci → Účetnictví: kredit zákazníka
    accountingApi.customerCredit(c.id).then(setCustomerCredit).catch(() => {});
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Zákazníci</div>
          <div className="page-subtitle">CRM databáze — {total} zákazníků</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Nový zákazník</button>
      </div>

      <div className="filter-bar">
        <div className="search-input-wrap" style={{ flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input className="form-input" placeholder="Hledat jméno, telefon, e-mail…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 16 }}>
        {/* Table */}
        <div>
          {customers.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-icon">👥</div>
              <p>Žádní zákazníci nenalezeni</p>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openNew}>Přidat zákazníka</button>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Jméno</th><th>Telefon</th><th>E-mail</th><th>Zakázky</th><th>Utraceno</th><th></th></tr>
                </thead>
                <tbody>
                  {customers.map(c => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => viewDetail(c)}>
                      <td><b>{c.name}</b></td>
                      <td className="td-muted">{c.phone || '—'}</td>
                      <td className="td-muted">{c.email || '—'}</td>
                      <td><span className="badge badge-blue">{c.total_orders}</span></td>
                      <td className="text-money">{c.total_spent?.toLocaleString('cs-CZ') || 0} Kč</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card" style={{ position: 'sticky', top: 80, alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="card-title">{selected.name}</div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>
            {[['Telefon', selected.phone],['E-mail', selected.email],['Adresa', selected.address],['Město', selected.city]].map(([l,v]) => v ? (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>
                <span className="text-muted" style={{ fontSize: 11 }}>{l}</span><span>{v}</span>
              </div>
            ) : null)}
            {selected.notes && <p style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>{selected.notes}</p>}
            {selected.source && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
                📣 Zdroj zákazníka: <strong style={{ color: 'var(--navy)' }}>{selected.source}</strong>
              </div>
            )}
            {selected.is_inactive && (
              <div className="alert alert-warning" style={{ marginTop: 10, fontSize: 13 }}>
                ⚠️ Neaktivní zákazník — poslední zakázka před {selected.days_since_last_order} dny
              </div>
            )}

            <div style={{ margin: '14px 0 8px', fontWeight: 700, fontSize: 12, color: 'var(--navy)' }}>
              Historie zakázek ({selected.orders?.length || 0})
            </div>
            {selected.orders?.length > 0 ? selected.orders.slice(0, 6).map((o: any) => (
              <div key={o.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--rule)', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="td-mono" style={{ color: 'var(--blue)' }}>{o.order_number}</span>
                  <span>{o.total_price?.toLocaleString('cs-CZ')} Kč</span>
                </div>
                <div className="text-muted">{o.device_type} — {o.status}</div>
              </div>
            )) : <p className="text-muted" style={{ fontSize: 12 }}>Žádné zakázky</p>}
            {selected.visits && selected.visits.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)', marginBottom: 8 }}>🚗 Výjezdy k zákazníkovi</div>
                {selected.visits.map((v: any) => (
                  <div key={v.id} style={{ background: 'var(--light)', borderRadius: 'var(--r-sm)', padding: '10px 14px', marginBottom: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{v.visit_date} — {v.address || 'bez adresy'}</span>
                    <span style={{ color: 'var(--muted)' }}>{v.distance_km} km · {v.fee_czk} Kč · {v.status}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Fakturace → Zákazníci: archiv dokladů */}
            {customerInvoices.length > 0 && (
              <div style={{ marginTop: 14, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--navy)', marginBottom: 6 }}>🧾 Doklady ({customerInvoices.length})</div>
                {customerInvoices.slice(0, 4).map((inv: any) => (
                  <div key={inv.id} style={{ padding: '5px 0', borderBottom: '1px solid var(--rule)', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span className="td-mono" style={{ color: 'var(--blue)' }}>{inv.invoice_number}</span>
                    <span>{inv.total?.toLocaleString('cs-CZ')} Kč</span>
                  </div>
                ))}
              </div>
            )}

            {/* Zákazníci → Účetnictví: kredit */}
            {customerCredit !== null && (
              <div style={{ marginTop: 10, background: customerCredit.balance >= 0 ? 'var(--green-bg, #e8f4f0)' : '#fff0f0', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                <span style={{ color: 'var(--muted)' }}>Kredit zákazníka: </span>
                <span style={{ fontWeight: 700, color: customerCredit.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {customerCredit.balance >= 0 ? '+' : ''}{customerCredit.balance?.toLocaleString('cs-CZ')} Kč
                </span>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8, fontSize: 11 }} onClick={async () => {
                  const amount = prompt('Přidat zálohu (Kč):');
                  if (!amount) return;
                  await accountingApi.addCredit(selected.id, { amount: parseFloat(amount), type: 'deposit', note: '' });
                  accountingApi.customerCredit(selected.id).then(setCustomerCredit).catch(() => {});
                }}>+ Záloha</button>
              </div>
            )}

            <button className="btn btn-secondary" style={{ marginTop: 12, width: '100%' }} onClick={() => openEdit(selected)}>
              ✏️ Upravit zákazníka
            </button>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <Modal title={editId ? 'Upravit zákazníka' : 'Nový zákazník'} onClose={() => setShowForm(false)}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group"><label className="form-label">Jméno *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Telefon</label>
              <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">E-mail</label>
              <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Adresa</label>
              <input className="form-input" value={form.address} onChange={e => set('address', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Město</label>
              <input className="form-input" value={form.city} onChange={e => set('city', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Poznámky</label>
            <textarea className="form-textarea" value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">IČO (pro firmy)</label>
              <input className="form-input" placeholder="12345678" value={form.ico} onChange={e => set('ico',e.target.value)} /></div>
            <div className="form-group"><label className="form-label">DIČ (pro firmy)</label>
              <input className="form-input" placeholder="CZ12345678" value={form.dic} onChange={e => set('dic',e.target.value)} /></div>
          </div>
          <div className="modal-footer" style={{ padding: 0, marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Zrušit</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <div className="spinner" /> : (editId ? 'Uložit změny' : 'Přidat zákazníka')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
