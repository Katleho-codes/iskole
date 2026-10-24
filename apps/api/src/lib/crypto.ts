/**
 * SA ID number handling (build instructions section 6, OWASP skill "Sensitive data
 * and cryptographic storage").
 *
 * - Validate the 13-digit format and the Luhn checksum before anything else.
 * - Encrypt with AES-256-GCM using a per-environment key from env. Store ciphertext,
 *   IV and auth tag together, never plaintext.
 * - Never log an ID number. Never send one to the AI.
 *
 * Collected only at the point of an application that needs it (data minimisation).
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Luhn checksum. Used by SA ID numbers as the final check digit.
 * Returns true when the digits pass the checksum.
 */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const char = digits[i];
    if (char === undefined) return false;
    let value = char.charCodeAt(0) - 48;
    if (value < 0 || value > 9) return false;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Structural validation of an SA ID number: 13 digits, a valid date of birth in the
 * first six digits, and a valid Luhn check digit.
 */
export function isValidSaIdNumber(idNumber: string): boolean {
  if (!/^\d{13}$/.test(idNumber)) return false;

  const month = Number(idNumber.slice(2, 4));
  const day = Number(idNumber.slice(4, 6));
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  return luhnValid(idNumber);
}

/** Birth date derived from the first six digits, or null when invalid. */
export function birthDateFromSaIdNumber(idNumber: string): Date | null {
  if (!/^\d{13}$/.test(idNumber)) return null;
  const yy = Number(idNumber.slice(0, 2));
  const mm = Number(idNumber.slice(2, 4));
  const dd = Number(idNumber.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  // 2000s cutoff: iskole's audience is 16 to 35, so a two-digit year above the current
  // two-digit year belongs to the previous century.
  const currentYY = new Date().getFullYear() % 100;
  const year = yy <= currentYY ? 2000 + yy : 1900 + yy;

  const date = new Date(Date.UTC(year, mm - 1, dd));
  // Reject impossible dates such as 31 February.
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;
  return date;
}

/** Age in whole years at the given date. */
export function ageAt(birthDate: Date, at: Date = new Date()): number {
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = at.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && at.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export type EncryptedField = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function keyBuffer(): Buffer {
  // The env key is base64. Derive a fixed 32 bytes so a non-standard key length
  // still yields a valid AES-256 key.
  const raw = Buffer.from(env.ID_ENCRYPTION_KEY, 'base64');
  if (raw.length >= 32) return raw.subarray(0, 32);
  const padded = Buffer.alloc(32);
  raw.copy(padded);
  return padded;
}

/** Encrypt a value with AES-256-GCM. Returns base64 parts for storage. */
export function encryptField(plaintext: string): EncryptedField {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyBuffer(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

/** Decrypt a value produced by encryptField. Throws when the tag does not verify. */
export function decryptField(field: EncryptedField): string {
  const decipher = createDecipheriv(ALGORITHM, keyBuffer(), Buffer.from(field.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(field.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(field.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** Constant-time comparison for tokens and signatures. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
