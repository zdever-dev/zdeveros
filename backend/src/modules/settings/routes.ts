import { Router, Request, Response } from 'express';
import { getDb } from '../../db/database';
import type { Settings } from '../../types';

const router = Router();
const TENANT = 1;

// ─── Get all settings ─────────────────────────────────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT key, value FROM settings WHERE tenant_id = ?`
  ).all(TENANT) as { key: string; value: string }[];

  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;

  res.json(settings as unknown as Settings);
});

// ─── Update settings (batch) ──────────────────────────────────────────────────
router.put('/', (req: Request, res: Response) => {
  const db = getDb();
  const updates: Record<string, string> = req.body;

  const upsert = db.prepare(`
    INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value
  `);

  const updateMany = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      upsert.run(TENANT, key, String(value));
    }
  });
  updateMany();

  const rows = db.prepare(
    `SELECT key, value FROM settings WHERE tenant_id = ?`
  ).all(TENANT) as { key: string; value: string }[];

  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;

  res.json(settings);
});

// ─── Get single setting ───────────────────────────────────────────────────────
router.get('/:key', (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare(
    `SELECT value FROM settings WHERE tenant_id = ? AND key = ?`
  ).get(TENANT, req.params.key) as { value: string } | undefined;

  if (!row) return res.status(404).json({ error: 'Nastavení nenalezeno' });
  res.json({ key: req.params.key, value: row.value });
});

// ─── Update single setting ────────────────────────────────────────────────────
router.patch('/:key', (req: Request, res: Response) => {
  const db = getDb();
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'Hodnota je povinná' });

  db.prepare(`
    INSERT INTO settings (tenant_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value
  `).run(TENANT, req.params.key, String(value));

  res.json({ key: req.params.key, value: String(value) });
});

// ─── Get checklist templates ──────────────────────────────────────────────────
router.get('/checklist/templates', (_req: Request, res: Response) => {
  const db = getDb();
  const templates = db.prepare(
    `SELECT * FROM checklist_templates WHERE tenant_id = ? ORDER BY id`
  ).all(TENANT);
  res.json(templates);
});

// ─── Update checklist template ────────────────────────────────────────────────
router.put('/checklist/templates/:id', (req: Request, res: Response) => {
  const db = getDb();
  const { name, items } = req.body;
  if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Items musí být pole' });

  db.prepare(`
    UPDATE checklist_templates SET name = COALESCE(?, name), items = ?
    WHERE id = ? AND tenant_id = ?
  `).run(name || null, JSON.stringify(items), req.params.id, TENANT);

  const updated = db.prepare('SELECT * FROM checklist_templates WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ─── Get message templates ────────────────────────────────────────────────────
router.get('/message/templates', (_req: Request, res: Response) => {
  const db = getDb();
  const templates = db.prepare(
    `SELECT * FROM message_templates WHERE tenant_id = ? ORDER BY id`
  ).all(TENANT);
  res.json(templates);
});

// ─── Update message template ──────────────────────────────────────────────────
router.put('/message/templates/:id', (req: Request, res: Response) => {
  const db = getDb();
  const { situation, subject, content } = req.body;

  db.prepare(`
    UPDATE message_templates SET
      situation = COALESCE(?, situation),
      subject   = COALESCE(?, subject),
      content   = COALESCE(?, content)
    WHERE id = ? AND tenant_id = ?
  `).run(situation, subject, content, req.params.id, TENANT);

  const updated = db.prepare('SELECT * FROM message_templates WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ─── Create custom message template ──────────────────────────────────────────
router.post('/message/templates', (req: Request, res: Response) => {
  const db = getDb();
  const { situation, subject, content } = req.body;

  if (!situation?.trim() || !content?.trim())
    return res.status(400).json({ error: 'Situace a obsah jsou povinné' });

  const result = db.prepare(`
    INSERT INTO message_templates (tenant_id, situation, subject, content, is_custom)
    VALUES (?, ?, ?, ?, 1)
  `).run(TENANT, situation.trim(), subject?.trim() || null, content.trim());

  const created = db.prepare('SELECT * FROM message_templates WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// ─── Delete custom message template ──────────────────────────────────────────
router.delete('/message/templates/:id', (req: Request, res: Response) => {
  const db = getDb();
  const tpl = db.prepare(
    `SELECT id, is_custom FROM message_templates WHERE id = ? AND tenant_id = ?`
  ).get(req.params.id, TENANT) as { id: number; is_custom: number } | undefined;

  if (!tpl) return res.status(404).json({ error: 'Šablona nenalezena' });
  if (!tpl.is_custom) return res.status(403).json({ error: 'Výchozí šablony nelze smazat' });

  db.prepare('DELETE FROM message_templates WHERE id = ?').run(tpl.id);
  res.json({ success: true });
});

export default router;
