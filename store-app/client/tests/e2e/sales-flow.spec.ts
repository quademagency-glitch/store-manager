import { test, expect } from '@playwright/test';

test.describe('Sale Process Flow', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'quadem.agency@gmail.com');
    await page.fill('input[type="password"]', 'quadem@13');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/(dashboard|platform-admin)/, { timeout: 10000 });
  });

  test('should complete a full sale process', async ({ page }) => {
    test.setTimeout(60000);
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
    page.on('response', async response => {
      if (response.url().includes('/api/')) {
        console.log('API RESPONSE:', response.status(), response.url());
        if (response.status() >= 400) {
          try {
            const body = await response.text();
            console.log('ERROR BODY:', body);
          } catch (e) {
            // ignore if body cannot be read
          }
        }
      }
    });
    // Wait for the location to be auto-selected (check sidebar or navbar)
    // Actually, Platform Admin might not be redirected to /dashboard, let's just go to /dashboard
    await page.goto('/dashboard');
    await expect(page.locator('button').filter({ hasText: 'Select Branch' })).toBeHidden({ timeout: 10000 });

    // Navigate to Sales POS
    await page.goto('/sales');
    await expect(page).toHaveURL(/.*\/sales/);

    // 2. Start a New Sale
    const newSaleButton = page.locator('h2').filter({ hasText: 'New Sale' }).first();
    await expect(newSaleButton).toBeVisible({ timeout: 10000 });
    await newSaleButton.click();

    // 3. Customer Selection (Step 1)
    await expect(page.locator('h2').filter({ hasText: 'Customer Identification' }).first()).toBeVisible();
    
    // Generate random phone to ensure uniqueness and pass validation (no leading 0 after +1)
    const randomPhone = '+1' + (Math.floor(Math.random() * 8000000000) + 2000000000).toString();
    
    // Just click the manual add button directly
    const manualAddBtn = page.locator('button').filter({ hasText: '+ Add New Customer Manually' }).first();
    await manualAddBtn.click();
    
    // Fill out new customer modal
    await expect(page.locator('h2').filter({ hasText: 'Add New Customer' }).first()).toBeVisible();
    await page.fill('input[name="name"]', 'Walk-in Customer');
    await page.fill('input[name="phone"]', randomPhone);
    await page.click('button[type="submit"]');

    // Wait for the modal to close
    await expect(page.locator('h2').filter({ hasText: 'Add New Customer' })).not.toBeVisible({ timeout: 10000 });

    // Click Continue to Sale
    const continueBtn = page.locator('button').filter({ hasText: 'Continue to Sale' }).first();
    await expect(continueBtn).toBeVisible();
    await continueBtn.click();

    // 4. Add Items (Step 2)
    await expect(page.locator('h2').filter({ hasText: '2. Order Items' }).first()).toBeVisible();
    const addItemBtn = page.locator('button').filter({ hasText: '+ Add Item' }).first();
    await addItemBtn.click();

    // Select the first product from the modal
    const selectProductBtn = page.locator('button').filter({ hasText: 'Select' }).first();
    await expect(selectProductBtn).toBeVisible({ timeout: 5000 });
    await selectProductBtn.click();

    // 5. Scan QR code (Mocked via DEV button)
    const scanBtn = page.locator('button').filter({ hasText: 'Scan QR' }).first();
    await expect(scanBtn).toBeVisible();
    await scanBtn.click();

    // Click the DEV simulate scan button
    const devScanBtn = page.locator('button').filter({ hasText: '[DEV] Simulate Scan' }).first();
    await expect(devScanBtn).toBeVisible();
    await devScanBtn.click();

    // 6. Checkout / Payment
    const checkoutBtn = page.locator('button').filter({ hasText: 'Hold & Continue to Payment' }).first();
    await expect(checkoutBtn).toBeVisible();
    // Wait for the button to become enabled (it requires the scan to process)
    await expect(checkoutBtn).toBeEnabled();
    await checkoutBtn.click();

    // Payment Modal
    await expect(page.locator('h2').filter({ hasText: 'Complete Payment' }).first()).toBeVisible({ timeout: 30000 });
    
    // Fill exact amount (or just click Finalize if it defaults to full amount)
    const amountDueElement = page.locator('div').filter({ hasText: 'Total Amount Due:' }).locator('span').last();
    // In our simplified test, we'll just try to click Finalize. If amount is required, we'll need to parse it.
    // The payment modal has an input for amount_paid
    const amountInput = page.locator('input[type="number"]').first();
    // Get the total amount text, strip non-numeric
    // (Unused, we just fill 999999 below)
    // Let's just enter a large number to ensure it covers the amount
    await amountInput.fill('999999');
    
    const finalizeBtn = page.locator('button').filter({ hasText: 'Finalize Sale' }).first();
    await finalizeBtn.click();

    // 7. Verify Receipt
    await expect(page.locator('h2').filter({ hasText: 'Transaction Details' }).first()).toBeVisible({ timeout: 10000 });
  });
});
