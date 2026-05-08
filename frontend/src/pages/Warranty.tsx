// frontend/src/pages/Warranty.tsx — A-07
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersApi, inventoryApi, accountingApi } from '../api';

const STATUS_BADGE: Record<string, string> = {
  'Přijato': 'badge badge-blue', 'Diagnostika': 'badge badge-teal',
  'V opravě': 'badge badge-amber', 'Čeká na díl': 'badge badge-amber',
  'Hotovo': 'badge badge-green', 'Vydáno': 'badge badge-muted', 'Stornováno': 'badge badge-red',
};

function fmtDate(dt: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('cs-CZ');
}
function daysLeft(dt: string) {
  return Math.ceil((new Date(dt).getTime() - Date.now()) / 86400000);
}

function ClaimModal({ order, onClose, onSave }: { order: any; onClose: () => void; onSave: () => void }) {
  const [reason, setReason] = useState(order.claim_reason || '');
  const [resolved, setResolved] = useState(order.claim_resolved_at ? order.claim_resolved_at.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [compatParts, setCompatParts] = useState<any[]>([]);

  useEffect(() => {
    // Záruky → Sklad: načti kompatibilní díly dle device_model
    if (order.device_model) {
      inventoryApi.compatibleParts(order.device_model)
        .then((d: any[]) => setCompatParts(d || []))
        .catch(() => {});
    }
  }, [order.device_model]);

  async function save() {
    setSaving(true);
    try {
      await ordersApi.updateClaim(order.id, {
        is_claim: 1,
        claim_reason: reason,
        claim_resolved_at: resolved || null,
      });
      onSave();
    } catch {}
    setSaving(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 520, maxWidth: '95vw', padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Reklamace — {order.order_number}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14, background: 'var(--bg)', borderRadius: 8, padding: '8px 12px' }}>
          {order.device_type}{order.device_model ? ` — ${order.device_model}` : ''} · {order.customer_name}
        </div>

        {/* Záruky → Sklad: dostupné kompatibilní díly */}
        {compatParts.length > 0 && (
          <div style={{ marginBottom: 16, background: 'var(--green-bg, #e8f4f0)', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>📦 Kompatibilní díly na skladě</div>
            {compatParts.slice(0, 4).map((p: any) => (
              <div key={p.id} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span>{p.name}</span>
                <span style={{ color: p.quantity > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                  {p.quantity > 0 ? `✅ ${p.quantity} ks` : '❌ Není skladem'}
                </span>
              </div>
            ))}
          </div>
        )}
        {order.device_model && compatParts.length === 0 && (
          <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--muted)' }}>
            ℹ️ Žádné kompatibilní díly nenalezeny ve skladu pro {order.device_model}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Důvod reklamace *</label>
          <textarea className="form-textarea" rows={3} value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Popište co zákazník reklamuje..." />
        </div>
        <div className="form-group">
          <label className="form-label">Datum vyřešení (vyplň až po vyřešení)</label>
          <input type="date" className="form-input" value={resolved} onChange={e => setResolved(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose}>Zrušit</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !reason.trim()}>
            {saving ? 'Ukládám…' : 'Uložit reklamaci'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Warranty() {
  const [tab, setTab] = useState<'expiring' | 'claims'>('expiring');
  const [days, setDays] = useState(14);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimOrder, setClaimOrder] = useState<any>(null);
  const [notifSending, setNotifSending] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [exp, cl] = await Promise.all([ordersApi.warrantyList(days), ordersApi.claims()]);
      setExpiring(exp.data || []);
      setClaims(cl.data || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [days]);

  async function resolveClaim(order: any) {
    if (!confirm(`Označit reklamaci ${order.order_number} jako vyřešenou?`)) return;
    await ordersApi.updateClaim(order.id, { is_claim: 1, claim_resolved_at: new Date().toISOString().slice(0, 10) });
    load();
  }

  async function removeClaim(order: any) {
    if (!confirm(`Zrušit označení reklamace u ${order.order_number}?`)) return;
    await ordersApi.updateClaim(order.id, { is_claim: 0, claim_resolved_at: null });
    load();
  }

  // Záruky → Zákazníci: simulace odeslání notifikace (základ pro SMS/email)
  async function sendNotification(order: any) {
    setNotifSending(order.id);
    // Připravená zpráva — v budoucnu nahradit SMS/email API voláním
    const msg = `Dobrý den ${order.customer_name}, záruční lhůta na opravu zařízení ${order.device_type} vyprší dne ${fmtDate(order.warranty_expires)}. Pokud máte dotazy, kontaktujte nás. ZdeVer Repair`;
    await navigator.clipboard.writeText(msg).catch(() => {});
    alert(`📋 Zpráva zkopírována do schránky:\n\n${msg}\n\nOdešli zákazníkovi přes SMS nebo WhatsApp.`);
    setNotifSending(null);
  }

  // Záruky → Marketing: follow-up po vypršení záruky
  async function sendFollowup(order: any) {
    const msg = `Dobrý den ${order.customer_name}, vaše záruka na opravu ${order.device_type} nedávno vypršela. Nabízíme vám servisní prohlídku nebo novou opravu. Kontaktujte nás! ZdeVer Repair`;
    await navigator.clipboard.writeText(msg).catch(() => {});
    alert(`📋 Follow-up zpráva zkopírována:\n\n${msg}`);
  }

  const activeClaims = claims.filter(c => !c.claim_resolved_at);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Záruky & Reklamace</div>
          <div className="page-subtitle">Evidence expirujících záruk a reklamací</div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ '--accent': 'var(--amber)' } as any}>
          <div className="stat-label">Záruky vyprší do {days} dní</div>
          <div className="stat-value">{expiring.length}</div>
          <div className="stat-sub">aktivních záruk</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--red)' } as any}>
          <div className="stat-label">Aktivní reklamace</div>
          <div className="stat-value">{activeClaims.length}</div>
          <div className="stat-sub">čeká na vyřešení</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--green)' } as any}>
          <div className="stat-label">Vyřešené reklamace</div>
          <div className="stat-value">{claims.filter(c => c.claim_resolved_at).length}</div>
          <div className="stat-sub">celkem</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid var(--rule)', paddingBottom: 0 }}>
        {(['expiring', 'claims'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
            color: tab === t ? 'var(--blue)' : 'var(--muted)',
            borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {t === 'expiring' ? `🛡️ Expirující záruky (${expiring.length})` : `⚠️ Reklamace (${claims.length})`}
          </button>
        ))}
      </div>

      {tab === 'expiring' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--rule)' }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Zobrazit záruky vyprší do:</span>
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDays(d)} className={`btn btn-sm ${days === d ? 'btn-primary' : 'btn-ghost'}`}>{d} dní</button>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div>
          ) : expiring.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              ✅ Žádné záruky nevyprší v dalších {days} dnech
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Zakázka</th><th>Zákazník</th><th>Zařízení</th>
                    <th>Platnost záruky</th><th>Zbývá</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.map(o => {
                    const left = daysLeft(o.warranty_expires);
                    return (
                      <tr key={o.id}>
                        <td><Link to="/orders" style={{ fontWeight: 700, color: 'var(--blue)' }}>{o.order_number}</Link></td>
                        <td>
                          <div>{o.customer_name}</div>
                          {o.customer_phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.customer_phone}</div>}
                        </td>
                        <td>{o.device_type}{o.device_model ? ` — ${o.device_model}` : ''}</td>
                        <td>{fmtDate(o.warranty_expires)}</td>
                        <td>
                          <span style={{ fontWeight: 700, color: left <= 3 ? 'var(--red)' : left <= 7 ? 'var(--amber)' : 'var(--green)' }}>
                            {left} dní
                          </span>
                        </td>
                        <td><span className={STATUS_BADGE[o.status] || 'badge'}>{o.status}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {/* Záruky → Zákazníci: notifikace */}
                            <button className="btn btn-ghost btn-sm" title="Kopírovat notifikaci zákazníkovi"
                              onClick={() => sendNotification(o)} disabled={notifSending === o.id}>
                              {notifSending === o.id ? '…' : '📨'}
                            </button>
                            {/* Záruky → Marketing: follow-up */}
                            <button className="btn btn-ghost btn-sm" title="Follow-up zpráva" onClick={() => sendFollowup(o)}>🔁</button>
                            <button className="btn btn-ghost btn-sm" title="Zadat reklamaci" onClick={() => setClaimOrder(o)}>⚠️</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--rule)', fontSize: 12, color: 'var(--muted)' }}>
            📨 = kopíruje notifikaci před koncem záruky do schránky · 🔁 = kopíruje follow-up po vypršení · ⚠️ = zadat reklamaci
          </div>
        </div>
      )}

      {tab === 'claims' && (
        <div className="card">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" /></div>
          ) : claims.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>✅ Žádné reklamace evidovány</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Zakázka</th><th>Zákazník</th><th>Zařízení</th>
                    <th>Důvod</th><th>Přijato</th><th>Záruka do</th><th>Vyřešeno</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map(o => (
                    <tr key={o.id}>
                      <td><span style={{ fontWeight: 700, color: 'var(--blue)' }}>{o.order_number}</span></td>
                      <td>
                        <div>{o.customer_name}</div>
                        {o.customer_phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.customer_phone}</div>}
                      </td>
                      <td>{o.device_type}</td>
                      <td style={{ maxWidth: 180, fontSize: 12 }}>{o.claim_reason || '—'}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(o.received_at)}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(o.warranty_expires)}</td>
                      <td>
                        {o.claim_resolved_at
                          ? <span className="badge badge-green">✅ {fmtDate(o.claim_resolved_at)}</span>
                          : <span className="badge badge-red">Otevřená</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setClaimOrder(o)} title="Upravit">✏️</button>
                          {!o.claim_resolved_at && (
                            <button className="btn btn-ghost btn-sm" onClick={() => resolveClaim(o)} title="Označit vyřešeno">✅</button>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => removeClaim(o)} title="Odebrat reklamaci">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {claimOrder && (
        <ClaimModal order={claimOrder} onClose={() => setClaimOrder(null)} onSave={() => { setClaimOrder(null); load(); }} />
      )}
    </div>
  );
}