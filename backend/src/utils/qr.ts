import QRCode from 'qrcode';

interface SpaydParams {
  iban?: string;
  account?: string;     // Czech account number (e.g. "123456789/0800")
  amount: number;
  currency?: string;
  variableSymbol?: string;
  message?: string;
  recipientName?: string;
}

/**
 * Generate SPAYD (Smart Payment) QR code string — Czech/Slovak bank standard
 * https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
 */
export function buildSpaydString(params: SpaydParams): string {
  const {
    account,
    iban,
    amount,
    currency = 'CZK',
    variableSymbol,
    message,
    recipientName,
  } = params;

  const parts: string[] = ['SPD*1.0'];

  if (iban) {
    parts.push(`ACC:${iban}`);
  } else if (account) {
    // Convert Czech account to IBAN-like format for SPAYD
    const [num, code] = account.split('/');
    // Use account number directly (SPAYD supports CZ-style accounts)
    parts.push(`ACC:CZ+${code}+${num.padStart(16, '0')}`);
  }

  parts.push(`AM:${amount.toFixed(2)}`);
  parts.push(`CC:${currency}`);

  if (variableSymbol) parts.push(`X-VS:${variableSymbol}`);
  if (message)        parts.push(`MSG:${message.slice(0, 60)}`);
  if (recipientName)  parts.push(`RN:${recipientName.slice(0, 35)}`);

  return parts.join('*');
}

/**
 * Generate QR code as base64 PNG data URL
 */
export async function generateQrDataUrl(spayd: string): Promise<string> {
  return QRCode.toDataURL(spayd, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
    color: {
      dark: '#1C2A4A',
      light: '#FFFFFF',
    },
  });
}

/**
 * Generate QR code as SVG string
 */
export async function generateQrSvg(spayd: string): Promise<string> {
  return QRCode.toString(spayd, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
  });
}

/**
 * Full pipeline: build SPAYD + generate QR data URL
 */
export async function generatePaymentQr(params: SpaydParams): Promise<{
  spayd: string;
  qr_data_url: string;
  qr_svg: string;
}> {
  const spayd = buildSpaydString(params);
  const [qr_data_url, qr_svg] = await Promise.all([
    generateQrDataUrl(spayd),
    generateQrSvg(spayd),
  ]);

  return { spayd, qr_data_url, qr_svg };
}
