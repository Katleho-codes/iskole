/**
 * Single Prisma client for the API (Prisma 7 driver adapter pattern,
 * docs: https://better-auth.com/docs/adapters/prisma#create-the-prisma-client).
 *
 * Rules that apply to every caller:
 * - Prisma only. Never $queryRawUnsafe, never string-built SQL.
 * - Every query that touches learner data is scoped by the authenticated user's id.
 *   The data-access layer (src/data) takes the user id as its first argument so
 *   ownership is enforced in one place instead of per route.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from './env';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
