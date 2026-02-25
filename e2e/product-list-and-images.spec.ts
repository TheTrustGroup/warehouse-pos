/**
 * Smoke: app loads; when product list is visible, at least one card has image or placeholder.
 * Run with: npm run test:e2e (starts dev server if not running).
 */
import { test, expect } from '@playwright/test';

test('app loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/(login|pos|inventory|dashboard)?/);
  await expect(page.locator('body')).toBeVisible();
});

test('when product list is visible, at least one card has image or placeholder', async ({ page }) => {
  await page.goto('/inventory');
  await page.waitForLoadState('domcontentloaded');
  const loginVisible = await page.getByRole('heading', { name: /login|sign in/i }).isVisible().catch(() => false);
  if (loginVisible) {
    test.skip();
    return;
  }
  const cardWithMedia = page.locator('button, [class*="card"]').filter({ has: page.locator('img, svg') }).first();
  await expect(cardWithMedia).toBeVisible({ timeout: 20000 });
  const hasImg = await cardWithMedia.locator('img').first().isVisible().catch(() => false);
  const hasSvg = await cardWithMedia.locator('svg').first().isVisible().catch(() => false);
  expect(hasImg || hasSvg).toBeTruthy();
});
