import { test, expect } from '@playwright/test';
import { APP_ROUTES, THEMES, VIEWPORTS, initScript, type Theme } from '../routes';
import { gotoApp } from '../helpers';

/**
 * Runtime invariants. Each one permanently guards a specific defect found in
 * the UI audit, so the regression can't come back silently.
 */

const SAMPLE = APP_ROUTES.filter((r) =>
  ['/dashboard', '/inventory', '/reconciliation', '/settings', '/business-admin/roles', '/customer-orders'].includes(r.path),
);

test.describe('content fits the viewport', () => {
  // Guards two distinct failures:
  //
  //  1. Real horizontal overflow — an element extending past the right edge.
  //     `document.scrollWidth` alone can't see this when an ancestor sets
  //     `overflow-x: hidden`, so element rects are measured directly.
  //
  //  2. Occlusion — `.admin-main-content { margin: 0 auto }` overriding
  //     `.dashboard-main { margin-left: var(--sidebar-width) }` left main
  //     content starting at x=0 underneath the opaque fixed 280px sidebar.
  //     Nothing overflowed; 280px of content was simply covered up.
  for (const viewport of VIEWPORTS) {
    for (const route of SAMPLE) {
      test(`${route.name} @ ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await gotoApp(page, route.path);

        const result = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;

          // An element whose rect exceeds the viewport is only a real problem
          // if nothing clips it. getBoundingClientRect() reports unclipped
          // geometry, so a decorative blur inside `overflow: hidden` would
          // otherwise be reported as overflow when it is visually contained.
          const isClipped = (el: Element) => {
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
              const o = getComputedStyle(p);
              if (/hidden|clip|auto|scroll/.test(o.overflowX)) return true;
            }
            return false;
          };

          const overflowing = [...document.querySelectorAll('body *')]
            .filter((el) => {
              const s = getComputedStyle(el);
              if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed') return false;
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.right > vw + 1 && !isClipped(el);
            })
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} (+${Math.round(el.getBoundingClientRect().right - vw)}px)`);

          // Authoritative signal, truthful now that `body { overflow-x: hidden }`
          // no longer clamps it.
          const docOverflow = Math.max(
            0,
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );

          const sidebar = document.querySelector('.dashboard-sidebar');
          const main = document.querySelector('.dashboard-main');
          let occludedBy = 0;
          if (sidebar && main) {
            const sb = sidebar.getBoundingClientRect();
            const mb = main.getBoundingClientRect();
            const pinned = ['fixed', 'sticky'].includes(getComputedStyle(sidebar).position);
            // Only meaningful while the sidebar is a visible side rail; below
            // the mobile breakpoint it becomes an off-canvas drawer.
            if (pinned && sb.width > 0 && sb.left >= 0 && sb.right > 0) {
              occludedBy = Math.max(0, Math.round(sb.right - mb.left));
            }
          }
          return { overflowing, occludedBy, docOverflow };
        });

        // Soft so a page reports every failure mode at once rather than
        // hiding the rest behind the first one.
        expect.soft(result.occludedBy, `Main content is hidden under the sidebar by ${result.occludedBy}px`).toBe(0);
        expect.soft(result.docOverflow, `Page scrolls horizontally by ${result.docOverflow}px`).toBe(0);
        expect.soft(result.overflowing, `Elements overflow the viewport: ${result.overflowing.join(', ')}`).toEqual([]);
      });
    }
  }
});

test.describe('no dead space above the page content', () => {
  // Guards a bug the overflow check could never see, because nothing
  // overflowed and nothing was occluded — there was simply 114px of empty
  // grid between the mobile topbar and the page title, on every page.
  //
  // `.dashboard-page` sets `min-height: 100dvh` and, below the breakpoint,
  // has two implicit auto rows. The default `align-content: stretch` then
  // shared the leftover height between them, so the 56px topbar row was
  // inflated to 170px. `grid-template-rows: auto 1fr` pins it.
  for (const route of ['/dashboard', '/customers', '/inventory']) {
    test(`${route} @ mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoApp(page, route);

      const gap = await page.evaluate(() => {
        const bar = document.querySelector('.mobile-sidebar-topbar');
        const main = document.querySelector('.dashboard-main');
        if (!bar || !main) return 0;
        return Math.round(main.getBoundingClientRect().top - bar.getBoundingClientRect().bottom);
      });

      expect(gap, `${gap}px of empty space between the topbar and the content`)
        .toBeLessThanOrEqual(1);
    });
  }
});

test.describe('theme is applied before first paint', () => {
  // Guards the FOUC: `data-theme` used to be set in a useEffect, and `:root`
  // defined no colour tokens, so the first frame was an unstyled white page.
  for (const theme of THEMES as readonly Theme[]) {
    test(theme, async ({ page }) => {
      await page.addInitScript(initScript(theme));
      await page.goto('/dashboard', { waitUntil: 'commit' });

      const applied = await page.evaluate(() => document.documentElement.dataset.theme);
      expect(applied).toBe(theme);
    });
  }
});

test('backdrop-filter stays within the blur budget', async ({ page }) => {
  // Guards perf: 73 .glass-panel + 41 .glass-table + 15 .pos-glass-card all
  // blurring would be 129 compositing layers. Blur is only spent where
  // something actually moves behind the surface.
  await gotoApp(page, '/inventory', 'dark');

  const blurred = await page.evaluate(() =>
    [...document.querySelectorAll('*')].filter((el) => {
      const s = getComputedStyle(el);
      const bf = s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter;
      return bf && bf !== 'none';
    }).length,
  );

  expect(blurred, `${blurred} elements use backdrop-filter; budget is 6`).toBeLessThanOrEqual(6);
});

test('interactive elements have a visible focus ring', async ({ page }) => {
  // buttons.css had no :focus-visible rule at all, so keyboard users had no
  // indication of position anywhere in the app.
  await gotoApp(page, '/settings');

  const offenders = await page.evaluate(() => {
    const bad: string[] = [];
    const candidates = [...document.querySelectorAll('button, a[href], input, select')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .slice(0, 25);

    for (const el of candidates) {
      (el as HTMLElement).focus();
      const s = getComputedStyle(el);
      const hasOutline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
      const hasRing = s.boxShadow !== 'none';
      if (!hasOutline && !hasRing) {
        bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);
      }
    }
    return bad;
  });

  expect(offenders, `No focus indicator on: ${offenders.join(', ')}`).toEqual([]);
});
