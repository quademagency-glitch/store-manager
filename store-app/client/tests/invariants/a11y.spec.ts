import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gotoApp } from '../helpers';

/**
 * Phase 6 guards: focus, motion, touch targets, and the layering that lets
 * `styles/a11y.css` enforce all three.
 *
 * The static half is the important half. Every defect below was invisible in
 * screenshots, a missing focus ring only exists while a keyboard user is
 * tabbing, and a runaway `prefers-reduced-motion` only exists for users who
 * set it. Neither shows up in a capture, so neither was caught for six
 * phases.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../src');
const STYLES = path.join(SRC, 'styles');

const indexCss = () => fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');

function walkJsx(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('._') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsx(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/* ── Layering ────────────────────────────────────────────────────────────
   The whole cascade-layer system rests on one assumption: nothing escapes
   it. Unlayered CSS beats *every* layer, tokens through a11y, so a single
   stylesheet imported without `layer()`, or one <style> tag injected from a
   component, silently outranks the entire design system. That is not
   hypothetical: `.btn-gradient` lived in an injected block and leaked
   app-wide whenever CRMCommunications mounted, then vanished on unmount. */

test('every stylesheet is imported into a cascade layer', () => {
  const css = indexCss();

  const imported = new Map<string, string | null>();
  for (const m of css.matchAll(/@import\s+'\.\/styles\/([\w-]+\.css)'(?:\s+layer\(([\w-]+)\))?/g)) {
    imported.set(m[1], m[2] ?? null);
  }

  const onDisk = fs
    .readdirSync(STYLES)
    .filter((f) => f.endsWith('.css') && !f.startsWith('._'));

  const unimported = onDisk.filter((f) => !imported.has(f));
  const unlayered = [...imported.entries()].filter(([, layer]) => !layer).map(([f]) => f);

  expect(
    unlayered,
    'Imported without a layer(), so they outrank every layered rule in the app:\n' +
      unlayered.map((f) => `  styles/${f}`).join('\n'),
  ).toEqual([]);

  expect(
    unimported,
    'Present in src/styles but never imported, either dead, or being pulled ' +
      'in from a component where it escapes the layer order:\n' +
      unimported.map((f) => `  styles/${f}`).join('\n'),
  ).toEqual([]);
});

test('the a11y layer is declared last, ahead of only overrides', () => {
  const decl = indexCss().match(/@layer\s+([^;]+);/);
  expect(decl, 'index.css must declare the layer order up front').not.toBeNull();

  const order = decl![1].split(',').map((s) => s.trim());
  expect(order).toContain('a11y');

  // a11y has to out-rank the page and component styling it is correcting.
  // `overrides` may sit after it: it is the documented escape hatch, and is
  // expected to stay empty.
  const rest = order.slice(order.indexOf('a11y') + 1);
  expect(
    rest,
    `Layers declared after a11y would beat the focus and motion guarantees: ${rest.join(', ')}`,
  ).toEqual(['overrides']);
});

