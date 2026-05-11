// backend/src/utils/pdf.tsx
// @react-pdf/renderer replacement — stejný vizuální výstup jako původní HTML verze
// Instalace: cd backend && npm install @react-pdf/renderer
// tsconfig.json → přidat "jsx": "react" do compilerOptions

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  renderToBuffer,
} from '@react-pdf/renderer';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { Order, Invoice } from '../types';
import { generatePaymentQr } from './qr';

const PDF_DIR = process.env.PDF_OUTPUT_DIR || join(process.cwd(), 'data', 'pdfs');

// ─── Barvy ───────────────────────────────────────────────────────────────────
const C = {
  navy:    '#1C2A4A',
  blue:    '#4A7CC7',
  blueL:   '#7aaae8',
  text:    '#1a1f2e',
  muted:   '#6b7a99',
  rule:    '#d8dde8',
  light:   '#eef1f8',
  green:   '#0a6a55',
  greenBg: '#e8f4f0',
  greenBorder: '#a7f3d0',
  white:   '#ffffff',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('cs-CZ', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return dateStr; }
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '0';
  return Math.round(n).toLocaleString('cs-CZ');
}

function saveBuffer(buf: Buffer, outputPath: string): void {
  writeFileSync(outputPath, buf);
}

// ─── Sdílené styly ───────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    backgroundColor: C.white,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: C.text,
  },

  // Header
  header: {
    backgroundColor: C.navy,
    paddingHorizontal: 31,
    paddingTop: 23,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 3,
    borderBottomColor: C.blue,
    borderBottomStyle: 'solid',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logoBox: {
    width: 34, height: 34,
    backgroundColor: C.white,
    borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8,
  },
  logoZ: { fontFamily: 'Helvetica-Bold', fontSize: 22, color: C.navy, lineHeight: 1 },
  logoTexts: { flexDirection: 'column' },
  logoName: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.white, lineHeight: 1 },
  logoNameAccent: { color: C.blueL },
  logoSub: {
    fontSize: 6.5, letterSpacing: 2.5, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.38)', marginTop: 3,
  },
  headerMeta: { textAlign: 'right', fontSize: 7.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.9 },
  headerMetaBold: { fontFamily: 'Helvetica-Bold', color: C.white },

  // Body
  body: { paddingHorizontal: 31, paddingTop: 14 },

  // Doc title bar
  docTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: C.navy,
    borderBottomStyle: 'solid',
    paddingBottom: 6,
    marginBottom: 10,
  },
  docH1: { fontFamily: 'Helvetica-Bold', fontSize: 18, color: C.navy, lineHeight: 1 },
  docNumber: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: C.blue },

  // Info grid (3 columns)
  infoGrid: { flexDirection: 'row', marginBottom: 8 },
  infoBlock: { flex: 1, paddingRight: 10 },
  infoLabel: {
    fontSize: 6.5, fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.5, textTransform: 'uppercase',
    color: C.muted, marginBottom: 3,
  },
  infoValue: { fontSize: 8.5, lineHeight: 1.6, color: C.text },
  infoValueBold: { fontFamily: 'Helvetica-Bold' },

  // Date boxes
  datesRow: { flexDirection: 'row', marginBottom: 8 },
  dateBox: {
    backgroundColor: C.light, borderRadius: 3,
    paddingHorizontal: 8, paddingVertical: 4,
    marginRight: 6,
  },
  dateLbl: { fontSize: 6, textTransform: 'uppercase', letterSpacing: 1.5, color: C.muted },
  dateVal: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.navy, marginTop: 1 },

  // Items table
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1.5, borderBottomColor: C.navy, borderBottomStyle: 'solid',
    paddingBottom: 3, marginBottom: 2,
  },
  tableHeadCell: {
    fontSize: 6.5, textTransform: 'uppercase', letterSpacing: 1, color: C.muted,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5, borderBottomColor: C.rule, borderBottomStyle: 'solid',
    paddingVertical: 4,
  },
  itemNameText: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.text },
  itemNote: { fontSize: 7, color: C.muted, fontStyle: 'italic', marginTop: 1 },
  priceText: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.navy, textAlign: 'right' },

  // Totals
  totalsOuter: { alignItems: 'flex-end', marginTop: 6, marginBottom: 4 },
  totalsInner: { width: 160 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  totalsLabel: { fontSize: 8.5, color: C.muted },
  totalsValue: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.navy },
  totalsFinalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1.5, borderTopColor: C.navy, borderTopStyle: 'solid',
    paddingTop: 4, marginTop: 3,
  },
  totalsFinalLabel: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: C.navy },
  totalsFinalValue: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: C.navy },

  // Payment row
  payRow: { flexDirection: 'row', marginVertical: 5 },
  payBox: {
    flex: 1, marginRight: 6,
    backgroundColor: C.light,
    borderLeftWidth: 2.5, borderLeftColor: C.blue, borderLeftStyle: 'solid',
    borderRadius: 2,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  payLbl: { fontSize: 6, textTransform: 'uppercase', letterSpacing: 1.5, color: C.muted, marginBottom: 1 },
  payVal: { fontSize: 8.5, color: C.text },

  // QR block
  qrBlock: { flexDirection: 'row', alignItems: 'center', marginVertical: 5 },
  qrImage: { width: 76, height: 76, marginRight: 12 },
  qrInfo: { fontSize: 8, color: C.muted, lineHeight: 1.7 },
  qrInfoBold: { fontFamily: 'Helvetica-Bold', color: C.text },

  // Note box
  noteBox: {
    backgroundColor: C.light,
    borderLeftWidth: 2.5, borderLeftColor: C.blue, borderLeftStyle: 'solid',
    borderRadius: 2,
    paddingHorizontal: 9, paddingVertical: 5,
    marginVertical: 5,
    fontSize: 7.5, color: C.muted, lineHeight: 1.55,
  },
  noteBoxBold: { fontFamily: 'Helvetica-Bold', color: C.text },

  // Info strip (bottom badges)
  infoStrip: { flexDirection: 'row', marginVertical: 5, flexWrap: 'wrap' },
  infoStripItem: {
    backgroundColor: C.light,
    borderWidth: 0.5, borderColor: C.rule, borderStyle: 'solid',
    borderRadius: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    marginRight: 5, marginBottom: 4,
  },
  infoStripLbl: { fontSize: 6, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted, marginBottom: 1 },
  infoStripVal: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: C.navy },

  // Signature area
  sigArea: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 5 },
  sigBox: { alignItems: 'center', width: 120 },
  sigLine: {
    borderBottomWidth: 0.5, borderBottomColor: C.navy, borderBottomStyle: 'solid',
    width: 100, height: 20, marginBottom: 3,
  },
  sigLbl: { fontSize: 7, color: C.muted, textAlign: 'center' },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginHorizontal: 31,
    marginTop: 8,
    paddingTop: 5,
    borderTopWidth: 1.5, borderTopColor: C.navy, borderTopStyle: 'solid',
  },
  footerNote: { maxWidth: '55%', fontSize: 6.5, color: C.muted, lineHeight: 1.5 },
  footerContact: { textAlign: 'right', fontSize: 7.5, color: C.muted, lineHeight: 1.8 },
  footerContactBold: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.navy },

  // Parties grid (2 col, receipt)
  partiesGrid: { flexDirection: 'row', marginBottom: 6 },
  partyBox: {
    flex: 1, marginRight: 8,
    borderWidth: 0.5, borderColor: C.rule, borderStyle: 'solid',
    borderRadius: 4, paddingHorizontal: 9, paddingVertical: 6,
  },
  partyBoxLast: {
    flex: 1,
    borderWidth: 0.5, borderColor: C.rule, borderStyle: 'solid',
    borderRadius: 4, paddingHorizontal: 9, paddingVertical: 6,
  },

  // Device box
  deviceBox: {
    backgroundColor: C.light,
    borderLeftWidth: 2.5, borderLeftColor: C.blue, borderLeftStyle: 'solid',
    borderRadius: 2,
    paddingHorizontal: 10, paddingVertical: 5,
    marginVertical: 4,
  },

  // Terms (dashed border)
  termsBox: {
    borderWidth: 0.5, borderColor: C.rule, borderStyle: 'dashed',
    borderRadius: 3,
    paddingHorizontal: 8, paddingVertical: 5,
    marginVertical: 4,
    fontSize: 7, color: C.muted, lineHeight: 1.7,
  },
  termsBold: { fontFamily: 'Helvetica-Bold', color: C.text },

  // Receipt title
  receiptTitleBlock: {
    alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: C.navy, borderBottomStyle: 'solid',
    paddingBottom: 6, marginBottom: 8, marginTop: 4,
  },
  receiptH1: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: C.navy },
  receiptSub: { fontSize: 7.5, color: C.muted, marginTop: 2 },

  // Warranty
  warrantyTitleBlock: {
    alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: C.navy, borderBottomStyle: 'solid',
    paddingBottom: 6, marginBottom: 8, marginTop: 4,
  },
  warrantyH1: { fontFamily: 'Helvetica-Bold', fontSize: 20, color: C.navy },
  warrantySubtitle: { fontSize: 8, color: C.muted, marginTop: 3 },
  warrantyBox: {
    backgroundColor: C.greenBg,
    borderWidth: 1.5, borderColor: C.green, borderStyle: 'solid',
    borderRadius: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    marginVertical: 5,
    flexDirection: 'row', alignItems: 'center',
  },
  warrantyShield: { fontSize: 22, marginRight: 10, color: C.green },
  warrantyTitle: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: C.green },
  warrantyDate: { fontSize: 9, color: C.green, marginTop: 2 },
  descBox: {
    marginVertical: 4,
    paddingHorizontal: 8, paddingVertical: 6,
    borderWidth: 0.5, borderColor: C.rule, borderStyle: 'solid',
    borderRadius: 3,
    fontSize: 8.5, lineHeight: 1.55, color: C.text,
    minHeight: 30,
  },

  // Checklist
  checklistItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderBottomWidth: 0.5, borderBottomColor: C.rule, borderBottomStyle: 'solid',
    paddingVertical: 5,
  },
  checkbox: {
    width: 12, height: 12,
    borderWidth: 1.5, borderColor: C.navy, borderStyle: 'solid',
    borderRadius: 2, marginRight: 8, marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    width: 12, height: 12,
    backgroundColor: C.navy,
    borderRadius: 2, marginRight: 8, marginTop: 1,
    flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxTick: { color: C.white, fontSize: 7, fontFamily: 'Helvetica-Bold' },
  checkLabel: { fontSize: 9, color: C.text, lineHeight: 1.5 },

  // Small footer note
  smallNote: {
    fontSize: 7, color: C.muted, lineHeight: 1.5,
    borderTopWidth: 0.5, borderTopColor: C.rule, borderTopStyle: 'solid',
    paddingTop: 5, marginTop: 6,
  },
});

