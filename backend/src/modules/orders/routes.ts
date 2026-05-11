// backend/src/modules/orders/routes.ts
import { Router, Request, Response } from 'express';
import { getDb, nextOrderNumber } from '../../db/database';
import type { CreateOrderDTO, Order, OrderStatus } from '../../types';
import QRCode from 'qrcode';
import { encrypt, decrypt } from '../../utils/crypto';

const router = Router();
const TENANT = 1;

// ─── List orders ─────────────────────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { status, search, limit = '50', offset = '0' } = req.query as Record<string, string>;

  let sql = `
    SELECT o.*, c.name as crm_name
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.tenant_id = ?
  `;
  const params: (string | number)[] = [TENANT];

  if (status) {
    sql += ` AND o.status = ?`;
    params.push(status);
  }
  if (search) {
    sql += ` AND (
      o.customer_name LIKE ? OR
      o.order_number LIKE ? OR
      o.device_model LIKE ? OR
      o.problem_description LIKE ?
    )`;
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  sql += ` ORDER BY o.received_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  const countSql = `SELECT COUNT(*) as total FROM orders WHERE tenant_id = ?${status ? ' AND status = ?' : ''}`;
  const countParams = status ? [TENANT, status] : [TENANT];

  const orders = db.prepare(sql).all(...params) as Order[];
  const { total } = db.prepare(countSql).get(...countParams) as { total: number };

  res.json({ data: orders, total, limit: parseInt(limit), offset: parseInt(offset) });
});

// ─── Dashboard stats ─────────────────────────────────────────────────────────
router.get('/stats', (_req: Request, res: Response) => {
  const db = getDb();

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM orders WHERE tenant_id = ?
    GROUP BY status
  `).all(TENANT) as { status: string; count: number }[];

  const statusMap: Record<string, number> = {};
  for (const row of byStatus) statusMap[row.status] = row.count;

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';

  const revenue = db.prepare(`
    SELECT
      SUM(CASE WHEN date(issued_at) = ? THEN total_price ELSE 0 END) as today,
      SUM(CASE WHEN date(issued_at) >= ? THEN total_price ELSE 0 END) as week,
      SUM(CASE WHEN date(issued_at) >= ? THEN total_price ELSE 0 END) as month,
      SUM(CASE WHEN strftime('%Y', issued_at) = strftime('%Y', 'now') THEN total_price ELSE 0 END) as year
    FROM orders
    WHERE tenant_id = ? AND paid = 1
  `).get(today, weekStart, monthStart, TENANT) as Record<string, number>;

  const doneToday = db.prepare(`
    SELECT COUNT(*) as c FROM orders
    WHERE tenant_id = ? AND date(completed_at) = ?
  `).get(TENANT, today) as { c: number };

  const waitingPickup = db.prepare(`
    SELECT COUNT(*) as c FROM orders
    WHERE tenant_id = ? AND status = 'Hotovo'
  `).get(TENANT) as { c: number };

  const activeClaims = db.prepare(`
    SELECT COUNT(*) as c FROM orders
    WHERE tenant_id = ? AND is_claim = 1 AND claim_resolved_at IS NULL
  `).get(TENANT) as { c: number };

  const warrantyExpiringSoon = db.prepare(`
    SELECT COUNT(*) as c FROM orders
    WHERE tenant_id = ?
      AND warranty_expires IS NOT NULL
      AND warranty_expires > datetime('now')
      AND warranty_expires <= datetime('now', '+14 days')
  `).get(TENANT) as { c: number };

  // Upozornění na neudělanou měsíční uzávěrku
  const prevMonth = new Date();
  prevMonth.setDate(0); // poslední den minulého měsíce
  const prevYear = prevMonth.getFullYear();
  const prevMonthNum = prevMonth.getMonth() + 1;
  const missingClosing = db.prepare(`
    SELECT COUNT(*) as c FROM closings
    WHERE tenant_id = ? AND type = 'monthly' AND period_year = ? AND period_month = ?
  `).get(TENANT, prevYear, prevMonthNum) as { c: number };

  const recentOrders = db.prepare(`
    SELECT * FROM orders WHERE tenant_id = ?
    ORDER BY received_at DESC LIMIT 8
  `).all(TENANT) as Order[];

  res.json({
    by_status: statusMap,
    total: byStatus.reduce((s, r) => s + r.count, 0),
    open: (statusMap['Přijato'] || 0) + (statusMap['Diagnostika'] || 0) +
          (statusMap['V opravě'] || 0) + (statusMap['Čeká na díl'] || 0),
    done_today: doneToday.c,
    waiting_pickup: waitingPickup.c,
    revenue: {
      today: revenue.today || 0,
      this_week: revenue.week || 0,
      this_month: revenue.month || 0,
      this_year: revenue.year || 0,
    },
    recent_orders: recentOrders,
    missing_monthly_closing: missingClosing.c === 0,
    missing_closing_month: `${prevMonthNum}/${prevYear}`,
    active_claims: activeClaims.c,
    warranty_expiring_soon: warrantyExpiringSoon.c,
  });
});

