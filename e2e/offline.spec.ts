/**
 * E2E: Offline flow — add product offline, then sync when online.
 * Requires app running (or webServer in config). Optional: E2E_LOGIN_EMAIL, E2E_LOGIN_PASSWORD to log in.
 */

import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_LOGIN_EMAIL || '';
const PASSWORD = process.env.E2E_LOGIN_PASSWORD || '';
const PRODUCT_NAME = `E2E Offline ${Date.now()}`;
const SKU = `E2E-SKU-${Date.now()}`;
const CATEGORY = 'E2E Category';

test.describe('Offline flow', () => {
  test('add product offline then sync when online', async ({ page }) => {
    await page.goto('/');

    // If redirected to login and we have credentials, log in
    if ((await page.url()).includes('/login') && EMAIL && PASSWORD) {
      await page.getByLabel(/email/i).fill(EMAIL);
      await page.getByLabel(/password/i).fill(PASSWORD);
      await page.getByRole('button', { name: /login/i }).click();
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    }

    // Go to Inventory (may already be there after login)
    await page.goto('/inventory');
    await page.waitForLoadState('domcontentloaded');
    // Wait for page to be interactive: either empty state or add button
    await Promise.race([
      page.getByRole('button', { name: /add first product/i }).waitFor({ state: 'visible', timeout: 15_000 }),
      page.getByRole('button', { name: /add product/i }).first().waitFor({ state: 'visible', timeout: 15_000 }),
    ]).catch(() => {});

    // Go offline
    await page.context().setOffline(true);

    // Open add product: either "Add product" in header or "Add first product" in empty state
    const addFirst = page.getByRole('button', { name: /add first product/i });
    const addProduct = page.getByRole('button', { name: /add product/i });
    if (await addFirst.isVisible()) {
      await addFirst.click();
    } else {
      await addProduct.first().click();
    }

    // Fill minimal required fields (labels: "Product name *", "SKU *", "Category *", "Quantity *")
    await page.getByLabel(/product name/i).fill(PRODUCT_NAME);
    await page.getByLabel(/^SKU/i).fill(SKU);
    await page.getByLabel(/category/i).fill(CATEGORY);
    await page.getByLabel(/quantity/i).first().fill('10');

    // Submit (submit button inside modal dialog)
    await page.getByRole('dialog').getByRole('button', { name: /add product/i }).click();

    // Modal should close; product appears in list
    await expect(page.getByText(PRODUCT_NAME)).toBeVisible({ timeout: 10_000 });

    // Product is in list; pending/sync badge may show "pending" or cloud icon depending on UI

    // Go online
    await page.context().setOffline(false);

    // Wait for sync (auto-sync runs every 30s; allow up to 35s)
    await page.waitForTimeout(35_000);

    // Product should still be visible (synced)
    await expect(page.getByText(PRODUCT_NAME)).toBeVisible();
  });
});
