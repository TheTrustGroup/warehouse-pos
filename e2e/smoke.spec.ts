/**
 * Minimal smoke: app loads and shows main content.
 * Run: npm run test:e2e (starts dev server if not running).
 */
import { test, expect } from '@playwright/test';

test('app loads and shows inventory or login', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  // Either Inventory page heading or Login / shell is visible
  const inventory = page.getByRole('heading', { name: /inventory/i });
  const loginOrShell = page.getByText(/login|sign in|inventory|dashboard/i).first();
  await expect(inventory.or(loginOrShell)).toBeVisible({ timeout: 15_000 });
});