// ─── Lookup by barcode (order number) ────────────────────────────────────────
router.get('/barcode/:orderNumber', (req: Request, res: Response) => {
  const db = getDb();
  const order = db.prepare(
    `SELECT * FROM orders WHERE order_number = ? AND tenant_id = ?`
  ).get(req.params.id, TENANT) as (Order & { customer_pin?: string }) | undefined;

  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });

  const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id);
  res.json({ ...order, has_pin: !!order.customer_pin, customer_pin: undefined, items });
});

// ─── Warranty expiring ────────────────────────────────────────────────────────
router.get('/warranty-expiring', (req: Request, res: Response) => {
  const db = getDb();
  const days = parseInt((req.query.days as string) || '14');
  const orders = db.prepare(`
    SELECT id, order_number, customer_name, customer_phone, device_type, device_model,
           warranty_expires, status, is_claim
    FROM orders
    WHERE tenant_id = ? AND status NOT IN ('Stornováno')
      AND warranty_expires IS NOT NULL
      AND warranty_expires > datetime('now')
      AND warranty_expires <= datetime('now', '+' || ? || ' days')
    ORDER BY warranty_expires ASC
  `).all(TENANT, days) as any[];
  res.json({ data: orders });
});

// ─── Claims list ──────────────────────────────────────────────────────────────
router.get('/claims', (_req: Request, res: Response) => {
  const db = getDb();
  const orders = db.prepare(`
    SELECT id, order_number, customer_name, customer_phone, device_type, device_model,
           status, claim_reason, claim_resolved_at, is_claim, received_at, warranty_expires
    FROM orders
    WHERE tenant_id = ? AND is_claim = 1
    ORDER BY received_at DESC
  `).all(TENANT) as any[];
  res.json({ data: orders });
});

// ─── Get single order ─────────────────────────────────────────────────────────
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
   const order = db.prepare(
    `SELECT * FROM orders WHERE id = ? AND tenant_id = ?`
  ).get(req.params.id, TENANT) as (Order & { customer_pin?: string; barcode_url?: string }) | undefined;

  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });

  const items = db.prepare(
    `SELECT * FROM order_items WHERE order_id = ?`
  ).all(order.id);

  // Nedešifruj PIN v odpovědi — vrátíme jen boolean jestli je nastaven
  const orderOut = {
    ...order,
    has_pin: !!order.customer_pin,
    customer_pin: undefined, // nikdy neposílej raw (šifrovanou) hodnotu
    items,
  };

  res.json(orderOut);
});

