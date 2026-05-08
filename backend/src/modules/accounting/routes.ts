// backend/src/modules/accounting/routes.ts
import { Router, Request, Response } from 'express';
import { getDb } from '../../db/database';
import type { CreateTransactionDTO, TaxCalcResult } from '../../types';

const router = Router();
const TENANT = 1;

// Načte daňové nastavení z DB
function getTaxSettings(db: ReturnType<typeof getDb>) {
  const rows = db.prepare(`SELECT key, value FROM settings WHERE tenant_id = ? AND key LIKE 'tax_%'`).all(TENANT) as { key: string; value: string }[];
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  return {
    flat_expense_rate: parseFloat(s.tax_flat_expense_rate || '60'),
    employment_type: s.tax_employment_type || 'side',       // 'side' | 'main'
    social_threshold: parseFloat(s.tax_social_threshold || '111736'),
    health_min_base: parseFloat(s.tax_health_min_base || '13500'),
    income_rate: parseFloat(s.tax_income_rate || '15') / 100,
    taxpayer_relief: parseFloat(s.tax_taxpayer_relief || '30840'),
    social_rate: parseFloat(s.tax_social_rate || '29.2') / 100,
    health_rate: parseFloat(s.tax_health_rate || '13.5') / 100,
  };
}

// ─── Overview / dashboard stats ───────────────────────────────────────────────
router.get('/overview', (_req: Request, res: Response) => {
  const db = getDb();
  const year = new Date().getFullYear();
  const month = new Date().toISOString().slice(0, 7);

  const income = db.prepare(`
    SELECT
      SUM(amount) as total,
      SUM(CASE WHEN strftime('%Y-%m', transaction_date) = ? THEN amount ELSE 0 END) as this_month
    FROM transactions
    WHERE tenant_id = ? AND type = 'income'
    AND strftime('%Y', transaction_date) = ?
  `).get(month, TENANT, String(year)) as { total: number; this_month: number };

  const expense = db.prepare(`
    SELECT
      SUM(amount) as total,
      SUM(CASE WHEN strftime('%Y-%m', transaction_date) = ? THEN amount ELSE 0 END) as this_month
    FROM transactions
    WHERE tenant_id = ? AND type = 'expense'
    AND strftime('%Y', transaction_date) = ?
  `).get(month, TENANT, String(year)) as { total: number; this_month: number };

  const monthly = db.prepare(`
    SELECT
      strftime('%Y-%m', transaction_date) as month,
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
    FROM transactions
    WHERE tenant_id = ? AND strftime('%Y', transaction_date) = ?
    GROUP BY month
    ORDER BY month ASC
  `).all(TENANT, String(year)) as { month: string; income: number; expense: number }[];

  const byCategory = db.prepare(`
    SELECT category, type, SUM(amount) as total
    FROM transactions
    WHERE tenant_id = ? AND strftime('%Y', transaction_date) = ?
    GROUP BY category, type
    ORDER BY total DESC
  `).all(TENANT, String(year));

  // Daňový odhad z nastavení
  const taxCfg = getTaxSettings(db);
  const grossIncome = income.total || 0;
  const expenses = grossIncome * taxCfg.flat_expense_rate / 100;
  const taxBase = Math.max(0, grossIncome - expenses);
  const taxGross = taxBase * taxCfg.income_rate;
  const taxNet = Math.max(0, taxGross - taxCfg.taxpayer_relief);
  const profitForSocial = grossIncome - expenses;
  const socialBase = profitForSocial * 0.5;
  const social = taxCfg.employment_type === 'side' && profitForSocial <= taxCfg.social_threshold
    ? 0
    : socialBase * taxCfg.social_rate;
  const healthBase = Math.max(profitForSocial * 0.5, taxCfg.health_min_base);
  const health = healthBase * taxCfg.health_rate;
  const totalTax = taxNet + social + health;
  const netIncome = grossIncome - totalTax;

  res.json({
    year,
    income: { total: income.total || 0, this_month: income.this_month || 0 },
    expense: { total: expense.total || 0, this_month: expense.this_month || 0 },
    profit: {
      total: (income.total || 0) - (expense.total || 0),
      this_month: (income.this_month || 0) - (expense.this_month || 0),
    },
    tax_estimate: {
      gross_income: Math.round(grossIncome),
      estimated_tax: Math.round(totalTax),
      estimated_net: Math.round(netIncome),
      social,
      health,
      income_tax: taxNet,
    },
    monthly,
    by_category: byCategory,
  });
});

