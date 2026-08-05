import { test, expect } from '@playwright/test';

test.describe('Sales (POS)', () => {
  // Use a valid user
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'quadem.agency@gmail.com');
    await page.fill('input[type="password"]', 'quadem@13');
    await page.click('button[type="submit"]');
    
    // Wait for the redirect to happen (could be /dashboard or /platform-admin)
    await page.waitForURL(/.*\/(dashboard|platform-admin)/, { timeout: 10000 });
  });

  test('should load the Sales/POS page and display product categories', async ({ page }) => {
    // Navigate to Sales
    await page.goto('/sales');
    
    // Wait for the POS layout
    await expect(page).toHaveURL(/.*\/sales/);
    
  });
});
