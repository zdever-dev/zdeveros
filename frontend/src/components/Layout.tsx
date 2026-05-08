// frontend/src/components/Layout.tsx
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';

const ALL_NAV = [
  { to: '/',           icon: '📊', label: 'Dashboard',    tab: 'dashboard' },
  { to: '/orders',     icon: '🔧', label: 'Zakázky',      tab: 'orders' },
  { to: '/customers',  icon: '👥', label: 'Zákazníci',    tab: 'customers' },
  { to: '/inventory',  icon: '📦', label: 'Sklad',        tab: 'inventory' },
  { to: '/invoicing',  icon: '🧾', label: 'Fakturace',    tab: 'invoicing' },
  { to: '/fieldvisits', icon: '🚗', label: 'Výjezdy',      tab: 'orders' },
  { to: '/warranty',   icon: '🛡️', label: 'Záruky',       tab: 'orders' },
  { to: '/accounting', icon: '📈', label: 'Účetnictví',   tab: 'accounting' },
  { to: '/analytics',  icon: '📉', label: 'Analytika',    tab: 'analytics' },
  { to: '/marketing',  icon: '📣', label: 'Marketing',    tab: 'settings' },
  { to: '/employees',  icon: '👤', label: 'Zaměstnanci',  tab: 'employees' },
  { to: '/settings',   icon: '⚙️', label: 'Nastavení',    tab: 'settings' },
  { to: '/devtools',   icon: '🛠️', label: 'Dev nástroje', tab: 'devtools' },
];

export default function Layout() {
  const { settings, theme, toggleTheme } = useApp();
  const { user, logout, hasTab } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const loc = useLocation();

  // Filtruj nav položky dle role
  const visibleNav = ALL_NAV.filter(n => hasTab(n.tab));

  const pageTitle = ALL_NAV.find(n => {
    if (n.to === '/') return loc.pathname === '/';
    return loc.pathname.startsWith(n.to);
  })?.label || 'ZdeVer OS';

  return (
    <div className="app-shell">
      {mobileOpen && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:49 }}
          onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`sidebar${mobileOpen ? ' open' : ''}`}>
        <NavLink to="/" className="sb-brand" onClick={() => setMobileOpen(false)}>
          <div className="sb-logo-box">Z</div>
          <div className="sb-brand-text">
            <div className="sb-name">Zde<em>Ver</em></div>
            <div className="sb-sub">OS · Repair</div>
          </div>
        </NavLink>

        <nav className="sb-nav">
          <div className="sb-section-label">Moduly</div>
          {visibleNav.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `sb-link${isActive ? ' active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <span className="icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* User info v sidebaru */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.07)', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
              {user?.is_super ? '🔐' : '👤'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.role_name}</div>
            </div>
            <button onClick={logout} title="Odhlásit" style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 6, padding: '4px 8px', color: 'rgba(255,255,255,.5)', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
              ↩ Odhlásit
            </button>
          </div>
        </div>

        <div className="sb-footer" style={{ borderTop: 'none', paddingTop: 0 }}>
          {settings.company_name || 'ZdeVer Repair'}<br />
          {settings.company_city || 'Višňové'}
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ display: 'none' }} aria-label="Menu">☰</button>

          <span style={{ fontFamily: 'var(--font-d)', fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>
            {pageTitle}
          </span>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={toggleTheme} title="Přepnout téma">
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <div style={{ position: 'relative' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowUserMenu(m => !m)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {user?.is_super ? '🔐' : '👤'}
                <span style={{ fontSize: 12 }}>{user?.name}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>▾</span>
              </button>
              {showUserMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, background: 'var(--white)', border: '1px solid var(--rule)', borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-md)', zIndex: 200, minWidth: 180, padding: 8, marginTop: 4 }}>
                  <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--rule)', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{user?.username}</div>
                    <div>{user?.role_name}</div>
                  </div>
                  <button onClick={() => { logout(); setShowUserMenu(false); }}
                    style={{ width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--red)', borderRadius: 6 }}>
                    ↩ Odhlásit se
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}