// ─── List transactions ────────────────────────────────────────────────────────
router.get('/transactions', (req: Request, res: Response) => {
  const db = getDb();
  const { type, category, from, to, limit = '100', offset = '0' } = req.query as Record<string, string>;

  let sql = `SELECT * FROM transactions WHERE tenant_id = ?`;
  const params: (string | number)[] = [TENANT];

  if (type)     { sql += ' AND type = ?';               params.push(type); }
  if (category) { sql += ' AND category = ?';           params.push(category); }
  if (from)     { sql += ' AND transaction_date >= ?';  params.push(from); }
  if (to)       { sql += ' AND transaction_date <= ?';  params.push(to); }

  sql += ` ORDER BY transaction_date DESC, id DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  const transactions = db.prepare(sql).all(...params);
  res.json({ data: transactions });
});

// ─── Add transaction ──────────────────────────────────────────────────────────
router.post('/transactions', (req: Request, res: Response) => {
  const db = getDb();
  const body: CreateTransactionDTO = req.body;

  if (!body.type || !['income', 'expense'].includes(body.type))
    return res.status(400).json({ error: 'Typ musí být income nebo expense' });
  if (!body.amount || body.amount <= 0)
    return res.status(400).json({ error: 'Částka musí být kladné číslo' });

  const result = db.prepare(`
    INSERT INTO transactions (tenant_id, type, category, amount, description, invoice_id, order_id, transaction_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    TENANT,
    body.type,
    body.category || 'other',
    body.amount,
    body.description || null,
    body.invoice_id || null,
    body.order_id || null,
    body.transaction_date || new Date().toISOString().slice(0, 10)
  );

  const newTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(newTx);
});

// ─── Delete transaction ───────────────────────────────────────────────────────
router.delete('/transactions/:id', (req: Request, res: Response) => {
  const db = getDb();
  const tx = db.prepare(`SELECT id FROM transactions WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT);
  if (!tx) return res.status(404).json({ error: 'Transakce nenalezena' });

  db.prepare('DELETE FROM transactions WHERE id = ? AND tenant_id = ?').run(req.params.id, TENANT);
  res.json({ success: true });
});

// ─── Tax calculator — konfigurovatelný z nastavení ────────────────────────────
router.post('/tax-calculator', (req: Request, res: Response) => {
  const db = getDb();
  const cfg = getTaxSettings(db);

  const {
    gross_income,
    flat_expense_rate = cfg.flat_expense_rate,
    employment_type   = cfg.employment_type,
    year = new Date().getFullYear(),
  } = req.body as {
    gross_income: number;
    flat_expense_rate?: number;
    employment_type?: string;
    year?: number;
  };

  if (!gross_income || gross_income < 0)
    return res.status(400).json({ error: 'Hrubý příjem musí být kladné číslo' });

  const expenses = gross_income * (flat_expense_rate / 100);
  const tax_base = Math.max(0, gross_income - expenses);
  const tax_gross = tax_base * cfg.income_rate;
  const tax_net = Math.max(0, tax_gross - cfg.taxpayer_relief);

  const profit_for_social = gross_income - expenses;
  const social_base = profit_for_social * 0.5;
  const social_insurance = employment_type === 'side' && profit_for_social <= cfg.social_threshold
    ? 0
    : social_base * cfg.social_rate;

  const health_base = Math.max(profit_for_social * 0.5, cfg.health_min_base);
  const health_insurance = health_base * cfg.health_rate;

  const total_deductions = tax_net + social_insurance + health_insurance;
  const net_income = gross_income - total_deductions;
  const effective_rate = gross_income > 0 ? (total_deductions / gross_income) * 100 : 0;

  const result: TaxCalcResult = {
    gross_income: Math.round(gross_income),
    flat_expense_rate,
    expenses: Math.round(expenses),
    tax_base: Math.round(tax_base),
    tax_rate: cfg.income_rate * 100,
    tax_gross: Math.round(tax_gross),
    taxpayer_relief: cfg.taxpayer_relief,
    tax_net: Math.round(tax_net),
    social_insurance: Math.round(social_insurance),
    health_insurance: Math.round(health_insurance),
    total_deductions: Math.round(total_deductions),
    net_income: Math.round(net_income),
    effective_rate: Math.round(effective_rate * 100) / 100,
  };

  res.json({
    ...result,
    above_social_threshold: profit_for_social > cfg.social_threshold,
    social_threshold: cfg.social_threshold,
    employment_type,
    year,
    notes: [
      `Paušální výdaje: ${flat_expense_rate}%`,
      employment_type === 'side'
        ? (social_insurance === 0
          ? `✅ Vedlejší činnost — nepřesahujete rozhodnou částku (${cfg.social_threshold.toLocaleString('cs-CZ')} Kč) — soc. pojistné NEPLATÍTE`
          : `⚠️ Vedlejší činnost — přesahujete rozhodnou částku — soc. pojistné: ${Math.round(social_insurance).toLocaleString('cs-CZ')} Kč`)
        : `Hlavní činnost — soc. pojistné: ${Math.round(social_insurance).toLocaleString('cs-CZ')} Kč`,
      `Zdravotní pojistné: ${Math.round(health_insurance).toLocaleString('cs-CZ')} Kč`,
      '⚠️ Orientační výpočet — konzultujte s účetní.',
    ],
  });
});

// ─── Annual summary ────────────────────────────────────────────────────────────
router.get('/annual-summary/:year', (req: Request, res: Response) => {
  const db = getDb();
  const { year } = req.params;

  const monthly = db.prepare(`
    SELECT
      strftime('%m', transaction_date) as month,
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense,
      COUNT(*) as count
    FROM transactions
    WHERE tenant_id = ? AND strftime('%Y', transaction_date) = ?
    GROUP BY month
    ORDER BY month
  `).all(TENANT, year);

  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expense
    FROM transactions
    WHERE tenant_id = ? AND strftime('%Y', transaction_date) = ?
  `).get(TENANT, year) as { total_income: number; total_expense: number };

  const orders = db.prepare(`
    SELECT COUNT(*) as count, SUM(total_price) as revenue
    FROM orders
    WHERE tenant_id = ? AND strftime('%Y', issued_at) = ? AND paid = 1
  `).get(TENANT, year) as { count: number; revenue: number };

  res.json({
    year,
    monthly,
    totals: {
      income: totals.total_income || 0,
      expense: totals.total_expense || 0,
      profit: (totals.total_income || 0) - (totals.total_expense || 0),
    },
    orders: { count: orders.count || 0, revenue: orders.revenue || 0 },
  });
});

