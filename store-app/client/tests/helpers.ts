import { expect, type Page } from '@playwright/test';
import { FIXED_TIME, initScript, type Theme } from './routes';
import { TEST_NONCE } from './nonce';

/**
 * Navigate to an authenticated route and wait for it to settle.
 *
 * Asserts we did NOT land on /login. Without this guard a misconfigured mock
 * flag silently redirects every route to the login page, and the whole suite
 * reports green while measuring nothing, which is exactly what happened when
 * a stale dev server was reused across runs.
 */
export async function gotoApp(page: Page, path: string, theme: Theme = 'light', prepare?: (page: Page) => Promise<void>) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript(initScript(theme));
  await page.goto(path);

  // Routes are code-split, so the first visit to one renders an empty Suspense
  // fallback until its chunk arrives. `networkidle` alone does not cover this:
  // the chunk request can start after the network has gone quiet, and a capture
  // taken in that window is a blank page compared against a real baseline.
  // Wait for the fallback to detach, it is absent entirely once mounted.
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
  await settleFonts(page);
  await settleCharts(page);

  // Route-specific setup (see `prepare` in routes.ts) runs last, once the page
  // is settled enough to be clicked, and is re-settled afterwards because the
  // interaction itself can mount charts or shift layout.
  if (prepare) {
    await prepare(page);
    await page.waitForTimeout(200);
    await settleCharts(page);
  }
}

/**
 * Wait for font loading to settle, then give layout one frame.
 *
 * index.css pulls Outfit and Inter from Google Fonts with `display=swap`, so a
 * fallback paints first and the real face swaps in later. Occasionally a
 * capture lands mid-swap and every glyph on the page shifts sub-pixel, ~3,000
 * px of diff on a text-heavy route, indistinguishable from a real regression.
 * Retries absorb it; it shows up as ~2 flaky per full run.
 *
 * Do NOT reach for `document.fonts.check('1em Outfit')` to harden this. It
 * returns false for a face that is available but not yet materialised, so it
 * never becomes true here, measured: `status: "loaded"`, `check('1em Inter')`
 * true, `check('1em Outfit')` false, all 33 faces reporting "unloaded". Polling
 * on it burns its full timeout on every test and took the suite from 6 minutes
 * to 25 without fixing anything.
 *
 * The real fix is self-hosting the fonts so captures do not depend on a network
 * fetch at all. Until then this is the honest cheap version.
 */
async function settleFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    // One frame so any swapped metrics are laid out before the screenshot.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

/**
 * Recharts animates its series in with a JS-driven timeline, and renders pie
 * labels only once that timeline completes. Playwright's `animations:
 * 'disabled'` freezes CSS animations but has no effect on it, so a capture can
 * land mid-animation, which produced a "dark mode is missing its donut
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
