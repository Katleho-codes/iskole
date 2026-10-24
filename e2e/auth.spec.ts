import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Authentication smoke test in a real browser.
 *
 * It proves the pieces the API tests cannot: sign-up sends a real verification email, the
 * link signs the learner in, the session cookie set by better-auth survives the Next
 * rewrite, and clearing cookies really does sign the learner out.
 *
 * Mailpit is a documented local dependency (`pnpm dev:db`). The test reads the message over
 * Mailpit's HTTP API rather than bypassing verification in the app.
 */
async function verificationUrl(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const list = await request.get('http://localhost:8025/api/v1/messages');
    if (list.ok()) {
      const data = (await list.json()) as {
        messages?: Array<{ ID: string; Subject: string; To?: Array<{ Address?: string }> }>;
      };
      const message = data.messages?.find(
        (candidate) =>
          candidate.Subject === 'Verify your iskole email' &&
          candidate.To?.some((recipient) => recipient.Address === email),
      );
      if (message) {
        const detail = await request.get(`http://localhost:8025/api/v1/message/${message.ID}`);
        if (detail.ok()) {
          const body = (await detail.json()) as { Text?: string };
          const url = body.Text?.match(/https?:\/\/\S+/)?.[0];
          if (url) return url;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no verification email arrived for ${email}`);
}

test('a learner can sign up, verify, reach the dashboard and sign back in', async ({
  page,
  context,
  request,
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

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  // Open the real link from Mailpit. better-auth verifies the token, creates a session and
  // follows the callback to the one onboarding field it could not store before the account
  // existed (date of birth). The dashboard is one navigation away, with a live session.
  await page.goto(await verificationUrl(request, email));
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
