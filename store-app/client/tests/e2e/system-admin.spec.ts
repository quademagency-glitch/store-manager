import { test, expect } from '@playwright/test';

test.describe('System Administration', () => {
  test.beforeEach(async ({ page }) => {
    // Login as Platform Admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'quadem.agency@gmail.com');
    await page.fill('input[type="password"]', 'quadem@13');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/(dashboard|platform-admin)/, { timeout: 10000 });
  });

  test('should load Settings & Access Control', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/settings');
    await expect(page).toHaveURL(/.*\/settings/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Settings & Access Control' })).toBeVisible({ timeout: 15000 });
  });

  test('should load Platform Admin', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/platform-admin');
    await expect(page).toHaveURL(/.*\/platform-admin/);
    
    // Verify heading in sidebar
    await expect(page.getByRole('heading', { name: 'Platform Admin', exact: true })).toBeVisible({ timeout: 15000 });
    
    // Verify tabs
    await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Businesses', exact: true })).toBeVisible();
  });

  test('should load Business Organization', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/business-admin/organization');
    await expect(page).toHaveURL(/.*\/business-admin\/organization/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Organization Settings' })).toBeVisible({ timeout: 15000 });
  });

  test('should load Team Management', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/business-admin/team');
    await expect(page).toHaveURL(/.*\/business-admin\/team/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Team Management' })).toBeVisible({ timeout: 15000 });
  });

  test('should load Roles & Permissions', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/business-admin/roles');
    await expect(page).toHaveURL(/.*\/business-admin\/roles/);
    
    // Verify heading
    await expect(page.getByRole('heading', { name: 'Roles & Permissions' })).toBeVisible({ timeout: 15000 });
  });
});
