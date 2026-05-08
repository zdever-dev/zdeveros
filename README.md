# ZdeVer OS — Repair Shop Management System

## Složková architektura

```
zdever-os/
├── package.json              ← root runner (concurrently)
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example          ← zkopírovat do .env
│   └── src/
│       ├── server.ts         ← Express entry point
│       ├── types/
│       │   └── index.ts      ← všechny TS typy
│       ├── db/
│       │   ├── schema.sql    ← SQLite schema
│       │   ├── database.ts   ← DB init, seed, helpers
│       │   └── migrate.ts    ← spouštěcí skript
│       ├── modules/
│       │   ├── orders/       ← A-1 Evidence zakázek
│       │   │   └── routes.ts
│       │   ├── customers/    ← A-2 CRM
│       │   │   └── routes.ts
│       │   ├── inventory/    ← A-4 Sklad + B-3 kalkulačka marže
│       │   │   └── routes.ts
│       │   ├── invoicing/    ← A-5 + B-1 + B-4 + B-5 + B-6 + B-8 + B-10
│       │   │   └── routes.ts
│       │   ├── accounting/   ← A-8 + B-2 daňová kalkulačka
│       │   │   └── routes.ts
│       │   └── settings/     ← celé nastavení
│       │       └── routes.ts
│       └── utils/
│           ├── pdf.ts        ← HTML→PDF (Puppeteer)
│           └── qr.ts         ← SPAYD QR platba
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx          ← React entry + Router
│       ├── api/
│       │   └── index.ts      ← API klient
│       ├── context/
│       │   └── AppContext.tsx ← theme + settings
│       ├── components/
│       │   └── Layout.tsx    ← Sidebar + Topbar
│       ├── pages/
│       │   ├── Dashboard.tsx  ← C-1 přehled dne
│       │   ├── Orders.tsx     ← A-1 zakázky
│       │   ├── Customers.tsx  ← A-2 CRM
│       │   ├── Inventory.tsx  ← A-4 sklad
│       │   ├── Invoicing.tsx  ← fakturace
│       │   ├── Accounting.tsx ← účetnictví
│       │   └── Settings.tsx   ← nastavení
│       └── styles/
│           └── globals.css   ← celý design systém
│
└── README.md
```

## Rychlý start

```bash
# 1. Naklonovat / rozbalit projekt
cd zdever-os

# 2. Nainstalovat závislosti (root + backend + frontend)
npm run setup

# 3. Nastavit prostředí
cd backend
cp .env.example .env
# Vyplňte .env (PORT, DB_PATH atd.)

# 4. Spustit oba servery najednou
cd ..
npm run dev
# Backend: http://localhost:3001
# Frontend: http://localhost:5173
```

## API endpointy

| Metoda | Cesta | Popis |
|--------|-------|-------|
| GET | /api/orders | Seznam zakázek |
| POST | /api/orders | Nová zakázka |
| PATCH | /api/orders/:id/status | Změna statusu |
| GET | /api/orders/stats | Dashboard statistiky |
| GET | /api/customers | Seznam zákazníků |
| POST | /api/customers | Nový zákazník |
| GET | /api/inventory | Sklad |
| POST | /api/inventory/calculator/margin | Kalkulačka marže |
| POST | /api/invoicing/generate | Vystavit doklad |
| POST | /api/invoicing/warranty/:id | Záruční list |
| POST | /api/invoicing/checklist/:id | Checklist |
| POST | /api/invoicing/qr-payment | QR platba |
| POST | /api/accounting/tax-calculator | Daňová kalkulačka |
| GET | /api/settings | Nastavení |
| PUT | /api/settings | Uložit nastavení |
