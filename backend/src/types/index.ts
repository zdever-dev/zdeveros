// ZdeVer OS — Shared TypeScript Types

export type OrderStatus =
  | 'Přijato'
  | 'Diagnostika'
  | 'V opravě'
  | 'Čeká na díl'
  | 'Hotovo'
  | 'Vydáno'
  | 'Stornováno';

export type PaymentMethod = 'Hotovost' | 'Převodem' | 'Nezaplaceno';
export type TransactionType = 'income' | 'expense';
export type InvoiceType = 'receipt' | 'invoice' | 'warranty' | 'checklist';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled';

// ─── Tenant ────────────────────────────────────────────────────────────────
export interface Tenant {
  id: number;
  name: string;
  slug: string;
  plan: string;
  active: number;
  created_at: string;
}

// ─── Customer (A-2) ────────────────────────────────────────────────────────
export interface Customer {
  id: number;
  tenant_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  ico: string | null;
  dic: string | null;
  total_orders: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerDTO {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  ico?: string;
  dic?: string;
}

// ─── Order (A-1) ───────────────────────────────────────────────────────────
export interface Order {
  id: number;
  tenant_id: number;
  order_number: string;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_ico: string | null;
  customer_dic: string | null;
  device_type: string;
  device_model: string | null;
  device_serial: string | null;
  problem_description: string;
  diagnosis: string | null;
  status: OrderStatus;
  technician: string | null;
  estimated_price: number;
  work_price: number;
  parts_price: number;
  total_price: number;
  paid: number;
  payment_method: PaymentMethod | null;
  warranty_days: number;
  warranty_expires: string | null;
  internal_notes: string | null;
  received_at: string;
  completed_at: string | null;
  issued_at: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  type: 'work' | 'part';
  description: string;
  part_id: number | null;
  quantity: number;
  unit_price: number;
  margin_percent: number;
  total_price: number;
}

export interface CreateOrderDTO {
  customer_id?: number;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_ico?: string;
  customer_dic?: string;
  device_type: string;
  device_model?: string;
  device_serial?: string;
  problem_description: string;
  technician?: string;
  estimated_price?: number;
  internal_notes?: string;
  source?: string; //
}

// ─── Part / Inventory (A-4) ────────────────────────────────────────────────
export interface Part {
  id: number;
  tenant_id: number;
  name: string;
  sku: string | null;
  category: string | null;
  compatible_models: string | null;
  purchase_price: number;
  sale_price: number;
  margin_percent: number;
  quantity: number;
  min_quantity: number;
  supplier: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePartDTO {
  name: string;
  sku?: string;
  category?: string;
  compatible_models?: string;
  purchase_price: number;
  sale_price?: number;
  margin_percent?: number;
  quantity?: number;
  min_quantity?: number;
  supplier?: string;
  location?: string;
  notes?: string;
}

// ─── Invoice (A-5) ─────────────────────────────────────────────────────────
export interface Invoice {
  id: number;
  tenant_id: number;
  invoice_number: string;
  order_id: number | null;
  customer_id: number | null;
  type: InvoiceType;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  taxable_date: string;
  subtotal_work: number;
  subtotal_parts: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod | null;
  notes: string | null;
  pdf_path: string | null;
  created_at: string;
}

// ─── Transaction / Accounting (A-8) ────────────────────────────────────────
export interface Transaction {
  id: number;
  tenant_id: number;
  type: TransactionType;
  category: string;
  amount: number;
  description: string | null;
  invoice_id: number | null;
  order_id: number | null;
  transaction_date: string;
  created_at: string;
}

export interface CreateTransactionDTO {
  type: TransactionType;
  category?: string;
  amount: number;
  description?: string;
  invoice_id?: number;
  order_id?: number;
  transaction_date?: string;
}

// ─── Tax calculation (B-2) ─────────────────────────────────────────────────
export interface TaxCalcResult {
  gross_income: number;
  flat_expense_rate: number;
  expenses: number;
  tax_base: number;
  tax_rate: number;
  tax_gross: number;
  taxpayer_relief: number;
  tax_net: number;
  social_insurance: number;
  health_insurance: number;
  total_deductions: number;
  net_income: number;
  effective_rate: number;
}

// ─── Settings ──────────────────────────────────────────────────────────────
export interface Settings {
  theme: 'light' | 'dark';
  company_name: string;
  company_address: string;
  company_city: string;
  company_phone: string;
  company_email: string;
  company_web: string;
  company_ico: string;
  bank_account: string;
  bank_code: string;
  warranty_days: string;
  invoice_prefix: string;
  default_margin: string;
  qr_payment_enabled: string;
  technician_name: string;
  currency: string;
  vat_payer: string;
  company_dic: string;
  company_registry: string;
}

// ─── Checklist (B-8) ───────────────────────────────────────────────────────
export interface ChecklistTemplate {
  id: number;
  tenant_id: number;
  name: string;
  items: string; // JSON array
  created_at: string;
}

// ─── Message Templates (B-10) ──────────────────────────────────────────────
export interface MessageTemplate {
  id: number;
  tenant_id: number;
  situation: string;
  subject: string | null;
  content: string;
  created_at: string;
}

// ─── Dashboard Stats (C-1) ─────────────────────────────────────────────────
export interface DashboardStats {
  orders: {
    total: number;
    open: number;
    done_today: number;
    waiting_pickup: number;
    by_status: Record<string, number>;
  };
  revenue: {
    today: number;
    this_week: number;
    this_month: number;
    this_year: number;
  };
  parts: {
    low_stock: number;
    total_items: number;
  };
  customers: {
    total: number;
    new_this_month: number;
  };
  recent_orders: Order[];
}

// ─── API Response wrapper ───────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  total?: number;
  page?: number;
  per_page?: number;
}

export interface ApiError {
  error: string;
  details?: string;
}
