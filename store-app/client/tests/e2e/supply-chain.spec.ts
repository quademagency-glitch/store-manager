import { test, expect } from '@playwright/test';

test.describe('Supply Chain & Purchasing', () => {
  test.beforeEach(async ({ page }) => {
    // Login as Platform Admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'quadem.agency@gmail.com');
    await page.fill('input[type="password"]', 'quadem@13');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/(dashboard|platform-admin)/, { timeout: 10000 });
  });

  test('should load Suppliers', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/suppliers');
    await expect(page).toHaveURL(/.*\/suppliers/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Suppliers' })).toBeVisible({ timeout: 15000 });

    // Verify "Add Supplier" button
    await expect(page.getByRole('button', { name: 'Add Supplier' })).toBeVisible();
  });

  test('should load Purchase Orders', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/purchase-orders');
    await expect(page).toHaveURL(/.*\/purchase-orders/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible({ timeout: 15000 });

    // Verify "Create PO" button
    await expect(page.getByRole('button', { name: 'Create PO' })).toBeVisible();
  });
});
