import { test, expect } from '@playwright/test';

test.describe('CRM & Customers', () => {
  test.beforeEach(async ({ page }) => {
    // Login as Platform Admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'quadem.agency@gmail.com');
    await page.fill('input[type="password"]', 'quadem@13');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/(dashboard|platform-admin)/, { timeout: 10000 });
  });

  test('should load Customers list and verify layout', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/customers');
    await expect(page).toHaveURL(/.*\/customers/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible({ timeout: 15000 });

    // Verify search input is present
    await expect(page.getByPlaceholder('e.g. Jane Doe or 0712345678')).toBeVisible();

    // Verify "Add Customer" button
    await expect(page.getByRole('button', { name: 'Add Customer' })).toBeVisible();

    // Verify there's a prompt to search
    await expect(page.locator('text=Search for a customer above to view their details.')).toBeVisible();
  });

  test('should load Marketing & Comms page', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/crm-communications');
    await expect(page).toHaveURL(/.*\/crm-communications/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Marketing & Comms' })).toBeVisible({ timeout: 15000 });

    // Verify tabs are present using specific locators to avoid strict mode violations
    await expect(page.locator('.modern-tab', { hasText: 'Send Campaign' })).toBeVisible();
    await expect(page.locator('.modern-tab', { hasText: 'Templates' })).toBeVisible();
    await expect(page.locator('.modern-tab', { hasText: 'Gateways' })).toBeVisible();
  });

  test('should create a new customer and search for it', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/customers');
    
    // Click Add Customer
    await page.getByRole('button', { name: 'Add Customer' }).click();
    
    // Fill form
    const uniquePhone = `07${Math.floor(10000000 + Math.random() * 90000000)}`;
    const customerName = `Test Customer ${uniquePhone}`;
    
    await page.getByLabel('Full Name').fill(customerName);
    await page.getByLabel('Phone Number').fill(uniquePhone);
    
    // Save
    await page.getByRole('button', { name: 'Save Customer' }).click();
    
    // Wait for modal to close
    await expect(page.getByRole('button', { name: 'Save Customer' })).toBeHidden({ timeout: 10000 });
    
    // Search for the newly created customer
    await page.getByPlaceholder('e.g. Jane Doe or 0712345678').fill(uniquePhone);
    await page.getByRole('button', { name: 'Search' }).click();
    
    // Verify the customer appears in the results
    await expect(page.getByRole('cell', { name: customerName })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('cell', { name: uniquePhone, exact: true })).toBeVisible();
  });
});
