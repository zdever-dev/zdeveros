// frontend/src/pages/Employees.tsx
import { useEffect, useState } from 'react';
import { employeesApi, accountingApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

const ALL_TABS = [
  { id: 'dashboard',  label: '📊 Dashboard' },
  { id: 'orders',     label: '🔧 Zakázky' },
  { id: 'customers',  label: '👥 Zákazníci' },
  { id: 'inventory',  label: '📦 Sklad' },
  { id: 'invoicing',  label: '🧾 Fakturace' },
  { id: 'fieldvisit',  label: 'výjezdy' },
  { id: 'warranty',  label: 'záruky' },
  { id: 'marketing', label: 'marketing' },
  { id: 'analytics',  label: '📈 Analytika' },
  { id: 'employees',  label: '👤 Zaměstnanci' },
  { id: 'settings',   label: '⚙️ Nastavení' },
];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,42,74,.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--white)', borderRadius: 14, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(28,42,74,.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: 18, color: 'var(--navy)' }}>{title}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Employees() {
  const { user } = useAuth();
  const { settings } = useApp();
  const [tab, setTab] = useState<'users'|'roles'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // User modal
  const [userModal, setUserModal] = useState<'new'|'edit'|null>(null);
  const [editUser, setEditUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({ name: '', username: '', password: '', email: '', phone: '', role_id: '' });
  const setUF = (k: string, v: string) => setUserForm(f => ({ ...f, [k]: v }));

  // Role modal
  const [roleModal, setRoleModal] = useState<'new'|'edit'|null>(null);
  const [editRole, setEditRole] = useState<any>(null);
  const [roleName, setRoleName] = useState('');
  const [roleAllowedTabs, setRoleAllowedTabs] = useState<string[]>([]);
  const [roleCanDelete, setRoleCanDelete] = useState(false);
  const [roleIsAdmin, setRoleIsAdmin] = useState(false);

  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    const [u, r] = await Promise.all([employeesApi.listUsers(), employeesApi.listRoles()]);
    setUsers(u.data || []);
    setRoles(r.data || []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  // ── User handlers ──
  const openNewUser = () => {
    // Nastavení → Zaměstnanci: předvyplnit výchozí roli z nastavení
    const defaultRoleId = settings?.default_technician_id
      ? roles.find((r: any) => r.name === 'Technik')?.id || roles[0]?.id || ''
      : roles[0]?.id || '';
    setUserForm({ name: '', username: '', password: '', email: '', phone: '', role_id: String(defaultRoleId) });
    setEditUser(null); setUserModal('new');
  };
  const openEditUser = (u: any) => {
    setUserForm({ name: u.name, username: u.username, password: '', email: u.email||'', phone: u.phone||'', role_id: String(u.role_id||'') });
    setEditUser(u); setUserModal('edit');
  };
  const saveUser = async () => {
    setSaving(true);
    try {
      const payload = { ...userForm, role_id: parseInt(userForm.role_id) || undefined };
      if (!payload.password) delete (payload as any).password;
      if (userModal === 'new') {
        await employeesApi.createUser(payload);
        flash('✅ Uživatel vytvořen');
      } else {
        await employeesApi.updateUser(editUser.id, payload);
        flash('✅ Uživatel uložen');
      }
      setUserModal(null); loadAll();
    } catch (e: any) { flash(`⚠️ ${e.message}`); }
    setSaving(false);
  };
  const deactivateUser = async (u: any) => {
    if (!confirm(`Deaktivovat uživatele "${u.name}"?`)) return;
    try {
      await employeesApi.deleteUser(u.id);
      flash(`✅ Uživatel "${u.name}" deaktivován`);
      loadAll();
    } catch (e: any) { flash(`⚠️ ${e.message}`); }
  };
  const activateUser = async (u: any) => {
    await employeesApi.updateUser(u.id, { active: true });
    flash(`✅ Uživatel "${u.name}" aktivován`);
    loadAll();
  };

  // ── Role handlers ──
  const openNewRole = () => {
    setRoleName(''); setRoleAllowedTabs(['dashboard','orders']); setRoleCanDelete(false); setRoleIsAdmin(false);
    setEditRole(null); setRoleModal('new');
  };
  const openEditRole = (r: any) => {
    setRoleName(r.name);
    setRoleAllowedTabs(JSON.parse(r.allowed_tabs || '[]'));
    setRoleCanDelete(!!r.can_delete);
    setRoleIsAdmin(!!r.is_admin);
    setEditRole(r); setRoleModal('edit');
  };
  const saveRole = async () => {
    setSaving(true);
    try {
      const payload = { name: roleName, allowed_tabs: roleAllowedTabs, can_delete: roleCanDelete, is_admin: roleIsAdmin };
      if (roleModal === 'new') {
        await employeesApi.createRole(payload);
        flash('✅ Role vytvořena');
      } else {
        await employeesApi.updateRole(editRole.id, payload);
        flash('✅ Role uložena');
      }
      setRoleModal(null); loadAll();
    } catch (e: any) { flash(`⚠️ ${e.message}`); }
    setSaving(false);
  };
  const deleteRole = async (r: any) => {
    if (!confirm(`Smazat roli "${r.name}"?`)) return;
    try {
      await employeesApi.deleteRole(r.id);
      flash(`✅ Role "${r.name}" smazána`);
      loadAll();
    } catch (e: any) { flash(`⚠️ ${e.message}`); }
  };

  const toggleTab = (id: string) => {
    setRoleAllowedTabs(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
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
          <div className="page-title">Zaměstnanci & Role</div>
          <div className="page-subtitle">Správa uživatelů, přístupových práv a rolí</div>
        </div>
      </div>

      {msg && <div className="alert alert-success" style={{ marginBottom: 16 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <TabBtn id="users" label="👤 Zaměstnanci" />
        <TabBtn id="roles" label="🏷️ Role & oprávnění" />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : tab === 'users' ? (
        // ─── USERS TAB ───────────────────────────────────────────
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={openNewUser}>+ Nový uživatel</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Jméno</th><th>Username</th><th>Email</th><th>Telefon</th><th>Role</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td><b>{u.name}</b></td>
                    <td className="td-mono">{u.username}</td>
                    <td className="td-muted">{u.email || '—'}</td>
                    <td className="td-muted">{u.phone || '—'}</td>
                    <td><span className="tag">{u.role_name || '—'}</span></td>
                    <td>
                      <span className={`badge ${u.active ? 'badge-green' : 'badge-red'}`}>
                        {u.active ? 'Aktivní' : 'Neaktivní'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditUser(u)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" title="Zadat mzdový náklad" onClick={async () => {
                          const hours = prompt(`Odpracované hodiny pro ${u.name}:`);
                          if (!hours) return;
                          const rate = prompt('Hodinová sazba (Kč):');
                          if (!rate) return;
                          const amount = parseFloat(hours) * parseFloat(rate);
                          const period = new Date().toISOString().slice(0, 7);
                          await accountingApi.salaryExpense({ user_id: u.id, username: u.username, amount, hours: parseFloat(hours), period_label: period });
                          flash(`✅ Mzdový náklad ${Math.round(amount)} Kč zaznamenán`);
                        }}>💰</button>
                        {u.active
                          ? <button className="btn btn-danger btn-sm btn-icon" onClick={() => deactivateUser(u)}>⏸️</button>
                          : <button className="btn btn-secondary btn-sm" onClick={() => activateUser(u)}>▶️</button>
                        }
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // ─── ROLES TAB ───────────────────────────────────────────
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={openNewRole}>+ Nová role</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 14 }}>
            {roles.map(r => {
              const tabs: string[] = JSON.parse(r.allowed_tabs || '[]');
              return (
                <div key={r.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: 15 }}>{r.name}</div>
                      {r.is_system && <span className="tag" style={{ fontSize: 10, marginTop: 2 }}>systémová</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditRole(r)}>✏️</button>
                      {!r.is_system && <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteRole(r)}>🗑️</button>}
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>Přístup k modulům</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {ALL_TABS.filter(t => tabs.includes(t.id)).map(t => (
                        <span key={t.id} className="tag" style={{ fontSize: 10 }}>{t.label}</span>
                      ))}
                      {tabs.length === 0 && <span className="td-muted" style={{ fontSize: 12 }}>Žádné moduly</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {r.can_delete && <span className="badge badge-amber" style={{ fontSize: 10 }}>✓ Může mazat</span>}
                    {r.is_admin   && <span className="badge badge-blue"  style={{ fontSize: 10 }}>✓ Administrátor</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── USER MODAL ──────────────────────────────────────────── */}
      {userModal && (
        <Modal title={userModal === 'new' ? 'Nový uživatel' : `Upravit — ${editUser?.name}`} onClose={() => setUserModal(null)}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Celé jméno *</label>
              <input className="form-input" value={userForm.name} onChange={e => setUF('name', e.target.value)} placeholder="Jan Novák" />
            </div>
            <div className="form-group">
              <label className="form-label">Username *</label>
              <input className="form-input" value={userForm.username} onChange={e => setUF('username', e.target.value)} placeholder="jan.novak" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{userModal === 'new' ? 'Heslo *' : 'Nové heslo (ponechte prázdné = nezměnit)'}</label>
            <input className="form-input" type="password" value={userForm.password} onChange={e => setUF('password', e.target.value)}
              placeholder={userModal === 'new' ? 'Minimálně 4 znaky' : '••••••••'} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input className="form-input" type="email" value={userForm.email} onChange={e => setUF('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefon</label>
              <input className="form-input" value={userForm.phone} onChange={e => setUF('phone', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="form-select" value={userForm.role_id} onChange={e => setUF('role_id', e.target.value)}>
              <option value="">— Bez role —</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={saveUser} disabled={saving}>
              {saving ? <div className="spinner" /> : '💾 Uložit'}
            </button>
            <button className="btn btn-ghost" onClick={() => setUserModal(null)}>Zrušit</button>
          </div>
        </Modal>
      )}

      {/* ─── ROLE MODAL ──────────────────────────────────────────── */}
      {roleModal && (
        <Modal title={roleModal === 'new' ? 'Nová role' : `Upravit roli — ${editRole?.name}`} onClose={() => setRoleModal(null)}>
          <div className="form-group">
            <label className="form-label">Název role *</label>
            <input className="form-input" value={roleName} onChange={e => setRoleName(e.target.value)}
              placeholder="Technik, Prodavač…"
              disabled={editRole?.is_system} />
            {editRole?.is_system && <div className="form-hint">Název systémové role nelze měnit</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Přístupné moduly</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
              {ALL_TABS.map(t => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 8px', borderRadius: 6, background: roleAllowedTabs.includes(t.id) ? 'var(--light)' : 'transparent', border: `1px solid ${roleAllowedTabs.includes(t.id) ? 'var(--blue)' : 'var(--rule)'}` }}>
                  <input type="checkbox" checked={roleAllowedTabs.includes(t.id)} onChange={() => toggleTab(t.id)} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 20, marginTop: 12, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={roleCanDelete} onChange={e => setRoleCanDelete(e.target.checked)} />
              Může mazat záznamy
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={roleIsAdmin} onChange={e => setRoleIsAdmin(e.target.checked)} />
              Administrátor (Nastavení + Zaměstnanci)
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={saveRole} disabled={saving}>
              {saving ? <div className="spinner" /> : '💾 Uložit roli'}
            </button>
            <button className="btn btn-ghost" onClick={() => setRoleModal(null)}>Zrušit</button>
          </div>
        </Modal>
      )}
    </div>
  );
}