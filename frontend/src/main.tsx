// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider }  from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout    from './components/Layout';
import Login     from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders    from './pages/Orders';
import Customers from './pages/Customers';
import Inventory from './pages/Inventory';
import Invoicing from './pages/Invoicing';
import Accounting from './pages/Accounting';
import Settings  from './pages/Settings';
import Employees from './pages/Employees';
import DevTools  from './pages/DevTools';
import Analytics from './pages/Analytics';
import Warranty  from './pages/Warranty';
import FieldVisits  from './pages/FieldVisits';
import Marketing    from './pages/Marketing';

// CSS import — Vite to zpracuje správně i bez TS deklarace
import './styles/globals.css';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#1C2A4A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid rgba(255,255,255,.2)',
          borderTopColor: '#4A7CC7', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>Načítám…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireTab({ tab, children }: { tab: string; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.is_super || user.allowed_tabs.includes(tab)) return <>{children}</>;
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1C2A4A', marginBottom: 8 }}>Přístup zamítnut</div>
      <div style={{ color: '#6b7a99' }}>Nemáte přístup k modulu <b>{tab}</b>. Kontaktujte administrátora.</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AppProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={
                <RedirectIfAuth><Login /></RedirectIfAuth>
              } />

              <Route path="/" element={
                <RequireAuth>
                  <ErrorBoundary>
                    <Layout />
                  </ErrorBoundary>
                </RequireAuth>
              }>
                <Route index element={<RequireTab tab="dashboard"><ErrorBoundary><Dashboard /></ErrorBoundary></RequireTab>} />
                <Route path="orders/*" element={<RequireTab tab="orders"><ErrorBoundary><Orders /></ErrorBoundary></RequireTab>} />
                <Route path="customers/*" element={<RequireTab tab="customers"><ErrorBoundary><Customers /></ErrorBoundary></RequireTab>} />
                <Route path="inventory/*" element={<RequireTab tab="inventory"><ErrorBoundary><Inventory /></ErrorBoundary></RequireTab>} />
                <Route path="invoicing/*" element={<RequireTab tab="invoicing"><ErrorBoundary><Invoicing /></ErrorBoundary></RequireTab>} />
                <Route path="accounting/*" element={<RequireTab tab="accounting"><ErrorBoundary><Accounting /></ErrorBoundary></RequireTab>} />
                <Route path="employees/*" element={<RequireTab tab="employees"><ErrorBoundary><Employees /></ErrorBoundary></RequireTab>} />
                <Route path="warranty/*" element={<RequireTab tab="orders"><ErrorBoundary><Warranty /></ErrorBoundary></RequireTab>} />
                <Route path="fieldvisits/*" element={<RequireTab tab="orders"><ErrorBoundary><FieldVisits /></ErrorBoundary></RequireTab>} />
                <Route path="marketing/*" element={<RequireTab tab="settings"><ErrorBoundary><Marketing /></ErrorBoundary></RequireTab>} />
                <Route path="analytics/*" element={<RequireTab tab="analytics"><ErrorBoundary><Analytics /></ErrorBoundary></RequireTab>} />
                <Route path="settings/*" element={<RequireTab tab="settings"><ErrorBoundary><Settings /></ErrorBoundary></RequireTab>} />
                <Route path="devtools/*" element={<RequireTab tab="devtools"><ErrorBoundary><DevTools /></ErrorBoundary></RequireTab>} />
                <Route path="marketing/*" element={<RequireTab tab="settings"><ErrorBoundary><Marketing /></ErrorBoundary></RequireTab>} />
                </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);