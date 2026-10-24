/**
 * Prisma 7 configuration.
 * Docs: https://www.prisma.io/docs/orm/reference/prisma-config-reference
 *
 * The datasource URL comes from the repo-root .env (gitignored). Prisma 7 no longer
 * reads .env automatically through the schema, so it is loaded here.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { PrismaConfig } from 'prisma';

// apps/api/prisma.config.ts -> repo root is two levels up.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
config({ path: path.join(repoRoot, '.env'), quiet: true });

const prismaConfig: PrismaConfig = {
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
};

export default prismaConfig;
