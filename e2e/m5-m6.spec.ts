import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * M5 (money, nudges, wellness) and M6 (privacy centre, notifications) in a real browser.
 *
 * A fresh learner is created through the real sign-up and verification flow so the test does
 * not depend on demo rows left over from an earlier run. The payday nudge is triggered from
 * the Money page, which proves the demo trigger, the notification list and the sidebar badge
 * in one pass. The account is deleted through the Privacy centre at the end.
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

async function createVerifiedLearner(page: Page, request: APIRequestContext) {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `m5m6-${unique}@example.test`;
  const password = 'iskole-m5-m6-password-123';

  await page.goto('/signup');
  await page.getByLabel('Your name').fill('M5 M6 Learner');
  await page.getByLabel('Date of birth').fill('2001-02-03');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.goto(await verificationUrl(request, email));
  await page.waitForURL(/\/profile\?onboarding=1/);

  return { email, password };
}

test('money, wellness, notifications and the privacy centre work for a learner', async ({
  page,
  request,
}) => {
  const { email } = await createVerifiedLearner(page, request);

  // ---- M5: Money -----------------------------------------------------------------
  await page.goto('/money');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Money');

  const uniqueDescription = `E2E snack ${Date.now()}`;
  await page.getByLabel('Amount (R)').first().fill('7.50');
  await page.getByLabel('Description (optional)').fill(uniqueDescription);
  await page.getByRole('checkbox', { name: 'Remind me on payday' }).check();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByText(uniqueDescription)).toBeVisible();
  await expect(page.getByText('R7.50').first()).toBeVisible();

  await page.locator('#budget-amount').fill('250');
  await page.getByRole('button', { name: 'Save budget' }).click();
  await expect(page.getByText('Budget saved')).toBeVisible();

  // Set payday to today in Johannesburg so the demo trigger definitely writes a nudge.
  const todayDay = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Johannesburg',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day === lastDay ? 0 : day;
  });

  await page.locator('#payday').fill(String(todayDay));
  await page.getByRole('button', { name: 'Save payday' }).click();
  await expect(page.getByText('Payday updated')).toBeVisible();

  await page.getByRole('button', { name: 'Run demo nudge' }).click();
  await expect(page.getByText('Nudge generated if today is payday')).toBeVisible();

  // ---- M6: Notifications and unread badge ---------------------------------------
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifications');
  await expect(page.getByText('Payday check-in')).toBeVisible();
  await expect(page.getByRole('main').getByText(email)).toHaveCount(0);

  const notificationsLink = page.getByRole('link', { name: /Notifications/ }).first();
  await expect(notificationsLink).toContainText(/\d+/);

  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByText('All marked as read')).toBeVisible();
  await expect(page.getByText('All caught up', { exact: false }).first()).toBeVisible();

  // ---- M5: Wellness booking and cancellation ------------------------------------
  await page.goto('/wellness');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wellness');

  await page.getByLabel('Booking reason').click();
  await page.getByRole('option', { name: 'Study skills and planning' }).click();

  const bookButton = page.getByRole('button', { name: 'Book slot' }).first();
  await expect(bookButton).toBeVisible();
  const slotRow = bookButton.locator('xpath=ancestor::li');
  const topic = (await slotRow.locator('p').first().innerText()).trim();

  await bookButton.click();
  await expect(page.getByText('Clinic session booked')).toBeVisible();
  await expect(page.getByText(topic).last()).toBeVisible();
  await expect(page.getByText('Reason: Study skills and planning')).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await expect(page.getByText('Booking cancelled')).toBeVisible();

  // ---- M6: Privacy centre --------------------------------------------------------
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy and data');

  await page.getByRole('switch').nth(1).click();
  await expect(page.getByText('Consent granted')).toBeVisible();
  await expect(page.getByText('AI study-plan assistance').first()).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('iskole-data-export.json');

  await page.getByRole('link', { name: 'Privacy notice' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy notice');
  await page.goto('/privacy/terms');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of use');
  await page.goto('/privacy/officer');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Information officer');
  await page.goto('/privacy/ai');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('How iskole uses AI');

  // ---- Account deletion through the privacy centre ------------------------------
  await page.goto('/privacy');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Delete your account')).toBeVisible();
  await dialog.getByLabel(/Type DELETE to continue/).fill('DELETE');
  await dialog.getByRole('button', { name: 'Delete account' }).click();

  await page.waitForURL('**/signin');
});
