/**
 * Guards against inline <style> elements while the CSP forbids them.
 *
 * vercel.json sends `style-src 'self'` with no 'unsafe-inline', no nonce and
 * no hash, so the browser refuses every <style> ELEMENT the app renders. The
 * companion `style-src-attr 'unsafe-inline'` covers only style="..."
 * ATTRIBUTES, which is why thousands of style={{...}} props keep working and
 * make the gap invisible.
 *
 * That cost the price tag printer and the price list printer: all of their
 * layout, including the rule that made the container visible, lived in a
 * <style> element. Both printed a blank page in production for months. It
 * could not be caught locally, because the Vite dev server sends no CSP at
 * all, and check-csp-hashes.mjs only inspects inline SCRIPTS.
 *
 * The policy is read from vercel.json rather than assumed, so adding
 * 'unsafe-inline', a nonce or a hash to style-src relaxes this check by
 * itself instead of leaving a stale rule behind.
 *
 * The fix for a failure here is a real stylesheet under src/styles imported
 * from index.css with a layer, not a change to the CSP.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const repoRoot = join(root, '../..');
const fail = (msg) => { console.error(`\n✗ inline style check: ${msg}\n`); process.exit(1); };

// 1. What does the deployed policy actually allow?
const vercelPath = join(repoRoot, 'vercel.json');
let policy;
try {
  const config = JSON.parse(readFileSync(vercelPath, 'utf8'));
  const headers = (config.headers || []).flatMap((h) => h.headers || []);
  policy = headers.find((h) => h.key.toLowerCase() === 'content-security-policy')?.value;
} catch (err) {
  fail(`cannot read ${vercelPath}: ${err.message}`);
}
if (!policy) fail('no Content-Security-Policy header found in vercel.json, so this check cannot prove anything.');

// style-src-elem wins over style-src for <style> elements when it is present.
const directive = (name) => {
  const match = policy.split(';').map((s) => s.trim()).find((s) => s === name || s.startsWith(`${name} `));
  return match ? match.slice(name.length).trim() : null;
};
const styleSrc = directive('style-src-elem') ?? directive('style-src') ?? directive('default-src');

if (styleSrc === null) {
  console.log('✓ inline style check: no style-src, style-src-elem or default-src in the policy, nothing to enforce.');
  process.exit(0);
}
if (/'unsafe-inline'|'nonce-|'sha(256|384|512)-/.test(styleSrc)) {
  console.log(`✓ inline style check: style-src permits inline styles (${styleSrc.trim()}), nothing to enforce.`);
  process.exit(0);
}

// 2. Does anything in src still render one?
/* Comments are stripped first, because the note explaining this rule names
   the very tag it forbids. */
const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const offenders = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    if (!/\.(jsx?|tsx?)$/.test(entry)) continue;

    const source = stripComments(readFileSync(path, 'utf8'));
    const reasons = [];
    if (/<style[\s>]/.test(source)) reasons.push('renders a <style> element');
    if (/createElement\(\s*['"`]style['"`]/.test(source)) reasons.push("calls createElement('style')");
    if (reasons.length) offenders.push(`${relative(root, path)}: ${reasons.join(', ')}`);
  }
};
walk(join(root, 'src'));

if (offenders.length) {
  fail(
    `the CSP sets style-src to "${styleSrc.trim()}", which blocks every <style> element, ` +
    `but these files render one:\n` +
    offenders.map((o) => `    ${o}`).join('\n') +
    `\n  The rules will be silently dropped in production and work fine on localhost, ` +
    `because the dev server sends no CSP.\n` +
    `  Move them to a stylesheet in src/styles and @import it from src/index.css with a layer. ` +
    `Do not add 'unsafe-inline' to the policy.`
  );
}

console.log(`✓ inline style check: style-src is "${styleSrc.trim()}"; no <style> elements in src.`);
