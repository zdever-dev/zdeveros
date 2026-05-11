// backend/src/modules/analytics/routes.ts
import { Router, Request, Response } from 'express';
import { getDb } from '../../db/database';
import { writeFileSync } from 'fs';
import { join } from 'path';

const router = Router();
const TENANT = 1;
const PDF_DIR = process.env.PDF_OUTPUT_DIR || join(process.cwd(), 'data', 'pdfs');

function getSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings WHERE tenant_id = ?').all(TENANT) as { key: string; value: string }[];
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

// ─── Analytics overview ───────────────────────────────────────────────────────
router.get('/overview', (req: Request, res: Response) => {
  const db = getDb();
  const { from, to, period = 'year' } = req.query as Record<string, string>;

  const now = new Date();
  const yearStr = String(now.getFullYear());
  const monthStr = now.toISOString().slice(0, 7);

  let dateFrom = from;
  let dateTo = to;
  if (!dateFrom) {
    if (period === 'month') dateFrom = monthStr + '-01';
    else dateFrom = yearStr + '-01-01';
  }
  if (!dateTo) dateTo = now.toISOString().slice(0, 10);

  // 1. Nejpopulárnější typy oprav
  const popularRepairs = db.prepare(`
    SELECT device_type, COUNT(*) as count, SUM(total_price) as revenue, AVG(total_price) as avg_price
    FROM orders
    WHERE tenant_id = ? AND date(received_at) BETWEEN ? AND ?
    GROUP BY device_type
    ORDER BY count DESC
    LIMIT 10
  `).all(TENANT, dateFrom, dateTo);

  // 2. Průměrná cena zakázky po měsících
  const monthlyAvg = db.prepare(`
    SELECT
      strftime('%Y-%m', received_at) as month,
      COUNT(*) as count,
      AVG(total_price) as avg_price,
      SUM(total_price) as total_revenue,
      SUM(CASE WHEN paid = 1 THEN total_price ELSE 0 END) as paid_revenue
    FROM orders
    WHERE tenant_id = ? AND date(received_at) BETWEEN ? AND ?
    GROUP BY month
    ORDER BY month ASC
  `).all(TENANT, dateFrom, dateTo);

  // 3. Průměrná délka opravy (dni od received_at do completed_at)
  const durationStats = db.prepare(`
    SELECT
      AVG(CAST((julianday(completed_at) - julianday(received_at)) AS REAL)) as avg_days,
      MIN(CAST((julianday(completed_at) - julianday(received_at)) AS REAL)) as min_days,
      MAX(CAST((julianday(completed_at) - julianday(received_at)) AS REAL)) as max_days,
      COUNT(*) as completed_count
    FROM orders
    WHERE tenant_id = ? AND completed_at IS NOT NULL
      AND date(received_at) BETWEEN ? AND ?
  `).get(TENANT, dateFrom, dateTo) as any;

  // 4. Top 10 zákazníků
  const topCustomers = db.prepare(`
    SELECT
      customer_name,
      customer_id,
      COUNT(*) as order_count,
      SUM(total_price) as total_spent,
      SUM(CASE WHEN paid = 1 THEN total_price ELSE 0 END) as paid_total
    FROM orders
    WHERE tenant_id = ? AND date(received_at) BETWEEN ? AND ?
    GROUP BY COALESCE(customer_id, customer_name)
    ORDER BY total_spent DESC
    LIMIT 10
  `).all(TENANT, dateFrom, dateTo);

  // 5. Reklamace (status = 'Reklamace' nebo vrácené)
  const claimsCount = db.prepare(`
    SELECT COUNT(*) as count FROM orders
    WHERE tenant_id = ? AND status = 'Stornováno' AND date(received_at) BETWEEN ? AND ?
  `).get(TENANT, dateFrom, dateTo) as { count: number };

  // 6. Celkové summary
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_orders,
      SUM(CASE WHEN paid = 1 THEN total_price ELSE 0 END) as total_revenue,
      AVG(CASE WHEN paid = 1 THEN total_price ELSE NULL END) as avg_order_value,
      SUM(CASE WHEN status NOT IN ('Vydáno','Stornováno') THEN 1 ELSE 0 END) as open_orders,
      SUM(CASE WHEN paid = 0 AND status NOT IN ('Stornováno') THEN total_price ELSE 0 END) as unpaid_total
    FROM orders
    WHERE tenant_id = ? AND date(received_at) BETWEEN ? AND ?
  `).get(TENANT, dateFrom, dateTo) as any;

  // 7. Work timer stats
  const timerStats = db.prepare(`
    SELECT
      AVG(work_duration_minutes) as avg_minutes,
      SUM(work_duration_minutes) as total_minutes,
      COUNT(*) as timed_count
    FROM orders
    WHERE tenant_id = ? AND work_duration_minutes > 0 AND date(received_at) BETWEEN ? AND ?
  `).get(TENANT, dateFrom, dateTo) as any;

  res.json({
    period: { from: dateFrom, to: dateTo },
    summary,
    popular_repairs: popularRepairs,
    monthly_avg: monthlyAvg,
    duration_stats: durationStats,
    top_customers: topCustomers,
    claims_count: claimsCount?.count || 0,
    timer_stats: timerStats,
  });
});

// ─── Generate analytics HTML report ──────────────────────────────────────────
router.get('/report', (req: Request, res: Response) => {
  const db = getDb();
  const settings = getSettings();
  const { from, to } = req.query as Record<string, string>;
  const now = new Date();
  const dateFrom = from || now.getFullYear() + '-01-01';
  const dateTo = to || now.toISOString().slice(0, 10);
  const cur = settings.currency || 'Kč';
  const fmt = (n: number) => Math.round(n || 0).toLocaleString('cs-CZ');

  const popularRepairs = db.prepare(`
    SELECT device_type, COUNT(*) as count, SUM(total_price) as revenue
    FROM orders WHERE tenant_id = ? AND date(received_at) BETWEEN ? AND ?
    GROUP BY device_type ORDER BY count DESC LIMIT 10
  `).all(TENANT, dateFrom, dateTo) as any[];

  const topCustomers = db.prepare(`
    SELECT customer_name, COUNT(*) as order_count, SUM(total_price) as total_spent
    FROM orders WHERE tenant_id = ? AND date(received_at) BETWEEN ? AND ?
    GROUP BY COALESCE(customer_id, customer_name)
    ORDER BY total_spent DESC LIMIT 10
  `).all(TENANT, dateFrom, dateTo) as any[];

  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', received_at) as month, COUNT(*) as count,
      SUM(CASE WHEN paid=1 THEN total_price ELSE 0 END) as revenue
    FROM orders WHERE tenant_id = ? AND date(received_at) BETWEEN ? AND ?
    GROUP BY month ORDER BY month
  `).all(TENANT, dateFrom, dateTo) as any[];

  const summary = db.prepare(`
    SELECT COUNT(*) as total, SUM(CASE WHEN paid=1 THEN total_price ELSE 0 END) as revenue,
      AVG(total_price) as avg_price
    FROM orders WHERE tenant_id = ? AND date(received_at) BETWEEN ? AND ?
  `).get(TENANT, dateFrom, dateTo) as any;

  const maxRev = Math.max(...monthly.map((m: any) => m.revenue || 0), 1);

  const html = `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
<title>Analytics Report — ${settings.company_name || 'ZdeVer Repair'}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:11px;line-height:1.5;color:#1a1f2e;background:#fff;padding:12mm}
h1{font-size:20px;font-weight:800;color:#1C2A4A;margin-bottom:4px}
h2{font-size:13px;font-weight:700;color:#1C2A4A;margin:14px 0 8px;border-bottom:2px solid #1C2A4A;padding-bottom:4px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:12px;border-bottom:3px solid #4A7CC7}
.company{font-size:13px;font-weight:700;color:#1C2A4A}
.period{font-size:10px;color:#6b7a99;text-align:right}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
.kpi{background:#eef1f8;border-radius:6px;padding:10px 12px}
.kpi-val{font-size:20px;font-weight:800;color:#1C2A4A}
.kpi-lbl{font-size:9px;color:#6b7a99;text-transform:uppercase;letter-spacing:1px;margin-top:2px}
table{width:100%;border-collapse:collapse;margin-bottom:12px}
th{font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#6b7a99;padding:5px 6px;text-align:left;border-bottom:1.5px solid #1C2A4A}
td{padding:5px 6px;border-bottom:1px solid #d8dde8;font-size:10px}
.bar-wrap{margin:4px 0 12px}
.bar-row{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.bar-lbl{font-size:9px;color:#1C2A4A;width:50px;text-align:right;flex-shrink:0}
.bar{height:14px;background:#4A7CC7;border-radius:2px;min-width:2px}
.bar-val{font-size:9px;color:#6b7a99;margin-left:4px}
.text-right{text-align:right}
.text-money{font-weight:700;font-family:monospace}
footer{margin-top:16px;padding-top:8px;border-top:1px solid #d8dde8;font-size:9px;color:#6b7a99;display:flex;justify-content:space-between}
@media print{body{padding:8mm}@page{margin:0}}
</style></head><body>
<div class="header">
  <div>
    <div class="company">${settings.company_name || 'ZdeVer Repair'}</div>
    <h1>Analytics Report</h1>
  </div>
  <div class="period">Období: ${dateFrom} — ${dateTo}<br>Vygenerováno: ${new Date().toLocaleDateString('cs-CZ')}</div>
</div>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">${fmt(summary.total)}</div><div class="kpi-lbl">Zakázek celkem</div></div>
  <div class="kpi"><div class="kpi-val">${fmt(summary.revenue)} ${cur}</div><div class="kpi-lbl">Tržby (zaplaceno)</div></div>
  <div class="kpi"><div class="kpi-val">${fmt(summary.avg_price)} ${cur}</div><div class="kpi-lbl">Prům. cena zakázky</div></div>
</div>

<h2>Měsíční tržby</h2>
<div class="bar-wrap">
${monthly.map((m: any) => `
  <div class="bar-row">
    <div class="bar-lbl">${m.month}</div>
    <div class="bar" style="width:${Math.round((m.revenue / maxRev) * 200)}px"></div>
    <div class="bar-val">${fmt(m.revenue)} ${cur} (${m.count} zak.)</div>
  </div>`).join('')}
</div>

<h2>Nejpopulárnější typy oprav</h2>
<table>
  <thead><tr><th>Typ zařízení</th><th class="text-right">Počet</th><th class="text-right">Tržby</th></tr></thead>
  <tbody>
    ${popularRepairs.map((r: any) => `
    <tr><td>${r.device_type}</td><td class="text-right">${r.count}</td><td class="text-right text-money">${fmt(r.revenue)} ${cur}</td></tr>`).join('')}
  </tbody>
</table>

<h2>Top zákazníci</h2>
<table>
  <thead><tr><th>Zákazník</th><th class="text-right">Zakázek</th><th class="text-right">Celkem utratil</th></tr></thead>
  <tbody>
    ${topCustomers.map((c: any) => `
    <tr><td>${c.customer_name}</td><td class="text-right">${c.order_count}</td><td class="text-right text-money">${fmt(c.total_spent)} ${cur}</td></tr>`).join('')}
  </tbody>
</table>

<footer>
  <span>${settings.company_name || 'ZdeVer Repair'} · ${settings.company_address || ''}</span>
  <span>ZdeVer OS · Analytics Report</span>
</footer>
<script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
</body></html>`;

  const filename = `analytics-report-${Date.now()}.html`;
  const outputPath = join(PDF_DIR, filename);
  writeFileSync(outputPath, html, 'utf-8');

  res.json({ filename, url: `/pdfs/${filename}` });
});