// ─── Create order ─────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  const db = getDb();
  const body: CreateOrderDTO & { customer_pin?: string } = req.body;

  if (!body.customer_name?.trim()) return res.status(400).json({ error: 'Jméno zákazníka je povinné' });
  if (!body.device_type?.trim())   return res.status(400).json({ error: 'Typ zařízení je povinný' });
  if (!body.problem_description?.trim()) return res.status(400).json({ error: 'Popis závady je povinný' });

  const orderNumber = nextOrderNumber(TENANT);

  // Generuj barcode (QR s číslem zakázky)
  let barcodeUrl = '';
  try {
    barcodeUrl = await QRCode.toDataURL(orderNumber, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 200,
      color: { dark: '#1C2A4A', light: '#FFFFFF' },
    });
    console.log(`[QR] Vygenerován pro zakázku ${orderNumber}, délka: ${barcodeUrl.length}`);
  } catch (qrErr) {
    console.error('[QR] Chyba při generování:', qrErr);
  }

  // Šifruj PIN pokud byl zadán
  const encryptedPin = body.customer_pin ? encrypt(body.customer_pin) : null;

   const result = db.prepare(`
    INSERT INTO orders (
      tenant_id, order_number, customer_id, customer_name, customer_phone,
      customer_email, customer_ico, customer_dic, device_type, device_model, device_serial,
      problem_description, technician, estimated_price, internal_notes,
      customer_pin, barcode_url, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    TENANT,
    orderNumber,
    body.customer_id || null,
    body.customer_name.trim(),
    body.customer_phone || null,
    body.customer_email || null,
    body.customer_ico || null,
    body.customer_dic || null,
    body.device_type.trim(),
    body.device_model || null,
    body.device_serial || null,
    body.problem_description.trim(),
     (() => {
      if (body.technician) return body.technician;
      const s = db.prepare(`SELECT value FROM settings WHERE tenant_id = ? AND key = 'default_technician_id'`).get(TENANT) as { value: string } | undefined;
      return s?.value?.trim() || null;
    })(),
    body.estimated_price || 0,
    body.internal_notes || null,
    encryptedPin,
    barcodeUrl || null,
    body.source || null,
  );

  // Update customer stats + IČO/DIČ pokud linked
  if (body.customer_id) {
    db.prepare(`
      UPDATE customers SET
        total_orders = total_orders + 1,
        ico = COALESCE(NULLIF(ico,''), ?),
        dic = COALESCE(NULLIF(dic,''), ?),
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(body.customer_ico || null, body.customer_dic || null, body.customer_id, TENANT);
  }

  // Přečti uloženou zakázku — explicitní typ aby nevznikl TypeError
  const newOrder = db.prepare('SELECT * FROM orders WHERE id = ?')
    .get(result.lastInsertRowid) as (Order & { customer_pin?: string; barcode_url?: string }) | undefined;

  if (!newOrder) {
    return res.status(500).json({ error: 'Zakázka se nepodařilo vytvořit' });
  }

  res.status(201).json({
    ...newOrder,
    has_pin: !!newOrder.customer_pin,
    customer_pin: undefined,
  });
});

