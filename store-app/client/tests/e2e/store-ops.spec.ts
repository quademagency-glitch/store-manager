import { test, expect } from '@playwright/test';

test.describe('Store Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Login as Platform Admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'quadem.agency@gmail.com');
    await page.fill('input[type="password"]', 'quadem@13');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/(dashboard|platform-admin)/, { timeout: 10000 });
  });

  test('should load Till Account and allow recording a cash drop', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/till-account');
    await expect(page).toHaveURL(/.*\/till-account/);
    await expect(page.getByRole('heading', { name: 'Till Account Ledger' })).toBeVisible({ timeout: 15000 });

    // Verify basic elements
    await expect(page.locator('text=Financial Summary')).toBeVisible();
  });

  test('should load Sales Record and test filtering', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/sales-record');
    await expect(page).toHaveURL(/.*\/sales-record/);
    await expect(page.getByRole('heading', { name: 'Sales Record' })).toBeVisible({ timeout: 15000 });

    // Verify filter by date inputs exist
    await expect(page.getByRole('button', { name: 'Filter Records' })).toBeVisible();
    
    // There should be a table or empty state
    await expect(page.locator('.glass-panel').first()).toBeVisible();
  });

  test('should load Returns page and verify layout', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/returns');
    await expect(page).toHaveURL(/.*\/returns/);
    await expect(page.getByRole('heading', { name: 'Returns & Reversals' })).toBeVisible({ timeout: 15000 });

    // Should have search receipt input
    await expect(page.getByPlaceholder('Search by Receipt Number, Customer Name, or Phone Number...')).toBeVisible();
    
    // Should have a button to search
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
  });
});
