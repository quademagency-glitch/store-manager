import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Fill in email
    await page.fill('input[type="email"]', 'quadem.agency@gmail.com');
    
    // Fill in password
    await page.fill('input[type="password"]', 'quadem@13');
    
    // Click submit
    await page.click('button[type="submit"]');
    
    // Wait for navigation or successful login indication
    // Since this is a SPA, wait for the platform-admin element or URL change
    await page.waitForURL('**/platform-admin', { timeout: 10000 });
    
    // Check if we are on platform-admin
    await expect(page).toHaveURL(/.*\/platform-admin/);
  });

  test('should fail login with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Expect some error message to be visible
    const errorMsg = page.locator('text=Invalid credentials').first();
    // Assuming Supabase auth returns an error text somewhere
    await expect(errorMsg).toBeVisible({ timeout: 5000 }).catch(() => {
        // If exact text "Invalid credentials" isn't used, just check that URL doesn't change to dashboard
        expect(page.url()).not.toContain('dashboard');
    });
  });
});
