// frontend/src/api/index.ts
const BASE = '/api';

function getToken(): string | null {
  // sessionStorage místo localStorage — konzistentní s AuthContext
  return sessionStorage.getItem('zdever-auth-token');
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (res.status === 401) {
    sessionStorage.removeItem('zdever-auth-token');
    sessionStorage.removeItem('zdever-auth-user');
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error(data.error || 'Přihlášení vypršelo');
  }

  if (!res.ok) throw new Error(data.error || 'Chyba serveru');

  return data as T;  // ← tenhle řádek chyběl
}

const get   = <T>(p: string)             => req<T>('GET', p);
const post  = <T>(p: string, b: unknown) => req<T>('POST', p, b);
const put   = <T>(p: string, b: unknown) => req<T>('PUT', p, b);
const patch = <T>(p: string, b: unknown) => req<T>('PATCH', p, b);
const del   = <T>(p: string)             => req<T>('DELETE', p);

// ─── Auth ────────────────────────────────────────────────────────
export const authApi = {
  login:          (b: any) => post<any>('/auth/login', b),
  me:             ()       => get<any>('/auth/me'),
  changePassword: (b: any) => post<any>('/auth/change-password', b),
};

// ─── Orders ──────────────────────────────────────────────────────
export const ordersApi = {
  list:       (q: Record<string,string> = {}) => get<any>('/orders?' + new URLSearchParams(q)),
  stats:      ()                              => get<any>('/orders/stats'),
  get:        (id: number)                    => get<any>(`/orders/${id}`),
  byBarcode:  (orderNumber: string)           => get<any>(`/orders/barcode/${encodeURIComponent(orderNumber)}`),
  create:     (b: any)                        => post<any>('/orders', b),
  update:     (id: number, b: any)            => put<any>(`/orders/${id}`, b),
  status:     (id: number, s: string)         => patch<any>(`/orders/${id}/status`, { status: s }),
  verifyPin:  (id: number, pin: string)       => post<any>(`/orders/${id}/verify-pin`, { pin }),
  saveTimer:  (id: number, minutes: number)   => patch<any>(`/orders/${id}/timer`, { minutes }),
  delete:     (id: number)                    => del<any>(`/orders/${id}`),
  createVisit: (id: number, b: any)           => post<any>(`/orders/${id}/create-visit`, b),
  warrantyList:  (days?: number)                 => get<any>(`/orders/warranty-expiring${days ? `?days=${days}` : ''}`),
  claims:        ()                              => get<any>('/orders/claims'),
  updateClaim:   (id: number, b: any)            => patch<any>(`/orders/${id}/claim`, b),
  addItem:    (id: number, b: any)            => post<any>(`/orders/${id}/items`, b),
  delItem:    (id: number, itemId: number)    => del<any>(`/orders/${id}/items/${itemId}`),
};

// ─── Customers ───────────────────────────────────────────────────
export const customersApi = {
  list:   (q: Record<string,string> = {}) => get<any>('/customers?' + new URLSearchParams(q)),
  get:    (id: number)                    => get<any>(`/customers/${id}`),
  lookup: (phone: string)                 => get<any>(`/customers/lookup/phone?q=${encodeURIComponent(phone)}`),
  create: (b: any)                        => post<any>('/customers', b),
  update: (id: number, b: any)            => put<any>(`/customers/${id}`, b),
  delete: (id: number)                    => del<any>(`/customers/${id}`),
};

// ─── Inventory ───────────────────────────────────────────────────
export const inventoryApi = {
  list:       (q: Record<string,string> = {}) => get<any>('/inventory?' + new URLSearchParams(q)),
  categories: ()                              => get<any>('/inventory/categories'),
  lowStock:   ()                              => get<any>('/inventory/low-stock'),
  get:        (id: number)                    => get<any>(`/inventory/${id}`),
  create:     (b: any)                        => post<any>('/inventory', b),
  update:     (id: number, b: any)            => put<any>(`/inventory/${id}`, b),
  adjustQty:  (id: number, b: any)            => patch<any>(`/inventory/${id}/quantity`, b),
  delete:     (id: number)                    => del<any>(`/inventory/${id}`),
  calcMargin: (b: any)                        => post<any>('/inventory/calculator/margin', b),
  getQr:      (id: number)                    => get<any>(`/inventory/${id}/qr`),
  getLabel:   (id: number)                    => get<any>(`/inventory/${id}/label`),
  compatibleParts: (model: string)             => get<any>(`/inventory/compatible/${encodeURIComponent(model)}`),
};

// ─── Analytics ───────────────────────────────────────────────────
export const analyticsApi = {
  overview: (q?: Record<string,string>) => get<any>('/analytics/overview?' + new URLSearchParams(q||{})),
  report:   (q?: Record<string,string>) => get<any>('/analytics/report?' + new URLSearchParams(q||{})),
  technicians:       (q?: Record<string,string>) => get<any>('/analytics/technicians?' + new URLSearchParams(q||{})),
  sources:           (q?: Record<string,string>) => get<any>('/analytics/sources?' + new URLSearchParams(q||{})),
  inventoryTurnover: ()                          => get<any>('/analytics/inventory-turnover'),
  fieldVisits:       (q?: Record<string,string>) => get<any>('/analytics/field-visits?' + new URLSearchParams(q||{})),
  customerStats:     ()                          => get<any>('/analytics/customer-stats'),
  profitability:     (q?: Record<string,string>) => get<any>('/analytics/profitability?' + new URLSearchParams(q||{})),
  partsDemand:       ()                          => get<any>('/analytics/parts-demand'),
};

