import { test, expect } from '@playwright/test';
import { gotoApp } from '../helpers';

/**
 * The product page exists to answer "what happened to this product", and its
 * three event kinds are rendered by three different branches. A fixture with
 * only stock rows would leave two of them unexercised, so the counts here are
 * deliberately exact: they fail if a renderer stops producing its row.
 *
 * The click-through is asserted too. A product row opening its history rather
 * than the edit form is the behaviour this page was added for, and it lives in
 * two places (the table and the mobile card), so it is easy to half-change.
 */
test.describe('product detail', () => {
  test.skip(
    process.env.VITE_USE_MOCKS === 'empty',
    'asserts fixture rows; empty mode is covered by empty-states.spec.ts',
  );

  test('a product row opens its history page', async ({ page }) => {
    await gotoApp(page, '/inventory');
    await page.locator('tbody tr').first().click();

    await expect(page).toHaveURL(/\/inventory\/products\/p1$/);
    await expect(page.getByRole('heading', { name: 'Perfumed Rice 5kg' })).toBeVisible();

    await expect(page.locator('.pd-event--stock')).toHaveCount(3);
    await expect(page.locator('.pd-event--price')).toHaveCount(2);
    await expect(page.locator('.pd-event--edit')).toHaveCount(1);

    // Each kind states what happened, rather than showing a raw column value.
    await expect(page.locator('.pd-event--stock').first()).toContainText('Sold 2 units');
    await expect(page.locator('.pd-event--edit')).toContainText('Name changed from');
    await expect(page.locator('.pd-event--price').first()).toContainText('→');
  });

  test('editing is still reachable, from the product page', async ({ page }) => {
    await gotoApp(page, '/inventory/products/p1');
    await page.getByRole('button', { name: 'Edit Product' }).click();

    const modal = page.locator('.modal, [role="dialog"]').first();
    await expect(modal).toContainText('Edit Product');
    await expect(modal.getByRole('button', { name: 'Delete Product' })).toBeVisible();
  });

  test('back returns to the list', async ({ page }) => {
    await gotoApp(page, '/inventory/products/p1');
    await page.getByRole('button', { name: /Back to Inventory/ }).click();
    await expect(page).toHaveURL(/\/inventory$/);
  });
});
