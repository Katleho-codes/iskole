/**
 * Age rules shared by the API and the web app.
 *
 * The app is for learners aged 16 and over. Under-18s need a guardian's consent before an
 * application is opened or submitted, and company visibility is disabled for them entirely.
 * Age is calculated from a date of birth, not stored as a number, because a stored age goes
 * stale.
 */

export const MIN_LEARNER_AGE = 16;
export const ADULT_AGE = 18;

/** Parse the `YYYY-MM-DD` form used by an `<input type="date">`. Returns null if invalid. */
export function parseDateOfBirth(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject impossible dates such as 2001-02-31, which Date would silently roll over.
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

/**
 * Whole years between a date of birth and a reference date, in UTC.
 *
 * UTC is deliberate: every server and test calculates the same answer. The trade-off is
 * that a learner can become 18 up to two hours after South African midnight (UTC is two
 * hours behind SAST). The delay is conservative: it never grants adult access early.
 */
export function ageInYears(dateOfBirth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function isMinor(dateOfBirth: Date, now = new Date()): boolean {
  return ageInYears(dateOfBirth, now) < ADULT_AGE;
}

/** The latest date of birth that is still 18 or older today. Useful as a query cutoff. */
export function adultCutoff(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear() - ADULT_AGE, now.getUTCMonth(), now.getUTCDate()),
  );
}
