import { test, expect, type Page } from '@playwright/test';
import { gotoApp } from '../helpers';

/**
 * The menu shows everyday pages by default and everything else behind one
 * switch. Hidden pages stay reachable: the current page always shows, and the
 * command palette searches the full permission-filtered list.
 *
 * Mock setup-status: loyalty and messaging not set up, commissions set up,
 * two branches.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const sidebar = (page: Page) => page.locator('.sidebar-nav');
const openGroup = async (page: Page, title: string) => {
  const header = sidebar(page).locator('.sidebar-group-header', { hasText: title });
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
};

test('essentials menu is short and the full menu labels modules not set up', async ({ page }) => {
  await gotoApp(page, '/dashboard');
  const toggle = sidebar(page).getByRole('button', { name: /Show all features \(\d+ more\)/ });
  await expect(toggle).toBeVisible();

  await openGroup(page, 'Customers');
  await expect(sidebar(page).getByRole('link', { name: 'Customers', exact: true })).toBeVisible();
  await expect(sidebar(page).getByRole('link', { name: /Loyalty & Rewards/ })).toHaveCount(0);

  await toggle.click();
  await expect(sidebar(page).getByRole('button', { name: 'Show essentials only' })).toHaveAttribute('aria-pressed', 'true');
  await openGroup(page, 'Customers');
  await expect(sidebar(page).getByRole('link', { name: /Loyalty & Rewards/ })).toContainText('Not set up');
  await expect(sidebar(page).getByRole('link', { name: /Marketing & Comms/ })).toContainText('Not set up');
  await openGroup(page, 'Settings');
  await expect(sidebar(page).getByRole('link', { name: /Commission Rules/ })).not.toContainText('Not set up');
  await expect(sidebar(page).getByRole('link', { name: /Integrations/ }).locator('svg')).toHaveCount(1);

  await page.reload();
  await expect(sidebar(page).getByRole('button', { name: 'Show essentials only' })).toBeVisible();
});

test('the current page stays in the essentials menu and hidden pages are found with Ctrl+K', async ({ page }) => {
  await gotoApp(page, '/loyalty');
  await expect(sidebar(page).getByRole('link', { name: /Loyalty & Rewards/ })).toHaveAttribute('aria-current', 'page');

  await gotoApp(page, '/dashboard');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').or(dialog.getByRole('textbox')).first().fill('loyalty');
  await expect(dialog.getByRole('option', { name: /Loyalty & Rewards/ })).toBeVisible();
});