// ─── Shared components ────────────────────────────────────────────────────────

function PdfHeader({ title, meta, settings }: {
  title: string;
  meta: string[];
  settings: Record<string, string>;
}) {
  return (
    <View style={s.header}>
      <View style={s.logoRow}>
        <View style={s.logoBox}>
          <Text style={s.logoZ}>Z</Text>
        </View>
        <View style={s.logoTexts}>
          <Text style={s.logoName}>
            {'Zde'}<Text style={{ color: C.blueL }}>{'Ver'}</Text>{' Repair'}
          </Text>
          <Text style={s.logoSub}>
            {'Opravy elektroniky · ' + (settings.company_city || 'Višňové')}
          </Text>
        </View>
      </View>
      <View style={s.headerMeta}>
        {meta.map((line, i) =>
          i === 0
            ? <Text key={i} style={s.headerMetaBold}>{line}</Text>
            : <Text key={i}>{line}</Text>
        )}
      </View>
    </View>
  );
}

function PdfFooter({ settings, date }: { settings: Record<string, string>; date: string }) {
  return (
    <View style={s.footer}>
      <Text style={s.footerNote}>
        {'* Ceny jsou za práci technika. Náhradní díly jsou účtovány zvlášť dle skutečné ceny. Konečná cena vždy odsouhlasena předem.'}
      </Text>
      <View>
        <Text style={s.footerContactBold}>{settings.company_name || 'ZdeVer Repair'}</Text>
        <Text style={s.footerContact}>
          {[settings.company_phone, settings.company_email, settings.company_web]
            .filter(Boolean).join(' · ')}
        </Text>
        <Text style={s.footerContact}>{'Vystaveno: ' + date}</Text>
      </View>
    </View>
  );
}

