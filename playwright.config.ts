import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the flows that only exist end to end: the better-auth cookie crossing
 * the Next rewrite, server-rendered session checks, and hydration. Everything with business
 * rules is covered faster by the API suite in `apps/api/tests`; this is deliberately small.
 *
 * Run with `pnpm test:e2e`. If the dev servers are already up, Playwright reuses them;
 * otherwise it starts the API and web app. PostgreSQL is expected to be running already
 * (`pnpm dev:db`). Set `E2E_BASE_URL` to test a deployment and skip the local servers.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'pnpm dev:api',
          url: 'http://localhost:4010/api/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: 'pnpm dev:web',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
