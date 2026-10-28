import { expect, test } from '@playwright/test';

/**
 * Dark mode: the top-bar toggle flips the `dark` class, survives a reload, and the
 * next-themes inline script runs under the strict CSP (nonce from `proxy.ts`).
 */

const DEMO_EMAIL = 'demo@iskole.app';
const DEMO_PASSWORD = 'iskole-demo-2026';

test('the top-bar toggle switches between light and dark and remembers the choice', async ({
  page,
}) => {
  const cspErrors: string[] = [];
  const hydrationErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Content Security Policy/i.test(text)) cspErrors.push(text);
    if (/hydrat/i.test(text)) hydrationErrors.push(text);
  });

  await page.goto('/signin');
  await page.getByLabel('Email address').fill(DEMO_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);

  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(243, 245, 249)');

  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(html).toHaveClass(/dark/);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 38)');

  // The choice is stored, so a reload comes back dark without a flash of light content.
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  expect(cspErrors, `CSP violations: ${cspErrors.join('\n')}`).toHaveLength(0);
  expect(hydrationErrors, `Hydration mismatches: ${hydrationErrors.join('\n')}`).toHaveLength(0);
});
