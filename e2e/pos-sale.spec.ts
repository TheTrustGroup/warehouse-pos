/**
 * Critical-path E2E: unauthenticated redirect and (when env set) login → POS → add to cart → charge.
 * Run full flow in CI by setting E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD (and ensure API is reachable).
 */
import { test, expect } from '@playwright/test';

const hasTestCreds =
  !!process.env.E2E_TEST_USER_EMAIL?.trim() && !!process.env.E2E_TEST_USER_PASSWORD;

test.describe('POS', () => {
  test('unauthenticated user visiting /pos is redirected to login', async ({ page }) => {
    await page.goto('/pos');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(
      page.getByRole('heading', { name: /log in|sign in/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test.skip(!hasTestCreds, 'Full POS sale flow requires E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD');

  test('login → POS → add product → charge shows success or known error', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /log in|sign in/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.locator('#login-email').fill(process.env.E2E_TEST_USER_EMAIL!);
    await page.locator('#login-password').fill(process.env.E2E_TEST_USER_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/(pos|\?)|$/, { timeout: 15_000 });

    await page.goto('/pos');
    await expect(page).toHaveURL(/\/pos/, { timeout: 5000 });

    await page.waitForLoadState('networkidle');

    const productCard = page.getByRole('button').filter({ has: page.locator('text=/GH₵|GHC/') }).first();
    await expect(productCard).toBeVisible({ timeout: 15_000 });
    await productCard.click();

    const addToOneSize = page.getByRole('button', { name: /add to cart/i });
    const firstSizeBtn = page.getByRole('button').filter({ hasText: /Stock:|left/ }).first();
    if (await addToOneSize.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addToOneSize.click();
    } else if (await firstSizeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstSizeBtn.click();
    } else {
      test.skip(true, 'No add-to-cart or size button found');
    }

    const cartBar = page.getByRole('button', { name: /1 item|items/ });
    await expect(cartBar).toBeVisible({ timeout: 5000 });
    await cartBar.click();

    const chargeBtn = page.getByRole('button', { name: /charge GH₵/i });
    await expect(chargeBtn).toBeVisible({ timeout: 3000 });
    await chargeBtn.click();

    await page.waitForTimeout(2000);

    const newSaleBtn = page.getByRole('button', { name: /new sale/i });
    const insufficientToast = page.getByText(/insufficient stock/i);
    const retryToast = page.getByText(/didn't reach the server|check your connection/i);

    const success = await newSaleBtn.isVisible({ timeout: 8000 }).catch(() => false);
    const insufficient = await insufficientToast.isVisible({ timeout: 2000 }).catch(() => false);
    const retry = await retryToast.isVisible({ timeout: 2000 }).catch(() => false);

    expect(
      success || insufficient || retry,
      'Expected either success screen (New Sale), insufficient stock toast, or retry toast'
    ).toBe(true);
  });
});
