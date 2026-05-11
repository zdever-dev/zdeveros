// backend/src/utils/crypto.ts
// AES-256-CBC šifrování pro citlivá data (PIN zákazníka)
// Poznámka: Šifrování CELÉ databáze by vyžadovalo SQLCipher (jiná build knihovna).
// Toto řeší šifrování konkrétních polí v DB — dostatečné pro PIN.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-cbc';
const KEY_ENV = process.env.ENCRYPTION_KEY;

function getKey(): Buffer {
  if (KEY_ENV && KEY_ENV.length === 64) {
    return Buffer.from(KEY_ENV, 'hex');
  }
  // fallback deterministický klíč pokud není v env (development)
  // V produkci VŽDY nastav ENCRYPTION_KEY v .env na 64 hex znaků (32 bytes)
  const fallback = 'zdever-secret-key-change-in-production-please!!';
  return Buffer.from(fallback.slice(0, 32));
}

export function encrypt(text: string): string {
  if (!text) return '';
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  // uložíme jako "iv:encrypted" v hex
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(stored: string): string {
  if (!stored || !stored.includes(':')) return stored;
  try {
    const key = getKey();
    const [ivHex, encHex] = stored.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv(ALGO, key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return ''; // pokud se dešifrování nepovede, vrať prázdný string
  }
}

// Zkontroluje jestli string vypadá jako zašifrovaný (iv:hex formát)
export function isEncrypted(val: string): boolean {
  return /^[0-9a-f]{32}:[0-9a-f]+$/i.test(val || '');
}