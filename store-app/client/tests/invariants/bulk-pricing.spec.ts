import { test, expect } from '@playwright/test';
import { gotoApp } from '../helpers';

/**
 * Pricing a catalogue that was imported at cost.
 *
 * Bulk import encourages sheets carrying only what you paid, and the tool
 * opens on Markup %, which is a percentage OF the selling price. Against
 * cost-only stock that matched every product, changed none, and explained
 * nothing: "52 products / 0 will change". Nothing was broken and nothing said
 * so, which is indistinguishable from broken.
 *
 * Both halves are asserted because both have failed: the explanation, and the
 * button that acts on it. The button re-runs the preview with a different
 * mode, and wiring it as a bare onClick handler passed React's click event in
 * as the mode, which made every preview fail with a circular-JSON error.
 */
test.describe('bulk pricing', () => {
  test.skip(
    process.env.VITE_USE_MOCKS === 'empty',
    'asserts fixture rows; empty mode is covered by empty-states.spec.ts',
  );

  test('explains why a percentage cannot price cost-only stock, and offers the way out', async ({ page }) => {
    await gotoApp(page, '/inventory');
    await page.getByRole('tab', { name: 'Pricing' }).click();
    await page.getByPlaceholder(/e\.g\. 15/).fill('30');
    await page.getByRole('button', { name: /Preview Changes/ }).click();

    const note = page.locator('.bulk-price-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('no selling price');

    // Nothing would change, and the summary must agree with the note.
    await expect(page.getByRole('button', { name: /Apply to 0 Product/ })).toBeVisible();

    await page.getByRole('button', { name: /Use From Cost %/ }).click();

    // Same numbers, worked from cost: the note is gone and every row is priced.
    await expect(page.locator('.bulk-price-note')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Apply to 3 Product/ })).toBeVisible();
    await expect(page.locator('.glass-table tbody tr').first()).toContainText('7,571');
  });

  test('a run can be narrowed to individual products before applying', async ({ page }) => {
    await gotoApp(page, '/inventory');
    await page.getByRole('tab', { name: 'Pricing' }).click();
    await page.getByRole('button', { name: /From Cost %/ }).click();
    await page.getByPlaceholder(/e\.g\. 15/).fill('30');
    await page.getByRole('button', { name: /Preview Changes/ }).click();

    await expect(page.getByRole('button', { name: /Apply to 3 Product/ })).toBeVisible();

    // Untick one row: the run shrinks, the preview still shows what it found.
    await page.getByRole('checkbox', { name: 'Include LG 32-inch Television' }).uncheck();
    await expect(page.getByRole('button', { name: /Apply to 2 Product/ })).toBeVisible();
    await expect(page.locator('.glass-table tbody tr')).toHaveCount(3);

    /* The header box restores a partial selection to all of them, then clears
       it, which is the order people expect from a select-all. */
    const selectAll = page.getByRole('checkbox', { name: 'Select all products' });
    await selectAll.click();
    await expect(page.getByRole('button', { name: /Apply to 3 Product/ })).toBeVisible();
    await selectAll.click();
    await expect(page.getByRole('button', { name: /Apply to 0 Product/ })).toBeDisabled();
  });

  test('prices can be rounded to end in 99', async ({ page }) => {
    await gotoApp(page, '/inventory');
    await page.getByRole('tab', { name: 'Pricing' }).click();
    await page.getByRole('button', { name: /From Cost %/ }).click();
    await page.getByPlaceholder(/e\.g\. 15/).fill('20');

    await page.getByLabel('Rounding').selectOption('charm-99');
    await page.getByRole('button', { name: /Preview Changes/ }).click();

    /* 5,824 at 20% is 6,988.80, which lands on 6,999. Asserted as rendered,
       because the point of the option is what the shopper sees on the tag. */
    const rows = page.locator('.glass-table tbody tr');
    await expect(rows.first()).toContainText('6,999');

    // Sixth cell is New Price: tick box, product, SKU, category, current, new.
    const newPrices = await rows.locator('td:nth-child(6)').allInnerTexts();
    expect(newPrices).toHaveLength(3);
    // Whole cedis ending in 99, pesewas zero: GH₵6,999.00, GH₵1,699.00 ...
    for (const price of newPrices) expect(price.trim()).toMatch(/99\.00$/);
  });

  test('pricing to a margin is not the same as pricing to a markup', async ({ page }) => {
    await gotoApp(page, '/inventory');
    await page.getByRole('tab', { name: 'Pricing' }).click();

    // 5,824 cost. A 20% MARGIN is 7,280; a 20% MARKUP is 6,988.80.
    await page.getByRole('button', { name: /Target Margin %/ }).click();
    await page.getByPlaceholder(/e\.g\. 15/).fill('20');

    /* Said in cedis before anything is previewed, because the two words sound
       interchangeable and the difference is otherwise invisible until after
       the prices have been written. */
    await expect(page.getByText('Cost 100 becomes GH₵125.00')).toBeVisible();

    await page.getByRole('button', { name: /Preview Changes/ }).click();
    const rows = page.locator('.glass-table tbody tr');
    await expect(rows.first()).toContainText('7,280');
    // And the margin column reports back exactly what was asked for.
    await expect(rows.first()).toContainText('20.0%');

    await page.getByRole('button', { name: /From Cost %/ }).click();
    await expect(page.getByText('Cost 100 becomes GH₵120.00')).toBeVisible();
  });

  test('the price history says what kind of change it was, and who made it', async ({ page }) => {
    await gotoApp(page, '/inventory');
    await page.getByRole('tab', { name: 'Pricing' }).click();
    await page.getByRole('tab', { name: 'Change History' }).click();

    const panel = page.getByRole('tabpanel', { name: 'Change History' });
    await expect(panel).toContainText('From Cost %');
    await expect(panel).toContainText('Bulk update: 2 products');
    // The single edit, which had no trail at all before it was recorded.
    await expect(panel).toContainText('Manual');
    await expect(panel).toContainText('Kofi Boateng');
  });
});
