import { test, expect } from '@playwright/test';
import { APP_ROUTES } from '../routes';
import { gotoApp } from '../helpers';

/**
 * Guards the bare-table failure: 30 tables in this app rendered their column
 * headers over nothing when a collection came back empty, so "no data yet",
 * "your filter matched nothing" and "the request failed" were all the same
 * blank rectangle.
 *
 * Runs against VITE_USE_MOCKS=empty, where every collection endpoint resolves
 * to `[]` — which is the only practical way to reach 40-odd empty states
 * without hand-building a scenario per page.
 *
 *   VITE_USE_MOCKS=empty npx playwright test --project=visual empty-states
 */
test.describe('empty collections explain themselves', () => {
  test.skip(
    process.env.VITE_USE_MOCKS !== 'empty',
    'needs VITE_USE_MOCKS=empty; the fixture mode has data in every table',
  );

  for (const route of APP_ROUTES) {
    test(route.name, async ({ page }) => {
      await gotoApp(page, route.path);

      const bare = await page.evaluate(() => {
        const offenders: string[] = [];
        for (const tbody of document.querySelectorAll('tbody')) {
          // A table still mounting is not an offender.
          if (!tbody.closest('table')?.querySelector('thead th')) continue;

          const rows = [...tbody.querySelectorAll(':scope > tr')];
          const meaningful = rows.filter(
            (r) => !r.classList.contains('skeleton-row'),
          );
          if (meaningful.length === 0) {
            offenders.push(
              tbody.closest('table')?.className || '<table>',
            );
            continue;
          }
          // A single row that is the empty state is the correct outcome.
          const onlyRow = meaningful.length === 1 ? meaningful[0] : null;
          if (onlyRow && !onlyRow.classList.contains('empty-state-row')) {
            const text = (onlyRow.textContent || '').trim();
            // Some tables legitimately render one aggregate/total row.
            if (!text) offenders.push('empty single row');
          }
        }
        return offenders;
      });

      expect(
        bare,
        `Table(s) rendered column headers over nothing: ${bare.join(', ')}`,
      ).toEqual([]);
    });
  }
});
