import { describe, expect, it } from 'vitest';
import { adultCutoff, ageInYears, isMinor, parseDateOfBirth } from './age';

describe('age helpers', () => {
  it('counts whole years in UTC and only on the birthday', () => {
    const dob = new Date('2008-03-01T00:00:00.000Z');
    expect(ageInYears(dob, new Date('2026-02-28T23:59:59.000Z'))).toBe(17);
    expect(ageInYears(dob, new Date('2026-03-01T00:00:00.000Z'))).toBe(18);
    expect(ageInYears(dob, new Date('2026-03-02T00:00:00.000Z'))).toBe(18);
  });

  it('treats the day before the 18th birthday as a minor', () => {
    const dob = new Date('2008-03-01T00:00:00.000Z');
    expect(isMinor(dob, new Date('2026-02-28T12:00:00.000Z'))).toBe(true);
    expect(isMinor(dob, new Date('2026-03-01T00:00:00.000Z'))).toBe(false);
  });

  it('parses the form date format strictly', () => {
    const parsed = parseDateOfBirth('2005-04-12');
    expect(parsed?.toISOString()).toBe('2005-04-12T00:00:00.000Z');
    expect(parseDateOfBirth('2005-02-31')).toBeNull();
    expect(parseDateOfBirth('12/04/2005')).toBeNull();
  });

  it('gives a cutoff that includes 18-year-olds and excludes the day before', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const cutoff = adultCutoff(now).toISOString().slice(0, 10);
    expect(cutoff).toBe('2008-06-15');
  });
});
