/**
 * Data-access layer. Every function takes the authenticated user id as its FIRST argument.
 * Docs: iskole-build-instructions.md section 4 ("Every query goes through a data-access
 * layer that takes the authenticated user, so ownership is enforced in one place").
 *
 * The rule, stated once so it does not have to be reinvented per route:
 *
 *   1. Ownership is part of the query, not a check after it. We scope by `userId` in the
 *      WHERE clause, so another learner's row is never loaded in the first place. A
 *      read-then-compare would leave their data in memory and in any log line that
 *      touches it.
 *
 *   2. A missing row and another user's row are indistinguishable to the caller. Both
 *      return null, and the route turns null into 404. Returning 403 for someone else's
 *      record would confirm that the record exists, which is an information leak an
 *      attacker can enumerate with.
 *
 *   3. Functions that must not return null take the id and throw NotFound, so a route
 *      cannot forget to handle the empty case.
 *
 * This file is deliberately small for now: M2 adds the first owned models. The convention
 * matters more than the current contents, because it is the thing later milestones copy.
 */
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/http-error';

/**
 * Fetch one record owned by `userId`, or null. Never returns another user's record, and
 * never reveals whether one exists.
 */
export async function findOwned<T extends { userId: string }>(
  delegate: {
    findFirst: (args: {
      where: { id: string; userId: string };
    }) => Promise<T | null>;
  },
  userId: string,
  id: string,
): Promise<T | null> {
  return delegate.findFirst({ where: { id, userId } });
}

/**
 * Same as findOwned, but throws a 404 when nothing matches. Use where the route cannot
 * sensibly continue without the record.
 */
export async function getOwnedOrThrow<T extends { userId: string }>(
  delegate: {
    findFirst: (args: {
      where: { id: string; userId: string };
    }) => Promise<T | null>;
  },
  userId: string,
  id: string,
): Promise<T> {
  const record = await findOwned(delegate, userId, id);
  if (!record) throw notFound('not found');
  return record;
}

/** Exposed for tests and callers that need the raw client without an ownership scope. */
export { prisma };