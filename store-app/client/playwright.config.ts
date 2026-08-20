import { defineConfig, devices } from '@playwright/test';

/**
 * Three suites:
 *
 *   invariants, runtime DOM assertions (tokens, layout, tabs, empty states,
 *                no-crash). Mock harness, no backend, no login.
 *   visual, screenshot baselines. Same harness, but runs *after*
 *                invariants rather than beside them.
 *   e2e, real login against a real server. Mocks OFF, or the login
 *                flow can't work.
 *
 * visual and e2e previously fought each other: the login-based specs could
 * never pass while useAuth.js was unconditionally mocked.
 *
 * visual and invariants then fought each other too, less obviously. Both drove
 * one dev server, and once the invariant suite grew to ~75 navigations the
 * added contention meant screenshots were being taken of pages that had not
 * finished settling, 68 of 80 captures "failed" against baselines that had
 * been written minutes earlier and that pass cleanly when the capture suite
 * runs on its own. `dependencies` serialises them: invariants complete first,
 * then the screenshots get an unloaded server.
 */

/* Overridable because 5175 is a common Vite fallback, a dev server from an
   unrelated project sitting on it fails the whole run at startup, and killing
   someone else's server is not the right fix. `PW_CLIENT_PORT=5185 npm run
   test:visual` moves this suite instead. */
const CLIENT_PORT = Number(process.env.PW_CLIENT_PORT) || 5175;
const baseURL = `http://localhost:${CLIENT_PORT}`;

/**
 * Proof-of-origin for the dev server.
 *
 * `reuseExistingServer: false` is not enough on its own: when a server is
 * already on the port the run can end up driving it, and it serves whatever
 * modules it was started with. That happened here, a leftover server from a
 * manual screenshot probe served pre-edit code, so 80 capture tests compared a
 * stale app against stale baselines and the suite reported green.
 *
 * The value is passed to the dev server, echoed onto `window` by main.jsx, and
 * asserted on every navigation in gotoApp().
 */
process.env.PW_TEST_NONCE ||= `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEST_NONCE = process.env.PW_TEST_NONCE;

const shared = {
  ...devices['Desktop Chrome'],
  baseURL,
  trace: 'retain-on-failure' as const,
};

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/._*',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry locally too: the suite drives ~110 page loads through a single
  // dev server, and unbounded parallelism produced sporadic navigation
  // timeouts that were not real regressions.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 4,
  reporter: 'html',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',

  expect: {
    toHaveScreenshot: {
      /* An absolute pixel count, not a ratio.

         `maxDiffPixelRatio: 0.01` sounded strict and was not: combined with
         `fullPage: true` the denominator is the whole scrollable page (~2.7M px
         on a tall route), while the things that regress are anti-aliased text
         strokes on an unchanged background. Collapsing every sidebar nav group
         across all 38 routes measured 8,396 px, 0.31%, and passed. So did a
         new Danger Zone panel and a fixture change that repopulated a page.
         The taller the page, the weaker the check, which is backwards.

         200 is set against a measured noise floor of *zero*: with the visual
         project serialised (see `fullyParallel` below), 37 of 38 routes are
         byte-identical run to run. The margin is for genuine environment
         variation, not for the app changing. The smallest real change measured
         here, a one-line flex fix on the POS cart total, was 598 px. */
      maxDiffPixels: 200,
    },
  },

  projects: [
    {
      name: 'invariants',
      testMatch: ['**/invariants/**/*.spec.ts'],
      use: shared,
    },
    {
      // Screenshots last, and only once nothing else is driving the server.
      name: 'visual',
      testMatch: ['**/visual/**/*.spec.ts'],
      dependencies: ['invariants'],
      /* Serialised deliberately. Under four parallel workers, two routes
         intermittently shifted text by a sub-pixel and diffed by 4,000-8,200
         px, indistinguishable from a real regression, and the reason a 1%
         tolerance looked necessary. At one worker the same routes are
         byte-identical, which is what lets `maxDiffPixels: 200` above hold.
         Costs a few minutes; invariants still run in parallel. */
      fullyParallel: false,
      workers: 1,
      use: shared,
    },
    {
      name: 'e2e',
      testMatch: ['**/e2e/**/*.spec.ts'],
      use: shared,
    },
  ],

  webServer: [
    {
      // Mock mode comes from the npm script, so `test:e2e` gets a real-auth
      // build from this same config. It is passed through explicitly rather
      // than relying on ambient inheritance.
      command: `npm run dev -- --port ${CLIENT_PORT}`,
      port: CLIENT_PORT,
      env: {
        VITE_USE_MOCKS: process.env.VITE_USE_MOCKS ?? '',
        VITE_MOCK_ROLE: process.env.VITE_MOCK_ROLE ?? '',
        VITE_TEST_NONCE: TEST_NONCE,
      },
      // Never reuse: a server left running from a differently-flagged run
      // silently serves the wrong build, and every page then redirects to
      // /login while the suite reports green.
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
