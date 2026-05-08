import { Router, Request, Response } from 'express';
import { getDb } from '../../db/database';
import type { Part, CreatePartDTO } from '../../types';
import QRCode from 'qrcode';
import { join } from 'path';
import { writeFileSync } from 'fs';

const PDF_DIR = process.env.PDF_OUTPUT_DIR || join(process.cwd(), 'data', 'pdfs');

const router = Router();
const TENANT = 1;

// ─── List parts ───────────────────────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { search, category, low_stock, limit = '100', offset = '0' } = req.query as Record<string, string>;

  let sql = `SELECT * FROM parts WHERE tenant_id = ?`;
  const params: (string | number)[] = [TENANT];

  if (search) {
    sql += ` AND (name LIKE ? OR sku LIKE ? OR compatible_models LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }
  if (low_stock === 'true') {
    sql += ` AND quantity <= min_quantity`;
  }

  sql += ` ORDER BY name ASC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  const parts = db.prepare(sql).all(...params) as Part[];

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN quantity <= min_quantity THEN 1 ELSE 0 END) as low_stock,
      SUM(quantity * purchase_price) as total_value
    FROM parts WHERE tenant_id = ?
  `).get(TENANT) as { total: number; low_stock: number; total_value: number };

  res.json({ data: parts, stats });
});

// ─── Categories list ──────────────────────────────────────────────────────────
router.get('/categories', (_req: Request, res: Response) => {
  const db = getDb();
  const categories = db.prepare(`
    SELECT DISTINCT category FROM parts
    WHERE tenant_id = ? AND category IS NOT NULL
    ORDER BY category
  `).all(TENANT) as { category: string }[];
  res.json(categories.map(r => r.category));
});

// ─── Low stock parts ──────────────────────────────────────────────────────────
router.get('/low-stock', (_req: Request, res: Response) => {
  const db = getDb();
  const parts = db.prepare(`
    SELECT * FROM parts
    WHERE tenant_id = ? AND quantity <= min_quantity
    ORDER BY (quantity - min_quantity) ASC
  `).all(TENANT) as Part[];
  res.json({ data: parts, count: parts.length });
});

// ─── B-3: Margin calculator ───────────────────────────────────────────────────
router.post('/calculator/margin', (req: Request, res: Response) => {
  const { purchase_price, margin_percent = 20, work_price = 0 } = req.body as {
    purchase_price: number;
    margin_percent?: number;
    work_price?: number;
  };

  if (!purchase_price && purchase_price !== 0)
    return res.status(400).json({ error: 'Nákupní cena je povinná' });

  const margin = (purchase_price * margin_percent) / 100;
  const sale_price = purchase_price + margin;
  const total_with_work = sale_price + work_price;

  res.json({
    purchase_price: Math.round(purchase_price * 100) / 100,
    margin_percent,
    margin_amount: Math.round(margin * 100) / 100,
    sale_price: Math.round(sale_price * 100) / 100,
    work_price: Math.round(work_price * 100) / 100,
    total_with_work: Math.round(total_with_work * 100) / 100,
    profit: Math.round(margin * 100) / 100,
  });
});

// ─── Get single part ──────────────────────────────────────────────────────────
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const part = db.prepare(`SELECT * FROM parts WHERE id = ? AND tenant_id = ?`)
    .get(req.params.id, TENANT) as Part | undefined;
  if (!part) return res.status(404).json({ error: 'Díl nenalezen' });
  res.json(part);
});

// ─── Create part ──────────────────────────────────────────────────────────────
router.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const body: CreatePartDTO = req.body;

  if (!body.name?.trim()) return res.status(400).json({ error: 'Název dílu je povinný' });
  if (body.purchase_price === undefined) return res.status(400).json({ error: 'Nákupní cena je povinná' });

  const marginPct = body.margin_percent ?? 20;
  const salePrice = body.sale_price !== undefined
    ? body.sale_price
    : body.purchase_price * (1 + marginPct / 100);

  const result = db.prepare(`
    INSERT INTO parts (
      tenant_id, name, sku, category, compatible_models,
      purchase_price, sale_price, margin_percent, quantity, min_quantity,
      supplier, location, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    TENANT,
    body.name.trim(),
    body.sku || null,
    body.category || null,
    body.compatible_models || null,
    body.purchase_price,
    Math.round(salePrice * 100) / 100,
    marginPct,
    body.quantity ?? 0,
    body.min_quantity ?? 2,
    body.supplier || null,
    body.location || null,
    body.notes || null
  );

  const newPart = db.prepare('SELECT * FROM parts WHERE id = ?').get(result.lastInsertRowid) as Part;
  res.status(201).json(newPart);
});

// ─── Update part ──────────────────────────────────────────────────────────────
router.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const part = db.prepare(`SELECT id FROM parts WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT);
  if (!part) return res.status(404).json({ error: 'Díl nenalezen' });

  const b = req.body;

  // Recalculate sale_price if margin changed
  let salePrice = b.sale_price;
  if (b.purchase_price !== undefined && b.margin_percent !== undefined && !b.sale_price) {
    salePrice = b.purchase_price * (1 + b.margin_percent / 100);
  }

  db.prepare(`
    UPDATE parts SET
      name              = COALESCE(?, name),
      sku               = COALESCE(?, sku),
      category          = COALESCE(?, category),
      compatible_models = COALESCE(?, compatible_models),
      purchase_price    = COALESCE(?, purchase_price),
      sale_price        = COALESCE(?, sale_price),
      margin_percent    = COALESCE(?, margin_percent),
      quantity          = COALESCE(?, quantity),
      min_quantity      = COALESCE(?, min_quantity),
      supplier          = COALESCE(?, supplier),
      location          = COALESCE(?, location),
      notes             = COALESCE(?, notes),
      updated_at        = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(
    b.name, b.sku, b.category, b.compatible_models,
    b.purchase_price, salePrice, b.margin_percent,
    b.quantity, b.min_quantity, b.supplier, b.location, b.notes,
    req.params.id, TENANT
  );

  const updated = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id) as Part;
  res.json(updated);
});

