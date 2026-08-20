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
