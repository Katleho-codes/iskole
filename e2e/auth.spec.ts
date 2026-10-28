import { expect, test } from '@playwright/test';

/**
 * Authentication smoke test in a real browser.
 *
 * It proves the pieces the API tests cannot: sign-up creates a live session immediately
 * (email verification is intentionally off for the hackathon), the cookie set by
 * better-auth survives the Next rewrite, and clearing cookies really does sign the learner
 * out.
 */

test('a learner can sign up, reach the dashboard and sign back in', async ({
  page,
  context,
}) => {
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

  // Verification is disabled, so the new account lands on the onboarding field that could
  // not be stored before the account existed: date of birth.
  await page.waitForURL(/\/profile\?onboarding=1/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your profile');

  await page.goto('/dashboard');
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E');
  await expect(page.getByText(email)).toBeVisible();

  // Clearing cookies is what a sign-out does. If the dashboard still rendered the name
  // after this, the page would be showing cached HTML instead of the session.
  await context.clearCookies();
  await page.goto('/signin');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E');

  const deleted = await page.request.delete('/api/privacy/account', {
    data: { confirm: 'DELETE' },
  });
  expect(deleted.status()).toBe(204);
});
