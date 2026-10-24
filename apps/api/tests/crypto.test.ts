import { describe, expect, it } from 'vitest';
import {
  ageAt,
  birthDateFromSaIdNumber,
  decryptField,
  encryptField,
  isValidSaIdNumber,
  luhnValid,
  safeEqual,
} from '../src/lib/crypto';

/**
 * Test fixtures use obviously fake ID numbers, never real people's data.
 */
describe('luhnValid', () => {
  it('accepts a number with a correct check digit', () => {
    expect(luhnValid('79927398713')).toBe(true);
  });

  it('rejects a number with a wrong check digit', () => {
    expect(luhnValid('79927398710')).toBe(false);
  });

  it('rejects non-digits', () => {
    expect(luhnValid('79927a98713')).toBe(false);
  });
});

describe('isValidSaIdNumber', () => {
  // 8001015009087 is the well-known published sample SA ID number, and it passes Luhn.
  it('accepts a structurally valid 13-digit number', () => {
    expect(isValidSaIdNumber('8001015009087')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidSaIdNumber('800101500908')).toBe(false);
    expect(isValidSaIdNumber('80010150090878')).toBe(false);
  });

  it('rejects an impossible birth month', () => {
    // Month 13 with a Luhn-valid check digit would still be rejected on structure.
    expect(isValidSaIdNumber('8013015009087')).toBe(false);
  });

  it('rejects a value that fails the checksum', () => {
    expect(isValidSaIdNumber('8001015009080')).toBe(false);
  });
});

describe('birthDateFromSaIdNumber', () => {
  it('reads a 1900s date for a two-digit year above the current year', () => {
    const date = birthDateFromSaIdNumber('8001015009087');
    expect(date?.getUTCFullYear()).toBe(1980);
    expect(date?.getUTCMonth()).toBe(0);
    expect(date?.getUTCDate()).toBe(1);
  });

  it('reads a 2000s date for a two-digit year at or below the current year', () => {
    const date = birthDateFromSaIdNumber('0601015009087');
    expect(date?.getUTCFullYear()).toBe(2006);
  });

  it('rejects an impossible day such as 31 February', () => {
    expect(birthDateFromSaIdNumber('8002315009087')).toBeNull();
  });
});

describe('ageAt', () => {
  it('counts whole years and floors a birthday not yet reached', () => {
    const birth = new Date(Date.UTC(2008, 5, 15)); // 15 June 2008
    expect(ageAt(birth, new Date(Date.UTC(2026, 5, 14)))).toBe(17);
    expect(ageAt(birth, new Date(Date.UTC(2026, 5, 15)))).toBe(18);
  });
});

describe('encryptField and decryptField', () => {
  it('round-trips a value', () => {
    const encrypted = encryptField('8001015009087');
    expect(decryptField(encrypted)).toBe('8001015009087');
  });

  it('never stores the plaintext in the ciphertext or IV', () => {
    const encrypted = encryptField('8001015009087');
    expect(encrypted.ciphertext).not.toContain('8001015009087');
    expect(encrypted.iv).not.toBe('');
    expect(encrypted.tag).not.toBe('');
  });

  it('produces a different IV and ciphertext each time', () => {
    const a = encryptField('8001015009087');
    const b = encryptField('8001015009087');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('rejects tampered ciphertext through the auth tag', () => {
    const encrypted = encryptField('8001015009087');
    const tampered = {
      ...encrypted,
      ciphertext: Buffer.from('tampered-value').toString('base64'),
    };
    expect(() => decryptField(tampered)).toThrow();
  });
});

describe('safeEqual', () => {
  it('compares equal strings as true and different strings as false', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
    expect(safeEqual('abc123', 'abc124')).toBe(false);
    expect(safeEqual('abc123', 'abc1234')).toBe(false);
  });
});
