-- ZdeVer OS — Database Schema v1.0
-- SaaS-ready: tenant_id on all user data tables
-- SQLite with WAL mode for performance
-- To migrate to Postgres: swap TEXT dates to TIMESTAMPTZ, INTEGER -> SERIAL

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- ═══════════════════════════════════════════════════════════
-- TENANTS (Multi-tenancy foundation for SaaS)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tenants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  slug        TEXT    UNIQUE NOT NULL,
  plan        TEXT    DEFAULT 'free',
  active      INTEGER DEFAULT 1,
  created_at  TEXT    DEFAULT (datetime('now'))
);

-- Default tenant for single-user deployment
INSERT OR IGNORE INTO tenants (id, name, slug, plan) VALUES (1, 'ZdeVer Repair', 'zdever', 'pro');

-- ═══════════════════════════════════════════════════════════
-- SETTINGS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS settings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   INTEGER DEFAULT 1,
  key         TEXT    NOT NULL,
  value       TEXT,
  UNIQUE(tenant_id, key),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════
-- CUSTOMERS (A-2 CRM)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS customers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    INTEGER DEFAULT 1,
  name         TEXT    NOT NULL,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  city         TEXT,
  notes        TEXT,
  ico  TEXT,
  dic  TEXT,
  total_orders INTEGER DEFAULT 0,
  total_spent  REAL    DEFAULT 0,
  created_at   TEXT    DEFAULT (datetime('now')),
  updated_at   TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant    ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_name      ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone     ON customers(phone);

-- ═══════════════════════════════════════════════════════════
-- ORDERS (A-1 Evidence zakázek)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS orders (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id            INTEGER DEFAULT 1,
  order_number         TEXT    NOT NULL,
  customer_id          INTEGER,
  customer_name        TEXT    NOT NULL,
  customer_phone       TEXT,
  customer_email       TEXT,
  customer_ico TEXT,
  customer_dic TEXT,
  device_type          TEXT    NOT NULL,
  device_model         TEXT,
  device_serial        TEXT,
  problem_description  TEXT    NOT NULL,
  diagnosis            TEXT,
  status               TEXT    DEFAULT 'Přijato',
  technician           TEXT,
  estimated_price      REAL    DEFAULT 0,
  work_price           REAL    DEFAULT 0,
  parts_price          REAL    DEFAULT 0,
  total_price          REAL    DEFAULT 0,
  paid                 INTEGER DEFAULT 0,
  payment_method       TEXT,
  warranty_days        INTEGER DEFAULT 30,
  warranty_expires     TEXT,
  internal_notes       TEXT,
  received_at          TEXT    DEFAULT (datetime('now')),
  completed_at         TEXT,
  issued_at            TEXT,
  created_at           TEXT    DEFAULT (datetime('now')),
  updated_at           TEXT    DEFAULT (datetime('now')),
  UNIQUE(tenant_id, order_number),
  FOREIGN KEY (tenant_id)   REFERENCES tenants(id)   ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant    ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer  ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_received  ON orders(received_at);
CREATE INDEX IF NOT EXISTS idx_orders_number    ON orders(order_number);

-- ═══════════════════════════════════════════════════════════
-- ORDER LINE ITEMS (parts + work items in an order)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS order_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL,
  type            TEXT    DEFAULT 'part',   -- 'work' | 'part'
  description     TEXT    NOT NULL,
  part_id         INTEGER,
  quantity        INTEGER DEFAULT 1,
  unit_price      REAL    NOT NULL,
  margin_percent  REAL    DEFAULT 0,
  total_price     REAL    NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (part_id)  REFERENCES parts(id)  ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ═══════════════════════════════════════════════════════════
-- PARTS / INVENTORY (A-4 Sklad)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS parts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id         INTEGER DEFAULT 1,
  name              TEXT    NOT NULL,
  sku               TEXT,
  category          TEXT,
  compatible_models TEXT,
  purchase_price    REAL    NOT NULL DEFAULT 0,
  sale_price        REAL    NOT NULL DEFAULT 0,
  margin_percent    REAL    DEFAULT 0,
  quantity          INTEGER DEFAULT 0,
  min_quantity      INTEGER DEFAULT 2,
  supplier          TEXT,
  location          TEXT,
  notes             TEXT,
  created_at        TEXT    DEFAULT (datetime('now')),
  updated_at        TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parts_tenant   ON parts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_parts_category ON parts(category);
CREATE INDEX IF NOT EXISTS idx_parts_sku      ON parts(sku);

-- ═══════════════════════════════════════════════════════════
-- INVOICES (A-5 Fakturace)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id       INTEGER DEFAULT 1,
  invoice_number  TEXT    NOT NULL,
  order_id        INTEGER,
  customer_id     INTEGER,
  type            TEXT    DEFAULT 'receipt',  -- receipt | invoice | warranty | checklist
  status          TEXT    DEFAULT 'issued',   -- draft | issued | paid | cancelled
  issue_date      TEXT    DEFAULT (datetime('now')),
  due_date        TEXT,
  taxable_date    TEXT    DEFAULT (date('now')),
  subtotal_work   REAL    DEFAULT 0,
  subtotal_parts  REAL    DEFAULT 0,
  discount        REAL    DEFAULT 0,
  total           REAL    DEFAULT 0,
  payment_method  TEXT,
  notes           TEXT,
  pdf_path        TEXT,
  created_at      TEXT    DEFAULT (datetime('now')),
  UNIQUE(tenant_id, invoice_number),
  FOREIGN KEY (tenant_id)   REFERENCES tenants(id)   ON DELETE CASCADE,
  FOREIGN KEY (order_id)    REFERENCES orders(id)    ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order  ON invoices(order_id);

-- ═══════════════════════════════════════════════════════════
-- TRANSACTIONS / ACCOUNTING (A-8)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id        INTEGER DEFAULT 1,
  type             TEXT    NOT NULL,   -- income | expense
  category         TEXT    DEFAULT 'other',
  amount           REAL    NOT NULL,
  description      TEXT,
  invoice_id       INTEGER,
  order_id         INTEGER,
  transaction_date TEXT    DEFAULT (date('now')),
  created_at       TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id)  REFERENCES tenants(id)  ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date   ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type   ON transactions(type);

-- ═══════════════════════════════════════════════════════════
-- CHECKLIST TEMPLATES (B-8)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS checklist_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  INTEGER DEFAULT 1,
  name       TEXT    NOT NULL,
  items      TEXT    NOT NULL,  -- JSON array of strings
  created_at TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════
-- MESSAGE TEMPLATES (B-10)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS message_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  INTEGER DEFAULT 1,
  situation  TEXT    NOT NULL,
  subject    TEXT,
  content    TEXT    NOT NULL,
  created_at TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════
-- FIELD VISITS (A-09 Správa výjezdů)
-- Přidáno jako součást schema pro nové instalace
-- ═══════════════════════════════════════════════════════════
-- (Viz migrations v database.ts — tabulka se vytvoří přes ALTER/CREATE)