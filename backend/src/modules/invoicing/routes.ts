import { Router, Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { getDb, nextInvoiceNumber } from '../../db/database';
import type { Order, Invoice } from '../../types';
import { generateInvoicePdf, generateWarrantyPdf, generateChecklistPdf } from '../../utils/pdf';
import { generatePaymentQr } from '../../utils/qr';

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

// ─── B-1: Order estimate calculator ──────────────────────────────────────────
router.post('/estimate', (req: Request, res: Response) => {
  const {
    work_items = [],
    parts = [],
    default_margin = 20,
  } = req.body as {
    work_items: { description: string; price: number }[];
    parts: { name: string; purchase_price: number; margin_percent?: number; quantity?: number }[];
    default_margin?: number;
  };

  const workTotal = work_items.reduce((s, i) => s + (i.price || 0), 0);
  const partsBreakdown = parts.map(p => {
    const margin = p.margin_percent ?? default_margin;
    const qty = p.quantity ?? 1;
    const salePrice = p.purchase_price * (1 + margin / 100);
    const profit = (salePrice - p.purchase_price) * qty;
    return {
      ...p,
      margin_percent: margin,
      quantity: qty,
      sale_price: Math.round(salePrice * 100) / 100,
      total: Math.round(salePrice * qty * 100) / 100,
      profit: Math.round(profit * 100) / 100,
    };
  });

  const partsTotal = partsBreakdown.reduce((s, p) => s + p.total, 0);
  const grandTotal = workTotal + partsTotal;
  const partsProfit = partsBreakdown.reduce((s, p) => s + p.profit, 0);

  res.json({
    work_items,
    parts: partsBreakdown,
    summary: {
      work_total: Math.round(workTotal * 100) / 100,
      parts_total: Math.round(partsTotal * 100) / 100,
      grand_total: Math.round(grandTotal * 100) / 100,
      parts_profit: Math.round(partsProfit * 100) / 100,
      net_profit: Math.round((workTotal + partsProfit) * 100) / 100,
    },
  });
});

// ─── List invoices ────────────────────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { type, order_id, limit = '50', offset = '0' } = req.query as Record<string, string>;

  let sql = `SELECT i.*, o.order_number, o.customer_name FROM invoices i
    LEFT JOIN orders o ON i.order_id = o.id
    WHERE i.tenant_id = ?`;
  const params: (string | number)[] = [TENANT];

  if (type)     { sql += ' AND i.type = ?';     params.push(type); }
  if (order_id) { sql += ' AND i.order_id = ?'; params.push(parseInt(order_id)); }

  sql += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const invoices = db.prepare(sql).all(...params);
  res.json({ data: invoices });
});

