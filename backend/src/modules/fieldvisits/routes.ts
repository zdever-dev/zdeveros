// backend/src/modules/fieldvisits/routes.ts — A-09 + B-09
import { Router, Request, Response } from 'express';
import { getDb } from '../../db/database';

const router = Router();
const TENANT = 1;

const VISIT_STATUSES = ['Naplánován', 'Probíhá', 'Hotovo', 'Zrušen'];

// Haversine vzorec — Višňové: 49.0897° N, 17.9419° E
const HOME_LAT = 49.0897;
const HOME_LNG = 17.9419;

function haversineKm(lat: number, lng: number): number {
  const R = 6371;
  const dLat = ((lat - HOME_LAT) * Math.PI) / 180;
  const dLng = ((lng - HOME_LNG) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((HOME_LAT * Math.PI) / 180) *
    Math.cos((lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcFee(km: number, db: any): number {
  const gs = (key: string, def: number) => {
    const r = db.prepare(`SELECT value FROM settings WHERE tenant_id = 1 AND key = ?`).get(key) as { value: string } | undefined;
    return r ? (parseFloat(r.value) || def) : def;
  };
  const z1km  = gs('visit_fee_zone1_km',  5);
  const z1czk = gs('visit_fee_zone1_czk', 0);
  const z2km  = gs('visit_fee_zone2_km',  15);
  const z2czk = gs('visit_fee_zone2_czk', 150);
  const z3km  = gs('visit_fee_zone3_km',  30);
  const z3czk = gs('visit_fee_zone3_czk', 300);
  const overRate = gs('visit_fee_over_czk_per_km', 15);
  if (km <= z1km) return z1czk;
  if (km <= z2km) return z2czk;
  if (km <= z3km) return z3czk;
  return Math.round(z3czk + (km - z3km) * overRate);
}

// GET /api/fieldvisits
router.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const { status } = req.query as Record<string, string>;
  let sql = `
    SELECT fv.*, o.order_number
    FROM field_visits fv
    LEFT JOIN orders o ON fv.order_id = o.id
    WHERE fv.tenant_id = ?
  `;
  const params: any[] = [TENANT];
  if (status) { sql += ' AND fv.status = ?'; params.push(status); }
  sql += ' ORDER BY fv.visit_date DESC, fv.visit_time ASC';
  const visits = db.prepare(sql).all(...params);
  res.json({ data: visits });
});

// POST /api/fieldvisits
router.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const {
    order_id, customer_name, address, visit_date, visit_time,
    description, distance_km = 0, notes,
  } = req.body;

  if (!customer_name || !address || !visit_date) {
    return res.status(400).json({ error: 'customer_name, address, visit_date jsou povinné' });
  }

  const km = parseFloat(distance_km) || 0;
   const fee = calcFee(km, db);

  const r = db.prepare(`
    INSERT INTO field_visits
      (tenant_id, order_id, customer_name, address, visit_date, visit_time,
       description, distance_km, fee_czk, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Naplánován')
  `).run(TENANT, order_id || null, customer_name, address, visit_date,
      visit_time || null, description || null, km, fee, notes || null);

  const visit = db.prepare('SELECT * FROM field_visits WHERE id = ?').get(r.lastInsertRowid);
  res.json(visit);
});

