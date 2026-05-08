import { Router, Request, Response } from 'express';
import { getDb } from '../../db/database';
import type { Customer, CreateCustomerDTO } from '../../types';

const router = Router();
const TENANT = 1;

// ─── List / search customers ──────────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { search, limit = '50', offset = '0' } = req.query as Record<string, string>;

  let sql = `SELECT * FROM customers WHERE tenant_id = ?`;
  const params: (string | number)[] = [TENANT];

  if (search) {
    sql += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const countSql = `SELECT COUNT(*) as total FROM customers WHERE tenant_id = ?${search ? ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)' : ''}`;
  const countParams = search
    ? [TENANT, `%${search}%`, `%${search}%`, `%${search}%`]
    : [TENANT];

  sql += ` ORDER BY total_orders DESC, name ASC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  const customers = db.prepare(sql).all(...params) as Customer[];
  const { total } = db.prepare(countSql).get(...countParams) as { total: number };

  res.json({ data: customers, total });
});

// ─── Get customer with full order history ─────────────────────────────────────
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const customer = db.prepare(
    `SELECT * FROM customers WHERE id = ? AND tenant_id = ?`
  ).get(req.params.id, TENANT) as Customer | undefined;

  if (!customer) return res.status(404).json({ error: 'Zákazník nenalezen' });

 const orders = db.prepare(`
    SELECT id, order_number, device_type, device_model, problem_description,
           status, total_price, paid, received_at, issued_at, source
    FROM orders
    WHERE customer_id = ? AND tenant_id = ?
    ORDER BY received_at DESC
  `).all(customer.id, TENANT);

  // Zákazníci → Analytika: source zákazníka z první zakázky
  const firstSource = (orders as any[]).find(o => o.source)?.source || null;

  // Zákazníci → Analytika: inactive flag dle nastavení customer_inactive_threshold_days
  const thresholdRow = db.prepare(
    `SELECT value FROM settings WHERE tenant_id = ? AND key = 'customer_inactive_threshold_days'`
  ).get(TENANT) as { value: string } | undefined;
  const threshold = parseInt(thresholdRow?.value || '180');
  const lastOrderDate = (orders as any[])[0]?.received_at || null;
  const daysSinceLastOrder = lastOrderDate
    ? Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / 86400000)
    : null;
  const is_inactive = daysSinceLastOrder !== null && daysSinceLastOrder > threshold;

  // Výjezdy → Zákazníci: historie výjezdů přes order_id → customer_id
  const visits = db.prepare(`
    SELECT fv.id, fv.visit_date, fv.address, fv.distance_km, fv.fee_czk, fv.status, fv.description
    FROM field_visits fv
    INNER JOIN orders o ON fv.order_id = o.id
    WHERE o.customer_id = ? AND fv.tenant_id = ?
    ORDER BY fv.visit_date DESC
    LIMIT 10
  `).all(customer.id, TENANT);

  res.json({ ...customer, orders, visits, source: firstSource, is_inactive, days_since_last_order: daysSinceLastOrder });
});

// ─── Create customer ──────────────────────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const body: CreateCustomerDTO = req.body;

  if (!body.name?.trim()) return res.status(400).json({ error: 'Jméno zákazníka je povinné' });

  // Check for duplicate phone
  if (body.phone) {
    const existing = db.prepare(
      `SELECT id, name FROM customers WHERE phone = ? AND tenant_id = ?`
    ).get(body.phone.trim(), TENANT) as { id: number; name: string } | undefined;
    if (existing) {
      return res.status(409).json({
        error: `Zákazník s tímto telefonem již existuje: ${existing.name} (ID: ${existing.id})`,
        existing_id: existing.id,
      });
    }
  }

  const result = db.prepare(`
    INSERT INTO customers (tenant_id, name, phone, email, address, city, notes, ico, dic)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    TENANT,
    body.name.trim(),
    body.phone?.trim() || null,
    body.email?.trim() || null,
    body.address?.trim() || null,
    body.city?.trim() || null,
    body.notes?.trim() || null,
    body.ico?.trim() || null,
    body.dic?.trim() || null
  );

  const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid) as Customer;
  res.status(201).json(newCustomer);
});

// ─── Update customer ──────────────────────────────────────────────────────────
router.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const customer = db.prepare(
    `SELECT id FROM customers WHERE id = ? AND tenant_id = ?`
  ).get(req.params.id, TENANT);
  if (!customer) return res.status(404).json({ error: 'Zákazník nenalezen' });

  const b = req.body;
  db.prepare(`
    UPDATE customers SET
      name    = COALESCE(?, name),
      phone   = COALESCE(?, phone),
      email   = COALESCE(?, email),
      address = COALESCE(?, address),
      city    = COALESCE(?, city),
      notes   = COALESCE(?, notes),
      ico = COALESCE(?, ico),
      dic = COALESCE(?, dic),
      updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(
    b.name, b.phone, b.email, b.address, b.city, b.notes, b.ico, b.dic,
    req.params.id, TENANT
  );

  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as Customer;
  res.json(updated);
});

// ─── Delete customer ──────────────────────────────────────────────────────────
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const customer = db.prepare(
    `SELECT id FROM customers WHERE id = ? AND tenant_id = ?`
  ).get(req.params.id, TENANT);
  if (!customer) return res.status(404).json({ error: 'Zákazník nenalezen' });

  // Unlink orders (set customer_id to null, keep order data)
  db.prepare(`UPDATE orders SET customer_id = NULL WHERE customer_id = ? AND tenant_id = ?`)
    .run(req.params.id, TENANT);

  db.prepare('DELETE FROM customers WHERE id = ? AND tenant_id = ?').run(req.params.id, TENANT);
  res.json({ success: true });
});

// ─── Quick lookup by phone ─────────────────────────────────────────────────────
router.get('/lookup/phone', (req: Request, res: Response) => {
  const { q } = req.query as { q?: string };
  if (!q) return res.json([]);

  const db = getDb();
  const customers = db.prepare(`
    SELECT id, name, phone, email, total_orders
    FROM customers
    WHERE tenant_id = ? AND phone LIKE ?
    LIMIT 5
  `).all(TENANT, `%${q}%`) as Customer[];

  res.json(customers);
});

export default router;
