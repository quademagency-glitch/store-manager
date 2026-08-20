import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A JSX element may not carry the same prop twice.
 *
 * React keeps the *last* occurrence and drops the rest, silently. That is
 * how ten elements across the app lost the class that actually styled them:
 * `className="btn btn-primary" … className="flex items-center gap-sm"`
 * renders a plain unstyled button, and `className="m-card" …
 * className="cursor-pointer"` renders a card with no card styling. The one
 * that made this visible was `MainLayout`'s hamburger, which lost
 * `mobile-menu-toggle`, the class carrying `display: none` above 768px.
 *
 * Nothing catches it today: it is valid JavaScript, so the build is happy,
 * and `eslint-plugin-react` (which has `jsx-no-duplicate-props`) is not a
 * dependency of this project. Rather than add one for a single rule, the
 * check lives here alongside the other static invariants.
 *
 * Scanning is textual on purpose, no parser dependency. The scanner tracks
 * quote and bracket depth so that a `=>` inside an `onClick`, a template
 * literal, or nested JSX in a prop expression (`actions={<div
 * className="…">}`) is not mistaken for the end of the tag or for a
 * duplicate attribute.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../src');

function walkJsx(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('._') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsx(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

type Dup = { file: string; line: number; prop: string; tag: string };

/** Attribute names worth guarding, the ones whose loss is silent. */
const WATCHED = ['className', 'style', 'onClick', 'onChange', 'key', 'value'];

function findDuplicateProps(source: string, file: string): Dup[] {
  const found: Dup[] = [];

  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '<' || !/[A-Za-z]/.test(source[i + 1] ?? '')) continue;

    let depth = 0;
    let quote: string | null = null;
    const seen = new Map<string, number>();

    for (let j = i + 1; j < source.length; j++) {
      const c = source[j];

      if (quote) {
        if (c === quote && source[j - 1] !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{' || c === '(' || c === '[') { depth++; continue; }
      if (c === '}' || c === ')' || c === ']') { depth--; continue; }

      // Only count a name as an attribute at depth 0, inside a `{}` prop
      // expression it belongs to nested JSX, not to this tag.
      if (depth === 0 && /\s/.test(source[j - 1] ?? '')) {
        for (const prop of WATCHED) {
          if (!source.startsWith(prop, j)) continue;
          let k = j + prop.length;
          while (/\s/.test(source[k] ?? '')) k++;
          if (source[k] !== '=') continue;
          seen.set(prop, (seen.get(prop) ?? 0) + 1);
        }
      }

      if (c === '>' && depth === 0) {
        for (const [prop, count] of seen) {
          if (count > 1) {
            found.push({
              file,
              line: source.slice(0, i).split('\n').length,
              prop,
              tag: source.slice(i, Math.min(j + 1, i + 120)).replace(/\s+/g, ' '),
            });
          }
        }
        i = j;
        break;
      }
    }
  }

  return found;
}

test('no JSX element declares the same prop twice', () => {
  const dups = walkJsx(SRC).flatMap((f) =>
    findDuplicateProps(fs.readFileSync(f, 'utf8'), path.relative(SRC, f)),
  );

  expect(
    dups,
    dups.length
      ? 'React silently keeps the last one and drops the rest:\n' +
          dups.map((d) => `  ${d.file}:${d.line}  duplicate \`${d.prop}\`\n    ${d.tag}`).join('\n')
      : '',
  ).toEqual([]);
});

/* The scanner is doing enough parsing-by-hand to be worth testing itself, a silent false negative here would let the real defect back in. */
test('scanner distinguishes real duplicates from lookalikes', () => {
  const cases: Array<[string, number, string]> = [
    ['<button className="a" className="b">', 1, 'plain duplicate'],
    ['<div className="a" onClick={() => go()} className="b">', 1, 'arrow fn between them'],
    ['<div className={`x ${y > 1 ? "a" : "b"}`} className="c">', 1, 'template literal with >'],
    ['<div className="a">', 0, 'single attribute'],
    ['<PageHeader actions={<div className="a"><b className="c" /></div>} />', 0, 'nested JSX in prop'],
    ['<div className="a"><span className="b" /></div>', 0, 'sibling elements'],
    ['<Modal title="t" onClose={() => x(">")} className="a" />', 0, 'gt inside a string'],
  ];

  for (const [src, expected, label] of cases) {
    expect(findDuplicateProps(src, 'inline').length, label).toBe(expected);
  }
});
