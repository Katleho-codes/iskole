/**
 * Profile and preference data access. Every function takes `userId` first (see ./owned.ts
 * for the ownership rule). These models are one-per-user, so ownership is enforced by the
 * unique key on `userId` rather than by an id the client supplies: a learner cannot pass
 * someone else's id even by accident, because no route accepts one.
 */
import { prisma } from '../lib/prisma';
import { parseDateOfBirth, type PreferenceUpdateInput, type ProfileUpdateInput } from '@iskole/shared';
import { badRequest } from '../lib/http-error';

/** The learner's profile, created empty on first read so the caller always gets a row. */
export async function getOrCreateProfile(userId: string) {
  return prisma.profile.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/** Apply a validated partial update. Only the keys the caller sent are touched. */
export async function updateProfile(userId: string, input: ProfileUpdateInput) {
  const { dateOfBirth, ...rest } = input;
  let dateOfBirthValue: Date | undefined;
  if (dateOfBirth) {
    const parsed = parseDateOfBirth(dateOfBirth);
    if (!parsed) throw badRequest('date of birth is not a valid date');
    dateOfBirthValue = parsed;
  }

  return prisma.profile.upsert({
    where: { userId },
    create: { userId, ...rest, ...(dateOfBirthValue ? { dateOfBirth: dateOfBirthValue } : {}) },
    update: { ...rest, ...(dateOfBirthValue ? { dateOfBirth: dateOfBirthValue } : {}) },
  });
}

export async function getOrCreatePreferences(userId: string) {
  return prisma.preference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function updatePreferences(userId: string, input: PreferenceUpdateInput) {
  return prisma.preference.upsert({
    where: { userId },
    create: { userId, ...input },
    update: { ...input },
  });
}

/**
 * The only route that accepts a record id for profile data: nothing does yet. Exported so
 * later milestones use the shared helper rather than writing their own scoped query.
 */
export { getOwnedOrThrow, findOwned } from './owned';
