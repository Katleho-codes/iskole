import { z } from 'zod';

/**
 * Money shapes shared by the API and the web app.
 *
 * Amounts are rands at the edge and cents in the database. The API converts once, so the
 * client never has to know which representation it is holding.
 */
export const MAX_MONEY_RANDS = 1_000_000;
export const MAX_MONEY_CENTS = MAX_MONEY_RANDS * 100;

export const MONEY_PERIODS = ['MONTHLY', 'WEEKLY', 'YEARLY'] as const;
export type MoneyPeriod = (typeof MONEY_PERIODS)[number];

export const ExpenseInputSchema = z
  .object({
    category: z.string().trim().min(1).max(60),
    amount: z.number().positive().max(MAX_MONEY_RANDS),
    description: z.string().trim().max(200).optional(),
    date: z.coerce.date().optional(),
    remindMe: z.boolean().default(false),
  })
  .strict();

export type ExpenseInput = z.infer<typeof ExpenseInputSchema>;

export const BudgetInputSchema = z
  .object({
    category: z.string().trim().min(1).max(60),
    amount: z.number().positive().max(MAX_MONEY_RANDS),
    period: z.enum(MONEY_PERIODS).default('MONTHLY'),
  })
  .strict();

export type BudgetInput = z.infer<typeof BudgetInputSchema>;

/**
 * `paydayDay` 0 means "last day of the month". The API and the cron job both use this
 * schema, so an invalid day can never reach the database.
 */
export const PaydayInputSchema = z
  .object({
    paydayDay: z.number().int().min(0).max(31),
  })
  .strict();

export type PaydayInput = z.infer<typeof PaydayInputSchema>;

/** The last calendar day of a month, in UTC, for a 1-based month. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * True when `paydayDay` lands on `dateKey` (YYYY-MM-DD). Days beyond a short month's end
 * fall on that month's last day, so a 31st payday still arrives in February.
 */
export function isPayday(paydayDay: number, dateKey: string): boolean {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return false;
  if (paydayDay === 0) return day === lastDayOfMonth(year, month);
  if (paydayDay < 1 || paydayDay > 31) return false;
  return day === Math.min(paydayDay, lastDayOfMonth(year, month));
}

export function formatRands(cents: number): string {
  return `R${(Math.round(cents) / 100).toFixed(2)}`;
}
