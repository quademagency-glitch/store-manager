/**
 * The Content-Security-Policy the app is served with, read from
 * public/_headers (Cloudflare's headers file, copied into dist/ by Vite).
 *
 * Shared by check-csp-hashes.mjs and check-inline-style.mjs so both test the
 * policy production actually sends, not a copy that can drift. Until October
 * 2026 the policy lived in vercel.json.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HEADERS_PATH = join(dirname(fileURLToPath(import.meta.url)), '../public/_headers');

/** @returns {string | null} the policy value, or null if there is none */
export function readCspPolicy() {
  const lines = readFileSync(HEADERS_PATH, 'utf8').split('\n');
  const line = lines.find((l) => /^\s+Content-Security-Policy\s*:/i.test(l));
  return line ? line.slice(line.indexOf(':') + 1).trim() : null;
}
