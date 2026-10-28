import { expect, test, type Page } from '@playwright/test';

/**
 * Direct messaging, end to end in a real browser.
 *
 * Two accounts: a fresh learner created through the real sign-up form, and the seeded demo
 * account. The test proves search by email, starting a conversation, sending, replying from
 * the other side and persistence after signing back in. It also asserts that the strict CSP
 * is not violated by the theme script (an inline script that once lacked its nonce).
 */

const DEMO_EMAIL = 'demo@iskole.app';
const DEMO_PASSWORD = 'iskole-demo-2026';
const DEMO_NAME = 'Thandi Mokoena';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/signin');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: /Sign out/ }).click();
  await page.waitForURL(/\/signin/);
}

async function openConversationWith(page: Page, name: string) {
  await page.goto('/messages');
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: name })).toBeVisible();
}

function thread(page: Page) {
  return page.locator('[aria-live="polite"]');
}

test('a learner can find someone by email, start a chat and exchange messages', async ({ page }) => {
  const cspErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
      cspErrors.push(message.text());
    }
  });

  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const learnerEmail = `messages-${unique}@example.test`;
  const learnerPassword = 'iskole-messages-password-123';
  const learnerName = 'Message Learner';

  // 1. Create the second account through the real sign-up form.
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(learnerName);
  await page.getByLabel('Date of birth').fill('2001-02-03');
  await page.getByLabel('Email address').fill(learnerEmail);
  await page.getByLabel('Password', { exact: true }).fill(learnerPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL(/\/profile\?onboarding=1/);

  // 2. Search the demo account by email and start a conversation.
  await page.goto('/messages');
  await page.getByLabel('Search by email').fill(DEMO_EMAIL);
  await page.getByLabel('Search by email').press('Enter');
  await expect(page.getByText(DEMO_EMAIL).first()).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).first().click();
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: DEMO_NAME })).toBeVisible();

  // 3. Send the first message.
  const firstBody = `Hello ${DEMO_NAME}, this is ${learnerName}. ${unique}`;
  await page.getByPlaceholder('Type a message...').fill(firstBody);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread(page).getByText(firstBody)).toBeVisible();

  // 4. Reply as the demo account.
  await signOut(page);
  await signIn(page, DEMO_EMAIL, DEMO_PASSWORD);
  await openConversationWith(page, learnerName);
  await expect(thread(page).getByText(firstBody)).toBeVisible();

  const replyBody = `Hi ${learnerName}, Thandi here. ${unique}`;
  await page.getByPlaceholder('Type a message...').fill(replyBody);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(thread(page).getByText(replyBody)).toBeVisible();

  // 5. Back as the learner, the reply persisted.
  await signOut(page);
  await signIn(page, learnerEmail, learnerPassword);
  await openConversationWith(page, DEMO_NAME);
  await expect(thread(page).getByText(replyBody)).toBeVisible();

  // 6. The composer refuses an empty send, and the page stacks on a phone viewport.
  const sendButton = page.getByRole('button', { name: 'Send', exact: true });
  await expect(sendButton).toBeDisabled();
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/messages');
  await expect(page.getByLabel('Search by email')).toBeVisible();

  expect(cspErrors, `CSP violations: ${cspErrors.join('\n')}`).toHaveLength(0);
});

test('blocking from a thread stops messaging and can be undone', async ({ page, request }) => {
  // A learner to block, created through the API. The demo account is the one clicking.
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const blockedEmail = `messages-block-${unique}@example.test`;
  const signUp = await request.post('http://localhost:8004/api/auth/sign-up/email', {
    headers: { Origin: 'http://localhost:3004' },
    data: {
      name: 'Blocked Learner',
      email: blockedEmail,
      password: 'iskole-messages-password-123',
    },
  });
  expect(signUp.ok()).toBeTruthy();

  await signIn(page, DEMO_EMAIL, DEMO_PASSWORD);
  await page.goto('/messages');
  await page.getByLabel('Search by email').fill(blockedEmail);
  await page.getByLabel('Search by email').press('Enter');
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('[data-slot="card-title"]').filter({ hasText: 'Blocked Learner' })).toBeVisible();

  // Block: confirm the dialog, then the composer is disabled and the notice appears.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'You blocked' })).toBeVisible();
  await expect(page.getByPlaceholder('Unblock to send a message')).toBeDisabled();

  // Starting a chat with a blocked person surfaces the API refusal instead of failing quietly.
  await page.getByLabel('Search by email').fill(blockedEmail);
  await page.getByLabel('Search by email').press('Enter');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'cannot start a conversation' })).toBeVisible();

  // Unblock: the composer comes back.
  await page.getByRole('button', { name: 'Unblock', exact: true }).click();
  await expect(page.getByPlaceholder('Type a message...')).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: 'You blocked' })).toHaveCount(0);
});
