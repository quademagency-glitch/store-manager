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
