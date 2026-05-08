// backend/src/modules/employees/routes.ts
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../../db/database';
import { requireAuth, requireAdmin } from '../../middleware/auth';

const router = Router();
const TENANT = 1;

// Všechny routes vyžadují přihlášení + admin práva
router.use(requireAuth, requireAdmin);

// ═══════════════════════════════════════
// ROLE
// ═══════════════════════════════════════

router.get('/roles', (_req: Request, res: Response) => {
  const db = getDb();
  const roles = db.prepare(`SELECT * FROM roles WHERE tenant_id = ? ORDER BY is_system DESC, name ASC`).all(TENANT);
  res.json({ data: roles });
});

router.post('/roles', (req: Request, res: Response) => {
  const db = getDb();
  const { name, allowed_tabs = [], can_delete = false, is_admin = false } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Název role je povinný' });

  const result = db.prepare(`
    INSERT INTO roles (tenant_id, name, allowed_tabs, can_delete, is_admin, is_system)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(TENANT, name.trim(), JSON.stringify(allowed_tabs), can_delete ? 1 : 0, is_admin ? 1 : 0);

  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(role);
});

router.put('/roles/:id', (req: Request, res: Response) => {
  const db = getDb();
  const role = db.prepare(`SELECT * FROM roles WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as any;
  if (!role) return res.status(404).json({ error: 'Role nenalezena' });
  if (role.is_system && req.body.name && req.body.name !== role.name)
    return res.status(403).json({ error: 'Název systémové role nelze měnit' });

  const { name, allowed_tabs, can_delete, is_admin } = req.body;
  db.prepare(`
    UPDATE roles SET
      name         = COALESCE(?, name),
      allowed_tabs = COALESCE(?, allowed_tabs),
      can_delete   = COALESCE(?, can_delete),
      is_admin     = COALESCE(?, is_admin)
    WHERE id = ? AND tenant_id = ?
  `).run(
    name || null,
    allowed_tabs !== undefined ? JSON.stringify(allowed_tabs) : null,
    can_delete !== undefined ? (can_delete ? 1 : 0) : null,
    is_admin !== undefined ? (is_admin ? 1 : 0) : null,
    req.params.id, TENANT
  );

  const updated = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/roles/:id', (req: Request, res: Response) => {
  const db = getDb();
  const role = db.prepare(`SELECT * FROM roles WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as any;
  if (!role) return res.status(404).json({ error: 'Role nenalezena' });
  if (role.is_system) return res.status(403).json({ error: 'Systémovou roli nelze smazat' });

  const usersWithRole = db.prepare('SELECT COUNT(*) as c FROM users WHERE role_id = ?').get(role.id) as { c: number };
  if (usersWithRole.c > 0)
    return res.status(409).json({ error: `Roli nelze smazat — ${usersWithRole.c} uživatelů ji má přiřazenou` });

  db.prepare('DELETE FROM roles WHERE id = ?').run(role.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════
// USERS / ZAMĚSTNANCI
// ═══════════════════════════════════════

router.get('/users', (_req: Request, res: Response) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.name, u.username, u.email, u.phone, u.active, u.created_at, u.updated_at,
           u.role_id, r.name as role_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.tenant_id = ?
    ORDER BY u.name ASC
  `).all(TENANT);
  res.json({ data: users });
});

router.get('/users/:id', (req: Request, res: Response) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT u.id, u.name, u.username, u.email, u.phone, u.active, u.created_at, u.updated_at,
           u.role_id, r.name as role_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.id = ? AND u.tenant_id = ?
  `).get(req.params.id, TENANT);
  if (!user) return res.status(404).json({ error: 'Uživatel nenalezen' });
  res.json(user);
});

router.post('/users', async (req: Request, res: Response) => {
  const db = getDb();
  const { name, username, password, email, phone, role_id } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'Jméno je povinné' });
  if (!username?.trim()) return res.status(400).json({ error: 'Uživatelské jméno je povinné' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Heslo musí mít alespoň 4 znaky' });

  // Kontrola duplicity username
  if (username.trim().toLowerCase() === 'zdever-technik')
    return res.status(409).json({ error: 'Toto uživatelské jméno je rezervováno' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ? AND tenant_id = ?').get(username.trim(), TENANT);
  if (existing) return res.status(409).json({ error: 'Uživatelské jméno je již obsazeno' });

  const password_hash = await bcrypt.hash(password, 10);

  const result = db.prepare(`
    INSERT INTO users (tenant_id, name, username, password_hash, email, phone, role_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(TENANT, name.trim(), username.trim().toLowerCase(), password_hash, email?.trim() || null, phone?.trim() || null, role_id || null);

  const user = db.prepare(`
    SELECT u.id, u.name, u.username, u.email, u.phone, u.active, u.created_at, u.role_id, r.name as role_name
    FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(user);
});

router.put('/users/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const user = db.prepare(`SELECT * FROM users WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as any;
  if (!user) return res.status(404).json({ error: 'Uživatel nenalezen' });

  const { name, username, password, email, phone, role_id, active } = req.body;

  // Kontrola duplicitního username pokud se mění
  if (username && username.toLowerCase() !== user.username) {
    if (username.toLowerCase() === 'zdever-technik')
      return res.status(409).json({ error: 'Toto uživatelské jméno je rezervováno' });
    const dup = db.prepare('SELECT id FROM users WHERE username = ? AND tenant_id = ? AND id != ?').get(username.toLowerCase(), TENANT, user.id);
    if (dup) return res.status(409).json({ error: 'Uživatelské jméno je již obsazeno' });
  }

  let password_hash = undefined;
  if (password) {
    if (password.length < 4) return res.status(400).json({ error: 'Heslo musí mít alespoň 4 znaky' });
    password_hash = await bcrypt.hash(password, 10);
  }

  db.prepare(`
    UPDATE users SET
      name          = COALESCE(?, name),
      username      = COALESCE(?, username),
      ${password_hash ? 'password_hash = ?,' : ''}
      email         = COALESCE(?, email),
      phone         = COALESCE(?, phone),
      role_id       = COALESCE(?, role_id),
      active        = COALESCE(?, active),
      updated_at    = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(
    name || null,
    username?.toLowerCase() || null,
    ...(password_hash ? [password_hash] : []),
    email !== undefined ? (email?.trim() || null) : null,
    phone !== undefined ? (phone?.trim() || null) : null,
    role_id !== undefined ? role_id : null,
    active !== undefined ? (active ? 1 : 0) : null,
    req.params.id, TENANT
  );

  const updated = db.prepare(`
    SELECT u.id, u.name, u.username, u.email, u.phone, u.active, u.updated_at, u.role_id, r.name as role_name
    FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?
  `).get(req.params.id);
  res.json(updated);
});

router.delete('/users/:id', (req: Request, res: Response) => {
  const db = getDb();
  const user = db.prepare(`SELECT * FROM users WHERE id = ? AND tenant_id = ?`).get(req.params.id, TENANT) as any;
  if (!user) return res.status(404).json({ error: 'Uživatel nenalezen' });
  if (user.username === 'test1') return res.status(403).json({ error: 'Testovací účet nelze smazat' });

  // Soft delete — jen deaktivace
  db.prepare('UPDATE users SET active = 0, updated_at = datetime(\'now\') WHERE id = ?').run(user.id);
  res.json({ success: true, message: 'Uživatel deaktivován' });
});

export default router;