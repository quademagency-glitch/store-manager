import { test, expect } from '@playwright/test';

test.describe('Inventory Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'quadem.agency@gmail.com');
    await page.fill('input[type="password"]', 'quadem@13');
    await page.click('button[type="submit"]');
    
    // Wait for login
    await page.waitForURL(/.*\/(dashboard|platform-admin)/, { timeout: 10000 });
  });

  test('should load the Inventory page and add a product', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
    test.setTimeout(60000);

    // Navigate to Inventory
    await page.goto('/inventory');
    await expect(page).toHaveURL(/.*\/inventory/);
    // Wait for the Inventory page to fully load
    await expect(page.getByRole('heading', { name: 'Inventory Management' })).toBeVisible({ timeout: 15000 });
    
    // Click Add Product
    await page.getByTitle('Add Product').click();
    await expect(page.locator('h2').filter({ hasText: 'Add New Product' })).toBeVisible({ timeout: 10000 });

    // Fill Product Details
    const uniqueSku = `TEST-SKU-${Date.now()}`;
    await page.fill('input#prod-name', 'Test Product');
    await page.fill('input#prod-sku', uniqueSku);
    await page.fill('input#prod-category', 'Testing');
    await page.fill('input#prod-price', '19.99');
    await page.fill('input#prod-cost', '9.99');
    await page.fill('input#prod-qty', '100');

    // Select the first location if available
    const locationSelect = page.locator('select#prod-loc');
    await locationSelect.waitFor({ state: 'visible' });
    const options = await locationSelect.locator('option').allInnerTexts();
    if (options.length > 1) {
      await locationSelect.selectOption({ index: 1 });
    }

    // Submit the form
    await page.click('button[type="submit"]:has-text("Save Product")');

    // Wait for modal to close and table to update
    await expect(page.locator('h2').filter({ hasText: 'Add New Product' })).toBeHidden({ timeout: 10000 });

    // Verify the product is in the table
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill(uniqueSku);
    
    // The table should eventually contain the product
    await expect(page.locator('table.glass-table')).toContainText(uniqueSku, { timeout: 15000 });
    await expect(page.locator('table.glass-table')).toContainText('Test Product');
  });
});
