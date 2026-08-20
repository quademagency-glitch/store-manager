import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Static guard against the bug class that produced the ghost "Adjust Stock"
 * button and the invisible search input: a `var(--x)` whose custom property is
 * never defined. An undefined custom property invalidates its entire
 * declaration at computed-value time, so the element silently loses its
 * background or colour with no console error.
 *
 * This audit found 13 such properties across 80 references.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('._') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(css|jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('every referenced CSS custom property is defined somewhere', () => {
  const files = walk(SRC);

  const defined = new Set<string>();
  const referenced = new Map<string, string[]>();

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');

    // Definitions: `--x: value` in CSS, or `'--x': value` in a JSX style object.
    for (const m of text.matchAll(/(?:^|[;{\s'"])(--[\w-]+)\s*'?"?\s*:/g)) {
      defined.add(m[1]);
    }

    // References without a fallback. `var(--x, fallback)` is intentionally
    // tolerant of an undefined property, so it is not a defect.
    for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      const rel = path.relative(SRC, file);
      const list = referenced.get(m[1]) || [];
      if (!list.includes(rel)) list.push(rel);
      referenced.set(m[1], list);
    }
  }

  const undefinedProps = [...referenced.entries()]
    .filter(([name]) => !defined.has(name))
    .map(([name, files]) => `  ${name}  ← ${files.slice(0, 4).join(', ')}${files.length > 4 ? ` (+${files.length - 4} more)` : ''}`);

  expect(
    undefinedProps.length,
    `Undefined CSS custom properties referenced without a fallback:\n${undefinedProps.join('\n')}`,
  ).toBe(0);
});

test('the dark theme block introduces no token the light default lacks', () => {
  const tokenFile = path.join(SRC, 'styles/design-tokens-custom-properties.css');
  const css = fs.readFileSync(tokenFile, 'utf8');

  const blockOf = (selector: string) => {
    const start = css.indexOf(selector);
    if (start === -1) return '';
    const open = css.indexOf('{', start);
    const close = css.indexOf('}', open);
    return css.slice(open, close);
  };

  const keys = (block: string) => new Set([...block.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

  const root = keys(blockOf(':root'));
  const dark = keys(blockOf('[data-theme="dark"]'));

  // `:root` is the complete contract; the dark block may only override.
  // Anything defined only in dark is missing in light, that asymmetry is what
  // left `.btn-primary:hover` with no glow in dark mode.
  const darkOnly = [...dark].filter((k) => !root.has(k));

  expect(darkOnly, `Defined in [data-theme="dark"] but missing from :root: ${darkOnly.join(', ')}`).toEqual([]);
});