// ─── Update order ─────────────────────────────────────────────────────────────
router.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const order = db.prepare(`SELECT * FROM orders WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as Order | undefined;
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });

  const b = req.body;

  // Šifruj PIN pokud byl poslán
  let pinSql = '';
  let pinVal: string | null = null;
  if (b.customer_pin !== undefined) {
    pinSql = ', customer_pin = ?';
    pinVal = b.customer_pin ? encrypt(b.customer_pin) : null;
  }

  db.prepare(`
    UPDATE orders SET
      customer_name = COALESCE(?, customer_name),
      customer_phone = COALESCE(?, customer_phone),
      customer_email = COALESCE(?, customer_email),
      customer_ico = COALESCE(?, customer_ico),
      customer_dic = COALESCE(?, customer_dic),
      device_type = COALESCE(?, device_type),
      device_model = COALESCE(?, device_model),
      device_serial = COALESCE(?, device_serial),
      problem_description = COALESCE(?, problem_description),
      diagnosis = COALESCE(?, diagnosis),
      status = COALESCE(?, status),
      technician = COALESCE(?, technician),
      estimated_price = COALESCE(?, estimated_price),
      work_price = COALESCE(?, work_price),
      parts_price = COALESCE(?, parts_price),
      total_price = COALESCE(?, total_price),
      paid = COALESCE(?, paid),
      payment_method = COALESCE(?, payment_method),
      warranty_days = COALESCE(?, warranty_days),
      internal_notes = COALESCE(?, internal_notes),
      source = COALESCE(?, source),
      completed_at = CASE WHEN ? = 'Hotovo' AND completed_at IS NULL THEN datetime('now') ELSE completed_at END,
      issued_at    = CASE WHEN ? = 'Vydáno' AND issued_at IS NULL THEN datetime('now') ELSE issued_at END,
      warranty_expires = CASE WHEN ? = 'Vydáno' AND warranty_expires IS NULL
        THEN datetime('now', '+' || COALESCE(?, 30) || ' days') ELSE warranty_expires END
      ${pinSql},
      updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(
    b.customer_name, b.customer_phone, b.customer_email,
    b.customer_ico, b.customer_dic,
    b.device_type, b.device_model, b.device_serial,
    b.problem_description, b.diagnosis, b.status,
    b.technician, b.estimated_price, b.work_price,
    b.parts_price, b.total_price, b.paid, b.payment_method,
    b.warranty_days, b.internal_notes, b.source ?? null,
    b.status, b.status, b.status, b.warranty_days || order.warranty_days,
    ...(pinVal !== null ? [pinVal] : []),
    req.params.id, TENANT
  );

  // Sync IČO/DIČ na zákazníka
  if (order.customer_id && (b.customer_ico !== undefined || b.customer_dic !== undefined)) {
    db.prepare(`
      UPDATE customers SET
        ico = COALESCE(NULLIF(?, ''), ico),
        dic = COALESCE(NULLIF(?, ''), dic),
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(b.customer_ico || null, b.customer_dic || null, order.customer_id, TENANT);
  }

  if (b.paid === 1 && !order.paid && order.customer_id) {
    db.prepare(`
      UPDATE customers SET total_spent = total_spent + ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(b.total_price || order.total_price, order.customer_id, TENANT);
  }

  // Auto-create income transaction when order is marked as paid
   if (b.status === 'Vydáno' && order.status !== 'Vydáno') {
    const autoReview = db.prepare(`SELECT value FROM settings WHERE tenant_id = ? AND key = 'auto_review_request'`).get(TENANT) as { value: string } | undefined;
    if (autoReview?.value === 'true') {
      const delayRow = db.prepare(`SELECT value FROM settings WHERE tenant_id = ? AND key = 'review_request_delay_hours'`).get(TENANT) as { value: string } | undefined;
      const delay = parseFloat(delayRow?.value || '24');
      // Poznámka v internal_notes — základ pro budoucí SMS/email automatizaci
      const tag = `[Review request naplánován za ${delay}h od vydání]`;
      db.prepare(`UPDATE orders SET internal_notes = CASE WHEN internal_notes IS NULL OR internal_notes = '' THEN ? ELSE internal_notes || char(10) || ? END WHERE id = ? AND tenant_id = ?`)
        .run(tag, tag, req.params.id, TENANT);
    }
  }

  // Auto-create income transaction when order is marked as paid
  if (b.paid === 1 && !order.paid) {
    const price = b.total_price || order.total_price;
    if (price > 0) {
      db.prepare(`
        INSERT INTO transactions (tenant_id, type, category, amount, description, order_id, transaction_date)
        VALUES (?, 'income', 'Oprava', ?, ?, ?, date('now'))
      `).run(TENANT, price, `Zakázka ${order.order_number} — ${order.device_type}${order.device_model ? ' ' + order.device_model : ''}`, order.id);
    }
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?')
    .get(req.params.id) as (Order & { customer_pin?: string }) | undefined;
  if (!updated) return res.status(500).json({ error: 'Chyba při načtení zakázky' });
  res.json({ ...updated, has_pin: !!updated.customer_pin, customer_pin: undefined });
});

// ─── Quick status update ──────────────────────────────────────────────────────
router.patch('/:id/status', (req: Request, res: Response) => {
  const db = getDb();
  const { status } = req.body as { status: OrderStatus };
  const validStatuses: OrderStatus[] = ['Přijato','Diagnostika','V opravě','Čeká na díl','Hotovo','Vydáno','Stornováno'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Neplatný status' });

  const order = db.prepare(`SELECT * FROM orders WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as Order | undefined;
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });

  db.prepare(`
    UPDATE orders SET
      status = ?,
      completed_at = CASE WHEN ? = 'Hotovo' AND completed_at IS NULL THEN datetime('now') ELSE completed_at END,
      issued_at    = CASE WHEN ? = 'Vydáno' AND issued_at IS NULL THEN datetime('now') ELSE issued_at END,
      warranty_expires = CASE WHEN ? = 'Vydáno' AND warranty_expires IS NULL
        THEN datetime('now', '+' || ? || ' days') ELSE warranty_expires END,
      updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(status, status, status, status, order.warranty_days, req.params.id, TENANT);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?')
    .get(req.params.id) as (Order & { customer_pin?: string }) | undefined;
  if (!updated) return res.status(500).json({ error: 'Chyba při načtení zakázky' });
  res.json({ ...updated, has_pin: !!updated.customer_pin, customer_pin: undefined });
});

// ─── Reveal PIN (admin/super only) ───────────────────────────────────────────
router.get('/:id/reveal-pin', (req: Request, res: Response) => {
  const db = getDb();
  const order = db.prepare(`SELECT customer_pin FROM orders WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as { customer_pin: string | null } | undefined;
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });
  if (!order.customer_pin) return res.json({ pin: null, has_pin: false });
  const decrypted = decrypt(order.customer_pin);
  return res.json({ pin: decrypted, has_pin: true });
});

// ─── Verify PIN ───────────────────────────────────────────────────────────────
router.post('/:id/verify-pin', (req: Request, res: Response) => {
  const db = getDb();
  const { pin } = req.body as { pin: string };
  const order = db.prepare(`SELECT customer_pin FROM orders WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as { customer_pin: string | null } | undefined;
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });
  if (!order.customer_pin) return res.json({ valid: false, reason: 'no_pin' });
  const decrypted = decrypt(order.customer_pin);
  res.json({ valid: decrypted === String(pin) });
});

// ─── Save work timer ─────────────────────────────────────────────────────────
router.patch('/:id/timer', (req: Request, res: Response) => {
  const db = getDb();
  const { minutes } = req.body as { minutes: number };
  if (typeof minutes !== 'number' || minutes < 0) return res.status(400).json({ error: 'Neplatný čas' });

  const order = db.prepare(`SELECT id FROM orders WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT);
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });

  db.prepare(`UPDATE orders SET work_duration_minutes = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
    .run(minutes, req.params.id, TENANT);

  res.json({ success: true, work_duration_minutes: minutes });
});

// ─── Delete order ─────────────────────────────────────────────────────────────
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const order = db.prepare(`SELECT id FROM orders WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT);
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });

  db.prepare('DELETE FROM orders WHERE id = ? AND tenant_id = ?').run(req.params.id, TENANT);
  res.json({ success: true });
});

// ─── Add item to order ────────────────────────────────────────────────────────
router.post('/:id/items', (req: Request, res: Response) => {
  const db = getDb();
  const order = db.prepare(`SELECT * FROM orders WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as Order | undefined;
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });

  // type: 'work' | 'part' | 'material'
  const {
    type = 'part',
    description,
    part_id,
    quantity = 1,
    unit_price,
    margin_percent = 0,
    // Práce: hodiny + minuty + sazba
    hours,
    minutes,
    hourly_rate,
  } = req.body;

  if (!description) return res.status(400).json({ error: 'Popis položky je povinný' });

  let finalUnitPrice = parseFloat(unit_price) || 0;
  let finalDesc = description;

  // Pokud jde o práci s časem, přepočítej cenu
  if (type === 'work' && (hours !== undefined || minutes !== undefined)) {
    const totalMinutes = (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
    const rate = parseFloat(hourly_rate) || 0;
    finalUnitPrice = (totalMinutes / 60) * rate;
    finalDesc = description || `Práce ${hours || 0}h ${minutes || 0}min`;
  }

  // Material nemá marži — cena je finální
  const totalPrice = type === 'material'
    ? finalUnitPrice * quantity
    : finalUnitPrice * quantity * (1 + margin_percent / 100);

  const result = db.prepare(`
    INSERT INTO order_items (order_id, type, description, part_id, quantity, unit_price, margin_percent, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(order.id, type, finalDesc, part_id || null, quantity, finalUnitPrice, type === 'material' ? 0 : margin_percent, totalPrice);

  // Recalculate order totals
  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN type = 'work' THEN total_price ELSE 0 END) as work_total,
      SUM(CASE WHEN type IN ('part','material') THEN total_price ELSE 0 END) as parts_total,
      SUM(total_price) as grand_total
    FROM order_items WHERE order_id = ?
  `).get(order.id) as { work_total: number; parts_total: number; grand_total: number };

  db.prepare(`
    UPDATE orders SET
      work_price = ?, parts_price = ?, total_price = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(totals.work_total || 0, totals.parts_total || 0, totals.grand_total || 0, order.id);

  if (part_id) {
    db.prepare(`UPDATE parts SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ?`)
      .run(quantity, part_id);
  }

  const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

// ─── Remove item from order ───────────────────────────────────────────────────
router.delete('/:id/items/:itemId', (req: Request, res: Response) => {
  const db = getDb();
  const item = db.prepare(`
    SELECT oi.* FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.id = ? AND o.tenant_id = ?
  `).get(req.params.itemId, TENANT) as any;

  if (!item) return res.status(404).json({ error: 'Položka nenalezena' });

  if (item.part_id) {
    db.prepare(`UPDATE parts SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`)
      .run(item.quantity, item.part_id);
  }

  db.prepare('DELETE FROM order_items WHERE id = ?').run(item.id);

  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN type = 'work' THEN total_price ELSE 0 END) as work_total,
      SUM(CASE WHEN type IN ('part','material') THEN total_price ELSE 0 END) as parts_total,
      SUM(total_price) as grand_total
    FROM order_items WHERE order_id = ?
  `).get(req.params.id) as { work_total: number; parts_total: number; grand_total: number };

  db.prepare(`
    UPDATE orders SET work_price = ?, parts_price = ?, total_price = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(totals.work_total || 0, totals.parts_total || 0, totals.grand_total || 0, req.params.id);

  res.json({ success: true });
});

// ─── Mark/update claim ────────────────────────────────────────────────────────
router.patch('/:id/claim', (req: Request, res: Response) => {
  const db = getDb();
  const { claim_reason, claim_resolved_at, is_claim } = req.body;
  const order = db.prepare('SELECT id FROM orders WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, TENANT) as any;
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });

  db.prepare(`
    UPDATE orders SET
      is_claim = COALESCE(?, is_claim),
      claim_reason = COALESCE(?, claim_reason),
      claim_resolved_at = ?,
      updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(
    is_claim !== undefined ? (is_claim ? 1 : 0) : null,
    claim_reason ?? null,
    claim_resolved_at ?? null,
    req.params.id, TENANT
  );

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as any;

  // Záruky → Účetnictví: záruční oprava jako expense transakce
  if (is_claim === 1) {
    const exists = db.prepare(
      `SELECT id FROM transactions WHERE tenant_id = ? AND description LIKE ?`
    ).get(TENANT, `%Záruční oprava ${updated?.order_number}%`) as any;
    if (!exists) {
      db.prepare(`
        INSERT INTO transactions (tenant_id, type, category, amount, description, order_id, transaction_date)
        VALUES (?, 'expense', 'Záruční oprava', ?, ?, ?, date('now'))
      `).run(
        TENANT,
        updated?.total_price || 0,
        `Záruční oprava ${updated?.order_number} — ${updated?.device_type || ''}`,
        updated?.id
      );
    }
  }
  res.json(updated);
});

// ─── Vytvořit výjezd ze zakázky ──────────────────────────────────────────────
router.post('/:id/create-visit', (req: Request, res: Response) => {
  const db = getDb();
  const order = db.prepare(
    `SELECT * FROM orders WHERE id = ? AND tenant_id = ?`
  ).get(req.params.id, TENANT) as Order | undefined;
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });

  const { visit_date, visit_time, description, distance_km, notes } = req.body;
  if (!visit_date) return res.status(400).json({ error: 'Datum výjezdu je povinné' });

  // Načti adresu ze zákaznického profilu pokud existuje
  let address = '';
  if (order.customer_id) {
    const cust = db.prepare(`SELECT address, city FROM customers WHERE id = ? AND tenant_id = ?`).get(order.customer_id, TENANT) as any;
    if (cust) address = [cust.address, cust.city].filter(Boolean).join(', ');
  }

  const km = parseFloat(distance_km) || 0;

  // Použij settings-based calcFee
  const gs = (key: string, def: number) => {
    const r = db.prepare(`SELECT value FROM settings WHERE tenant_id = 1 AND key = ?`).get(key) as { value: string } | undefined;
    return r ? (parseFloat(r.value) || def) : def;
  };
  const z1km = gs('visit_fee_zone1_km', 5), z1czk = gs('visit_fee_zone1_czk', 0);
  const z2km = gs('visit_fee_zone2_km', 15), z2czk = gs('visit_fee_zone2_czk', 150);
  const z3km = gs('visit_fee_zone3_km', 30), z3czk = gs('visit_fee_zone3_czk', 300);
  const overRate = gs('visit_fee_over_czk_per_km', 15);
  let fee = 0;
  if (km <= z1km) fee = z1czk;
  else if (km <= z2km) fee = z2czk;
  else if (km <= z3km) fee = z3czk;
  else fee = Math.round(z3czk + (km - z3km) * overRate);

  const r = db.prepare(`
    INSERT INTO field_visits
      (tenant_id, order_id, customer_name, address, visit_date, visit_time,
       description, distance_km, fee_czk, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Naplánován')
  `).run(
    TENANT, order.id, order.customer_name, address,
    visit_date, visit_time || null,
    description || order.problem_description || null,
    km, fee, notes || null
  );

  res.status(201).json(db.prepare('SELECT * FROM field_visits WHERE id = ?').get(r.lastInsertRowid));
});

export default router;