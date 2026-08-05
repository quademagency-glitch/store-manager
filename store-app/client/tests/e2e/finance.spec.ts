import { test, expect } from '@playwright/test';

test.describe('Finance & Accounting', () => {
  test.beforeEach(async ({ page }) => {
    // Login as Platform Admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'quadem.agency@gmail.com');
    await page.fill('input[type="password"]', 'quadem@13');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/(dashboard|platform-admin)/, { timeout: 10000 });
  });

  test('should load Accounts Receivable', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/accounts-receivable');
    await expect(page).toHaveURL(/.*\/accounts-receivable/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Accounts Receivable' })).toBeVisible({ timeout: 15000 });

    // Verify "New Invoice" button
    await expect(page.getByRole('button', { name: 'New Invoice' })).toBeVisible();

    // Verify tabs
    await expect(page.getByRole('button', { name: 'Invoices', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aging Report', exact: true })).toBeVisible();
  });

  test('should load Accounts Payable', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/accounts-payable');
    await expect(page).toHaveURL(/.*\/accounts-payable/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Accounts Payable' })).toBeVisible({ timeout: 15000 });

    // Verify "New Bill" button
    await expect(page.getByRole('button', { name: 'New Bill' })).toBeVisible();
  });

  test('should load Accounting Entries', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/accounting-templates');
    await expect(page).toHaveURL(/.*\/accounting-templates/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Accounting Entries' })).toBeVisible({ timeout: 15000 });

    // Verify Search input
    await expect(page.getByPlaceholder('Search templates...')).toBeVisible();
  });

  test('should load Billing & Subscription', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/business-admin/billing');
    await expect(page).toHaveURL(/.*\/business-admin\/billing/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Billing & Subscription' })).toBeVisible({ timeout: 15000 });
  });
});
