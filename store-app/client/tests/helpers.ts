import { expect, type Page } from '@playwright/test';
import { FIXED_TIME, initScript, type Theme } from './routes';
import { TEST_NONCE } from './nonce';

/**
 * Navigate to an authenticated route and wait for it to settle.
 *
 * Asserts we did NOT land on /login. Without this guard a misconfigured mock
 * flag silently redirects every route to the login page, and the whole suite
 * reports green while measuring nothing — which is exactly what happened when
 * a stale dev server was reused across runs.
 */
export async function gotoApp(page: Page, path: string, theme: Theme = 'light') {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript(initScript(theme));
  await page.goto(path);

  // Routes are code-split, so the first visit to one renders an empty Suspense
  // fallback until its chunk arrives. `networkidle` alone does not cover this:
  // the chunk request can start after the network has gone quiet, and a capture
  // taken in that window is a blank page compared against a real baseline.
  // Wait for the fallback to detach — it is absent entirely once mounted.
  await page
    .locator('.route-suspense-fallback')
    .waitFor({ state: 'detached', timeout: 20000 })
    .catch(() => {});

  // Bounded: endpoints outside the fixture map fall through to real requests
  // that fail slowly, and the default 30s networkidle timeout would make each
  // such page a half-minute of dead wait.
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

  const landed = new URL(page.url()).pathname;
  expect(
    landed,
    `Expected ${path} but landed on ${landed}. Is VITE_USE_MOCKS set for the dev server?`,
  ).not.toMatch(/^\/login/);

  // Second stale-server guard. The /login check above catches a server started
  // without the mock flag; this catches one started before the code under test
  // was written, which is otherwise completely silent.
  const served = await page.evaluate(() => (window as Window & { __TEST_NONCE__?: string }).__TEST_NONCE__);
  expect(
    served,
    'The page was served by a dev server this run did not start, so it may be ' +
      'running pre-edit code. Kill it: lsof -ti:5175 | xargs kill -9',
  ).toBe(TEST_NONCE);

  // Let entrance animations finish so screenshots aren't animation-phase noise.
  await page.waitForTimeout(400);
  await page.evaluate(() => document.fonts?.ready);
  await settleCharts(page);
}

/**
 * Recharts animates its series in with a JS-driven timeline, and renders pie
 * labels only once that timeline completes. Playwright's `animations:
 * 'disabled'` freezes CSS animations but has no effect on it, so a capture can
 * land mid-animation — which produced a "dark mode is missing its donut
 * labels" diff that was really just two captures catching different frames.
 *
 * Waits for the SVG text-node count to stop changing.
 */
async function settleCharts(page: Page) {
  const hasChart = await page.locator('.recharts-wrapper').count();
  if (!hasChart) return;

  // Bounded: Recharts' default entry animation is 1500ms. Polling for a
  // stable node count is unreliable here because pie labels are painted
  // outside the node tree we can observe, so this is a plain wait capped
  // well below the per-test timeout.
  await page.waitForTimeout(1200);
}
