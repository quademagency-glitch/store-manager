import { test, expect } from '@playwright/test';
import { gotoApp } from '../helpers';

/**
 * The point of sale at tablet width.
 *
 * This band (769-1023px) had no breakpoint at all, so a tablet in landscape
 * got the desktop layout: a cart pinned at a fixed 380px against an ~800px
 * viewport, taking nearly half the screen, with the catalogue squeezed into
 * two cramped columns.
 *
 * It survived because captures are taken at desktop and phone widths, where
 * the layout is correct, and nothing in between was ever measured. So this
 * measures, rather than comparing pixels.
 */

const TABLETS = [
  { name: 'iPad portrait', width: 768, height: 1024 },
  { name: 'iPad landscape', width: 1024, height: 768 },
  { name: 'mid tablet', width: 820, height: 1180 },
  { name: 'small tablet', width: 900, height: 600 },
];

for (const device of TABLETS) {
  test(`POS is usable at ${device.name} (${device.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    await gotoApp(page, '/sales');

    const layout = await page.evaluate(() => {
      const cart = document.querySelector('.sales-cart') as HTMLElement | null;
      const catalog = document.querySelector('.sales-catalog') as HTMLElement | null;
      const pos = document.querySelector('.sales-page') as HTMLElement | null;
      if (!cart || !catalog || !pos) return null;
      return {
        cart: cart.getBoundingClientRect().width,
        catalog: catalog.getBoundingClientRect().width,
        // Measured against the POS area, not the viewport: the nav sidebar
        // takes its cut first, and a share of the viewport would flatter the
        // layout by exactly the width of a column the POS never sees.
        pos: pos.getBoundingClientRect().width,
        stacked: catalog.getBoundingClientRect().bottom <= cart.getBoundingClientRect().top + 1,
      };
    });

    expect(layout, 'Could not find .sales-cart / .sales-catalog').not.toBeNull();
    if (!layout) return;

    // Stacked (phone) layout is a legitimate answer at these widths; the cart
    // being full width is correct there. Only the side-by-side case is checked.
    if (layout.stacked) return;

    const cartShare = layout.cart / layout.pos;
    expect(
      cartShare,
      `The cart takes ${(cartShare * 100).toFixed(0)}% of the ${Math.round(layout.pos)}px ` +
        `POS area (${Math.round(layout.cart)}px). The fixed 380px cart this test was ` +
        `written for was 64% at 820px.`,
    ).toBeLessThan(0.45);

    // Two tiles minimum, three once there is room for them.
    //
    // Three everywhere is not reachable in this band: the nav sidebar is a
    // fixed column on every page, and at 820px there is not enough left after
    // it and the cart. Getting three at 820px would mean collapsing the
    // sidebar to icons, which is a change to the whole app rather than to the
    // POS. Asserting three here would just be asserting a wish.
    const minColumns = device.width >= 1000 ? 3 : 2;
    const columns = await page.evaluate(() => {
      const grid = document.querySelector('.catalog-grid');
      if (!grid) return null;
      const cols = getComputedStyle(grid).gridTemplateColumns;
      return cols.split(' ').filter(Boolean).length;
    });
    if (columns !== null) {
      expect(
        columns,
        `Catalogue renders ${columns} column(s) in ${Math.round(layout.catalog)}px ` +
          `at ${device.width}px wide; expected at least ${minColumns}`,
      ).toBeGreaterThanOrEqual(minColumns);
    }
  });
}
