import { describe, expect, it } from 'vitest';
import { idParamSchema, languageSchema } from './common';

describe('idParamSchema', () => {
  it('accepts a normal record id', () => {
    expect(idParamSchema.parse({ id: 'clx1234567890' }).id).toBe('clx1234567890');
  });

  it('rejects an empty id', () => {
    expect(idParamSchema.safeParse({ id: '' }).success).toBe(false);
  });

  it('rejects an oversized id before it reaches the database', () => {
    expect(idParamSchema.safeParse({ id: 'a'.repeat(65) }).success).toBe(false);
  });
});

describe('languageSchema', () => {
  it('accepts en and zu only', () => {
    expect(languageSchema.safeParse('en').success).toBe(true);
    expect(languageSchema.safeParse('zu').success).toBe(true);
    expect(languageSchema.safeParse('fr').success).toBe(false);
  });
});
