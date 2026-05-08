// backend/src/modules/marketing/routes.ts — C-08 Marketing Suite
import { Router, Request, Response } from 'express';
import { getDb } from '../../db/database';

const router = Router();
const TENANT = 1;

// ─── Zdroje zákazníků ─────────────────────────────────────────────────────────
router.get('/sources', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT source, COUNT(*) as count
    FROM orders
    WHERE tenant_id = ? AND source IS NOT NULL AND source != ''
    GROUP BY source
    ORDER BY count DESC
  `).all(TENANT) as any[];
  const total = (db.prepare('SELECT COUNT(*) as c FROM orders WHERE tenant_id = ?').get(TENANT) as any).c;
  res.json({ data: rows, total });
});

// ─── Šablony inzerátů ─────────────────────────────────────────────────────────
router.get('/ad-templates', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM ad_templates WHERE tenant_id = ? ORDER BY id').all(TENANT);
  res.json({ data: rows });
});

router.post('/ad-templates', (req: Request, res: Response) => {
  const db = getDb();
  const { name, platform, content } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'name a content jsou povinné' });
  const r = db.prepare('INSERT INTO ad_templates (tenant_id, name, platform, content) VALUES (?, ?, ?, ?)')
    .run(TENANT, name, platform || 'facebook', content);
  res.json(db.prepare('SELECT * FROM ad_templates WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/ad-templates/:id', (req: Request, res: Response) => {
  const db = getDb();
  const { name, platform, content } = req.body;
  db.prepare('UPDATE ad_templates SET name=COALESCE(?,name), platform=COALESCE(?,platform), content=COALESCE(?,content) WHERE id=? AND tenant_id=?')
    .run(name??null, platform??null, content??null, req.params.id, TENANT);
  res.json(db.prepare('SELECT * FROM ad_templates WHERE id = ?').get(req.params.id));
});

router.delete('/ad-templates/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM ad_templates WHERE id = ? AND tenant_id = ?').run(req.params.id, TENANT);
  res.json({ ok: true });
});

// ─── Review request — vygeneruj zprávu ───────────────────────────────────────
router.post('/review-request/:orderId', (req: Request, res: Response) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?')
    .get(req.params.orderId, TENANT) as any;
  if (!order) return res.status(404).json({ error: 'Zakázka nenalezena' });

  const settings = db.prepare('SELECT key, value FROM settings WHERE tenant_id = ?').all(TENANT) as any[];
  const cfg: Record<string,string> = {};
  settings.forEach(s => cfg[s.key] = s.value);

  const googleUrl = cfg['review_google_url'] || '';
  const fbUrl = cfg['review_facebook_url'] || '';
  const linkLine = [googleUrl && `Google: ${googleUrl}`, fbUrl && `Facebook: ${fbUrl}`].filter(Boolean).join('\n');

  const msg = `Dobrý den, ${order.customer_name.split(' ')[0]}!\n\n` +
    `Děkuji za návštěvu opravny ZdeVer Repair. Doufám, že jste spokojen/a s opravou zařízení ${order.device_type}.\n\n` +
    `Pokud máte chvilku, budu rád za recenzi — pomáhá to dalším zákazníkům nás najít:\n${linkLine || '[doplňte odkaz v Nastavení]'}\n\n` +
    `Díky moc! 🙏\nZdeněk, ZdeVer Repair`;

  res.json({ message: msg, order_number: order.order_number });
});

export default router;