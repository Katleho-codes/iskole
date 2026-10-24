import { describe, expect, it } from 'vitest';
import { preferenceUpdateSchema, profileUpdateSchema } from './profile';

describe('profileUpdateSchema', () => {
  it('accepts a partial update with one field', () => {
    const parsed = profileUpdateSchema.parse({ fullName: 'Thandi Mokoena' });
    expect(parsed.fullName).toBe('Thandi Mokoena');
  });

  it('accepts an empty object, so a screen with nothing changed still saves', () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(profileUpdateSchema.parse({ fullName: '  Sipho  ' }).fullName).toBe('Sipho');
  });

  it('rejects a blank name rather than storing one', () => {
    expect(profileUpdateSchema.safeParse({ fullName: '   ' }).success).toBe(false);
  });

  it('rejects a name past the shared limit', () => {
    expect(profileUpdateSchema.safeParse({ fullName: 'a'.repeat(121) }).success).toBe(false);
  });

  it('rejects a province that is not a real province', () => {
    expect(profileUpdateSchema.safeParse({ province: 'ATLANTIS' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ province: 'GAUTENG' }).success).toBe(true);
  });

  it('rejects a grade outside 8 to 12', () => {
    expect(profileUpdateSchema.safeParse({ grade: 7 }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ grade: 13 }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ grade: 11 }).success).toBe(true);
  });

  it('rejects a phone number with letters', () => {
    expect(profileUpdateSchema.safeParse({ phone: 'call me' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ phone: '+27 82 123 4567' }).success).toBe(true);
  });

  // The property that matters most: the body can never carry identity fields that belong
  // to the session or to better-auth. Rejecting them loudly beats silently dropping them.
  it('rejects a body that tries to set userId, role, email or emailVerified', () => {
    expect(profileUpdateSchema.safeParse({ userId: 'someone-else' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ role: 'ADMIN' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ email: 'attacker@example.test' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ emailVerified: true }).success).toBe(false);
  });

  it('rejects an ID number in the profile body', () => {
    expect(profileUpdateSchema.safeParse({ idNumber: '9001015800085' }).success).toBe(false);
  });

  it('accepts a valid date of birth and rejects impossible dates', () => {
    expect(profileUpdateSchema.safeParse({ dateOfBirth: '2005-04-12' }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ dateOfBirth: '2005-02-31' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ dateOfBirth: '12/04/2005' }).success).toBe(false);
  });

  it('rejects a future date of birth', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(profileUpdateSchema.safeParse({ dateOfBirth: future }).success).toBe(false);
  });
});

describe('preferenceUpdateSchema', () => {
  it('accepts a partial update', () => {
    expect(preferenceUpdateSchema.safeParse({ studyMode: 'FULL_TIME' }).success).toBe(true);
  });

  it('rejects an unknown field of study', () => {
    expect(preferenceUpdateSchema.safeParse({ fields: ['ASTROPHYSICS'] }).success).toBe(false);
    expect(preferenceUpdateSchema.safeParse({ fields: ['NURSING'] }).success).toBe(true);
  });

  it('removes duplicate fields instead of storing them twice', () => {
    const parsed = preferenceUpdateSchema.parse({ fields: ['NURSING', 'NURSING', 'LAW'] });
    expect(parsed.fields).toEqual(['NURSING', 'LAW']);
  });

  it('removes duplicate provinces', () => {
    const parsed = preferenceUpdateSchema.parse({ provinces: ['GAUTENG', 'GAUTENG'] });
    expect(parsed.provinces).toEqual(['GAUTENG']);
  });

  it('caps the array length so a preference row cannot be flooded', () => {
    const tooMany = Array.from({ length: 30 }, () => 'NURSING' as const);
    expect(preferenceUpdateSchema.safeParse({ fields: tooMany }).success).toBe(false);
  });

  it('treats an empty provinces array as no preference, not as an error', () => {
    expect(preferenceUpdateSchema.parse({ provinces: [] }).provinces).toEqual([]);
  });

  it('allows a null budget ceiling, meaning no ceiling set', () => {
    expect(preferenceUpdateSchema.parse({ budgetCeiling: null }).budgetCeiling).toBeNull();
  });

  it('rejects a negative budget ceiling', () => {
    expect(preferenceUpdateSchema.safeParse({ budgetCeiling: -1 }).success).toBe(false);
  });

  it('rejects a language outside en and zu', () => {
    expect(preferenceUpdateSchema.safeParse({ language: 'fr' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(preferenceUpdateSchema.safeParse({ userId: 'someone-else' }).success).toBe(false);
  });
});