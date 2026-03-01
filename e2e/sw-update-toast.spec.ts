import { test, expect } from '@playwright/test';

test.describe('SW update toast', () => {
  test('shows toast with Refresh button when sw-update is dispatched', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /log in|sign in/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('sw-update'));
    });

    const toast = page.getByRole('alert').filter({ hasText: /App updated|Tap Refresh|load the latest/i });
    await expect(toast).toBeVisible({ timeout: 3000 });

    const refreshBtn = toast.getByRole('button', { name: 'Refresh' });
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toBeEnabled();
  });

  test('Refresh button is clickable and causes reload', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /log in|sign in/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('sw-update'));
    });

    const refreshBtn = page
      .getByRole('alert')
      .filter({ hasText: /Refresh|updated|latest/i })
      .getByRole('button', { name: 'Refresh' });
    await expect(refreshBtn).toBeVisible({ timeout: 3000 });

    await refreshBtn.click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL(/\/login/);
  });
});