// ─── Adjust quantity ──────────────────────────────────────────────────────────
router.patch('/:id/quantity', (req: Request, res: Response) => {
  const db = getDb();
  const part = db.prepare(`SELECT * FROM parts WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as Part | undefined;
  if (!part) return res.status(404).json({ error: 'Díl nenalezen' });

  const { delta, absolute } = req.body as { delta?: number; absolute?: number };

  if (absolute !== undefined) {
    if (absolute < 0) return res.status(400).json({ error: 'Množství nesmí být záporné' });
    db.prepare(`UPDATE parts SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(absolute, part.id);
  } else if (delta !== undefined) {
    const newQty = part.quantity + delta;
    if (newQty < 0) return res.status(400).json({ error: 'Výsledné množství by bylo záporné' });
    db.prepare(`UPDATE parts SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`).run(delta, part.id);
  } else {
    return res.status(400).json({ error: 'Zadejte delta nebo absolute hodnotu' });
  }

  const updated = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id) as Part;

  // Sklad → Účetnictví: auto expense při příjmu dílů (když se zvyšuje množství)
  const addedQty =
    absolute !== undefined
      ? Math.max(0, absolute - part.quantity)
      : delta !== undefined && delta > 0 ? delta : 0;
  if (addedQty > 0 && part.purchase_price > 0) {
    const cost = Math.round(addedQty * part.purchase_price * 100) / 100;
    db.prepare(
      `INSERT INTO transactions (tenant_id, type, category, amount, description, transaction_date)
       VALUES (?, 'expense', 'Sklad', ?, ?, date('now'))`
    ).run(TENANT, cost, `Nákup: ${part.name} (${addedQty} ks × ${part.purchase_price} Kč)`);
  }

  res.json(updated);
});

// ─── Delete part ──────────────────────────────────────────────────────────────
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const part = db.prepare(`SELECT id FROM parts WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT);
  if (!part) return res.status(404).json({ error: 'Díl nenalezen' });

  db.prepare('DELETE FROM parts WHERE id = ? AND tenant_id = ?').run(req.params.id, TENANT);
  res.json({ success: true });
});

// ─── Generate QR code for part ────────────────────────────────────────────────
router.get('/:id/qr', async (req: Request, res: Response) => {
  const db = getDb();
  const part = db.prepare(`SELECT * FROM parts WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as Part | undefined;
  if (!part) return res.status(404).json({ error: 'Díl nenalezen' });

  const payload = JSON.stringify({ part_id: part.id, sku: part.sku || '', name: part.name });
  const qrDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M', margin: 1, width: 200,
    color: { dark: '#1C2A4A', light: '#FFFFFF' },
  });

  res.json({ qr_data_url: qrDataUrl, part_id: part.id, sku: part.sku, name: part.name });
});

// ─── Generate printable label HTML for part ───────────────────────────────────
router.get('/:id/label', async (req: Request, res: Response) => {
  const db = getDb();
  const part = db.prepare(`SELECT * FROM parts WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as Part | undefined;
  if (!part) return res.status(404).json({ error: 'Díl nenalezen' });

  const payload = JSON.stringify({ part_id: part.id, sku: part.sku || '', name: part.name });
  const qrDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M', margin: 1, width: 180,
    color: { dark: '#1C2A4A', light: '#FFFFFF' },
  });

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Štítek — ${part.name}</title>
<style>
  body { margin:0; padding:4px; width:62mm; font-family:Arial,sans-serif; background:#fff; }
  img { width:54mm; height:54mm; display:block; margin:0 auto; }
  .name { font-size:10px; font-weight:700; text-align:center; margin-top:3px; color:#1C2A4A; word-break:break-word; }
  .sku { font-size:9px; text-align:center; color:#6b7a99; font-family:monospace; }
  .qty { font-size:8px; text-align:center; color:#0a6a55; margin-top:2px; }
  @media print { @page { size:62mm auto; margin:0; } body { width:62mm; } }
</style></head><body>
  <img src="${qrDataUrl}" alt="QR" />
  <div class="name">${part.name}</div>
  ${part.sku ? `<div class="sku">SKU: ${part.sku}</div>` : ''}
  <div class="qty">Sklad: ${part.quantity} ks · Min: ${part.min_quantity} ks</div>
  <script>window.onload=()=>{ window.print(); window.onafterprint=()=>window.close(); }<\/script>
</body></html>`;

  const filename = `label-part-${part.id}-${Date.now()}.html`;
  writeFileSync(join(PDF_DIR, filename), html, 'utf-8');
  res.json({ filename, url: `/pdfs/${filename}` });
});

// ─── Kompatibilní díly pro daný model zařízení ────────────────────────────────
router.get('/compatible/:model', (req: Request, res: Response) => {
  const db = getDb();
  const model = decodeURIComponent(req.params.model).trim();
  if (!model) return res.json([]);

  // compatible_models je text — hledáme substring match
  const parts = db.prepare(`
    SELECT id, name, sku, category, quantity, min_quantity, purchase_price, sale_price, compatible_models
    FROM parts
    WHERE tenant_id = ? AND quantity > 0
      AND (compatible_models LIKE ? OR compatible_models LIKE ? OR compatible_models LIKE ?)
    ORDER BY quantity DESC
    LIMIT 20
  `).all(TENANT, `%${model}%`, `%${model.split(' ')[0]}%`, `%${(model.split(' ')[1] || '')}%`);

  res.json(parts);
});

export default router;