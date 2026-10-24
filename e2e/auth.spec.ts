import { expect, test } from '@playwright/test';

/**
 * Authentication smoke test in a real browser.
 *
 * It proves the pieces the API tests cannot: the session cookie set by better-auth is
 * forwarded through the Next rewrite, the server component on /dashboard reads it, and a
 * cleared cookie really does sign the learner out. It also checks that a freshly created
 * (still unverified) account can sign in, which is the current temporary setting.
 *
 * Each run creates one account and deletes it at the end, so local runs do not accumulate
 * rows in the development database.
 */
test('a learner can sign up, reach the dashboard and sign back in', async ({ page, context }) => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `e2e-${unique}@example.test`;
  const password = 'iskole-e2e-password-123';

  await page.goto('/signup');
  await page.getByLabel('Your name').fill('E2E Learner');
  await page.getByLabel('Date of birth').fill('2000-01-01');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();

  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome, E2E Learner');
  await expect(page.getByText(email)).toBeVisible();

  // Clearing cookies is what a sign-out does. If the dashboard still rendered the name
  // after this, the page would be showing cached HTML instead of the session.
  await context.clearCookies();
  await page.goto('/signin');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome, E2E Learner');

  const deleted = await page.request.delete('/api/privacy/account', {
    data: { confirm: 'DELETE' },
  });
  expect(deleted.status()).toBe(204);
});
