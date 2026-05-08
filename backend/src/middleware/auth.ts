// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/database';

export interface AuthUser {
  id: number;           // -1 = hardcoded super admin
  username: string;
  name: string;
  role_name: string;
  allowed_tabs: string[];
  can_delete: boolean;
  is_admin: boolean;
  is_super: boolean;    // true jen pro zdever-technik
}

// Hardkodnutý super admin — heslo z .env nebo fallback
const SUPER_ADMIN_USERNAME = 'zdever-technik';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'ZdeVer2025!';
const SUPER_ADMIN_USER: AuthUser = {
  id: -1,
  username: 'zdever-technik',
  name: 'ZdeVer Technik (Super Admin)',
  role_name: 'super_admin',
  allowed_tabs: ['dashboard','orders','customers','inventory','invoicing','accounting','employees','settings','devtools'],
  can_delete: true,
  is_admin: true,
  is_super: true,
};

export { SUPER_ADMIN_USERNAME, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_USER };

export const JWT_SECRET = process.env.JWT_SECRET || 'zdever-os-jwt-secret-change-in-production';
export const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h';

// Rozšíření Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Middleware — ověří JWT a připojí user k req
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Přihlášení vyžadováno', code: 'UNAUTHORIZED' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };

    // Hardkodnutý super admin
    if (payload.username === SUPER_ADMIN_USERNAME && payload.userId === -1) {
      req.user = SUPER_ADMIN_USER;
      return next();
    }

    // DB user
    const db = getDb();
    const row = db.prepare(`
      SELECT u.id, u.username, u.name, u.active,
             r.name as role_name, r.allowed_tabs, r.can_delete, r.is_admin
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ? AND u.tenant_id = 1
    `).get(payload.userId) as any;

    if (!row || !row.active) {
      return res.status(401).json({ error: 'Uživatel neexistuje nebo je deaktivován', code: 'USER_INACTIVE' });
    }

    req.user = {
      id: row.id,
      username: row.username,
      name: row.name,
      role_name: row.role_name || 'unknown',
      allowed_tabs: JSON.parse(row.allowed_tabs || '[]'),
      can_delete: !!row.can_delete,
      is_admin: !!row.is_admin,
      is_super: false,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Neplatný nebo vypršelý token', code: 'TOKEN_INVALID' });
  }
}

// Middleware — vyžaduje admin práva
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.is_admin && !req.user?.is_super) {
    return res.status(403).json({ error: 'Přístup zamítnut — vyžadována admin práva', code: 'FORBIDDEN' });
  }
  next();
}

// Middleware — vyžaduje super admin (jen zdever-technik)
export function requireSuper(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.is_super) {
    return res.status(403).json({ error: 'Přístup zamítnut — pouze pro super administrátora', code: 'FORBIDDEN' });
  }
  next();
}

// Middleware — vyžaduje konkrétní tab v allowed_tabs
export function requireTab(tab: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.is_super || req.user?.allowed_tabs.includes(tab)) return next();
    return res.status(403).json({ error: `Přístup k modulu "${tab}" zamítnut`, code: 'FORBIDDEN' });
  };
}