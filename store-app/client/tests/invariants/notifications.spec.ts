import { test, expect } from '@playwright/test';
import { gotoApp } from '../helpers';

/**
 * The notification bell in the sidebar footer.
 *
 * Loss prevention alerts (voids, discounts, cash overrides, shrinkage) already
 * existed, already had a page and already had an API. Nothing surfaced them,
 * so an owner found out about a voided sale by going to look for one.
 */
/* Empty mode blanks every collection, alerts included, so these three assert
   on data it has removed on purpose and could never pass there. They were
   failing continuously, which is worse than not running: four permanent reds
   train you to skim the result, and the run stops meaning anything. Empty
   states have their own coverage; this file is about the populated one. */
const EMPTY_MODE = process.env.VITE_USE_MOCKS === 'empty';

test.describe('notification bell', () => {
  test.skip(EMPTY_MODE, 'asserts on fixture alerts, which empty mode removes by design');

  test('shows the pending count and not the resolved ones', async ({ page }) => {
    await gotoApp(page, '/dashboard');

    const trigger = page.locator('.notification-bell-trigger');
    await expect(trigger).toBeVisible();

    // The fixture has four alerts, three pending and one resolved. A badge that
    // counts the resolved one reads as work that is not there.
    await expect(page.locator('.notification-bell-badge')).toHaveText('3');
    await expect(trigger).toHaveAttribute('aria-label', /3 pending/i);
  });

  test('opens, lists the alerts with their real fields, and closes on Escape', async ({ page }) => {
    await gotoApp(page, '/dashboard');
    await page.locator('.notification-bell-trigger').click();

    const panel = page.locator('.notification-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.notification-list li')).toHaveCount(3);

    // `note` and `user`, which is what the table actually stores. The old
    // fixture used `message` and joined a `product`, so a panel that renders
    // blank here means the fixture has drifted from the schema again.
    await expect(panel).toContainText('Sale voided within a minute');
    await expect(panel).toContainText('Kwame Boateng');

    // Uppercase type mapped to a label, not printed raw.
    await expect(panel).toContainText('Cash override');
    await expect(panel).not.toContainText('CASH_OVERRIDE');

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);

    const focused = await page.evaluate(() =>
      document.activeElement?.classList.contains('notification-bell-trigger'),
    );
    expect(focused, 'Escape should return focus to the bell').toBe(true);
  });

  test('resolving removes the alert and decrements the badge', async ({ page }) => {
    await gotoApp(page, '/dashboard');
    await page.locator('.notification-bell-trigger').click();

    const panel = page.locator('.notification-panel');
    await panel.getByRole('button', { name: /resolve/i }).first().click();

    await expect(panel.locator('.notification-list li')).toHaveCount(2);
    await expect(page.locator('.notification-bell-badge')).toHaveText('2');
  });
});
