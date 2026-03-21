/**
 * src/crypto.ts
 * 
 * Utility for encrypting and decrypting sensitive values (e.g. API keys)
 * before storing them in the database.
 * 
 * Uses AES-256-CBC encryption from Node.js built-in `crypto` module.
 * Requires ENCRYPTION_KEY in .env (64 hex chars = 32 bytes).
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createCipheriv, createDecipheriv, randomBytes } = require('crypto') as typeof import('crypto');

// Read key from env; fall back to a default (CHANGE IN PRODUCTION)
const RAW_KEY = process.env.ENCRYPTION_KEY || '';
const KEY = RAW_KEY.length === 64
  ? Buffer.from(RAW_KEY, 'hex')
  : Buffer.alloc(32, 0); // Zero key — works but insecure; set ENCRYPTION_KEY in .env!

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypt a plain-text string. Returns a base64 string: "iv:ciphertext"
 */
export function encrypt(text: string): string {
  if (!text) return '';
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a previously encrypted string. Returns original plain text.
 * If the value is not in the expected format, returns it as-is (backward compat).
 */
export function decrypt(text: string): string {
  if (!text) return '';
  if (!text.includes(':')) return text; // Not encrypted (legacy plain text)
  const [ivHex, encHex] = text.split(':');
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const encBuffer = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, KEY, iv);
    return Buffer.concat([decipher.update(encBuffer), decipher.final()]).toString('utf8');
  } catch {
    return text; // Decryption failed — return as-is
  }
}
