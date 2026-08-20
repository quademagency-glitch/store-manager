#!/usr/bin/env node
/**
 * Verifies that the inline-script hashes in the CSP still match the built app.
 *
 * WHY: index.html contains two inline <script> blocks, one resolves the
 * light/dark theme before first paint and must stay inline to avoid a flash of
 * unstyled content. The CSP allows them by SHA-256 hash. Change index.html by
 * even one character and the hash no longer matches; once the policy is
 * enforcing (rather than Report-Only) the browser refuses to run the theme
 * script and the app renders as a blank white page.
 *
 * That is a nasty failure to discover in production, so this makes it a build
 * failure instead. Runs against dist/index.html, not the source, because the
 * build can alter the document around the scripts.
 *
 * Usage: node scripts/check-csp-hashes.mjs   (after `npm run build`)
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const distIndex = resolve(here, '../dist/index.html');
const vercelJson = resolve(here, '../../../vercel.json');

function fail(msg) {
  console.error(`\n✖ CSP hash check failed\n\n${msg}\n`);
  process.exit(1);
}

if (!existsSync(distIndex)) fail(`No build found at ${distIndex}.\nRun \`npm run build\` first.`);
if (!existsSync(vercelJson)) fail(`Could not find ${vercelJson}.`);

const html = readFileSync(distIndex, 'utf8');
const config = JSON.parse(readFileSync(vercelJson, 'utf8'));

const csp = (config.headers ?? [])
  .flatMap((b) => b.headers ?? [])
  .find((h) => h.key.startsWith('Content-Security-Policy'));

if (!csp) fail('No Content-Security-Policy header found in vercel.json.');

// Inline scripts only, those with a src attribute are covered by 'self'.
const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

if (inline.length === 0) {
  console.log('✓ CSP hash check: no inline scripts in the build, nothing to verify.');
  process.exit(0);
}

const missing = [];
for (const body of inline) {
  const hash = `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`;
  if (!csp.value.includes(hash)) {
    missing.push({ hash, preview: body.trim().split('\n')[0].slice(0, 70) });
  }
}

if (missing.length > 0) {
  fail(
    `${missing.length} inline script(s) in dist/index.html are NOT allowed by the CSP in vercel.json.\n\n` +
    missing.map((m) => `  ${m.hash}\n    from: ${m.preview}...`).join('\n\n') +
    `\n\nThis happens when index.html is edited. Once the CSP is enforcing (not\n` +
    `Report-Only) the browser will refuse to run these, and the app will render\n` +
    `as a blank white page.\n\n` +
    `Fix: replace the sha256- values in the script-src directive of vercel.json\n` +
    `with the ones listed above.`
  );
}

console.log(`✓ CSP hash check: all ${inline.length} inline script(s) allowed by the policy.`);