// PATCH /api/fieldvisits/:id
router.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const visit = db.prepare('SELECT id FROM field_visits WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, TENANT) as any;
  if (!visit) return res.status(404).json({ error: 'Výjezd nenalezen' });

  const {
    status, distance_km, duration_min, notes,
    customer_name, address, visit_date, visit_time, description, order_id,
  } = req.body;

  const km = distance_km !== undefined ? parseFloat(distance_km) || 0 : undefined;
  const fee = km !== undefined ? calcFee(km, db) : undefined;

  db.prepare(`
    UPDATE field_visits SET
      status       = COALESCE(?, status),
      distance_km  = COALESCE(?, distance_km),
      fee_czk      = COALESCE(?, fee_czk),
      duration_min = COALESCE(?, duration_min),
      notes        = COALESCE(?, notes),
      customer_name = COALESCE(?, customer_name),
      address      = COALESCE(?, address),
      visit_date   = COALESCE(?, visit_date),
      visit_time   = COALESCE(?, visit_time),
      description  = COALESCE(?, description),
      order_id     = COALESCE(?, order_id),
      updated_at   = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(
    status ?? null, km ?? null, fee ?? null, duration_min ?? null,
    notes ?? null, customer_name ?? null, address ?? null,
    visit_date ?? null, visit_time ?? null, description ?? null,
    order_id ?? null,
    req.params.id, TENANT
  );

  const v2 = db.prepare('SELECT * FROM field_visits WHERE id = ?').get(req.params.id) as any;

  // Výjezdy → Účetnictví: auto income transakce při uzavření výjezdu
  if (status === 'Hotovo' && v2?.fee_czk > 0) {
    const exists = db.prepare(
      `SELECT id FROM transactions WHERE tenant_id = ? AND description LIKE ?`
    ).get(TENANT, `%Výjezd #${req.params.id}%`) as any;
    if (!exists) {
      db.prepare(
        `INSERT INTO transactions (tenant_id, type, category, amount, description, transaction_date)
         VALUES (?, 'income', 'Výjezd', ?, ?, date('now'))`
      ).run(TENANT, v2.fee_czk, `Výjezd #${v2.id} — ${v2.customer_name} (${v2.address || ''})`);
    }
  }

  // Výjezdy → Zákazníci: aktualizace adresy zákazníka přes order_id
  if (status === 'Hotovo' && v2?.order_id && v2?.address) {
    const linkedOrder = db.prepare(
      `SELECT customer_id FROM orders WHERE id = ? AND tenant_id = ?`
    ).get(v2.order_id, TENANT) as any;
    if (linkedOrder?.customer_id) {
      db.prepare(
        `UPDATE customers SET address = ?, updated_at = datetime('now')
         WHERE id = ? AND tenant_id = ? AND (address IS NULL OR address = '')`
      ).run(v2.address, linkedOrder.customer_id, TENANT);
    }
  }

  res.json(v2);
});

// DELETE /api/fieldvisits/:id
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const r = db.prepare('DELETE FROM field_visits WHERE id = ? AND tenant_id = ?')
    .run(req.params.id, TENANT);
  if (r.changes === 0) return res.status(404).json({ error: 'Výjezd nenalezen' });
  res.json({ ok: true });
});

// POST /api/fieldvisits/calc-fee — kalkulačka poplatku
router.post('/calc-fee', (req: Request, res: Response) => {
  const { distance_km, lat, lng } = req.body;
  let km: number;
  if (lat !== undefined && lng !== undefined) {
    km = haversineKm(parseFloat(lat), parseFloat(lng));
  } else {
    km = parseFloat(distance_km) || 0;
  }
  const db = getDb();
  res.json({ km: Math.round(km * 10) / 10, fee: calcFee(km, db) });
});

// GET /api/fieldvisits/export.csv
router.get('/export.csv', (req: Request, res: Response) => {
  const db = getDb();
  const visits = db.prepare(`
    SELECT fv.*, o.order_number
    FROM field_visits fv
    LEFT JOIN orders o ON fv.order_id = o.id
    WHERE fv.tenant_id = ?
    ORDER BY fv.visit_date DESC
  `).all(TENANT) as any[];

  const headers = ['ID','Číslo zakázky','Zákazník','Adresa','Datum','Čas','Popis','Status','Km','Poplatek Kč','Doba min','Poznámky'];
  const rows = visits.map(v => [
    v.id, v.order_number || '', v.customer_name, v.address,
    v.visit_date, v.visit_time || '', v.description || '',
    v.status, v.distance_km, v.fee_czk, v.duration_min, v.notes || '',
  ].map(f => `"${String(f).replace(/"/g, '""')}"`).join(','));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vyjezdy.csv"');
  res.send('\uFEFF' + [headers.join(','), ...rows].join('\n'));
});

export default router;