// ─── Uzávěrky ─────────────────────────────────────────────────────────────────

// Spočítá data pro uzávěrku daného měsíce/roku
function computeClosing(db: ReturnType<typeof getDb>, year: number, month: number) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense,
      COUNT(*) as tx_count
    FROM transactions
    WHERE tenant_id = ? AND strftime('%Y-%m', transaction_date) = ?
  `).get(TENANT, monthStr) as { income: number; expense: number; tx_count: number };

  const txList = db.prepare(`
    SELECT * FROM transactions
    WHERE tenant_id = ? AND strftime('%Y-%m', transaction_date) = ?
    ORDER BY transaction_date ASC
  `).all(TENANT, monthStr);

  return {
    period_year: year,
    period_month: month,
    income_total: totals.income || 0,
    expense_total: totals.expense || 0,
    profit_total: (totals.income || 0) - (totals.expense || 0),
    tx_count: totals.tx_count || 0,
    transactions: txList,
  };
}

// GET uzávěrky
router.get('/closings', (_req: Request, res: Response) => {
  const db = getDb();
  const closings = db.prepare(
    `SELECT * FROM closings WHERE tenant_id = ? ORDER BY period_year DESC, period_month DESC`
  ).all(TENANT);
  res.json({ data: closings });
});

// Manuální uzávěrka (aktuální měsíc nebo zadaný)
router.post('/closings/manual', (req: Request, res: Response) => {
  const db = getDb();
  const now = new Date();
  const year = req.body.year || now.getFullYear();
  const month = req.body.month || (now.getMonth() + 1);

  // Manuální uzávěrka může být max jedna za měsíc (ale lze vytvořit víc — jen archivní)
  const data = computeClosing(db, year, month);

  const result = db.prepare(`
    INSERT INTO closings (tenant_id, type, period_year, period_month, income_total, expense_total, profit_total, tx_count, closed_by)
    VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, 'user')
  `).run(TENANT, data.period_year, data.period_month, data.income_total, data.expense_total, data.profit_total, data.tx_count);

  const closing = db.prepare('SELECT * FROM closings WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown> | null;
  res.status(201).json({ ...closing, ...data });
});

// Měsíční uzávěrka (spouštěna systémem — vždy minulý měsíc)
router.post('/closings/monthly', (_req: Request, res: Response) => {
  const db = getDb();
  const now = new Date();
  now.setDate(0); // přeskoč na minulý měsíc
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Zkontroluj jestli už existuje měsíční za tento měsíc
  const exists = db.prepare(
    `SELECT id FROM closings WHERE tenant_id = ? AND type = 'monthly' AND period_year = ? AND period_month = ?`
  ).get(TENANT, year, month);

  if (exists) {
    return res.status(409).json({ error: `Měsíční uzávěrka za ${month}/${year} již existuje`, existing_id: (exists as any).id });
  }

  const data = computeClosing(db, year, month);

  const result = db.prepare(`
    INSERT INTO closings (tenant_id, type, period_year, period_month, income_total, expense_total, profit_total, tx_count, closed_by)
    VALUES (?, 'monthly', ?, ?, ?, ?, ?, ?, 'system')
  `).run(TENANT, data.period_year, data.period_month, data.income_total, data.expense_total, data.profit_total, data.tx_count);

  const closing = db.prepare('SELECT * FROM closings WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown> | null;
  res.status(201).json({ ...closing, ...data });
});

// Detail uzávěrky (s transakcemi)
router.get('/closings/:id', (req: Request, res: Response) => {
  const db = getDb();
  const closing = db.prepare(`SELECT * FROM closings WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as any;
  if (!closing) return res.status(404).json({ error: 'Uzávěrka nenalezena' });

  const data = computeClosing(db, closing.period_year, closing.period_month);
  res.json({ ...closing, ...data });
});

