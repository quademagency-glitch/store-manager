import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gotoApp } from '../helpers';

/**
 * Receipt and document print geometry.
 *
 * Printing is the least-tested surface in the app because nobody looks at it
 * until a customer is holding the paper. Both defects guarded here shipped and
 * survived: a section headed "58mm / 80mm" that only ever implemented 80mm,
 * and an unnamed `@page` margin that applied to receipts as well as invoices.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRINT_CSS = fs.readFileSync(
  path.resolve(HERE, '../../src/styles/print.css'),
  'utf8',
);
const src = (p: string) => fs.readFileSync(path.resolve(HERE, '../../src', p), 'utf8');
const PRICE_PRINT_CSS = src('styles/price-print.css');

/**
 * Comments stripped before any rule matching.
 *
 * The first version of the @page check scanned the raw file and failed on the
 * worked example inside the comment that explains why the rule exists, which
 * would have taught the next person to delete the explanation to get a green
 * build.
 */
const CSS = PRINT_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** mm to CSS px at the 96dpi reference the spec uses. */
const mm = (n: number) => (n * 96) / 25.4;

test('no unnamed @page rule sets margins', () => {
  // `@page` cannot be scoped by selector: a bare one applies to every printed
  // document in the app. A bare `@page { margin: 15mm 12mm }` sat under the A4
  // section header, looking local to it, and gave every 80mm thermal receipt
  // 12mm side margins. Content was laid out into 56mm of an 80mm roll and
  // cropped at the right, which is where the totals are.
  //
  // Margins belong to a NAMED page that a format opts into with `page:`.
  const offenders: string[] = [];
  const bare = /@page\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = bare.exec(CSS)) !== null) {
    if (/margin\s*:/.test(m[1])) offenders.push(m[0].replace(/\s+/g, ' ').trim());
  }

  expect(
    offenders,
    'An unnamed @page applies to EVERY printed format, receipts included. ' +
      'Use a named page (@page a4-doc { ... }) plus `page: a4-doc`:\n' +
      offenders.join('\n'),
  ).toEqual([]);
});

test('both thermal roll widths exist and are distinct', () => {
  for (const cls of ['.print-format-thermal', '.print-format-thermal-58']) {
    expect(PRINT_CSS, `${cls} is not defined`).toContain(cls);
  }
  for (const page of ['@page thermal-80', '@page thermal-58', '@page a4-doc']) {
    expect(PRINT_CSS, `${page} is not defined`).toContain(page);
  }
  // `size` is what tells the printer it is on a continuous roll. Without it the
  // page is assumed to be A4 and a thermal printer feeds blank paper per sale.
  expect(PRINT_CSS).toMatch(/@page thermal-80\s*\{[^}]*size:\s*80mm auto/);
  expect(PRINT_CSS).toMatch(/@page thermal-58\s*\{[^}]*size:\s*58mm auto/);
});

test('thermal formats compute to their real paper widths under print media', async ({ page }) => {
  await gotoApp(page, '/dashboard');
  await page.emulateMedia({ media: 'print' });

  const applied = await page.evaluate(() => matchMedia('print').matches);
  expect(applied, 'Print emulation did not reach the page, so this proves nothing').toBe(true);

  const widths = await page.evaluate(() => {
    const measure = (cls: string) => {
      const el = document.createElement('div');
      el.className = `printable-area ${cls}`;
      document.body.appendChild(el);
      const w = getComputedStyle(el).width;
      el.remove();
      return w;
    };
    return {
      eighty: measure('print-format-thermal'),
      fiftyEight: measure('print-format-thermal-58'),
    };
  });

  // Allow a pixel of rounding; the point is 58 is not 80.
  expect(Math.abs(parseFloat(widths.eighty) - mm(80)), `80mm format measured ${widths.eighty}`).toBeLessThan(2);
  expect(Math.abs(parseFloat(widths.fiftyEight) - mm(58)), `58mm format measured ${widths.fiftyEight}`).toBeLessThan(2);
});

/**
 * Price tags and the price list.
 *
 * Both printed a completely blank page in production for months. Their whole
 * layout, including the one rule that made the container visible, sat in a
 * <style> element inside the component, and the site's CSP (`style-src
 * 'self'`, no 'unsafe-inline', no nonce, no hash) refuses <style> ELEMENTS.
 * The sibling `style-src-attr 'unsafe-inline'` keeps every style={{...}} prop
 * working, so nothing else on the page looked wrong.
 *
 * Nobody could see it locally either: the Vite dev server sends no CSP.
 *
 * scripts/check-inline-style.mjs now fails the build if a <style> element
 * comes back while the policy forbids it. These tests cover the other half,
 * that the stylesheet which replaced it actually shows the tags.
 */
