// backend/src/modules/devtools/routes.ts
import { Router, Request, Response } from 'express';
import { getDb } from '../../db/database';
import { requireAuth, requireSuper } from '../../middleware/auth';
import { getLogs, clearLogs } from '../../utils/logger';
import os from 'os';

const router = Router();

// Všechny dev routes vyžadují super admin
router.use(requireAuth, requireSuper);

// ─── Logy ─────────────────────────────────────────────────────────────────────
router.get('/logs', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  res.json({ data: getLogs(limit) });
});

router.delete('/logs', (_req: Request, res: Response) => {
  clearLogs();
  res.json({ success: true });
});

// ─── DB statistiky ────────────────────────────────────────────────────────────
router.get('/db-stats', (_req: Request, res: Response) => {
  const db = getDb();
  const tables = ['tenants','settings','customers','orders','order_items','parts','invoices','transactions','checklist_templates','message_templates','closings','roles','users'];

  const stats = tables.map(t => {
    try {
      const row = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number };
      return { table: t, rows: row.c };
    } catch {
      return { table: t, rows: -1 };
    }
  });

  // DB file size
  let db_size = '—';
  try {
    const { statSync } = require('fs');
    const { DB_PATH } = require('../db/database');
    const stat = statSync(process.env.DB_PATH || './data/zdever.db');
    db_size = (stat.size / 1024).toFixed(1) + ' KB';
  } catch {}

  res.json({ tables: stats, db_size });
});

// ─── Systém info ──────────────────────────────────────────────────────────────
router.get('/system', (_req: Request, res: Response) => {
  const uptime = process.uptime();
  const mem = process.memoryUsage();

  res.json({
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime_seconds: Math.floor(uptime),
    uptime_human: formatUptime(uptime),
    memory: {
      rss_mb: (mem.rss / 1024 / 1024).toFixed(1),
      heap_used_mb: (mem.heapUsed / 1024 / 1024).toFixed(1),
      heap_total_mb: (mem.heapTotal / 1024 / 1024).toFixed(1),
    },
    os: {
      hostname: os.hostname(),
      type: os.type(),
      release: os.release(),
      total_mem_mb: (os.totalmem() / 1024 / 1024).toFixed(0),
      free_mem_mb: (os.freemem() / 1024 / 1024).toFixed(0),
      cpus: os.cpus().length,
      load_avg: os.loadavg().map(l => l.toFixed(2)),
    },
    network: getNetworkInterfaces(),
    env: process.env.NODE_ENV || 'development',
    pid: process.pid,
  });
});

// ─── Test endpoint (echo) ─────────────────────────────────────────────────────
router.post('/echo', (req: Request, res: Response) => {
  res.json({
    method: req.method,
    path: req.path,
    body: req.body,
    headers: req.headers,
    user: req.user,
    timestamp: new Date().toISOString(),
  });
});

// ─── Seed testovacích dat ──────────────────────────────────────────────────────
router.post('/seed-demo', (_req: Request, res: Response) => {
  const db = getDb();
  // Vytvoří 3 demo zakázky pokud nejsou
  const count = (db.prepare('SELECT COUNT(*) as c FROM orders WHERE tenant_id = 1').get() as { c: number }).c;
  if (count > 0) return res.json({ message: 'Demo data již existují', existing: count });

  // Přidej demo zákazníka
  const cust = db.prepare(`
    INSERT INTO customers (tenant_id, name, phone, email) VALUES (1, 'Jan Novák (Demo)', '777000001', 'demo@zdever.cz')
  `).run();

  const demos = [
    { device: 'Notebook', model: 'Lenovo IdeaPad 3', problem: 'Nezapíná se, baterie nabitá' },
    { device: 'Telefon', model: 'Samsung Galaxy A52', problem: 'Prasknutý displej, nereaguje na dotek' },
    { device: 'PC', model: 'Vlastní sestava', problem: 'Modrá obrazovka, BSOD při spuštění Windows' },
  ];

  let created = 0;
  for (const d of demos) {
    try {
      db.prepare(`
        INSERT INTO orders (tenant_id, order_number, customer_id, customer_name, customer_phone,
          device_type, device_model, problem_description, status)
        VALUES (1, ?, ?, 'Jan Novák (Demo)', '777000001', ?, ?, ?, 'Přijato')
      `).run(`DEMO-00${++created}`, cust.lastInsertRowid, d.device, d.model, d.problem);
    } catch {}
  }

  res.json({ success: true, created });
});

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

function getNetworkInterfaces() {
  const ifaces = os.networkInterfaces();
  const result: { name: string; address: string; family: string }[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs || []) {
      if (!addr.internal) {
        result.push({ name, address: addr.address, family: addr.family });
      }
    }
  }
  return result;
}

export default router;