// ─── Zákaznický kredit (Zákazníci → Účetnictví) ──────────────────────────────
router.get('/customer-credit/:customerId', (req: Request, res: Response) => {
  const db = getDb();
  const credits = db.prepare(`
    SELECT * FROM transactions
    WHERE tenant_id = ? AND category = 'Zákaznický kredit'
      AND description LIKE ?
    ORDER BY transaction_date DESC
  `).all(TENANT, `%zákazník #${req.params.customerId}%`);

  const balance = (credits as any[]).reduce((sum: number, t: any) => {
    return sum + (t.type === 'income' ? -t.amount : t.amount);
  }, 0);

  res.json({ credits, balance: Math.round(balance * 100) / 100 });
});

router.post('/customer-credit/:customerId', (req: Request, res: Response) => {
  const db = getDb();
  const { amount, note, type } = req.body as { amount: number; note: string; type: 'deposit' | 'use' };
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Částka musí být kladná' });

  const customer = db.prepare(`SELECT name FROM customers WHERE id = ? AND tenant_id = ?`).get(req.params.customerId, TENANT) as any;
  if (!customer) return res.status(404).json({ error: 'Zákazník nenalezen' });

  // deposit = zákazník zaplatil předem (income), use = čerpání kreditu (expense v pohledu kreditu)
  db.prepare(`
    INSERT INTO transactions (tenant_id, type, category, amount, description, transaction_date)
    VALUES (?, ?, 'Zákaznický kredit', ?, ?, date('now'))
  `).run(TENANT, type === 'deposit' ? 'income' : 'expense', amount,
    `${type === 'deposit' ? 'Záloha' : 'Čerpání kreditu'} — zákazník #${req.params.customerId} ${customer.name}${note ? ': ' + note : ''}`
  );

  res.json({ ok: true });
});

// ─── Mzdové náklady (Zaměstnanci → Účetnictví) ───────────────────────────────
router.post('/salary-expense', (req: Request, res: Response) => {
  const db = getDb();
  const { user_id, username, amount, hours, period_label } = req.body as {
    user_id: number; username: string; amount: number; hours?: number; period_label: string;
  };
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Částka musí být kladná' });

  db.prepare(`
    INSERT INTO transactions (tenant_id, type, category, amount, description, transaction_date)
    VALUES (?, 'expense', 'Mzdy', ?, ?, date('now'))
  `).run(
    TENANT, amount,
    `Mzda — ${username || `user #${user_id}`}${hours ? ` (${hours}h)` : ''} — ${period_label}`
  );

  res.json({ ok: true });
});

export default router;