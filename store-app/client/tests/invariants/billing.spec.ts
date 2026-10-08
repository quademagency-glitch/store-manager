import { test, expect, type Page } from '@playwright/test';
import { gotoApp } from '../helpers';

/**
 * One plan, paid before use (since 8 October 2026). An unpaid or lapsed
 * business is sent to Billing from anywhere in the app; Billing shows what
 * each payment costs, from the server's figures; signup quotes the price and
 * promises no free trial.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const asBusiness = (page: Page, status: 'unpaid' | 'active' | 'expired') =>
  page.addInitScript((s) => localStorage.setItem('mock_business_status', s), status);

test('an unpaid business is sent to Billing and sees the start payment, itemised', async ({ page }) => {
  await asBusiness(page, 'unpaid');
  await gotoApp(page, '/dashboard');
  await expect(page).toHaveURL(/\/business-admin\/billing$/);
  await expect(page.getByRole('heading', { name: 'Pay to start using QuadERP' })).toBeVisible();
  const lines = page.locator('.billing-lines');
  await expect(lines).toContainText('One-time setup');
  await expect(lines.getByRole('row', { name: /Total/ })).toContainText('2,000');
  await page.getByLabel('Branches to start with').fill('3');
  await expect(lines.getByRole('row', { name: /Total/ })).toContainText('2,400');
  await expect(page.getByRole('button', { name: 'Pay with Paystack' })).toBeEnabled();
});

test('a paid-up business sees its year, its branches, renewal and adding branches', async ({ page }) => {
  await asBusiness(page, 'active');
  await gotoApp(page, '/business-admin/billing');
  await expect(page.getByText(/Paid until/)).toContainText('8 October 2027');
  await expect(page.getByText(/2 branches paid for, 2 in use/)).toBeVisible();
  await expect(page.getByText(/Renew for a year, 2 branches/)).toContainText('1,200');
  await page.getByLabel('Add branches').fill('2');
  await expect(page.locator('.billing-row').filter({ hasText: 'Pay for branches' })).toContainText('400');
  await expect(page.getByRole('heading', { name: 'Pay to start using QuadERP' })).toHaveCount(0);
});

test('a lapsed business is sent to Billing, can renew, and can still take its data', async ({ page }) => {
  await asBusiness(page, 'expired');
  await gotoApp(page, '/inventory');
  await expect(page).toHaveURL(/\/business-admin\/billing$/);
  await expect(page.getByRole('heading', { name: 'Your subscription has ended' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Renew with Paystack' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download your data' })).toBeVisible();
});

test('signup quotes the price and promises no free trial', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mock_signed_out', '1'));
  await gotoApp(page, '/signup');
  const card = page.locator('.signup-plan-card');
  await expect(card).toContainText('a year for one branch');
  await expect(card).toContainText('2,000');
  await expect(page.getByText(/free trial/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
});
