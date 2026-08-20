import { test, expect } from '@playwright/test';
import { gotoApp } from '../helpers';

/**
 * What survives a page crashing.
 *
 * There was one boundary, around <Routes>, so a throw in any of ~49 pages
 * unmounted the whole application including the sidebar, and the only way out
 * was a full reload. On a till mid-sale that costs the cart.
 *
 * Driven against /__boom, a dev-only route that throws during render, so this
 * exercises a real React error rather than a simulated one. The route is
 * stripped from production builds.
 */

// Note: the thrown error never reaches Playwright as a pageerror. React
// catches it inside the boundary and logs it, so the visible fallback is the
// evidence that it was thrown and handled, not an uncaught-error count.
test.describe('route error boundary', () => {
  test('a page that throws keeps the shell alive and offers a way out', async ({ page }) => {
    await gotoApp(page, '/__boom');

    // The fallback is shown...
    const fallback = page.locator('.error-boundary--route');
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute('role', 'alert');

    // ...and, the whole point, the shell is still standing.
    await expect(
      page.locator('.dashboard-sidebar'),
      'The sidebar was unmounted, so the boundary is still too high up the tree',
    ).toBeVisible();
    await expect(page.locator('#main-content')).toBeVisible();

    // The page variant would be wrong here: it offers only a reload.
    await expect(page.locator('.error-boundary--page')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /go to dashboard/i })).toBeVisible();
  });

  test('navigating away clears the error', async ({ page }) => {
    page.on('pageerror', () => {});
    await gotoApp(page, '/__boom');
    await expect(page.locator('.error-boundary--route')).toBeVisible();

    // React does not reset boundary state on its own, so without a resetKey
    // the user carries the error to every page they visit next.
    await page.getByRole('button', { name: /go to dashboard/i }).click();

    await expect(
      page.locator('.error-boundary--route'),
      'The boundary stayed latched after navigating away',
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('sidebar navigation still works after a page throws', async ({ page }) => {
    page.on('pageerror', () => {});
    await gotoApp(page, '/__boom');
    await expect(page.locator('.error-boundary--route')).toBeVisible();

    // The recovery people actually attempt first is clicking something else.
    const link = page.locator('.dashboard-sidebar').getByRole('button', { name: /^dashboard$/i }).first();
    await link.click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('.error-boundary--route')).toHaveCount(0);
  });
});
