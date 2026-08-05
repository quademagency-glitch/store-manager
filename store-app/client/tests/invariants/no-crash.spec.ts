import { test, expect } from '@playwright/test';
import { APP_ROUTES } from '../routes';
import { gotoApp } from '../helpers';

/**
 * Every route renders without hitting the ErrorBoundary.
 *
 * Cheap, and it catches the whole class of failure that screenshot diffs only
 * catch by accident. It was added after a real one: sweeping the swallowed
 * catch blocks turned `error` from a string into an Error object on a page
 * that still rendered it as `{error}` directly, and React throws "Objects are
 * not valid as a React child" — taking the entire Till Account page down.
 *
 * Runs in both mock modes, since an empty collection reaches different code
 * paths than a populated one.
 */
test.describe('routes render without crashing', () => {
  for (const route of APP_ROUTES) {
    test(route.name, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('pageerror', (e) => consoleErrors.push(e.message));

      await gotoApp(page, route.path);

      await expect(
        page.getByText('Something went wrong', { exact: false }),
        'The ErrorBoundary fallback is on screen — this route threw during render',
      ).toHaveCount(0);

      // React child/hook violations surface here rather than in the DOM.
      const fatal = consoleErrors.filter((m) =>
        /not valid as a React child|Rendered more hooks|Cannot read propert/.test(m),
      );
      expect(fatal, `Uncaught render errors: ${fatal.join(' | ')}`).toEqual([]);
    });
  }
});
