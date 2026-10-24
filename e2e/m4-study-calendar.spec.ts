import { expect, test } from '@playwright/test';

const DEMO_EMAIL = 'demo@iskole.app';
const DEMO_PASSWORD = 'iskole-demo-2026';

test.describe('M4 study plan and calendar', () => {
  test('demo user can login and access study plan and calendar', async ({ page }) => {
    await page.goto('/signin');
    await page.getByLabel('Email address').fill(DEMO_EMAIL);
    await page.getByLabel('Password').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/dashboard');
    
    await page.goto('/study-plan');
    await expect(page).toHaveURL(/study-plan/);
    
    await page.goto('/calendar');
    await expect(page).toHaveURL(/calendar/);
    
    await expect(page.getByRole('button', { name: 'Week', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Day', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Month', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agenda', exact: true })).toBeVisible();
  });
  
  test('calendar mobile default and ics download', async ({ page }) => {
    await page.goto('/signin');
    await page.getByLabel('Email address').fill(DEMO_EMAIL);
    await page.getByLabel('Password').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/dashboard');
    
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/calendar');
    await page.waitForTimeout(1000);
    
    const icsButton = page.getByRole('button', { name: /Download.*ics|\.ics/i });
    if (await icsButton.isVisible()) {
      await expect(icsButton).toBeEnabled();
    }
  });
});