// ─── Výkon techniků (Zaměstnanci → Analytika, Zakázky → Analytika) ───────────
router.get('/technicians', (req: Request, res: Response) => {
  const db = getDb();
  const { from, to } = req.query as Record<string, string>;
  const now = new Date();
  const dateFrom = from || now.getFullYear() + '-01-01';
  const dateTo   = to   || now.toISOString().slice(0, 10);

  const technicians = db.prepare(`
    SELECT
      technician,
      COUNT(*) as order_count,
      SUM(CASE WHEN paid = 1 THEN total_price ELSE 0 END) as total_revenue,
      ROUND(AVG(CASE WHEN work_duration_minutes > 0 THEN work_duration_minutes ELSE NULL END), 1) as avg_minutes,
      SUM(CASE WHEN is_claim = 1 THEN 1 ELSE 0 END) as claim_count,
      SUM(CASE WHEN status = 'Stornováno' THEN 1 ELSE 0 END) as cancelled_count
    FROM orders
    WHERE tenant_id = ? AND technician IS NOT NULL AND technician != ''
      AND date(received_at) BETWEEN ? AND ?
    GROUP BY technician
    ORDER BY total_revenue DESC
  `).all(TENANT, dateFrom, dateTo);

  res.json({ from: dateFrom, to: dateTo, technicians });
});

