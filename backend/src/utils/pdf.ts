import { join, dirname } from 'path';
import type { Order, Invoice, Settings } from '../types';
import { generatePaymentQr } from './qr';
import { writeFileSync } from 'fs';

const PDF_DIR = process.env.PDF_OUTPUT_DIR || join(process.cwd(), 'data', 'pdfs');


// ZdeVer design CSS shared across all templates
const ZDEVER_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --navy:#1C2A4A; --navy2:#243660; --blue:#4A7CC7; --blue-l:#7aaae8;
    --text:#1a1f2e; --muted:#6b7a99; --rule:#d8dde8; --light:#eef1f8; --white:#fff;
  }
  body {
    font-family:'DM Sans',Arial,sans-serif;
    font-size:10.5px; font-weight:300; line-height:1.45; color:var(--text);
    background:#fff;
  }
  .page { width:210mm; min-height:297mm; background:#fff; padding:0; position:relative; }
  header {
    background:var(--navy); padding:8mm 11mm 7mm;
    display:flex; justify-content:space-between; align-items:flex-end;
    position:relative;
  }
  header::after {
    content:''; position:absolute; bottom:0; left:0; right:0;
    height:3px; background:var(--blue);
  }
  .logo { display:flex; align-items:center; gap:8px; }
  .logo-box {
    width:36px; height:36px; background:#fff; border-radius:5px;
    display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  .logo-z { font-family:'Syne',serif; font-size:22px; font-weight:800; color:var(--navy); line-height:1; }
  .logo-name { font-family:'Syne',serif; font-size:16px; font-weight:700; color:#fff; letter-spacing:-0.3px; }
  .logo-name span { color:var(--blue-l); }
  .logo-sub { font-size:8px; letter-spacing:3px; text-transform:uppercase; color:rgba(255,255,255,.45); margin-top:2px; }
  .hdr-meta { text-align:right; font-size:8.5px; color:rgba(255,255,255,.55); line-height:1.9; }
  .hdr-meta b { color:#fff; font-weight:500; }
  .body { padding:7mm 11mm 0; }
  .doc-title {
    display:flex; justify-content:space-between; align-items:baseline;
    padding:6mm 0 4mm; border-bottom:2px solid var(--navy);
  }
  .doc-title h1 { font-family:'Syne',serif; font-size:22px; font-weight:800; color:var(--navy); }
  .doc-number { font-family:'Syne',serif; font-size:14px; font-weight:700; color:var(--blue); }
  .info-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:4mm; margin:4mm 0; }
  .info-block { }
  .info-label { font-size:7px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:var(--muted); margin-bottom:3px; }
  .info-value { font-size:10px; line-height:1.6; color:var(--text); }
  .info-value b { font-weight:500; }
  .dates-row { display:flex; gap:6mm; margin:2mm 0 4mm; }
  .date-box { background:var(--light); border-radius:4px; padding:4px 8px; }
  .date-lbl { font-size:7px; text-transform:uppercase; letter-spacing:1.5px; color:var(--muted); }
  .date-val { font-family:'Syne',serif; font-size:10px; font-weight:700; color:var(--navy); }
  table.items { width:100%; border-collapse:collapse; margin:3mm 0; }
  table.items thead th {
    font-size:7px; letter-spacing:1.5px; text-transform:uppercase;
    color:var(--muted); padding:0 0 3px; text-align:left;
    border-bottom:1.5px solid var(--navy); font-weight:400;
  }
  table.items thead th:last-child { text-align:right; }
  table.items td {
    padding:4px 0; border-bottom:1px solid var(--rule); vertical-align:top;
  }
  table.items tr:last-child td { border-bottom:none; }
  .item-name { font-weight:500; font-size:10px; color:var(--text); }
  .item-note { font-size:8px; color:var(--muted); font-style:italic; }
  .price { text-align:right; white-space:nowrap; padding-left:5px; }
  .price-val { font-family:'Syne',serif; font-size:10.5px; font-weight:700; color:var(--navy); }
  .totals-block { display:flex; justify-content:flex-end; margin:2mm 0; }
  .totals-table { min-width:160px; }
  .totals-table td { padding:2px 0; font-size:10px; }
  .totals-table td:last-child { text-align:right; padding-left:12px; font-family:'Syne',serif; font-weight:700; color:var(--navy); }
  .total-row td { font-size:14px; border-top:1.5px solid var(--navy); padding-top:4px; }
  .payment-row { display:flex; gap:6mm; margin:3mm 0; }
  .pay-box { background:var(--light); border-left:3px solid var(--blue); padding:5px 9px; border-radius:0 4px 4px 0; flex:1; }
  .pay-lbl { font-size:7px; text-transform:uppercase; letter-spacing:1.5px; color:var(--muted); margin-bottom:2px; }
  .pay-val { font-size:10px; font-weight:500; color:var(--text); }
  .note-box { background:var(--light); border-left:3px solid var(--blue); padding:4px 8px; margin:3mm 0; font-size:8px; color:var(--muted); }
  .note-box b { color:var(--text); }
  .info-strip { display:flex; gap:4mm; margin:3mm 0; flex-wrap:wrap; }
  .ib { background:var(--light); border:1px solid var(--rule); border-radius:4px; padding:4px 7px; }
  .ib-lbl { font-size:7px; letter-spacing:1.5px; text-transform:uppercase; color:var(--muted); margin-bottom:1px; }
  .ib-val { font-family:'Syne',serif; font-size:10px; font-weight:700; color:var(--navy); }
  footer {
    margin:3mm 11mm 0; padding:3mm 0 4mm;
    border-top:1.5px solid var(--navy);
    display:flex; justify-content:space-between; align-items:flex-end;
  }
  .ft-note { max-width:65%; font-size:7.5px; color:var(--muted); line-height:1.5; }
  .ft-contact { text-align:right; font-size:8px; color:var(--muted); line-height:1.8; }
  .ft-contact strong { color:var(--navy); font-size:9px; font-family:'Syne',serif; display:block; }
  .signature-area { display:flex; justify-content:space-between; margin:4mm 0 2mm; }
  .sig-box { text-align:center; }
  .sig-line { border-bottom:1px solid var(--navy); width:100px; margin:0 auto 3px; height:20px; }
  .sig-lbl { font-size:8px; color:var(--muted); }
  .qr-block { display:flex; align-items:center; gap:6mm; margin:2mm 0; }
  .qr-block img { width:80px; height:80px; }
  .qr-info { font-size:9px; color:var(--muted); line-height:1.7; }
  .warranty-icon { font-size:32px; }
  .warranty-box {
    background:linear-gradient(135deg, #e8f4f0, #d1ebe3);
    border:1.5px solid #0a6a55; border-radius:8px; padding:8px 12px; margin:4mm 0;
  }
  .warranty-box .w-title { font-family:'Syne',serif; font-size:14px; font-weight:800; color:#0a6a55; }
  .warranty-box .w-date { font-size:11px; color:#0a6a55; font-weight:500; }
  .checklist-item { display:flex; align-items:flex-start; gap:8px; padding:5px 0; border-bottom:1px solid var(--rule); }
  .checkbox { width:14px; height:14px; border:1.5px solid var(--navy); border-radius:3px; flex-shrink:0; margin-top:1px; }
  .checkbox.checked { background:var(--navy); }
  .checklist-item label { font-size:11px; color:var(--text); }
  @media print {
  body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { margin: 0; box-shadow: none; }
  }
`;

function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(msg)), ms)
    ),
  ]);
}

function saveHtml(html: string, outputPath: string): string {
  writeFileSync(outputPath, html, 'utf-8');
  return outputPath;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('cs-CZ', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return dateStr; }
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '0';
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ─── Invoice / Receipt (A-5 + B-4) ───────────────────────────────────────────
export async function generateInvoicePdf(
  order: Order,
  invoice: Invoice,
  settings: Record<string, string>,
  items: any[]
): Promise<string> {
  const isReceipt = invoice.type === 'receipt';
  if (isReceipt) {
  const filename = `Převzetí_${order.order_number.replace(/[^a-z0-9]/gi, '_')}.html`;
  const outputPath = join(PDF_DIR, filename);
  const receiptHtml = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="UTF-8">
<title>PROTOKOL O PŘEVZETÍ ${order.order_number}</title>
<style>${ZDEVER_CSS}
.receipt-body { padding: 8mm 11mm; }
.receipt-title { text-align:center; padding:5mm 0; border-bottom:2px solid var(--navy); margin-bottom:5mm; }
.receipt-title h1 { font-family:'Syne',serif; font-size:20px; font-weight:800; color:var(--navy); }
.receipt-title p { font-size:10px; color:var(--muted); margin-top:3px; }
.parties-grid { display:grid; grid-template-columns:1fr 1fr; gap:6mm; margin:4mm 0; }
.party-box { border:1px solid var(--rule); border-radius:5px; padding:6px 9px; }
.party-lbl { font-size:7px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:var(--muted); margin-bottom:4px; }
.device-box { background:var(--light); border-left:3px solid var(--blue); padding:6px 10px; margin:3mm 0; border-radius:0 4px 4px 0; }
.terms { font-size:8px; color:var(--muted); line-height:1.7; margin:3mm 0; padding:5px 8px; border:1px dashed var(--rule); border-radius:4px; }
.terms b { color:var(--text); }
</style></head>
<body><div class="page">
<header>
  <div class="logo">
    <div class="logo-box"><div class="logo-z">Z</div></div>
    <div>
      <div class="logo-name">Zde<span>Ver</span> Repair</div>
      <div class="logo-sub">Opravy elektroniky · ${settings.company_city || 'Nový Jičín'}</div>
    </div>
  </div>
  <div class="hdr-meta">
    <b>Protokol o převzetí zařízení</b><br>
    Č. zakázky: ${order.order_number}<br>
    Datum: ${formatDate(new Date().toISOString())}
  </div>
</header>

<div class="receipt-body">
  <div class="receipt-title">
    <h1>PROTOKOL O PŘEVZETÍ ZAŘÍZENÍ K OPRAVĚ</h1>
    <p>Tento dokument potvrzuje předání zařízení k opravě a vzájemnou dohodu o podmínkách</p>
  </div>

  <div class="parties-grid">
    <div class="party-box">
      <div class="party-lbl">Zákazník (předávající)</div>
      <div class="info-value">
        <b>${order.customer_name}</b><br>
        ${order.customer_phone || ''}<br>
        ${order.customer_email || ''}<br>
        ${order.customer_ico ? `IČO: ${order.customer_ico}` : ''}
      </div>
    </div>
    <div class="party-box">
      <div class="party-lbl">Servisní firma (přebírající)</div>
      <div class="info-value">
        <b>${settings.company_name || 'ZdeVer Repair'}</b><br>
        ${settings.company_address || ''}, ${settings.company_city || ''}<br>
        ${settings.company_ico ? `IČO: ${settings.company_ico}` : ''}<br>
        ${settings.vat_payer === 'true' && settings.company_dic ? `DIČ: ${settings.company_dic}` : ''}<br>
        ${settings.company_registry || ''}<br>
        Technik: ${settings.technician_name || order.technician || '—'}
      </div>
    </div>
  </div>

  <div class="device-box">
    <div class="info-label">Přijímané zařízení</div>
    <div class="info-value" style="margin-top:4px;">
      <b>${order.device_type}${order.device_model ? ` — ${order.device_model}` : ''}</b>
      ${order.device_serial ? `&nbsp;·&nbsp; S/N: ${order.device_serial}` : ''}
    </div>
  </div>

  <div class="info-block" style="margin:3mm 0;">
    <div class="info-label">Popis závady (dle zákazníka)</div>
    <div style="margin-top:3px; padding:6px 8px; border:1px solid var(--rule); border-radius:4px; font-size:10px; min-height:30px;">
      ${order.problem_description}
    </div>
  </div>

  <div class="info-block" style="margin:3mm 0;">
    <div class="info-label">Odhadovaná cena opravy</div>
    <div style="font-family:'Syne',serif; font-size:14px; font-weight:800; color:var(--navy); margin-top:3px;">
      ${order.estimated_price ? `od ${fmt(order.estimated_price)} ${settings.currency || 'Kč'}` : 'Bude stanovena po diagnostice'}
    </div>
    <div style="font-size:8px; color:var(--muted);">Konečná cena bude odsouhlasena se zákazníkem před zahájením opravy.</div>
  </div>

  <div class="terms">
    <b>Podmínky převzetí zařízení:</b><br>
    1. Zákazník prohlašuje, že je oprávněn předat zařízení k opravě a souhlasí s podmínkami servisu.<br>
    2. Servisní firma přebírá zařízení v popsaném stavu a za jeho bezpečné uložení po dobu opravy ručí.<br>
    3. Zákazník bude informován o průběhu opravy a konečné ceně před jejím zahájením.<br>
    4. Zařízení bude vyzvednuto po uhrazení ceny opravy. Nevyzvednuté zařízení po 90 dnech může být zlikvidováno.<br>
    5. Servisní firma nenese odpovědnost za ztrátu dat. Zákazníkovi je doporučeno předem zálohovat veškerá data.<br>
    6. <b>Záloha dat:</b> zákazník <span style="text-decoration:underline;">souhlasí / nesouhlasí</span> s provedením zálohy dat (nehodící se škrtněte).
  </div>

  <div class="dates-row" style="margin:4mm 0 2mm;">
    <div class="date-box">
      <div class="date-lbl">Datum přijetí</div>
      <div class="date-val">${formatDate(order.received_at)}</div>
    </div>
    <div class="date-box">
      <div class="date-lbl">Č. zakázky</div>
      <div class="date-val">${order.order_number}</div>
    </div>
  </div>

  <div class="signature-area" style="margin-top:10mm;">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-lbl">Zákazník — podpis a datum</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-lbl">${settings.technician_name || 'Technik'} — podpis a datum</div>
    </div>
  </div>

  <div style="margin-top:6mm; font-size:8px; color:var(--muted); border-top:1px solid var(--rule); padding-top:4mm;">
    Doklad byl vystaven v souladu s § 2 zákona č. 634/1992 Sb. o ochraně spotřebitele.
    Zákazník svým podpisem potvrzuje, že byl seznámen s podmínkami opravy.
  </div>
</div>
</div></body></html>`;

  saveHtml(receiptHtml, outputPath);
  return filename;
}
  const docTitle = isReceipt ? 'PŘÍJMOVÝ DOKLAD' : 'FAKTURA';
  const filename = `${invoice.invoice_number.replace(/[^a-z0-9]/gi, '_')}.html`;
  const outputPath = join(PDF_DIR, filename);

  // Generate QR code if bank account is configured
  let qrHtml = '';
  const isPaidByCash = (invoice.payment_method || '').toLowerCase().includes('hotov');
  if (!isPaidByCash && settings.bank_account && settings.qr_payment_enabled === 'true') {
    try {
      const [accNum, bankCode] = (settings.bank_account || '').split('/');
      const qr = await generatePaymentQr({
        account: settings.bank_account,
        amount: invoice.total,
        variableSymbol: invoice.invoice_number.replace(/\D/g, ''),
        message: `Faktura ${invoice.invoice_number}`,
        recipientName: settings.company_name,
      });
      qrHtml = `
        <div class="qr-block">
          <img src="${qr.qr_data_url}" alt="QR platba" />
          <div class="qr-info">
            <b>Platba QR kódem</b><br>
            Naskenujte telefonem a potvrďte v bance.<br>
            Účet: ${settings.bank_account || '—'}<br>
            VS: ${invoice.invoice_number.replace(/\D/g, '')}
          </div>
        </div>
      `;
    } catch {}
  }

  const html = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="UTF-8">
<title>${docTitle} ${invoice.invoice_number}</title>
<style>${ZDEVER_CSS}</style></head>
<body><div class="page">
<header>
  <div class="logo">
    <div class="logo-box"><div class="logo-z">Z</div></div>
    <div>
      <div class="logo-name">Zde<span>Ver</span> Repair</div>
      <div class="logo-sub">Opravy elektroniky · ${settings.company_city || 'Nový Jičín'}</div>
    </div>
  </div>
  <div class="hdr-meta">
    <b>${docTitle}</b><br>
    Ceny jsou za práci technika<br>
    Náhradní díly účtovány zvlášť<br>
    Konečná cena odsouhlasena předem
  </div>
</header>

<div class="body">
  <div class="doc-title">
    <h1>${docTitle}</h1>
    <div class="doc-number">Č. dokladu: ${invoice.invoice_number}</div>
  </div>

  <div class="info-grid">
    <div class="info-block">
      <div class="info-label">Dodavatel</div>
      <div class="info-value">
        <b>${settings.company_name || 'ZdeVer Repair'}</b><br>
        ${settings.company_address || ''}<br>
        ${settings.company_city || ''}<br>
        ${settings.company_ico ? `IČO: ${settings.company_ico}<br>` : ''}
        ${settings.vat_payer === 'true' && settings.company_dic ? `DIČ: ${settings.company_dic}<br>` : ''}
        ${settings.company_registry ? `${settings.company_registry}<br>` : ''}
        Technik: ${settings.technician_name || '—'}
      </div>
    </div>
    <div class="info-block">
      <div class="info-label">Odběratel</div>
      <div class="info-value">
        <b>${order.customer_name}</b><br>
        ${order.customer_phone || ''}<br>
        ${order.customer_email || ''}
        ${order.customer_ico ? `IČO: ${order.customer_ico}` : ''}
        ${order.customer_dic ? `DIČ: ${order.customer_dic}` : ''}
      </div>
    </div>
    <div class="info-block">
      <div class="info-label">Zakázka</div>
      <div class="info-value">
        Č. zakázky: <b>${order.order_number}</b><br>
        Zařízení: ${order.device_type}${order.device_model ? ` — ${order.device_model}` : ''}<br>
        ${order.device_serial ? `S/N: ${order.device_serial}` : ''}
      </div>
    </div>
  </div>

  <div class="dates-row">
    <div class="date-box">
      <div class="date-lbl">Datum vystavení</div>
      <div class="date-val">${formatDate(invoice.issue_date)}</div>
    </div>
    <div class="date-box">
      <div class="date-lbl">Datum zdanit. plnění</div>
      <div class="date-val">${formatDate(invoice.taxable_date)}</div>
    </div>
    ${invoice.due_date ? `<div class="date-box">
      <div class="date-lbl">Datum splatnosti</div>
      <div class="date-val">${formatDate(invoice.due_date)}</div>
    </div>` : ''}
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Popis (práce/díl)</th>
        <th style="width:40px;text-align:center">Ks</th>
        <th style="width:80px;text-align:right">Jedn. cena</th>
        <th style="width:60px;text-align:right">Sleva</th>
        <th style="width:80px;text-align:right">Celkem</th>
      </tr>
    </thead>
    <tbody>
      ${items.length > 0 ? items.map(item => `
        <tr>
          <td>
            <div class="item-name">${item.description}</div>
            ${item.type === 'part' && item.part_name ? `<div class="item-note">${item.part_name || ''}</div>` : ''}
          </td>
          <td style="text-align:center">${item.quantity}</td>
          <td class="price"><span class="price-val">${fmt(item.unit_price)}</span></td>
          <td class="price"><span class="price-val">—</span></td>
          <td class="price"><span class="price-val">${fmt(item.total_price)} ${settings.currency || 'Kč'}</span></td>
        </tr>
      `).join('') : `
        <tr>
          <td><div class="item-name">Práce technika — oprava ${order.device_type}</div></td>
          <td style="text-align:center">1</td>
          <td class="price"><span class="price-val">${fmt(order.work_price)}</span></td>
          <td class="price"><span class="price-val">—</span></td>
          <td class="price"><span class="price-val">${fmt(order.work_price)} ${settings.currency || 'Kč'}</span></td>
        </tr>
        ${order.parts_price > 0 ? `<tr>
          <td><div class="item-name">Náhradní díly</div></td>
          <td style="text-align:center">—</td>
          <td class="price"><span class="price-val">—</span></td>
          <td class="price"><span class="price-val">—</span></td>
          <td class="price"><span class="price-val">${fmt(order.parts_price)} ${settings.currency || 'Kč'}</span></td>
        </tr>` : ''}
      `}
    </tbody>
  </table>

  <div class="totals-block">
    <table class="totals-table">
      <tr><td>Práce celkem:</td><td>${fmt(invoice.subtotal_work)} ${settings.currency || 'Kč'}</td></tr>
      <tr><td>Díly celkem:</td><td>${fmt(invoice.subtotal_parts)} ${settings.currency || 'Kč'}</td></tr>
      ${invoice.discount > 0 ? `<tr><td>Sleva:</td><td>-${fmt(invoice.discount)} ${settings.currency || 'Kč'}</td></tr>` : ''}
      <tr class="total-row"><td><b>CELKEM:</b></td><td><b>${fmt(invoice.total)} ${settings.currency || 'Kč'}</b></td></tr>
    </table>
  </div>

  <div class="payment-row">
    <div class="pay-box">
      <div class="pay-lbl">Způsob platby</div>
      <div class="pay-val">${invoice.payment_method || 'Hotovost'}</div>
    </div>
    ${!isPaidByCash && settings.bank_account ? `<div class="pay-box">
      <div class="pay-lbl">Číslo účtu</div>
      <div class="pay-val">${settings.bank_account}</div>
    </div>` : ''}
    <div class="pay-box">
      <div class="pay-lbl">Variabilní symbol</div>
      <div class="pay-val">${invoice.invoice_number.replace(/\D/g, '')}</div>
    </div>
  </div>

  ${qrHtml}

  <div class="note-box">
    ${settings.vat_payer === 'false'
  ? '<b>Vystavovatel není plátcem DPH</b> — ceny jsou konečné (§ 6 zák. č. 235/2004 Sb.)'
  : ''}
  </div>

  <div class="signature-area">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-lbl">Zákazník — podpis a datum</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-lbl">${settings.technician_name || 'Technik'} — ZdeVer Repair</div>
    </div>
  </div>

  <div class="info-strip">
    <div class="ib"><div class="ib-lbl">Diagnostika</div><div class="ib-val">Zdarma</div></div>
    <div class="ib"><div class="ib-lbl">Záruka na práci</div><div class="ib-val">${order.warranty_days || 30} dní</div></div>
    <div class="ib"><div class="ib-lbl">Bez skrytých poplatků</div><div class="ib-val">Cena předem</div></div>
    <div class="ib"><div class="ib-lbl">Pokud nejde opravit</div><div class="ib-val">Nic neplatíš</div></div>
  </div>
</div>

<footer>
  <div class="ft-note">
    * Ceny jsou za práci technika. Náhradní díly jsou účtovány zvlášť dle skutečné ceny.
    Konečná cena vždy odsouhlasena předem.
  </div>
  <div class="ft-contact">
    <strong>${settings.company_name || 'ZdeVer Repair'}</strong>
    ${settings.company_phone || ''} · ${settings.company_email || ''} · ${settings.company_web || ''}
    <br>Vystaveno: ${formatDate(invoice.issue_date)}
  </div>
</footer>
</div></body></html>`;

  saveHtml(html, outputPath);
  return filename;
}

// ─── Warranty Certificate (B-5) ───────────────────────────────────────────────
export function generateWarrantyPdf(
  order: Order,
  settings: Record<string, string>,
  warrantyDays?: number,
  repairDescription?: string
): string {
  const days = warrantyDays ?? parseInt(settings.warranty_days || '30');
  const filename = `zaruka_${order.order_number.replace(/[^a-z0-9]/gi, '_')}.html`;
  const outputPath = join(PDF_DIR, filename);

// Spočítej datum záruky od vydání nebo od dneška
const baseDate = order.issued_at
  ? new Date(order.issued_at)
  : order.completed_at
    ? new Date(order.completed_at)
    : new Date();
const expiryDate = new Date(baseDate.getTime() + days * 86400000);
const warrantyExpires = formatDate(expiryDate.toISOString());

// Popis opravy — z parametru nebo z diagnózy zakázky
const finalRepairDesc = repairDescription?.trim() || order.diagnosis || order.problem_description;

  const html = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="UTF-8">
<title>Záruční list ${order.order_number}</title>
<style>${ZDEVER_CSS}
.warranty-content { padding:8mm 11mm; }
.warranty-title-block { text-align:center; padding:6mm 0; border-bottom:2px solid var(--navy); margin-bottom:6mm; }
.warranty-title-block h1 { font-family:'Syne',serif; font-size:28px; font-weight:800; color:var(--navy); }
.warranty-title-block p { color:var(--muted); font-size:11px; margin-top:4px; }
</style></head>
<body><div class="page">
<header>
  <div class="logo">
    <div class="logo-box"><div class="logo-z">Z</div></div>
    <div>
      <div class="logo-name">Zde<span>Ver</span> Repair</div>
      <div class="logo-sub">Opravy elektroniky · ${settings.company_city || 'Nový Jičín'}</div>
    </div>
  </div>
  <div class="hdr-meta">
    <b>Záruční list</b><br>
    Č. zakázky: ${order.order_number}<br>
    Datum opravy: ${formatDate(order.completed_at || order.issued_at)}
  </div>
</header>

<div class="warranty-content">
  <div class="warranty-title-block">
    <h1>ZÁRUČNÍ LIST</h1>
    <p>Doklad o provedené opravě a záruční ochraně</p>
  </div>

  <div class="info-grid">
    <div class="info-block">
      <div class="info-label">Zákazník</div>
      <div class="info-value">
        <b>${order.customer_name}</b><br>
        ${order.customer_phone || ''}<br>
        ${order.customer_email || ''}
        ${order.customer_ico ? `IČO: ${order.customer_ico}` : ''}
        ${order.customer_dic ? `DIČ: ${order.customer_dic}` : ''}
      </div>
    </div>
    <div class="info-block">
      <div class="info-label">Opravované zařízení</div>
      <div class="info-value">
        <b>${order.device_type}</b><br>
        ${order.device_model || '—'}<br>
        ${order.device_serial ? `S/N: ${order.device_serial}` : ''}
      </div>
    </div>
    <div class="info-block">
      <div class="info-label">Servisní firma</div>
      <div class="info-value">
        <b>${settings.company_name || 'ZdeVer Repair'}</b><br>
        ${settings.company_address || ''}, ${settings.company_city || ''}<br>
        ${settings.company_ico ? `IČO: ${settings.company_ico}` : ''}<br>
        ${settings.vat_payer === 'true' && settings.company_dic ? `DIČ: ${settings.company_dic}` : ''}<br>
        ${settings.company_registry ? `${settings.company_registry}` : ''}<br>
        Technik: ${settings.technician_name || 'Zdeněk Vérosta'}
      </div>
    </div>
  </div>

  <div class="info-block" style="margin:4mm 0">
    <div class="info-label">Popis provedené opravy</div>
    <div class="info-value" style="margin-top:4px;padding:6px 8px;background:var(--light);border-radius:4px;">
      ${finalRepairDesc}
  </div>

  <div class="warranty-box">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <div class="warranty-icon">🛡️</div>
      <div>
        <div class="w-title"Záruka na provedenou opravu: ${days} dní</div>
        <div class="date-val">${warrantyExpires}</div>
      </div>
    </div>
  </div>

  <div class="dates-row">
    <div class="date-box">
      <div class="date-lbl">Datum přijetí</div>
      <div class="date-val">${formatDate(order.received_at)}</div>
    </div>
    <div class="date-box">
      <div class="date-lbl">Datum opravy</div>
      <div class="date-val">${formatDate(order.completed_at)}</div>
    </div>
    <div class="date-box">
      <div class="date-lbl">Datum vydání</div>
      <div class="date-val">${formatDate(order.issued_at)}</div>
    </div>
    <div class="date-box">
      <div class="date-lbl">Záruka do</div>
      <div class="date-val">${warrantyExpires}</div>
    </div>
  </div>

  <div class="note-box" style="margin:4mm 0">
    <b>Záruční podmínky:</b><br>
    • Záruka se vztahuje na vadu způsobenou vadným dílem nebo chybou opravy.<br>
    • Záruka se <b>nevztahuje</b> na poškození způsobené zákazníkem po předání (náraz, voda, nesprávné zacházení).<br>
    • V záruční době bude závada odstraněna bezplatně.<br>
    • Pro uplatnění záruky je nutné předložit tento záruční list a doklad o zaplacení.
  </div>

  <div class="signature-area" style="margin-top:8mm">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-lbl">Zákazník — potvrzení převzetí a záruky</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-lbl">${settings.technician_name || 'Technik'} — ZdeVer Repair</div>
    </div>
  </div>
</div>

<footer>
  <div class="ft-note">Záruční list je platným dokladem pro uplatnění záruky. Uschovejte spolu s příjmovým dokladem.</div>
  <div class="ft-contact">
    <strong>${settings.company_name || 'ZdeVer Repair'}</strong>
    ${settings.company_phone || ''} · ${settings.company_email || ''} · ${settings.company_web || ''}
  </div>
</footer>
</div></body></html>`;

  saveHtml(html, outputPath);
  return filename;
}

// ─── Checklist (B-8) ──────────────────────────────────────────────────────────
export function generateChecklistPdf(
  order: Order,
  items: string[],
  checkedItems: boolean[],
  settings: Record<string, string>
): string {
  const filename = `checklist_${order.order_number.replace(/[^a-z0-9]/gi, '_')}.html`;
  const outputPath = join(PDF_DIR, filename);

  const checklistHtml = items
  .filter((_, i) => checkedItems[i] === true)
  .map(item => `
    <div class="checklist-item">
      <div class="checkbox checked" style="background:var(--navy);"></div>
      <label style="font-weight:500;">${item}</label>
    </div>
  `).join('') || `<p style="color:var(--muted);font-size:11px;">Žádné položky nebyly zaškrtnuty.</p>`;

  const html = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="UTF-8">
<title>Checklist výdeje ${order.order_number}</title>
<style>${ZDEVER_CSS}</style></head>
<body><div class="page">
<header>
  <div class="logo">
    <div class="logo-box"><div class="logo-z">Z</div></div>
    <div>
      <div class="logo-name">Zde<span>Ver</span> Repair</div>
      <div class="logo-sub">Opravy elektroniky · ${settings.company_city || 'Nový Jičín'}</div>
    </div>
  </div>
  <div class="hdr-meta">
    <b>Checklist výdeje zařízení</b><br>
    Zakázka: ${order.order_number}<br>
    Datum: ${formatDate(new Date().toISOString())}
  </div>
</header>

<div class="body">
  <div class="doc-title">
    <h1>VÝDEJOVÝ CHECKLIST</h1>
    <div class="doc-number">Zakázka č. ${order.order_number}</div>
  </div>

  <div class="info-grid" style="margin:4mm 0">
    <div class="info-block">
      <div class="info-label">Zákazník</div>
      <div class="info-value"><b>${order.customer_name}</b><br>${order.customer_phone || ''}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Zařízení</div>
      <div class="info-value"><b>${order.device_type}</b><br>${order.device_model || '—'}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Cena celkem</div>
      <div class="info-value" style="font-family:'Syne',serif;font-size:16px;font-weight:800;color:var(--navy)">
        ${fmt(order.total_price)} ${settings.currency || 'Kč'}
      </div>
    </div>
  </div>

  <div style="margin:4mm 0">
    <div class="info-label" style="margin-bottom:6px">Kontrolní seznam před vydáním</div>
    ${checklistHtml}
  </div>

  <div class="signature-area" style="margin-top:8mm">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-lbl">Zákazník — podpis a datum</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-lbl">${settings.technician_name || 'Technik'}</div>
    </div>
  </div>

  <div class="note-box" style="margin-top:4mm">
    Zákazník potvrzuje převzetí zařízení v opravěném stavu a uhrazení celkové ceny za oprav.
    Zákazník svým podpisem potvrzuje převzetí zařízení.
  </div>
</div>
</div></body></html>`;

  saveHtml(html, outputPath);
  return filename;
}
