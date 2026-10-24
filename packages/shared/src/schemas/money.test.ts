import { describe, expect, it } from 'vitest';
import {
  ExpenseInputSchema,
  PaydayInputSchema,
  isPayday,
  lastDayOfMonth,
} from './money';
import { ClinicBookingInputSchema, CLINIC_REASONS } from './clinic';

describe('money schemas', () => {
  it('accepts rands, optional description and a remind flag', () => {
    const parsed = ExpenseInputSchema.parse({
      category: 'Food',
      amount: 12.5,
      description: 'Lunch',
      remindMe: true,
    });
    expect(parsed.amount).toBe(12.5);
    expect(parsed.remindMe).toBe(true);
  });

  it('rejects zero, negative, oversized and unknown fields', () => {
    expect(ExpenseInputSchema.safeParse({ category: 'Food', amount: 0 }).success).toBe(false);
    expect(ExpenseInputSchema.safeParse({ category: 'Food', amount: -1 }).success).toBe(false);
    expect(
      ExpenseInputSchema.safeParse({ category: 'Food', amount: 1_000_001 }).success,
    ).toBe(false);
    expect(
      ExpenseInputSchema.safeParse({ category: 'Food', amount: 10, userId: 'x' }).success,
    ).toBe(false);
  });

  it('accepts 0 as last day and rejects 32', () => {
    expect(PaydayInputSchema.safeParse({ paydayDay: 0 }).success).toBe(true);
    expect(PaydayInputSchema.safeParse({ paydayDay: 31 }).success).toBe(true);
    expect(PaydayInputSchema.safeParse({ paydayDay: 32 }).success).toBe(false);
  });
});

describe('isPayday', () => {
  it('handles months with fewer days', () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2024, 2)).toBe(29);
    expect(lastDayOfMonth(2026, 4)).toBe(30);

    // A 31st payday arrives on 28 February, not on a non-existent date.
    expect(isPayday(31, '2026-02-28')).toBe(true);
    expect(isPayday(31, '2026-02-27')).toBe(false);
    expect(isPayday(0, '2026-02-28')).toBe(true);
    expect(isPayday(0, '2026-04-30')).toBe(true);
    expect(isPayday(0, '2026-04-29')).toBe(false);
  });

  it('matches an ordinary day exactly', () => {
    expect(isPayday(25, '2026-10-25')).toBe(true);
    expect(isPayday(25, '2026-10-24')).toBe(false);
    expect(isPayday(25, 'not-a-date')).toBe(false);
  });
});

describe('clinic booking schema', () => {
  it('accepts only the fixed reason list', () => {
    expect(ClinicBookingInputSchema.safeParse({ slotId: 'slot-1', reason: 'FUNDING' }).success).toBe(
      true,
    );
    expect(
      ClinicBookingInputSchema.safeParse({ slotId: 'slot-1', reason: 'I feel anxious' }).success,
    ).toBe(false);
    expect(ClinicBookingInputSchema.safeParse({ slotId: 'slot-1' }).success).toBe(false);
    expect(
      ClinicBookingInputSchema.safeParse({ slotId: 'slot-1', reason: CLINIC_REASONS[0] }).success,
    ).toBe(true);
  });
});
