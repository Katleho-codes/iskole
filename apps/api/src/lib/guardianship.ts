/**
 * POPIA age rules, enforced in one place.
 *
 * - The learner enters a date of birth on their profile. Without one, an application cannot
 *   be opened or submitted, documents cannot be attached to a draft, and company visibility
 *   cannot be turned on: an unknown age is treated as "not proven adult", not as an adult.
 * - Under-18s need a guardian consent record before opening or submitting an application.
 * - Under-18s can never be visible to companies, consent or not.
 *
 * These helpers read from the database on purpose. A client cannot assert its own age.
 */
import { isMinor, ageInYears, MIN_LEARNER_AGE } from '@iskole/shared';
import { prisma } from './prisma';
import { HttpError } from './http-error';

export type AgeStatus = {
  dateOfBirth: Date | null;
  age: number | null;
  minor: boolean;
  hasGuardianConsent: boolean;
};

export async function getAgeStatus(userId: string): Promise<AgeStatus> {
  const [profile, consent] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      select: { dateOfBirth: true },
    }),
    prisma.guardianConsent.findUnique({
      where: { userId },
      select: { userId: true },
    }),
  ]);

  const dateOfBirth = profile?.dateOfBirth ?? null;
  const age = dateOfBirth ? ageInYears(dateOfBirth) : null;
  return {
    dateOfBirth,
    age,
    minor: dateOfBirth ? isMinor(dateOfBirth) : false,
    hasGuardianConsent: consent !== null,
  };
}

/** Throws when the learner may not open or submit an application yet. */
export async function assertCanApply(userId: string): Promise<void> {
  const status = await getAgeStatus(userId);

  if (!status.dateOfBirth || status.age === null) {
    throw new HttpError(403, 'add your date of birth on your profile before applying');
  }
  if (status.age < MIN_LEARNER_AGE) {
    throw new HttpError(403, 'iskole is for learners aged 16 and over');
  }
  if (status.minor && !status.hasGuardianConsent) {
    throw new HttpError(403, 'guardian consent is required before you can apply');
  }
}

/** Throws when the learner may not turn on company visibility. */
export async function assertCanBeVisibleToCompanies(userId: string): Promise<void> {
  const status = await getAgeStatus(userId);

  if (!status.dateOfBirth || status.age === null) {
    throw new HttpError(403, 'add your date of birth on your profile before opting in');
  }
  if (status.minor) {
    throw new HttpError(403, 'company visibility is not available to learners under 18');
  }
}