// ─── ROI per zdroj zákazníka (Analytika → Marketing) ─────────────────────────
router.get('/sources', (req: Request, res: Response) => {
  const db = getDb();
  const { from, to } = req.query as Record<string, string>;
  const now = new Date();
  const dateFrom = from || now.getFullYear() + '-01-01';
  const dateTo   = to   || now.toISOString().slice(0, 10);

  const sources = db.prepare(`
    SELECT
      COALESCE(NULLIF(source, ''), 'Nezadáno') as source,
      COUNT(*) as order_count,
      SUM(CASE WHEN paid = 1 THEN total_price ELSE 0 END) as total_revenue,
      ROUND(AVG(total_price), 0) as avg_order_value,
      COUNT(DISTINCT COALESCE(customer_id, customer_name)) as unique_customers
    FROM orders
    WHERE tenant_id = ? AND date(received_at) BETWEEN ? AND ?
    GROUP BY source
    ORDER BY total_revenue DESC
  `).all(TENANT, dateFrom, dateTo);

  res.json({ from: dateFrom, to: dateTo, sources });
});

// ─── Obrátkovost skladu (Analytika → Sklad) ───────────────────────────────────
router.get('/inventory-turnover', (_req: Request, res: Response) => {
  const db = getDb();

  const data = db.prepare(`
    SELECT
      p.id, p.name, p.sku, p.category,
      p.quantity, p.min_quantity,
      p.purchase_price, p.sale_price, p.margin_percent,
      COALESCE(SUM(oi.quantity), 0) as units_sold,
      COUNT(DISTINCT oi.order_id) as times_in_order,
      COALESCE(SUM(oi.quantity * oi.unit_price), 0) as revenue,
      COALESCE(SUM(oi.quantity * p.purchase_price), 0) as cost
    FROM parts p
    LEFT JOIN order_items oi ON oi.part_id = p.id
    WHERE p.tenant_id = ?
    GROUP BY p.id
    ORDER BY units_sold DESC
  `).all(TENANT);

  res.json(data);
});