// ─── Generate invoice/receipt from order ─────────────────────────────────────
router.post('/generate', async (req: Request, res: Response) => {
  const db = getDb();
  const { order_id, type = 'receipt', payment_method, discount = 0, notes } = req.body as {
    order_id: number;
    type?: 'receipt' | 'invoice';
    payment_method?: string;
    discount?: number;
    notes?: string;
  };

  if (!order_id) return res.status(400).json({ error: 'order_id je povinný' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').get(order_id, TENANT) as Order | undefined;
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });
  const settings = getSettings();
  const invoiceNumber = nextInvoiceNumber(TENANT, type === 'receipt' ? 'P' : 'F');
  const total = (order.total_price || 0) - (discount || 0);
  const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const result = db.prepare(`
    INSERT INTO invoices (tenant_id, invoice_number, order_id, customer_id, type, status,
      issue_date, due_date, taxable_date, subtotal_work, subtotal_parts, discount, total,
      payment_method, notes)
    VALUES (?, ?, ?, ?, ?, 'issued', datetime('now'), ?, date('now'), ?, ?, ?, ?, ?, ?)
  `).run(
    TENANT, invoiceNumber, order_id, order.customer_id ?? null,
    type, dueDate,
    order.work_price || 0, order.parts_price || 0, discount, total,
    payment_method || 'Hotovost', notes || null
  );

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(result.lastInsertRowid) as Invoice;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order_id);

  // Generate PDF
  try {
    const filename = await generateInvoicePdf(order, invoice, settings, items);
    db.prepare('UPDATE invoices SET pdf_path = ? WHERE id = ?').run(filename, invoice.id);

    // Record income transaction
    db.prepare(`
      INSERT INTO transactions (tenant_id, type, category, amount, description, invoice_id, order_id)
      VALUES (?, 'income', 'repair', ?, ?, ?, ?)
    `).run(TENANT, total, `Zakázka ${order.order_number}`, invoice.id, order_id);

    // Mark order as paid if cash
    if (payment_method === 'Hotovost') {
      db.prepare(`UPDATE orders SET paid = 1, payment_method = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(payment_method, order_id);
    }

    res.status(201).json({ ...invoice, pdf_path: filename, pdf_url: `/pdfs/${filename}` });
  } catch (err: any) {
    // Return invoice even if PDF fails
    console.error('[PDF Error]', err.message);
    res.status(201).json({ ...invoice, pdf_error: 'PDF se nepodařilo vygenerovat: ' + err.message });
  }
});

// ─── Download invoice PDF ─────────────────────────────────────────────────────
router.get('/:id/pdf', async (req: Request, res: Response) => {
  const db = getDb();
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?').get(req.params.id, TENANT) as Invoice | undefined;
  if (!invoice) return res.status(404).json({ error: 'Faktura nenalezena' });

  const order = invoice.order_id
    ? db.prepare('SELECT * FROM orders WHERE id = ?').get(invoice.order_id) as Order
    : null;

  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });

  const settings = getSettings();
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

  try {
    const filename = generateInvoicePdf(order, invoice, settings, items);
    db.prepare('UPDATE invoices SET pdf_path = ? WHERE id = ?').run(filename, invoice.id);
    res.json({ filename, url: `/pdfs/${filename}` });
  } catch (err: any) {
    res.status(500).json({ error: 'Chyba generování PDF: ' + err.message });
  }
});

// ─── Generate warranty certificate for order (B-5) ───────────────────────────
router.post('/warranty/:orderId', async (req: Request, res: Response) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').get(req.params.orderId, TENANT) as Order | undefined;
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });
  const settings = getSettings();
  const {
  warranty_days,
  repair_description,
} = req.body as { warranty_days?: number; repair_description?: string };

const days = warranty_days ?? parseInt(settings.warranty_days || '30');

try {
  const filename = generateWarrantyPdf(order, settings, days, repair_description);
  res.json({ filename, url: `/pdfs/${filename}` });
} catch (err: any) {
  res.status(500).json({ error: 'Chyba generování záručního listu: ' + err.message });
}
});

// ─── Generate checklist (B-8) ────────────────────────────────────────────────
router.post('/checklist/:orderId', async (req: Request, res: Response) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').get(req.params.orderId, TENANT) as Order | undefined;
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });
  
  const { checked_items = [] } = req.body as { checked_items?: boolean[] };

  // Get default checklist template
  const template = db.prepare('SELECT items FROM checklist_templates WHERE tenant_id = ? LIMIT 1').get(TENANT) as { items: string } | undefined;
  const items: string[] = template ? JSON.parse(template.items) : [
    'Oprava otestována', 'Záruční list vygenerován', 'Doklad vystaven', 'Platba přijata',
  ];
  const checked = items.map((_, i) => checked_items[i] ?? false);

  const settings = getSettings();

  try {
    const filename = generateChecklistPdf(order, items, checked, settings);
    res.json({ filename, url: `/pdfs/${filename}` });
  } catch (err: any) {
    res.status(500).json({ error: 'Chyba generování checklistu: ' + err.message });
  }
});

// ─── B-6: Generate QR payment code ───────────────────────────────────────────
router.post('/qr-payment', async (req: Request, res: Response) => {
  const { amount, variable_symbol, message } = req.body as {
    amount: number;
    variable_symbol?: string;
    message?: string;
  };

  if (!amount || amount <= 0) return res.status(400).json({ error: 'Částka musí být kladná' });

  const settings = getSettings();
  if (!settings.bank_account) return res.status(400).json({ error: 'Číslo účtu není nastaveno v nastavení' });

  try {
    const qr = await generatePaymentQr({
      account: settings.bank_account,
      amount,
      variableSymbol: variable_symbol,
      message: message || settings.company_name,
      recipientName: settings.company_name,
    });
    res.json(qr);
  } catch (err: any) {
    res.status(500).json({ error: 'Chyba generování QR kódu: ' + err.message });
  }
});

// ─── B-10: Get message templates ─────────────────────────────────────────────
router.get('/message-templates', (_req: Request, res: Response) => {
  const db = getDb();
  const templates = db.prepare('SELECT * FROM message_templates WHERE tenant_id = ? ORDER BY id').all(TENANT);
  res.json(templates);
});

// ─── B-10: Render message template with order data ────────────────────────────
router.post('/message-templates/:id/render', (req: Request, res: Response) => {
  const db = getDb();
  const template = db.prepare('SELECT * FROM message_templates WHERE id = ? AND tenant_id = ?').get(req.params.id, TENANT) as any;
  if (!template) return res.status(404).json({ error: 'Šablona nenalezena' });

  const { order_id } = req.body as { order_id?: number };
  let order: Order | undefined;

  if (order_id) {
    order = db.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').get(order_id, TENANT) as Order | undefined;
  }

  const settings = getSettings();

  const vars: Record<string, string> = {
    '{jméno}': order?.customer_name || '[Jméno zákazníka]',
    '{zařízení}': order ? `${order.device_type}${order.device_model ? ` ${order.device_model}` : ''}` : '[Zařízení]',
    '{číslo}': order?.order_number || '[Č. zakázky]',
    '{cena}': order ? String(order.total_price) : '[Cena]',
    '{termín}': '[Termín]',
    '{telefon}': settings.company_phone || '',
    '{číslo_účtu}': settings.bank_account || '[Č. účtu]',
    '{splatnost}': '[Datum splatnosti]',
    '{číslo_faktury}': '[Č. faktury]',
  };

  let rendered = template.content;
  for (const [placeholder, value] of Object.entries(vars)) {
    rendered = rendered.replaceAll(placeholder, value);
  }

  res.json({ ...template, rendered });
});

// ─── Generovat doklad z výjezdu (Výjezdy → Fakturace) ────────────────────────
router.post('/from-visit/:visitId', async (req: Request, res: Response) => {
  const db = getDb();
  const visit = db.prepare(
    `SELECT * FROM field_visits WHERE id = ? AND tenant_id = ?`
  ).get(req.params.visitId, TENANT) as any;
  if (!visit) return res.status(404).json({ error: 'Výjezd nenalezen' });

  const settings = getSettings();
  const invoiceNumber = nextInvoiceNumber(TENANT, 'V');

  // Zákazník z propojené zakázky nebo přímý
  let customerId: number | null = null;
  let customerName = visit.customer_name;
  if (visit.order_id) {
    const order = db.prepare(`SELECT customer_id, customer_name FROM orders WHERE id = ?`).get(visit.order_id) as any;
    if (order) { customerId = order.customer_id; customerName = order.customer_name || customerName; }
  }

  const total = visit.fee_czk || 0;
  const result = db.prepare(`
    INSERT INTO invoices (tenant_id, invoice_number, order_id, customer_id, type, status,
      issue_date, due_date, subtotal, vat_amount, total, notes)
    VALUES (?, ?, ?, ?, 'receipt', 'paid', date('now'), date('now'), ?, 0, ?, ?)
  `).run(
    TENANT, invoiceNumber, visit.order_id || null, customerId,
    total, total,
    `Výjezd ${visit.address || ''} — ${visit.distance_km || 0} km`
  );

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(result.lastInsertRowid) as any;

  // Auto transakce (pokud ještě není z výjezdu)
  const txExists = db.prepare(
    `SELECT id FROM transactions WHERE tenant_id = ? AND description LIKE ?`
  ).get(TENANT, `%Výjezd #${visit.id}%`) as any;
  if (!txExists && total > 0) {
    db.prepare(`
      INSERT INTO transactions (tenant_id, type, category, amount, description, invoice_id, transaction_date)
      VALUES (?, 'income', 'Výjezd', ?, ?, ?, date('now'))
    `).run(TENANT, total, `Výjezd #${visit.id} — ${customerName}`, result.lastInsertRowid);
  }

  res.status(201).json(invoice);
});

// ─── Doklady zákazníka (Fakturace → Zákazníci) ───────────────────────────────
router.get('/customer/:customerId', (req: Request, res: Response) => {
  const db = getDb();
  const invoices = db.prepare(`
    SELECT i.*, o.order_number, o.device_type
    FROM invoices i
    LEFT JOIN orders o ON i.order_id = o.id
    WHERE i.tenant_id = ? AND i.customer_id = ?
    ORDER BY i.issue_date DESC
  `).all(TENANT, req.params.customerId);
  res.json({ data: invoices });
});

export default router;
