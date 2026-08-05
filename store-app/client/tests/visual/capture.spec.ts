import { test, expect } from '@playwright/test';
import { APP_ROUTES, FIXED_TIME, PUBLIC_ROUTES, THEMES, VIEWPORTS, initScript, type Theme } from '../routes';
import { gotoApp } from '../helpers';

/**
 * Visual baseline matrix: route × theme × viewport.
 *
 * Runs against the mock harness (VITE_USE_MOCKS=true), so no backend or login
 * is required and fixture data is fixed — see src/lib/mockMode.js.
 *
 *   npm run test:visual           compare against committed baselines
 *   npm run test:visual:update    re-baseline (phases 1-2 only, deliberately)
 *
 * Phases 1-2 change everything on purpose and get re-baselined after human
 * review. From phase 3 on, the primitives are designed to be visually
 * identical to what they replace — so a large diff here is a bug signal, not
 * an expected churn.
 */

// Full matrix is large; scope it with FULL_MATRIX=1 at phase boundaries.
const FULL = !!process.env.FULL_MATRIX;
const viewports = FULL ? VIEWPORTS : VIEWPORTS.filter((v) => v.name === 'desktop');

for (const theme of THEMES as readonly Theme[]) {
  for (const viewport of viewports) {
    test.describe(`${theme} @ ${viewport.name}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of APP_ROUTES) {
        test(route.name, async ({ page }) => {
          await gotoApp(page, route.path, theme);
          await expect(page).toHaveScreenshot(`${route.name}-${theme}-${viewport.name}.png`, {
            fullPage: true,
            animations: 'disabled',
          });
        });
      }

      // Public routes render outside the app shell and have no session, so
      // they skip the authenticated-navigation guard.
      for (const route of PUBLIC_ROUTES) {
        test(route.name, async ({ page }) => {
          await page.clock.setFixedTime(FIXED_TIME);
          await page.addInitScript(initScript(theme));
          await page.goto(route.path);
          await page.waitForLoadState('networkidle').catch(() => {});
          await page.waitForTimeout(400);

          await expect(page).toHaveScreenshot(`${route.name}-${theme}-${viewport.name}.png`, {
            fullPage: true,
            animations: 'disabled',
          });
        });
      }
    });
  }
}