test('no component injects screen CSS through a <style> tag', () => {
  const offenders: string[] = [];

  for (const file of walkJsx(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    // Match a <style> element and capture its template-literal body.
    for (const m of text.matchAll(/<style[^>]*>\s*\{?\s*`([\s\S]*?)`/g)) {
      const body = m[1];
      // Print-only blocks are fine: they are scoped to @media print, cannot
      // affect the screen cascade, and are generated per print job.
      const stripped = body.replace(/@media\s+print\s*\{[\s\S]*\}/g, '').trim();
      if (stripped.length > 0) {
        offenders.push(`  ${path.relative(SRC, file)}`);
      }
    }
  }

  expect(
    offenders,
    'Injected <style> content is unlayered, so it outranks the entire cascade ' +
      'layer system, and only while the component happens to be mounted. Move ' +
      'it to src/styles and import it into a layer:\n' + offenders.join('\n'),
  ).toEqual([]);
});

/* ── Focus ───────────────────────────────────────────────────────────── */

test('no rule removes a focus outline without providing one', () => {
  const offenders: string[] = [];

  for (const file of fs.readdirSync(STYLES).filter((f) => f.endsWith('.css') && !f.startsWith('._'))) {
    // Comments first. Several of these files *discuss* `outline: none` in a
    // note explaining why it was removed, and scanning raw text reports the
    // explanation as the defect.
    const css = fs.readFileSync(path.join(STYLES, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim().split('\n').pop()!.trim();
      const body = m[2];
      if (!/outline:\s*(none|0)\b/.test(body)) continue;

      // Legitimate when the same selector also defines a :focus-visible rule:
      // that is the "suppress on click, show on keyboard" pattern, and it is
      // how .tab-panel and .acct-amount-input's inner field are handled.
      // Longest alternative first, `focus` would otherwise match the head of
      // `focus-visible` and leave `-visible` glued to the selector.
      const base = selector
        .replace(/:(focus-visible|focus-within|focus|hover|active)\b/g, '')
        .trim();
      const hasVisible = new RegExp(
        base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^{}]*:focus-visible[^{}]*\\{',
      ).test(css);

      if (!hasVisible) offenders.push(`  ${file}  ${selector}`);
    }
  }

  expect(
    offenders,
    'These strip the focus indicator and put nothing back, which is how every ' +
      'text field in the app became keyboard-invisible:\n' + offenders.join('\n'),
  ).toEqual([]);
});

test('keyboard focus is always visible', async ({ page }) => {
  await gotoApp(page, '/dashboard');

  // Tab through the real focus order rather than calling .focus(): only a
  // genuine keyboard interaction makes :focus-visible match on a button, so
  // programmatic focus would test a different code path than a user takes.
  const missing: string[] = [];

  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');

    const result = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;

      const hasRing = (node: Element) => {
        const s = getComputedStyle(node);
        const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1;
        // A wrapper drawing the ring on :focus-within counts, the amount
        // field in accounting-templates is styled that way on purpose.
        const shadow = s.boxShadow !== 'none' && s.boxShadow !== '';
        return outline || shadow;
      };

      // Check the element and its two nearest ancestors, so the
      // ring-on-the-wrapper pattern is accepted.
      let node: Element | null = el;
      for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
        if (hasRing(node)) return null;
      }

      const cls = String(el.className || '').split(' ').filter(Boolean)[0] ?? '';
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
    });

    if (result) missing.push(result);
  }

  expect(
    [...new Set(missing)],
    'Focused via Tab with no visible focus indicator on the element or its wrapper',
  ).toEqual([]);
});

/* ── Motion ──────────────────────────────────────────────────────────── */

test('no stylesheet hardcodes a transition duration', () => {
  const offenders: string[] = [];

  for (const file of fs.readdirSync(STYLES).filter((f) => f.endsWith('.css') && !f.startsWith('._'))) {
    const css = fs.readFileSync(path.join(STYLES, file), 'utf8');
    css.split('\n').forEach((line, i) => {
      const m = line.match(/transition:[^;]*?(\d*\.?\d+m?s)/);
      if (m && !line.includes('var(--transition')) {
        offenders.push(`  ${file}:${i + 1}  ${line.trim()}`);
      }
    });
  }

  expect(
    offenders,
    'Durations belong to the token scale (--transition-fast/normal/spring/slow) ' +
      'so motion stays consistent and is tuned in one place:\n' + offenders.join('\n'),
  ).toEqual([]);
});

test('no stylesheet transitions `all`', () => {
  const offenders: string[] = [];

  for (const file of fs.readdirSync(STYLES).filter((f) => f.endsWith('.css') && !f.startsWith('._'))) {
    const css = fs.readFileSync(path.join(STYLES, file), 'utf8');
    css.split('\n').forEach((line, i) => {
      if (/transition:\s*all\b/.test(line)) offenders.push(`  ${file}:${i + 1}  ${line.trim()}`);
    });
  }

  expect(
    offenders,
    '`transition: all` animates every property that ever changes, including ' +
      'layout ones, and fires on changes the author never intended to animate. ' +
      'List the properties the rule actually changes:\n' + offenders.join('\n'),
  ).toEqual([]);
});

