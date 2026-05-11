// backend/src/server.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
import { networkInterfaces } from 'os';

dotenv.config();

import { initializeDatabase } from './db/database';
import { requireAuth }        from './middleware/auth';
import { pushLog }            from './utils/logger';

// Module routers
import authRouter       from './modules/auth/routes';
import ordersRouter     from './modules/orders/routes';
import customersRouter  from './modules/customers/routes';
import inventoryRouter  from './modules/inventory/routes';
import invoicingRouter  from './modules/invoicing/routes';
import accountingRouter from './modules/accounting/routes';
import settingsRouter   from './modules/settings/routes';
import employeesRouter  from './modules/employees/routes';
import devtoolsRouter   from './modules/devtools/routes';
import analyticsRouter  from './modules/analytics/routes';
import fieldVisitsRouter  from './modules/fieldvisits/routes'
import marketingRouter    from './modules/marketing/routes';

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const PDF_DIR = process.env.PDF_OUTPUT_DIR || join(process.cwd(), 'data', 'pdfs');
mkdirSync(PDF_DIR, { recursive: true });
initializeDatabase();

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT || '3001');
const HOST = '0.0.0.0'; // Naslouchá na všech síťových rozhraních → přístupné z LAN

// Security
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// CORS — v LAN prostředí povolíme všechny origins
app.use(cors({
  origin: true,  // v produkci nastav na konkrétní IP pokud chceš omezit přístup
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// Logování requestů do paměti pro DevTools
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    pushLog({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      user: (req as any).user?.username || 'anonymous',
      ip: req.ip || req.socket.remoteAddress || '—',
    });
  });
  next();
});

// Konzolové logování (jednoduché, bez morgan)
if (process.env.NODE_ENV !== 'test') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString().slice(11,19)}] ${req.method} ${req.path}`);
    next();
  });
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// PDF static files
app.use('/pdfs', express.static(PDF_DIR));

// ─── Statické soubory (production build frontendu) ────────────────────────────
const FRONTEND_DIST = join(__dirname, '../../frontend/dist');
if (existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  console.log('  📁  Serving frontend from:', FRONTEND_DIST);
}

// ─── API Routes ───────────────────────────────────────────────────────────────
// Auth — veřejné (bez JWT)
app.use('/api/auth', authRouter);

// Health check — veřejný
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.1.0', name: 'ZdeVer OS', timestamp: new Date().toISOString() });
});

// Všechny ostatní API routes vyžadují přihlášení
app.use('/api', requireAuth);

app.use('/api/orders',     ordersRouter);
app.use('/api/customers',  customersRouter);
app.use('/api/inventory',  inventoryRouter);
app.use('/api/invoicing',  invoicingRouter);
app.use('/api/accounting', accountingRouter);
app.use('/api/settings',   settingsRouter);
app.use('/api/employees',  employeesRouter);
app.use('/api/devtools',   devtoolsRouter);
app.use('/api/analytics',  analyticsRouter);
app.use('/api/fieldvisits', fieldVisitsRouter);
app.use('/api/marketing',   marketingRouter);

// ─── SPA fallback (pro React Router) ─────────────────────────────────────────
if (existsSync(FRONTEND_DIST)) {
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(join(FRONTEND_DIST, 'index.html'));
  });
}

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  🔧  ZdeVer OS Backend v1.1.0');
  console.log(`  📡  Localhost:  http://localhost:${PORT}`);

  // Vypíše LAN adresy
  const ifaces = networkInterfaces();
  for (const [, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs || []) {
      if (!addr.internal && addr.family === 'IPv4') {
        console.log(`  🌐  LAN:        http://${addr.address}:${PORT}`);
      }
    }
  }

  console.log(`  💾  SQLite:     ${process.env.DB_PATH || './data/zdever.db'}`);
  console.log(`  🔐  Super admin: zdever-technik`);
  console.log('');
});

export default app;