function SigArea({ left, right }: { left: string; right: string }) {
  return (
    <View style={s.sigArea}>
      <View style={s.sigBox}>
        <View style={s.sigLine} />
        <Text style={s.sigLbl}>{left}</Text>
      </View>
      <View style={s.sigBox}>
        <View style={s.sigLine} />
        <Text style={s.sigLbl}>{right}</Text>
      </View>
    </View>
  );
}

// ─── PROTOKOL O PŘEVZETÍ ─────────────────────────────────────────────────────

function ReceiptDocument({ order, invoice, settings }: {
  order: Order;
  invoice: Invoice;
  settings: Record<string, string>;
}) {
  const today = fmtDate(new Date().toISOString());
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PdfHeader
          title="Protokol o převzetí zařízení"
          meta={['Protokol o převzetí zařízení', 'Č. zakázky: ' + order.order_number, 'Datum: ' + today]}
          settings={settings}
        />

        <View style={s.body}>
          {/* Title */}
          <View style={s.receiptTitleBlock}>
            <Text style={s.receiptH1}>PROTOKOL O PŘEVZETÍ ZAŘÍZENÍ K OPRAVĚ</Text>
            <Text style={s.receiptSub}>
              Tento dokument potvrzuje předání zařízení k opravě a vzájemnou dohodu o podmínkách
            </Text>
          </View>

          {/* Parties grid */}
          <View style={s.partiesGrid}>
            <View style={s.partyBox}>
              <Text style={s.infoLabel}>Zákazník (předávající)</Text>
              <Text style={[s.infoValue, s.infoValueBold]}>{order.customer_name}</Text>
              {order.customer_phone ? <Text style={s.infoValue}>{order.customer_phone}</Text> : null}
              {order.customer_email ? <Text style={s.infoValue}>{order.customer_email}</Text> : null}
              {order.customer_ico   ? <Text style={s.infoValue}>{'IČO: ' + order.customer_ico}</Text> : null}
            </View>
            <View style={s.partyBoxLast}>
              <Text style={s.infoLabel}>Servisní firma (přebírající)</Text>
              <Text style={[s.infoValue, s.infoValueBold]}>{settings.company_name || 'ZdeVer Repair'}</Text>
              {settings.company_address ? <Text style={s.infoValue}>{settings.company_address + ', ' + (settings.company_city || '')}</Text> : null}
              {settings.company_ico ? <Text style={s.infoValue}>{'IČO: ' + settings.company_ico}</Text> : null}
              {settings.vat_payer === 'true' && settings.company_dic
                ? <Text style={s.infoValue}>{'DIČ: ' + settings.company_dic}</Text> : null}
              {settings.company_registry ? <Text style={s.infoValue}>{settings.company_registry}</Text> : null}
              <Text style={s.infoValue}>{'Technik: ' + (settings.technician_name || order.technician || '—')}</Text>
            </View>
          </View>

          {/* Device */}
          <View style={s.deviceBox}>
            <Text style={s.infoLabel}>Přijímané zařízení</Text>
            <Text style={[s.infoValue, s.infoValueBold]}>
              {order.device_type + (order.device_model ? ' — ' + order.device_model : '')}
              {order.device_serial ? ' · S/N: ' + order.device_serial : ''}
            </Text>
          </View>

          {/* Problem */}
          <View style={{ marginVertical: 4 }}>
            <Text style={s.infoLabel}>Popis závady (dle zákazníka)</Text>
            <View style={s.descBox}>
              <Text style={s.infoValue}>{order.problem_description}</Text>
            </View>
          </View>

          {/* Estimated price */}
          <View style={{ marginVertical: 4 }}>
            <Text style={s.infoLabel}>Odhadovaná cena opravy</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 12, color: C.navy, marginTop: 2 }}>
              {order.estimated_price
                ? 'od ' + fmt(order.estimated_price) + ' ' + (settings.currency || 'Kč')
                : 'Bude stanovena po diagnostice'}
            </Text>
            <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>
              Konečná cena bude odsouhlasena se zákazníkem před zahájením opravy.
            </Text>
          </View>

          {/* Terms */}
          <View style={s.termsBox}>
            <Text><Text style={s.termsBold}>Podmínky převzetí zařízení:{'\n'}</Text>
              {'1. Zákazník prohlašuje, že je oprávněn předat zařízení k opravě a souhlasí s podmínkami servisu.\n'}
              {'2. Servisní firma přebírá zařízení v popsaném stavu a za jeho bezpečné uložení po dobu opravy ručí.\n'}
              {'3. Zákazník bude informován o průběhu opravy a konečné ceně před jejím zahájením.\n'}
              {'4. Zařízení bude vyzvednuto po uhrazení ceny opravy. Nevyzvednuté zařízení po 90 dnech může být zlikvidováno.\n'}
              {'5. Servisní firma nenese odpovědnost za ztrátu dat. Zákazníkovi je doporučeno předem zálohovat data.\n'}
              {'6. Záloha dat: zákazník souhlasí / nesouhlasí s provedením zálohy (nehodící se škrtněte).'}
            </Text>
          </View>

          {/* Dates */}
          <View style={s.datesRow}>
            <View style={s.dateBox}>
              <Text style={s.dateLbl}>Datum přijetí</Text>
              <Text style={s.dateVal}>{fmtDate(order.received_at)}</Text>
            </View>
            <View style={s.dateBox}>
              <Text style={s.dateLbl}>Č. zakázky</Text>
              <Text style={s.dateVal}>{order.order_number}</Text>
            </View>
          </View>

          <SigArea
            left="Zákazník — podpis a datum"
            right={(settings.technician_name || 'Technik') + ' — podpis a datum'}
          />

          <Text style={s.smallNote}>
            Doklad byl vystaven v souladu s § 2 zákona č. 634/1992 Sb. o ochraně spotřebitele.
            Zákazník svým podpisem potvrzuje, že byl seznámen s podmínkami opravy.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