test.describe('reduced motion', () => {
  test('is honoured app-wide, not just where a component opted in', async ({ page }) => {
    // emulateMedia rather than `test.use({ reducedMotion })`: the fixture form
    // did not reach the page here, and because almost every duration in the app
    // is under the 1.5s threshold, the test still reported green while
    // measuring an app that was animating normally. Same false-green shape as
    // the stale dev server that made 80 capture tests meaningless.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoApp(page, '/dashboard');

    const applied = await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    expect(applied, 'Reduced-motion emulation did not reach the page, so this test proves nothing').toBe(true);

    const moving = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of [...document.querySelectorAll('body *')].slice(0, 800)) {
        const s = getComputedStyle(el);
        const durations = [...s.transitionDuration.split(','), ...s.animationDuration.split(',')]
          .map((d) => parseFloat(d) || 0);
        // The a11y layer collapses everything to 1ms and slows the handful of
        // progress indicators to 1.5s, so anything above 1.5s is unguarded.
        if (Math.max(0, ...durations) > 1.5) {
          const cls = String(el.className || '').split(' ').filter(Boolean)[0] ?? '';
          out.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`);
        }
      }
      return [...new Set(out)];
    });

    expect(moving, 'Still animating at full duration under prefers-reduced-motion').toEqual([]);
  });
});

/* ── Touch targets ───────────────────────────────────────────────────── */

test.describe('touch targets', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('interactive controls are at least 44px on a coarse pointer', async ({ page }) => {
    await gotoApp(page, '/dashboard');

    // Assert the emulation actually took, rather than passing vacuously if
    // Chromium stops reporting a coarse pointer under touch emulation.
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    expect(coarse, 'Touch emulation did not produce a coarse pointer, so this test proves nothing').toBe(true);

    const small = await page.evaluate(() => {
      const SELECTOR = 'button, select, summary, .tab, .sidebar-link, [role="tab"], [role="button"], input:not([type="hidden"])';
      const out: string[] = [];

      for (const el of document.querySelectorAll(SELECTOR)) {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height >= 44) continue;

        const cls = String(el.className || '').split(' ').filter(Boolean)[0] ?? '';
        out.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return [...new Set(out)];
    });

    expect(small, 'Below the 44px minimum hit area under a coarse pointer').toEqual([]);
  });
});

/* ── Getting into, and out of, things ────────────────────────────────────
   Three defects that no screenshot and no static check can see, because all
   three only exist while someone is operating the app from the keyboard.
   Each was real before these tests were written. */

test('the skip link is the first tab stop and actually moves focus', async ({ page }) => {
  await gotoApp(page, '/dashboard');

  await page.keyboard.press('Tab');

  const first = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? { cls: el.className, text: el.textContent?.trim(), tag: el.tagName } : null;
  });
  expect(first?.cls, 'The first Tab must reach the skip link, the sidebar has 39 links behind it').toContain('skip-link');

  // Visible once focused. A skip link that stays off-screen while focused is
  // the standard broken implementation: sighted keyboard users cannot see
  // where their focus went.
  const visible = await page.evaluate(() => {
    const el = document.querySelector('.skip-link') as HTMLElement;
    return el.getBoundingClientRect().left >= 0;
  });
  expect(visible, 'The skip link must become visible when focused').toBe(true);

  await page.keyboard.press('Enter');

  // The tabindex on <main> is what makes this work in Safari; without it the
  // page scrolls but focus stays on the link, and the next Tab goes straight
  // back into the navigation.
  const landed = await page.evaluate(() => document.activeElement?.id);
  expect(landed, 'Enter on the skip link must move focus to the main landmark').toBe('main-content');
});

test('an open dialog keeps Tab inside it, and gives focus back on close', async ({ page }) => {
  await gotoApp(page, '/customers');

  const trigger = page.getByRole('button', { name: /add customer/i });
  await trigger.waitFor();
  await trigger.click();

  const dialog = page.locator('.modal-content[role="dialog"]');
  await expect(dialog).toBeVisible();

  // Tab all the way round the dialog and past where its last control is. If
  // the trap is missing, focus walks out onto the page behind, which is
  // covered by the overlay, so the user is editing a form they cannot see and
  // sighted keyboard users simply lose the caret.
  const escaped: string[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'body';
      return el.closest('.modal-content[role="dialog"]') ? 'in' : 'out';
    });
    if (inside !== 'in') escaped.push(`${i}:${inside}`);
  }
  expect(escaped, 'Focus left the open dialog while tabbing').toEqual([]);

  // Shift+Tab off the first control must wrap backwards, not fall out.
  await page.evaluate(() => {
    const first = document.querySelector('.modal-content[role="dialog"] button') as HTMLElement;
    first?.focus();
  });
  await page.keyboard.press('Shift+Tab');
  const stillIn = await page.evaluate(() =>
    Boolean(document.activeElement?.closest('.modal-content[role="dialog"]')),
  );
  expect(stillIn, 'Shift+Tab off the first control fell out of the dialog').toBe(true);

  // Closing must hand focus back to whatever opened it. Without this a
  // keyboard user is dropped on <body> and the next Tab restarts from the top
  // of the page, so closing a dialog opened from a table's last row sends
  // them back to the header.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const returned = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(returned, 'Focus was not returned to the trigger after closing').toMatch(/add customer/i);
});

test('sidebar dropdowns close on Escape', async ({ page }) => {
  await gotoApp(page, '/dashboard');

  const trigger = page.locator('[data-dropdown="user"] > button');
  await trigger.click();

  const openCount = await page.locator('.user-dropdown-menu.open').count();
  expect(openCount, 'The user menu should have opened').toBe(1);

  await page.keyboard.press('Escape');

  await expect(
    page.locator('.user-dropdown-menu.open'),
    'Escape must close the menu, it previously had no exit but selecting an item',
  ).toHaveCount(0);

  // Focus must not be stranded on a control that has just been hidden.
  const focused = await page.evaluate(() =>
    document.activeElement?.closest('[data-dropdown]') !== null,
  );
  expect(focused, 'Escape should return focus to the trigger, not to <body>').toBe(true);
});

test('a destructive confirmation does not open with the destructive button focused', async ({ page }) => {
  // Needs a row to delete, and empty mode removes every row by design, so the
  // dialog never opens there. A test that cannot reach the thing it tests
  // fails for a reason that is not a defect.
  test.skip(
    process.env.VITE_USE_MOCKS === 'empty',
    'needs a deletable row; empty mode has none',
  );
  await gotoApp(page, '/accounting-settings');

  const del = page.getByRole('button', { name: /^delete /i }).first();
  await del.waitFor();
  const triggerName = (await del.getAttribute('aria-label')) ?? '';
  await del.click();

  const dialog = page.locator('.confirm-dialog[role="alertdialog"]');
  await expect(dialog).toBeVisible();

  // The dialog must announce itself with its title and message, not as a bare
  // "dialog" with no context.
  await expect(dialog).toHaveAttribute('aria-labelledby', /.+/);
  await expect(dialog).toHaveAttribute('aria-describedby', /.+/);

  // The whole point of a confirmation is that confirming takes a deliberate
  // act. Opening with the destructive button focused meant a reflexive Enter
  // deleted the record with no further interaction.
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(focused, 'Focus must start on the safe option, not the destructive one').not.toMatch(/^delete$/i);

  // Tab must not leave the dialog.
  const escaped: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('.confirm-dialog')),
    );
    if (!inside) escaped.push(String(i));
  }
  expect(escaped, 'Focus left the open confirmation while tabbing').toEqual([]);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const returnedTo = await page.evaluate(
    () => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim(),
  );
  expect(returnedTo, 'Focus was not returned to the trigger').toBe(triggerName);
});
