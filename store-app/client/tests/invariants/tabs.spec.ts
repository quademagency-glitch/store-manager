import { test, expect } from '@playwright/test';
import { gotoApp } from '../helpers';

/**
 * Guards the Tabs primitive's accessibility contract.
 *
 * Before it there were five hand-rolled tab strips — `.inventory-tab`,
 * `.loyalty-tab`, `.modern-tab` and two sets of inline-styled buttons — and
 * not one of them exposed `role="tablist"`, `aria-selected`, or arrow-key
 * navigation. A screen reader announced a row of unrelated buttons with no
 * indication of which one was current, and a keyboard user had to Tab through
 * every tab to reach the panel.
 *
 * One page per variant: Inventory is the widest pill strip (8 tabs, scrolls),
 * Settings is the underline variant inside a card.
 */
const PAGES = [
  { path: '/inventory', name: 'inventory (pill)', first: 'Products' },
  { path: '/settings', name: 'settings (underline)', first: 'Users' },
];

for (const p of PAGES) {
  test.describe(p.name, () => {
    test('exposes the tablist pattern', async ({ page }) => {
      await gotoApp(page, p.path);

      const tablist = page.getByRole('tablist').first();
      await expect(tablist).toBeVisible();

      const tabs = tablist.getByRole('tab');
      expect(await tabs.count()).toBeGreaterThan(1);

      // Exactly one selected, and it is the one the panel points back to.
      const selected = tablist.locator('[role="tab"][aria-selected="true"]');
      await expect(selected).toHaveCount(1);
      await expect(selected).toHaveText(new RegExp(p.first));

      const panel = page.getByRole('tabpanel').first();
      await expect(panel).toHaveAttribute('aria-labelledby', await selected.getAttribute('id') ?? '');
    });

    test('is a single tab stop with roving tabindex', async ({ page }) => {
      await gotoApp(page, p.path);

      const tabs = page.getByRole('tablist').first().getByRole('tab');
      const tabIndexes = await tabs.evaluateAll((els) =>
        els.map((el) => el.getAttribute('tabindex')),
      );

      // Every tab in the strip must not be its own Tab stop: exactly one 0.
      expect(tabIndexes.filter((t) => t === '0')).toHaveLength(1);
      expect(tabIndexes.filter((t) => t === '-1')).toHaveLength(tabIndexes.length - 1);
    });

    test('arrow keys move selection, Home and End jump to the ends', async ({ page }) => {
      await gotoApp(page, p.path);

      const tablist = page.getByRole('tablist').first();
      const tabs = tablist.getByRole('tab');
      const labels = await tabs.allTextContents();

      await tabs.first().focus();

      await page.keyboard.press('ArrowRight');
      await expect(tablist.locator('[aria-selected="true"]')).toHaveText(labels[1]);

      await page.keyboard.press('End');
      await expect(tablist.locator('[aria-selected="true"]')).toHaveText(labels[labels.length - 1]);

      await page.keyboard.press('Home');
      await expect(tablist.locator('[aria-selected="true"]')).toHaveText(labels[0]);

      // Wraps rather than dead-ending, per the APG pattern.
      await page.keyboard.press('ArrowLeft');
      await expect(tablist.locator('[aria-selected="true"]')).toHaveText(labels[labels.length - 1]);
    });
  });
}