// ─── Invoicing ───────────────────────────────────────────────────
export const invoicingApi = {
  list:         (q: Record<string,string> = {}) => get<any>('/invoicing?' + new URLSearchParams(q)),
  fromVisit:    (visitId: number)               => post<any>(`/invoicing/from-visit/${visitId}`, {}),
  byCustomer:   (customerId: number)            => get<any>(`/invoicing/customer/${customerId}`),
  estimate:     (b: any)                        => post<any>('/invoicing/estimate', b),
  generate:     (b: any)                        => post<any>('/invoicing/generate', b),
  pdf:          (id: number)                    => get<any>(`/invoicing/${id}/pdf`),
  warranty:     (orderId: number, b: any = {})  => post<any>(`/invoicing/warranty/${orderId}`, b),
  checklist:    (orderId: number, b: any)       => post<any>(`/invoicing/checklist/${orderId}`, b),
  qrPayment:    (b: any)                        => post<any>('/invoicing/qr-payment', b),
  msgTemplates: ()                              => get<any>('/invoicing/message-templates'),
  renderMsg:    (id: number, b: any)            => post<any>(`/invoicing/message-templates/${id}/render`, b),
};

// ─── Accounting ──────────────────────────────────────────────────
export const accountingApi = {
  overview:       ()               => get<any>('/accounting/overview'),
  customerCredit:    (id: number)     => get<any>(`/accounting/customer-credit/${id}`),
  addCredit:         (id: number, b: any) => post<any>(`/accounting/customer-credit/${id}`, b),
  salaryExpense:     (b: any)         => post<any>('/accounting/salary-expense', b),
  transactions:   (q?: Record<string,string>) => get<any>('/accounting/transactions?' + new URLSearchParams(q||{})),
  addTx:          (b: any)         => post<any>('/accounting/transactions', b),
  delTx:          (id: number)     => del<any>(`/accounting/transactions/${id}`),
  taxCalc:        (b: any)         => post<any>('/accounting/tax-calculator', b),
  annual:         (year: number)   => get<any>(`/accounting/annual-summary/${year}`),
  closings:       ()               => get<any>('/accounting/closings'),
  closingDetail:  (id: number)     => get<any>(`/accounting/closings/${id}`),
  manualClosing:  (b?: any)        => post<any>('/accounting/closings/manual', b || {}),
  monthlyClosing: ()               => post<any>('/accounting/closings/monthly', {}),
};

// ─── Settings ────────────────────────────────────────────────────
export const settingsApi = {
  get:                ()             => get<any>('/settings'),
  save:               (b: any)       => put<any>('/settings', b),
  getChecklists:      ()             => get<any>('/settings/checklist/templates'),
  saveChecklist:      (id: number, b: any) => put<any>(`/settings/checklist/templates/${id}`, b),
  getMsgTemplates:    ()             => get<any>('/settings/message/templates'),
  saveMsgTemplate:    (id: number, b: any) => put<any>(`/settings/message/templates/${id}`, b),
  createMsgTemplate:  (b: any)       => post<any>('/settings/message/templates', b),
  deleteMsgTemplate:  (id: number)   => del<any>(`/settings/message/templates/${id}`),
};

// ─── Employees ───────────────────────────────────────────────────
export const employeesApi = {
  // Roles
  listRoles:    ()             => get<any>('/employees/roles'),
  createRole:   (b: any)       => post<any>('/employees/roles', b),
  updateRole:   (id: number, b: any) => put<any>(`/employees/roles/${id}`, b),
  deleteRole:   (id: number)   => del<any>(`/employees/roles/${id}`),
  // Users
  listUsers:    ()             => get<any>('/employees/users'),
  getUser:      (id: number)   => get<any>(`/employees/users/${id}`),
  createUser:   (b: any)       => post<any>('/employees/users', b),
  updateUser:   (id: number, b: any) => put<any>(`/employees/users/${id}`, b),
  deleteUser:   (id: number)   => del<any>(`/employees/users/${id}`),
};

// ─── DevTools ────────────────────────────────────────────────────
export const devtoolsApi = {
  logs:       (limit?: number)   => get<any>(`/devtools/logs${limit ? `?limit=${limit}` : ''}`),
  clearLogs:  ()                 => del<any>('/devtools/logs'),
  dbStats:    ()                 => get<any>('/devtools/db-stats'),
  system:     ()                 => get<any>('/devtools/system'),
  echo:       (b: any)           => post<any>('/devtools/echo', b),
  seedDemo:   ()                 => post<any>('/devtools/seed-demo', {}),
};

// ─── Field Visits ─────────────────────────────────────────────────────────────
export const fieldVisitsApi = {
  list:    (status?: string)  => get<any>(`/fieldvisits${status ? `?status=${status}` : ''}`),
  create:  (b: any)           => post<any>('/fieldvisits', b),
  update:  (id: number, b: any) => patch<any>(`/fieldvisits/${id}`, b),
  delete:  (id: number)       => del<any>(`/fieldvisits/${id}`),
  calcFee: (b: any)           => post<any>('/fieldvisits/calc-fee', b),
  exportCsv: ()               => '/api/fieldvisits/export.csv',
};
// ─── Marketing ────────────────────────────────────────────────────────────────
export const marketingApi = {
  sources:       ()             => get<any>('/marketing/sources'),
  adTemplates:   ()             => get<any>('/marketing/ad-templates'),
  createAd:      (b: any)       => post<any>('/marketing/ad-templates', b),
  updateAd:      (id: number, b: any) => put<any>(`/marketing/ad-templates/${id}`, b),
  deleteAd:      (id: number)   => del<any>(`/marketing/ad-templates/${id}`),
  reviewRequest: (orderId: number) => post<any>(`/marketing/review-request/${orderId}`, {}),
};