test('the printable containers are print-only, not .hidden', () => {
  for (const file of [
    'features/inventory/components/PriceTagPrinter.jsx',
    'features/inventory/components/PriceListPrint.jsx',
  ]) {
    const jsx = src(file);
    expect(jsx, `${file} should mark its printable area with the .print-only utility`)
      .toMatch(/className="printable-area print-only"/);
    // `.hidden` is `display: none` with no print-media exception, so it kept
    // the page empty even once the CSS was reachable.
    expect(jsx, `${file} still uses .hidden, which has no print exception`)
      .not.toMatch(/className="printable-area hidden"/);
  }
});

test('price tag geometry lives in a stylesheet, scoped to print', () => {
  const withoutComments = PRICE_PRINT_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const printBlocks = withoutComments.match(/@media\s+print\s*\{/g) || [];
  expect(printBlocks.length, 'price-print.css must scope its rules to @media print').toBeGreaterThan(0);

  for (const selector of ['.tag-page', '.tag-grid', '.price-tag', '.tag-price', '.pl-table']) {
    expect(withoutComments, `${selector} is not defined in price-print.css`).toContain(selector);
  }

  // Anything outside an @media print block would apply on screen too.
  const firstRule = withoutComments.indexOf('.tag-page');
  const firstMedia = withoutComments.indexOf('@media print');
  expect(firstMedia, 'the first @media print must open before the first rule').toBeLessThan(firstRule);
});

test('a print-only printable area is hidden on screen and shown when printing', async ({ page }) => {
  await gotoApp(page, '/dashboard');

  const displayFor = () => page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'printable-area print-only';
    document.body.appendChild(el);
    const value = getComputedStyle(el).display;
    el.remove();
    return value;
  });

  expect(await displayFor(), 'the tag container must stay out of the way on screen').toBe('none');

  await page.emulateMedia({ media: 'print' });
  expect(await page.evaluate(() => matchMedia('print').matches), 'print emulation did not reach the page').toBe(true);

  // This is the exact assertion that would have caught the blank page.
  expect(await displayFor(), 'the tag container is still display:none when printing, so the page prints blank').toBe('block');
});

test('price tags lay out as a grid of visible tags when printing', async ({ page }) => {
  await gotoApp(page, '/dashboard');
  await page.emulateMedia({ media: 'print' });

  const measured = await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'price-tags-print';
    host.className = 'printable-area print-only';
    host.innerHTML = `
      <div class="tag-page">
        <div class="tag-grid cols-3">
          <div class="price-tag"><div class="tag-name">Hisense Fridge</div><div class="tag-price">GHS 2,450.50</div></div>
          <div class="price-tag"><div class="tag-name">Kettle</div><div class="tag-price">GHS 104.00</div></div>
          <div class="price-tag"><div class="tag-name">Blender</div><div class="tag-price">GHS 260.00</div></div>
        </div>
      </div>`;
    document.body.appendChild(host);

    const grid = host.querySelector('.tag-grid') as HTMLElement;
    const tag = host.querySelector('.price-tag') as HTMLElement;
    const price = host.querySelector('.tag-price') as HTMLElement;
    const result = {
      hostDisplay: getComputedStyle(host).display,
      columns: getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      tagWidth: tag.getBoundingClientRect().width,
      tagHeight: tag.getBoundingClientRect().height,
      priceVisibility: getComputedStyle(price).visibility,
      priceWeight: getComputedStyle(price).fontWeight,
    };
    host.remove();
    return result;
  });

  expect(measured.hostDisplay).toBe('block');
  expect(measured.columns, 'cols-3 must produce three grid tracks').toBe(3);
  expect(measured.tagWidth, 'a tag with no width prints as nothing').toBeGreaterThan(10);
  expect(measured.tagHeight, 'a tag with no height prints as nothing').toBeGreaterThan(10);
  // print.css hides everything with `body * { visibility: hidden }` and only
  // re-shows `.printable-area *`, so a tag outside that tree prints invisibly.
  expect(measured.priceVisibility).toBe('visible');
  expect(measured.priceWeight, 'the price should still be the boldest thing on the tag').toBe('900');
});