// ─── FAKTURA / PŘÍJMOVÝ DOKLAD ────────────────────────────────────────────────

function InvoiceDocument({ order, invoice, settings, items, qrDataUrl }: {
  order: Order;
  invoice: Invoice;
  settings: Record<string, string>;
  items: any[];
  qrDataUrl?: string;
}) {
  const docTitle = invoice.type === 'invoice' ? 'FAKTURA' : 'PŘÍJMOVÝ DOKLAD';
  const isPaidByCash = (invoice.payment_method || '').toLowerCase().includes('hotov');
  const cur = settings.currency || 'Kč';

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PdfHeader
          title={docTitle}
          meta={[docTitle, 'Ceny jsou za práci technika', 'Náhradní díly účtovány zvlášť', 'Konečná cena odsouhlasena předem']}
          settings={settings}
        />

        <View style={s.body}>
          {/* Doc title row */}
          <View style={s.docTitleRow}>
            <Text style={s.docH1}>{docTitle}</Text>
            <Text style={s.docNumber}>{'Č. dokladu: ' + invoice.invoice_number}</Text>
          </View>

          {/* Info grid */}
          <View style={s.infoGrid}>
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Dodavatel</Text>
              <Text style={[s.infoValue, s.infoValueBold]}>{settings.company_name || 'ZdeVer Repair'}</Text>
              {settings.company_address ? <Text style={s.infoValue}>{settings.company_address}</Text> : null}
              {settings.company_city   ? <Text style={s.infoValue}>{settings.company_city}</Text> : null}
              {settings.company_ico    ? <Text style={s.infoValue}>{'IČO: ' + settings.company_ico}</Text> : null}
              {settings.vat_payer === 'true' && settings.company_dic
                ? <Text style={s.infoValue}>{'DIČ: ' + settings.company_dic}</Text> : null}
              {settings.company_registry ? <Text style={s.infoValue}>{settings.company_registry}</Text> : null}
              <Text style={s.infoValue}>{'Technik: ' + (settings.technician_name || '—')}</Text>
            </View>
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Odběratel</Text>
              <Text style={[s.infoValue, s.infoValueBold]}>{order.customer_name}</Text>
              {order.customer_phone ? <Text style={s.infoValue}>{order.customer_phone}</Text> : null}
              {order.customer_email ? <Text style={s.infoValue}>{order.customer_email}</Text> : null}
              {order.customer_ico   ? <Text style={s.infoValue}>{'IČO: ' + order.customer_ico}</Text> : null}
              {order.customer_dic   ? <Text style={s.infoValue}>{'DIČ: ' + order.customer_dic}</Text> : null}
            </View>
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Zakázka</Text>
              <Text style={s.infoValue}>{'Č. zakázky: '}<Text style={s.infoValueBold}>{order.order_number}</Text></Text>
              <Text style={s.infoValue}>
                {'Zařízení: ' + order.device_type + (order.device_model ? ' — ' + order.device_model : '')}
              </Text>
              {order.device_serial ? <Text style={s.infoValue}>{'S/N: ' + order.device_serial}</Text> : null}
            </View>
          </View>

          {/* Dates */}
          <View style={s.datesRow}>
            <View style={s.dateBox}>
              <Text style={s.dateLbl}>Datum vystavení</Text>
              <Text style={s.dateVal}>{fmtDate(invoice.issue_date)}</Text>
            </View>
            <View style={s.dateBox}>
              <Text style={s.dateLbl}>Datum zdanit. plnění</Text>
              <Text style={s.dateVal}>{fmtDate(invoice.taxable_date)}</Text>
            </View>
            {invoice.due_date ? (
              <View style={s.dateBox}>
                <Text style={s.dateLbl}>Datum splatnosti</Text>
                <Text style={s.dateVal}>{fmtDate(invoice.due_date)}</Text>
              </View>
            ) : null}
          </View>

          {/* Items table */}
          <View style={s.tableHead}>
            <Text style={[s.tableHeadCell, { flex: 4 }]}>Popis (práce/díl)</Text>
            <Text style={[s.tableHeadCell, { width: 28, textAlign: 'center' }]}>Ks</Text>
            <Text style={[s.tableHeadCell, { width: 60, textAlign: 'right' }]}>Jedn. cena</Text>
            <Text style={[s.tableHeadCell, { width: 45, textAlign: 'right' }]}>Sleva</Text>
            <Text style={[s.tableHeadCell, { width: 65, textAlign: 'right' }]}>Celkem</Text>
          </View>

          {items.length > 0
            ? items.map((item: any, i: number) => (
              <View key={i} style={s.tableRow}>
                <View style={{ flex: 4 }}>
                  <Text style={s.itemNameText}>{item.description}</Text>
                  {item.type === 'part' && item.part_name
                    ? <Text style={s.itemNote}>{item.part_name}</Text>
                    : null}
                </View>
                <Text style={[s.priceText, { width: 28, textAlign: 'center', fontFamily: 'Helvetica' }]}>
                  {item.quantity}
                </Text>
                <Text style={[s.priceText, { width: 60 }]}>
                  {fmt(item.unit_price)}
                </Text>
                <Text style={[s.priceText, { width: 45 }]}>{'—'}</Text>
                <Text style={[s.priceText, { width: 65 }]}>
                  {fmt(item.total_price) + ' ' + cur}
                </Text>
              </View>
            ))
            : (
              <>
                <View style={s.tableRow}>
                  <Text style={[s.itemNameText, { flex: 4 }]}>
                    {'Práce technika — oprava ' + order.device_type}
                  </Text>
                  <Text style={[s.priceText, { width: 28, textAlign: 'center', fontFamily: 'Helvetica' }]}>1</Text>
                  <Text style={[s.priceText, { width: 60 }]}>{fmt(order.work_price)}</Text>
                  <Text style={[s.priceText, { width: 45 }]}>{'—'}</Text>
                  <Text style={[s.priceText, { width: 65 }]}>{fmt(order.work_price) + ' ' + cur}</Text>
                </View>
                {order.parts_price > 0 ? (
                  <View style={s.tableRow}>
                    <Text style={[s.itemNameText, { flex: 4 }]}>Náhradní díly</Text>
                    <Text style={[s.priceText, { width: 28, textAlign: 'center', fontFamily: 'Helvetica' }]}>{'—'}</Text>
                    <Text style={[s.priceText, { width: 60 }]}>{'—'}</Text>
                    <Text style={[s.priceText, { width: 45 }]}>{'—'}</Text>
                    <Text style={[s.priceText, { width: 65 }]}>{fmt(order.parts_price) + ' ' + cur}</Text>
                  </View>
                ) : null}
              </>
            )
          }

          {/* Totals */}
          <View style={s.totalsOuter}>
            <View style={s.totalsInner}>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>Práce celkem:</Text>
                <Text style={s.totalsValue}>{fmt(invoice.subtotal_work) + ' ' + cur}</Text>
              </View>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>Díly celkem:</Text>
                <Text style={s.totalsValue}>{fmt(invoice.subtotal_parts) + ' ' + cur}</Text>
              </View>
              {invoice.discount > 0 ? (
                <View style={s.totalsRow}>
                  <Text style={s.totalsLabel}>Sleva:</Text>
                  <Text style={s.totalsValue}>{'-' + fmt(invoice.discount) + ' ' + cur}</Text>
                </View>
              ) : null}
              <View style={s.totalsFinalRow}>
                <Text style={s.totalsFinalLabel}>CELKEM:</Text>
                <Text style={s.totalsFinalValue}>{fmt(invoice.total) + ' ' + cur}</Text>
              </View>
            </View>
          </View>

          {/* Payment row */}
          <View style={s.payRow}>
            <View style={s.payBox}>
              <Text style={s.payLbl}>Způsob platby</Text>
              <Text style={s.payVal}>{invoice.payment_method || 'Hotovost'}</Text>
            </View>
            {!isPaidByCash && settings.bank_account ? (
              <View style={s.payBox}>
                <Text style={s.payLbl}>Číslo účtu</Text>
                <Text style={s.payVal}>{settings.bank_account}</Text>
              </View>
            ) : null}
            <View style={[s.payBox, { marginRight: 0 }]}>
              <Text style={s.payLbl}>Variabilní symbol</Text>
              <Text style={s.payVal}>{invoice.invoice_number.replace(/\D/g, '')}</Text>
            </View>
          </View>

          {/* QR code */}
          {qrDataUrl ? (
            <View style={s.qrBlock}>
              <Image src={qrDataUrl} style={s.qrImage} />
              <View>
                <Text style={[s.qrInfo, s.qrInfoBold]}>Platba QR kódem</Text>
                <Text style={s.qrInfo}>Naskenujte telefonem a potvrďte v bance.</Text>
                <Text style={s.qrInfo}>{'Účet: ' + (settings.bank_account || '—')}</Text>
                <Text style={s.qrInfo}>{'VS: ' + invoice.invoice_number.replace(/\D/g, '')}</Text>
              </View>
            </View>
          ) : null}

          {/* Note */}
          <View style={s.noteBox}>
            <Text>
              {settings.vat_payer === 'false'
                ? <><Text style={s.noteBoxBold}>Vystavovatel není plátcem DPH</Text>{' — ceny jsou konečné (§ 6 zák. č. 235/2004 Sb.)'}</>
                : null}
            </Text>
          </View>

          <SigArea
            left="Zákazník — podpis a datum"
            right={(settings.technician_name || 'Technik') + ' — ZdeVer Repair'}
          />

          {/* Info strip */}
          <View style={s.infoStrip}>
            {[
              ['Diagnostika', 'Zdarma'],
              ['Záruka na práci', (order.warranty_days || 30) + ' dní'],
              ['Bez skrytých poplatků', 'Cena předem'],
              ['Pokud nejde opravit', 'Nic neplatíš'],
            ].map(([l, v]) => (
              <View key={l} style={s.infoStripItem}>
                <Text style={s.infoStripLbl}>{l}</Text>
                <Text style={s.infoStripVal}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <PdfFooter settings={settings} date={fmtDate(invoice.issue_date)} />
      </Page>
    </Document>
  );
}

// ─── ZÁRUČNÍ LIST ─────────────────────────────────────────────────────────────

function WarrantyDocument({ order, settings, warrantyDays, repairDescription }: {
  order: Order;
  settings: Record<string, string>;
  warrantyDays: number;
  repairDescription: string;
}) {
  const baseDate = order.issued_at
    ? new Date(order.issued_at)
    : order.completed_at
      ? new Date(order.completed_at)
      : new Date();
  const expiryDate = new Date(baseDate.getTime() + warrantyDays * 86400000);
  const warrantyExpires = fmtDate(expiryDate.toISOString());
  const cur = settings.currency || 'Kč';

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PdfHeader
          title="Záruční list"
          meta={['Záruční list', 'Č. zakázky: ' + order.order_number, 'Datum opravy: ' + fmtDate(order.completed_at || order.issued_at)]}
          settings={settings}
        />

        <View style={s.body}>
          {/* Title */}
          <View style={s.warrantyTitleBlock}>
            <Text style={s.warrantyH1}>ZÁRUČNÍ LIST</Text>
            <Text style={s.warrantySubtitle}>Doklad o provedené opravě a záruční ochraně</Text>
          </View>

          {/* Info grid */}
          <View style={s.infoGrid}>
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Zákazník</Text>
              <Text style={[s.infoValue, s.infoValueBold]}>{order.customer_name}</Text>
              {order.customer_phone ? <Text style={s.infoValue}>{order.customer_phone}</Text> : null}
              {order.customer_email ? <Text style={s.infoValue}>{order.customer_email}</Text> : null}
              {order.customer_ico   ? <Text style={s.infoValue}>{'IČO: ' + order.customer_ico}</Text> : null}
            </View>
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Opravované zařízení</Text>
              <Text style={[s.infoValue, s.infoValueBold]}>{order.device_type}</Text>
              <Text style={s.infoValue}>{order.device_model || '—'}</Text>
              {order.device_serial ? <Text style={s.infoValue}>{'S/N: ' + order.device_serial}</Text> : null}
            </View>
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Servisní firma</Text>
              <Text style={[s.infoValue, s.infoValueBold]}>{settings.company_name || 'ZdeVer Repair'}</Text>
              {settings.company_address ? <Text style={s.infoValue}>{settings.company_address + ', ' + (settings.company_city || '')}</Text> : null}
              {settings.company_ico ? <Text style={s.infoValue}>{'IČO: ' + settings.company_ico}</Text> : null}
              {settings.vat_payer === 'true' && settings.company_dic
                ? <Text style={s.infoValue}>{'DIČ: ' + settings.company_dic}</Text> : null}
              <Text style={s.infoValue}>{'Technik: ' + (settings.technician_name || 'Zdeněk Vérosta')}</Text>
            </View>
          </View>

          {/* Repair description */}
          <View style={{ marginBottom: 4 }}>
            <Text style={s.infoLabel}>Popis provedené opravy</Text>
            <View style={s.descBox}>
              <Text style={s.infoValue}>{repairDescription}</Text>
            </View>
          </View>

          {/* Warranty box */}
          <View style={s.warrantyBox}>
            <Text style={{ fontSize: 28, color: C.green, marginRight: 12 }}>{'[Zaruka]'}</Text>
            <View>
              <Text style={s.warrantyTitle}>
                {'Zaruka na provedenou opravu: ' + warrantyDays + ' dni'}
              </Text>
              <Text style={s.warrantyDate}>{warrantyExpires}</Text>
            </View>
          </View>

          {/* Dates */}
          <View style={s.datesRow}>
            <View style={s.dateBox}>
              <Text style={s.dateLbl}>Datum přijetí</Text>
              <Text style={s.dateVal}>{fmtDate(order.received_at)}</Text>
            </View>
            <View style={s.dateBox}>
              <Text style={s.dateLbl}>Datum opravy</Text>
              <Text style={s.dateVal}>{fmtDate(order.completed_at)}</Text>
            </View>
            <View style={s.dateBox}>
              <Text style={s.dateLbl}>Datum vydání</Text>
              <Text style={s.dateVal}>{fmtDate(order.issued_at)}</Text>
            </View>
            <View style={s.dateBox}>
              <Text style={s.dateLbl}>Záruka do</Text>
              <Text style={s.dateVal}>{warrantyExpires}</Text>
            </View>
          </View>

          {/* Warranty conditions */}
          <View style={s.noteBox}>
            <Text>
              <Text style={s.noteBoxBold}>Záruční podmínky:{'\n'}</Text>
              {'• Záruka se vztahuje na vadu způsobenou vadným dílem nebo chybou opravy.\n'}
              {'• Záruka se nevztahuje na poškození způsobené zákazníkem po předání (náraz, voda, nesprávné zacházení).\n'}
              {'• V záruční době bude závada odstraněna bezplatně.\n'}
              {'• Pro uplatnění záruky je nutné předložit tento záruční list a doklad o zaplacení.'}
            </Text>
          </View>

          <SigArea
            left="Zákazník — potvrzení převzetí a záruky"
            right={(settings.technician_name || 'Technik') + ' — ZdeVer Repair'}
          />
        </View>

        {/* Footer (no asterisk note for warranty) */}
        <View style={s.footer}>
          <Text style={s.footerNote}>
            Záruční list je platným dokladem pro uplatnění záruky. Uschovejte spolu s příjmovým dokladem.
          </Text>
          <View>
            <Text style={s.footerContactBold}>{settings.company_name || 'ZdeVer Repair'}</Text>
            <Text style={s.footerContact}>
              {[settings.company_phone, settings.company_email, settings.company_web]
                .filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ─── VÝDEJOVÝ CHECKLIST ───────────────────────────────────────────────────────

function ChecklistDocument({ order, items, checkedItems, settings }: {
  order: Order;
  items: string[];
  checkedItems: boolean[];
  settings: Record<string, string>;
}) {
  const cur = settings.currency || 'Kč';
  const checkedList = items.filter((_, i) => checkedItems[i] === true);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PdfHeader
          title="Checklist výdeje zařízení"
          meta={['Checklist výdeje zařízení', 'Zakázka: ' + order.order_number, 'Datum: ' + fmtDate(new Date().toISOString())]}
          settings={settings}
        />

        <View style={s.body}>
          {/* Title */}
          <View style={s.docTitleRow}>
            <Text style={s.docH1}>VÝDEJOVÝ CHECKLIST</Text>
            <Text style={s.docNumber}>{'Zakázka č. ' + order.order_number}</Text>
          </View>

          {/* Info grid */}
          <View style={s.infoGrid}>
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Zákazník</Text>
              <Text style={[s.infoValue, s.infoValueBold]}>{order.customer_name}</Text>
              {order.customer_phone ? <Text style={s.infoValue}>{order.customer_phone}</Text> : null}
            </View>
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Zařízení</Text>
              <Text style={[s.infoValue, s.infoValueBold]}>{order.device_type}</Text>
              <Text style={s.infoValue}>{order.device_model || '—'}</Text>
            </View>
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Cena celkem</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.navy }}>
                {fmt(order.total_price) + ' ' + cur}
              </Text>
            </View>
          </View>

          {/* Checklist */}
          <View style={{ marginTop: 8 }}>
            <Text style={s.infoLabel}>Kontrolní seznam před vydáním</Text>

            {checkedList.length > 0
              ? checkedList.map((item, i) => (
                <View key={i} style={s.checklistItem}>
                  <View style={s.checkboxChecked}>
                    <Text style={s.checkboxTick}>✓</Text>
                  </View>
                  <Text style={[s.checkLabel, { fontFamily: 'Helvetica-Bold' }]}>{item}</Text>
                </View>
              ))
              : <Text style={{ color: C.muted, fontSize: 8.5, marginTop: 4 }}>
                  Žádné položky nebyly zaškrtnuty.
                </Text>
            }
          </View>

          <SigArea
            left="Zákazník — podpis a datum"
            right={settings.technician_name || 'Technik'}
          />

          <View style={s.noteBox}>
            <Text>
              Zákazník potvrzuje převzetí zařízení v opravěném stavu a uhrazení celkové ceny za opravu.
              Zákazník svým podpisem potvrzuje převzetí zařízení.
            </Text>
          </View>
        </View>

        <View style={[s.footer, { borderTopWidth: 0 }]} />
      </Page>
    </Document>
  );
}

// ─── Exportované funkce ───────────────────────────────────────────────────────

export async function generateInvoicePdf(
  order: Order,
  invoice: Invoice,
  settings: Record<string, string>,
  items: any[]
): Promise<string> {
  const isReceipt = invoice.type === 'receipt';

  if (isReceipt) {
    const filename = `Prevzeti_${order.order_number.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    const outputPath = join(PDF_DIR, filename);
    const buf = await renderToBuffer(
      <ReceiptDocument order={order} invoice={invoice} settings={settings} />
    );
    saveBuffer(buf, outputPath);
    return filename;
  }

  // Invoice / Faktura
  let qrDataUrl: string | undefined;
  const isPaidByCash = (invoice.payment_method || '').toLowerCase().includes('hotov');
  if (!isPaidByCash && settings.bank_account && settings.qr_payment_enabled === 'true') {
    try {
      const qr = await generatePaymentQr({
        account: settings.bank_account,
        amount: invoice.total,
        variableSymbol: invoice.invoice_number.replace(/\D/g, ''),
        message: `Faktura ${invoice.invoice_number}`,
        recipientName: settings.company_name,
      });
      qrDataUrl = qr.qr_data_url;
    } catch { /* QR je nepovinné */ }
  }

  const filename = `${invoice.invoice_number.replace(/[^a-z0-9]/gi, '_')}.pdf`;
  const outputPath = join(PDF_DIR, filename);
  const buf = await renderToBuffer(
    <InvoiceDocument
      order={order}
      invoice={invoice}
      settings={settings}
      items={items}
      qrDataUrl={qrDataUrl}
    />
  );
  saveBuffer(buf, outputPath);
  return filename;
}

export async function generateWarrantyPdf(
  order: Order,
  settings: Record<string, string>,
  warrantyDays?: number,
  repairDescription?: string
): Promise<string> {
  const days = warrantyDays ?? parseInt(settings.warranty_days || '30');
  const desc = repairDescription?.trim() || order.diagnosis || order.problem_description;

  const filename = `zaruka_${order.order_number.replace(/[^a-z0-9]/gi, '_')}.pdf`;
  const outputPath = join(PDF_DIR, filename);
  const buf = await renderToBuffer(
    <WarrantyDocument
      order={order}
      settings={settings}
      warrantyDays={days}
      repairDescription={desc}
    />
  );
  saveBuffer(buf, outputPath);
  return filename;
}

export async function generateChecklistPdf(
  order: Order,
  items: string[],
  checkedItems: boolean[],
  settings: Record<string, string>
): Promise<string> {
  const filename = `checklist_${order.order_number.replace(/[^a-z0-9]/gi, '_')}.pdf`;
  const outputPath = join(PDF_DIR, filename);
  const buf = await renderToBuffer(
    <ChecklistDocument
      order={order}
      items={items}
      checkedItems={checkedItems}
      settings={settings}
    />
  );
  saveBuffer(buf, outputPath);
  return filename;
}