// ─── Ziskovost výjezdů (Výjezdy → Analytika) ──────────────────────────────────
router.get('/field-visits', (req: Request, res: Response) => {
  const db = getDb();
  const { from, to } = req.query as Record<string, string>;
  const now = new Date();
  const dateFrom = from || now.getFullYear() + '-01-01';
  const dateTo   = to   || now.toISOString().slice(0, 10);

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Hotovo' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'Zrušen' THEN 1 ELSE 0 END) as cancelled,
      ROUND(AVG(distance_km), 1) as avg_distance,
      SUM(CASE WHEN status = 'Hotovo' THEN fee_czk ELSE 0 END) as total_fees,
      ROUND(AVG(CASE WHEN duration_min > 0 THEN duration_min ELSE NULL END), 0) as avg_duration_min
    FROM field_visits
    WHERE tenant_id = ? AND date(visit_date) BETWEEN ? AND ?
  `).get(TENANT, dateFrom, dateTo);

  const byMonth = db.prepare(`
    SELECT strftime('%Y-%m', visit_date) as month,
           COUNT(*) as count,
           SUM(CASE WHEN status='Hotovo' THEN fee_czk ELSE 0 END) as fees
    FROM field_visits
    WHERE tenant_id = ? AND date(visit_date) BETWEEN ? AND ?
    GROUP BY month ORDER BY month ASC
  `).all(TENANT, dateFrom, dateTo);

  res.json({ from: dateFrom, to: dateTo, summary, by_month: byMonth });
});

// ─── LTV & Retention (Zákazníci → Analytika) ─────────────────────────────────
router.get('/customer-stats', (_req: Request, res: Response) => {
  const db = getDb();

  const ltv = db.prepare(`
    SELECT
      ROUND(AVG(total_spent), 0) as avg_ltv,
      ROUND(MAX(total_spent), 0) as max_ltv,
      COUNT(*) as total_customers,
      SUM(CASE WHEN total_orders > 1 THEN 1 ELSE 0 END) as returning_customers,
      ROUND(AVG(total_orders), 1) as avg_orders_per_customer
    FROM customers WHERE tenant_id = ?
  `).get(TENANT) as any;

  const retention = ltv?.total_customers > 0
    ? Math.round((ltv.returning_customers / ltv.total_customers) * 100)
    : 0;

  // Segmentace dle aktivity
  const thresholdRow = db.prepare(`SELECT value FROM settings WHERE tenant_id = ? AND key = 'customer_inactive_threshold_days'`).get(TENANT) as any;
  const threshold = parseInt(thresholdRow?.value || '180');

  const segments = db.prepare(`
    SELECT
      SUM(CASE WHEN julianday('now') - julianday(updated_at) <= 30 THEN 1 ELSE 0 END) as active_30d,
      SUM(CASE WHEN julianday('now') - julianday(updated_at) <= 90 THEN 1 ELSE 0 END) as active_90d,
      SUM(CASE WHEN julianday('now') - julianday(updated_at) > ? THEN 1 ELSE 0 END) as inactive
    FROM customers WHERE tenant_id = ?
  `).get(threshold, TENANT) as any;

  res.json({ ...ltv, retention_rate: retention, segments, inactive_threshold_days: threshold });
});

// ─── Ziskovost dle kategorií (Účetnictví → Analytika) ────────────────────────
router.get('/profitability', (req: Request, res: Response) => {
  const db = getDb();
  const { year } = req.query as Record<string, string>;
  const y = year || String(new Date().getFullYear());

  const byDeviceType = db.prepare(`
    SELECT
      device_type,
      COUNT(*) as order_count,
      SUM(total_price) as revenue,
      SUM(work_price) as labor_revenue,
      SUM(parts_price) as parts_revenue,
      ROUND(AVG(total_price), 0) as avg_price
    FROM orders
    WHERE tenant_id = ? AND paid = 1
      AND strftime('%Y', received_at) = ?
    GROUP BY device_type
    ORDER BY revenue DESC
  `).all(TENANT, y);

  const laborVsParts = db.prepare(`
    SELECT
      SUM(work_price) as total_labor,
      SUM(parts_price) as total_parts,
      SUM(total_price) as total_revenue
    FROM orders
    WHERE tenant_id = ? AND paid = 1 AND strftime('%Y', received_at) = ?
  `).get(TENANT, y) as any;

  const expensesByCategory = db.prepare(`
    SELECT category, SUM(amount) as total
    FROM transactions
    WHERE tenant_id = ? AND type = 'expense' AND strftime('%Y', transaction_date) = ?
    GROUP BY category ORDER BY total DESC
  `).all(TENANT, y);

  res.json({ year: y, by_device_type: byDeviceType, labor_vs_parts: laborVsParts, expenses_by_category: expensesByCategory });
});

// ─── Predikce poptávky dílů (Analytika → Sklad) ──────────────────────────────
router.get('/parts-demand', (_req: Request, res: Response) => {
  const db = getDb();

  const demand = db.prepare(`
    SELECT
      p.id, p.name, p.sku, p.quantity, p.min_quantity, p.purchase_price,
      COALESCE(SUM(oi.quantity), 0) as used_total,
      COALESCE(SUM(CASE WHEN date(o.received_at) >= date('now', '-30 days') THEN oi.quantity ELSE 0 END), 0) as used_30d,
      COALESCE(SUM(CASE WHEN date(o.received_at) >= date('now', '-90 days') THEN oi.quantity ELSE 0 END), 0) as used_90d,
      ROUND(COALESCE(SUM(CASE WHEN date(o.received_at) >= date('now', '-30 days') THEN oi.quantity ELSE 0 END), 0) * 1.2, 0) as predicted_next_month
    FROM parts p
    LEFT JOIN order_items oi ON oi.part_id = p.id
    LEFT JOIN orders o ON oi.order_id = o.id
    WHERE p.tenant_id = ?
    GROUP BY p.id
    ORDER BY used_30d DESC
  `).all(TENANT);

  res.json(demand);
});

export default router;
