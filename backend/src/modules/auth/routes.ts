// backend/src/modules/auth/routes.ts
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { getDb } from '../../db/database';
import {
  JWT_SECRET, JWT_EXPIRES, requireAuth,
  SUPER_ADMIN_USERNAME, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_USER,
  AuthUser,
} from '../../middleware/auth';


const router = Router();

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };

  if (!username?.trim() || !password)
    return res.status(400).json({ error: 'Uživatelské jméno a heslo jsou povinné' });

  // Kontrola hardkodnutého super admina
  if (username.trim().toLowerCase() === SUPER_ADMIN_USERNAME) {
    if (password !== SUPER_ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Nesprávné heslo' });
    }
    const signOptions: SignOptions = { expiresIn: '24h' };
const token = jwt.sign({ userId: -1, username: SUPER_ADMIN_USERNAME }, JWT_SECRET, signOptions);
    return res.json({ token, user: SUPER_ADMIN_USER });
  }

  // DB uživatel
  const db = getDb();
  const row = db.prepare(`
    SELECT u.id, u.username, u.name, u.password_hash, u.active,
           r.name as role_name, r.allowed_tabs, r.can_delete, r.is_admin
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE u.username = ? AND u.tenant_id = 1
  `).get(username.trim()) as any;

  if (!row) return res.status(401).json({ error: 'Uživatel nenalezen' });
  if (!row.active) return res.status(401).json({ error: 'Účet byl deaktivován' });

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return res.status(401).json({ error: 'Nesprávné heslo' });

  const user: AuthUser = {
    id: row.id,
    username: row.username,
    name: row.name,
    role_name: row.role_name || 'unknown',
    allowed_tabs: JSON.parse(row.allowed_tabs || '[]'),
    can_delete: !!row.can_delete,
    is_admin: !!row.is_admin,
    is_super: false,
  };
  const signOptions: SignOptions = { expiresIn: '24h' };
  const token = jwt.sign({ userId: row.id, username: row.username }, JWT_SECRET, signOptions);

  // Zaloguj přihlášení
  db.prepare(`
    UPDATE users SET updated_at = datetime('now') WHERE id = ?
  `).run(row.id);

  res.json({ token, user });
});

// ─── Me (current user info) ───────────────────────────────────────────────────
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json(req.user);
});

// ─── Change password ──────────────────────────────────────────────────────────
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Obě hesla jsou povinná' });
  if (new_password.length < 4)
    return res.status(400).json({ error: 'Nové heslo musí mít alespoň 4 znaky' });
  if (req.user?.id === -1)
    return res.status(403).json({ error: 'Heslo super admina se mění v .env souboru' });

  const db = getDb();
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!row) return res.status(404).json({ error: 'Uživatel nenalezen' });

  const valid = await bcrypt.compare(current_password, row.password_hash);
  if (!valid) return res.status(401).json({ error: 'Stávající heslo je nesprávné' });

  const hash = await bcrypt.hash(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hash, req.user!.id);
  res.json({ success: true });
});

export default router;