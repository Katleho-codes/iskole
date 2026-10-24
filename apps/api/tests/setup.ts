/**
 * Vitest global setup. Runs once before the whole suite.
 *
 * The auth tests exercise better-auth against a real PostgreSQL database, because that is
 * where sessions, verification tokens and rate-limit counters actually live. Mocking the
 * database there would test the mocks, not the auth.
 *
 * This applies the committed migrations to the iskole_test database. It never touches the
 * development database: the URL comes from vitest.config.ts and points at iskole_test.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');

export default function setup() {
  // vitest's `test.env` is only applied inside test workers, not here, so the test
  // database URL is set explicitly. It must never equal the development database.
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ?? 'postgresql://iskole:iskole@localhost:5434/iskole_test?schema=public';
  process.env.DATABASE_URL = testDatabaseUrl;

  // Invoke the Prisma CLI's JS entry with the current Node binary. No shell, so no
  // argument-escaping concerns and no child-process deprecation warning.
  const prismaCli = path.join(apiRoot, 'node_modules', 'prisma', 'build', 'index.js');

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'inherit',
  });
}
