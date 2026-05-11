import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'zdever.db');

// Ensure data directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!instance) {
    instance = new Database(DB_PATH, {
      verbose: process.env.NODE_ENV === 'development' ? undefined : undefined,
    });
    instance.pragma('journal_mode = WAL');
    instance.pragma('foreign_keys = ON');
    instance.pragma('synchronous = NORMAL');
    instance.pragma('cache_size = -64000'); // 64MB cache
  }
  return instance;
}

export function initializeDatabase(): void {
  const db = getDb();

  // Run schema
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Migrations — add columns that may not exist in older DBs
  const migrations: string[] = [
  `ALTER TABLE orders ADD COLUMN work_duration_minutes INTEGER DEFAULT 0`,
  `ALTER TABLE message_templates ADD COLUMN is_custom INTEGER DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS closings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id    INTEGER DEFAULT 1,
    type         TEXT    NOT NULL DEFAULT 'manual',
    period_year  INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    income_total REAL    DEFAULT 0,
    expense_total REAL   DEFAULT 0,
    profit_total REAL    DEFAULT 0,
    tx_count     INTEGER DEFAULT 0,
    closed_by    TEXT    DEFAULT 'user',
    created_at   TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`,

  `ALTER TABLE customers ADD COLUMN ico TEXT`,
  `ALTER TABLE customers ADD COLUMN dic TEXT`,
  `ALTER TABLE orders ADD COLUMN customer_ico TEXT`,
  `ALTER TABLE orders ADD COLUMN customer_dic TEXT`,
  `ALTER TABLE orders ADD COLUMN customer_pin TEXT`,
  `ALTER TABLE orders ADD COLUMN barcode_url TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_closings_tenant ON closings(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_closings_period ON closings(period_year, period_month)`,
  `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'tax_flat_expense_rate', '60')`,
  `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'tax_employment_type', 'side')`,
  `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'tax_social_threshold', '111736')`,
  `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'tax_health_min_base', '13500')`,
  `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'tax_income_rate', '15')`,
  `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'tax_taxpayer_relief', '30840')`,
  `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'tax_social_rate', '29.2')`,
  `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'tax_health_rate', '13.5')`,
  `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'default_part_margin', '20')`,
  `CREATE TABLE IF NOT EXISTS roles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id    INTEGER DEFAULT 1,
    name         TEXT    NOT NULL,
    allowed_tabs TEXT    NOT NULL DEFAULT '["dashboard","orders","customers","inventory","invoicing"]',
    can_delete   INTEGER DEFAULT 0,
    is_admin     INTEGER DEFAULT 0,
    is_system    INTEGER DEFAULT 0,
    created_at   TEXT    DEFAULT (datetime('now')),
    UNIQUE(tenant_id, name),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id)`,
  `CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     INTEGER DEFAULT 1,
    name          TEXT    NOT NULL,
    username      TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    email         TEXT,
    phone         TEXT,
    role_id       INTEGER,
    active        INTEGER DEFAULT 1,
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now')),
    UNIQUE(tenant_id, username),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id)   REFERENCES roles(id)   ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_users_tenant   ON users(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,

  // A-07: Reklamační pole v orders
  `ALTER TABLE orders ADD COLUMN claim_reason TEXT`,
  `ALTER TABLE orders ADD COLUMN claim_resolved_at TEXT`,
  `ALTER TABLE orders ADD COLUMN is_claim INTEGER DEFAULT 0`,

  // C-08: Zdroj zákazníka
  `ALTER TABLE orders ADD COLUMN source TEXT`,

  // A-09: Výjezdy
  `CREATE TABLE IF NOT EXISTS field_visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id       INTEGER DEFAULT 1,
    order_id        INTEGER,
    customer_name   TEXT    NOT NULL,
    address         TEXT    NOT NULL,
    visit_date      TEXT    NOT NULL,
    visit_time      TEXT,
    description     TEXT,
    status          TEXT    DEFAULT 'Naplánován',
    distance_km     REAL    DEFAULT 0,
    duration_min    INTEGER DEFAULT 0,
    fee_czk         REAL    DEFAULT 0,
    notes           TEXT,
    created_at      TEXT    DEFAULT (datetime('now')),
    updated_at      TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id)  REFERENCES orders(id)  ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_field_visits_tenant ON field_visits(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_field_visits_date   ON field_visits(visit_date)`,

  // C-08: Marketing šablony inzerátů
  `CREATE TABLE IF NOT EXISTS ad_templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id  INTEGER DEFAULT 1,
    name       TEXT    NOT NULL,
    platform   TEXT    DEFAULT 'facebook',
    content    TEXT    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  )`,
  `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'review_google_url', '')`,
  `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, 'review_facebook_url', '')`,
];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column/table already exists */ }
  }

  // Seed default settings
  const upsertSetting = db.prepare(
    `INSERT OR IGNORE INTO settings (tenant_id, key, value) VALUES (1, ?, ?)`
  );

  const defaults: [string, string][] = [
    ['theme', 'light'],
    ['company_name', 'ZdeVer Repair'],
    ['company_address', 'Višňové 292'],
    ['company_city', 'Višňové, JMK'],
    ['company_phone', ''],
    ['company_email', ''],
    ['company_web', 'zdever.cz'],
    ['company_ico', ''],
    ['company_dic', ''],
    ['company_registry', ''],
    ['bank_account', ''],
    ['bank_code', ''],
    ['warranty_days', '30'],
    ['invoice_prefix', new Date().getFullYear().toString()],
    ['default_margin', '20'],
    ['qr_payment_enabled', 'true'],
    ['technician_name', 'Zdeněk Vérosta'],
    ['currency', 'Kč'],
    ['vat_payer', 'false'],
    // ── Propojení: Marketing pipeline ──────────────────────────
    ['auto_review_request', 'false'],
    ['review_request_delay_hours', '24'],
    // ── Propojení: Záruční řetězec ──────────────────────────────
    ['warranty_auto_notify', 'false'],
    ['warranty_notify_days_before', '7'],
    ['warranty_followup_enabled', 'false'],
    ['warranty_followup_days', '7'],
    // ── Propojení: Zákaznická cesta ─────────────────────────────
    ['customer_inactive_threshold_days', '180'],
    // ── Propojení: Technik ──────────────────────────────────────
    ['default_technician_id', ''],
    ['employee_performance_period', 'month'],
    // ── Propojení: Skladová inteligence ────────────────────────
    ['low_stock_dashboard_alerts', 'true'],
    // ── Propojení: Výjezdový cyklus (přesunutí z hardcoded) ────
    ['visit_fee_zone1_km', '5'],
    ['visit_fee_zone1_czk', '0'],
    ['visit_fee_zone2_km', '15'],
    ['visit_fee_zone2_czk', '150'],
    ['visit_fee_zone3_km', '30'],
    ['visit_fee_zone3_czk', '300'],
    ['visit_fee_over_czk_per_km', '15'],
  ];

  const seedMany = db.transaction(() => {
    for (const [k, v] of defaults) upsertSetting.run(k, v);
  });
  seedMany();

  // Seed default checklist if empty
  const clCount = (db.prepare('SELECT COUNT(*) as c FROM checklist_templates').get() as { c: number }).c;
  if (clCount === 0) {
    db.prepare(`INSERT INTO checklist_templates (tenant_id, name, items) VALUES (1, ?, ?)`).run(
      'Výdej zařízení',
      JSON.stringify([
        'Oprava plně otestována a funkční',
        'Data zákazníka zálohovány (pokud bylo potřeba)',
        'Záruční list vygenerován a podepsán',
        'Příjmový doklad / faktura vystavena',
        'Platba přijata a potvrzena',
        'Zařízení zabaleno a označeno',
        'Zákazník informován o provedené opravě',
      ])
    );
  }

  // Seed default message templates if empty
  const mtCount = (db.prepare('SELECT COUNT(*) as c FROM message_templates').get() as { c: number }).c;
  if (mtCount === 0) {
    const insertTpl = db.prepare(
      `INSERT INTO message_templates (tenant_id, situation, subject, content) VALUES (1, ?, ?, ?)`
    );
    const seedTpl = db.transaction(() => {
      insertTpl.run(
        'Oprava hotová',
        'Vaše zařízení je opravené',
        'Dobrý den {jméno},\n\nVaše {zařízení} je opravené a připravené k vyzvednutí.\nCena za opravu: {cena} Kč.\n\nTěšíme se na Vás!\n\nZdeVer Repair\n{telefon}'
      );
      insertTpl.run(
        'Čeká na díl',
        'Čeká na náhradní díl',
        'Dobrý den {jméno},\n\nVaše {zařízení} bohužel čeká na objednání náhradního dílu.\nOdhadovaný termín dokončení: {termín}.\n\nV případě dotazů nás neváhejte kontaktovat.\n\nZdeVer Repair\n{telefon}'
      );
      insertTpl.run(
        'Upozornění na vyzvednutí',
        'Zařízení čeká na vyzvednutí',
        'Dobrý den {jméno},\n\nPřipomínáme, že Vaše opravené {zařízení} (zakázka č. {číslo}) na Vás stále čeká k vyzvednutí.\n\nProsíme o kontakt pro domluvení termínu.\n\nZdeVer Repair\n{telefon}'
      );
      insertTpl.run(
        'Platba nezaplacena',
        'Připomínka nezaplacené faktury',
        'Dobrý den {jméno},\n\nEvidujeme nezaplacenou fakturu č. {číslo_faktury} ve výši {cena} Kč.\nProšel termín splatnosti {splatnost}.\n\nProsíme o vyrovnání na účet: {číslo_účtu}.\n\nZdeVer Repair\n{telefon}'
      );
    });
    seedTpl();
  }
  for (const sql of migrations) {
    try { db.exec(sql); } catch {} // ignoruj chybu "already exists"
  }

  // Seed výchozích rolí
  const rolesCount = (db.prepare('SELECT COUNT(*) as c FROM roles WHERE tenant_id = 1').get() as { c: number }).c;
  if (rolesCount === 0) {
    const insertRole = db.prepare(`
      INSERT OR IGNORE INTO roles (tenant_id, name, allowed_tabs, can_delete, is_admin, is_system)
      VALUES (1, ?, ?, ?, ?, 1)
    `);
    const seedRoles = db.transaction(() => {
      insertRole.run(
        'Majitel',
        JSON.stringify(['dashboard','orders','customers','inventory','invoicing','accounting','analytics','employees','settings']),
        1, 1
      );
      insertRole.run(
        'Technik',
        JSON.stringify(['dashboard','orders','customers','inventory','invoicing']),
        0, 0
      );
      insertRole.run(
        'Prodavač',
        JSON.stringify(['dashboard','orders','customers']),
        0, 0
      );
    });
    seedRoles();
  }

  // Seed testovacího uživatele test1/user1
  const usersCount = (db.prepare('SELECT COUNT(*) as c FROM users WHERE tenant_id = 1').get() as { c: number }).c;
  if (usersCount === 0) {
    // Synchronní bcrypt hash pro seed (jen při inicializaci)
    const bcrypt = require('bcryptjs');
    const ownerRole = db.prepare('SELECT id FROM roles WHERE name = ? AND tenant_id = 1').get('Majitel') as { id: number } | undefined;
    if (ownerRole) {
      const hash = bcrypt.hashSync('user1', 10);
      db.prepare(`
        INSERT OR IGNORE INTO users (tenant_id, name, username, password_hash, email, role_id, active)
        VALUES (1, 'Testovací majitel', 'test1', ?, 'test@zdever.cz', ?, 1)
      `).run(hash, ownerRole.id);
      console.log('  👤  Seed user: test1 / user1 (Majitel)');
    }
  }

  console.log('✅ Database ready:', DB_PATH);
}

// Helper: generate next order number (e.g. "2025-042")
export function nextOrderNumber(tenantId = 1): string {
  const db = getDb();
  const year = new Date().getFullYear();
  const prefix = `${year}-`;

  const row = db
    .prepare(
      `SELECT order_number FROM orders
       WHERE tenant_id = ? AND order_number LIKE ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(tenantId, `${prefix}%`) as { order_number: string } | undefined;

  let nextNum = 1;
  if (row) {
    const parts = row.order_number.split('-');
    const last = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(last)) nextNum = last + 1;
  }

  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

// Helper: generate next invoice number (e.g. "F2025-042")
export function nextInvoiceNumber(tenantId = 1, prefix = 'F'): string {
  const db = getDb();
  const year = new Date().getFullYear();
  const pfx = `${prefix}${year}-`;

  const row = db
    .prepare(
      `SELECT invoice_number FROM invoices
       WHERE tenant_id = ? AND invoice_number LIKE ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(tenantId, `${pfx}%`) as { invoice_number: string } | undefined;

  let nextNum = 1;
  if (row) {
    const parts = row.invoice_number.split('-');
    const last = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(last)) nextNum = last + 1;
  }

  return `${pfx}${String(nextNum).padStart(3, '0')}`;
}