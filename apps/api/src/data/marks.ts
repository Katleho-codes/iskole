/**
 * Subject mark data access. `userId` is always first and always from the session.
 *
 * Marks are keyed by (userId, subject), so a repeat save updates the existing mark instead
 * of creating a duplicate. That is a real property, not a nicety: a learner correcting
 * "Maths 62" to "Maths 68" should not end up with two Maths rows feeding the APS calculator.
 */
import { prisma } from '../lib/prisma';
import type { MarkCreateInput } from '@iskole/shared';

/** Upsert one mark for this learner. Ownership is the userId in the unique key. */
export async function upsertMark(userId: string, input: MarkCreateInput) {
  return prisma.subjectMark.upsert({
    where: { userId_subject: { userId, subject: input.subject } },
    create: {
      userId,
      subject: input.subject,
      mark: input.mark,
      isHomeLanguage: input.isHomeLanguage ?? false,
    },
    update: {
      mark: input.mark,
      isHomeLanguage: input.isHomeLanguage ?? false,
    },
  });
}

/** All of this learner's marks, newest subject name order for stable output. */
export async function listMarks(userId: string) {
  return prisma.subjectMark.findMany({
    where: { userId },
    orderBy: { subject: 'asc' },
  });
}
