/**
 * Guards the @supabase/realtime-js stub.
 *
 * vite.config.js aliases realtime-js to src/lib/realtime-stub.js, because
 * nothing in this app opens a realtime channel and shipping the real client
 * costs ~52KB of the entry chunk for a websocket that never connects.
 *
 * The risk with that swap is a Supabase upgrade quietly starting to call
 * something the stub does not implement. `setAuth` is the dangerous one: it
 * runs on every auth token change, so a missing method breaks sign-in rather
 * than breaking realtime, and it would do so in production, at runtime, on a
 * path with no test coverage.
 *
 * So rather than trusting a hand-written list, this reads the INSTALLED
 * supabase-js bundle, extracts every `this.realtime.<method>` it calls, and
 * fails if the stub is missing one. Upgrade Supabase, get a red build.
 *
 * It also fails if the app itself starts using realtime, since at that point
 * the stub should be removed rather than worked around.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fail = (msg) => { console.error(`\n✗ realtime stub check: ${msg}\n`); process.exit(1); };

// 1. What does supabase-js actually call on this.realtime?
const bundle = join(root, 'node_modules/@supabase/supabase-js/dist/index.mjs');
let src;
try { src = readFileSync(bundle, 'utf8'); }
catch { fail(`cannot read ${bundle}, is supabase-js installed?`); }

const called = new Set(
  [...src.matchAll(/this\.realtime\.([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1])
);
if (called.size === 0) {
  fail('found no `this.realtime.x()` calls in supabase-js. Its internals changed shape, so this check is no longer proving anything, re-derive it before trusting the stub.');
}

// 2. Does the stub implement all of them?
const stubPath = join(root, 'src/lib/realtime-stub.js');
const stub = readFileSync(stubPath, 'utf8');
const body = stub.slice(stub.indexOf('export class RealtimeClient'));
const missing = [...called].filter((m) => !new RegExp(`\\b${m}\\s*\\(`).test(body));
if (missing.length) {
  fail(
    `supabase-js calls this.realtime.{${missing.join(', ')}} but the stub does not implement ` +
    `${missing.length === 1 ? 'it' : 'them'}.\n  Add ${missing.length === 1 ? 'it' : 'them'} to ${stubPath}, ` +
    `or drop the alias in vite.config.js and ship the real client.\n` +
    `  Note: setAuth runs on every token refresh, so a gap here breaks sign-in, not realtime.`
  );
}

// 3. Has the app started using realtime? Then the stub is the wrong answer.
const offenders = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(js|jsx|ts|tsx)$/.test(e)) continue;
    if (p.includes('realtime-stub')) continue;
    const t = readFileSync(p, 'utf8');
    if (/\.channel\s*\(|postgres_changes|removeAllChannels\s*\(/.test(t)) offenders.push(p.replace(root + '/', ''));
  }
};
walk(join(root, 'src'));
if (offenders.length) {
  fail(
    `these files look like they use realtime, which the stub disables:\n` +
    offenders.map((o) => `    ${o}`).join('\n') +
    `\n  Remove the alias in vite.config.js and src/lib/realtime-stub.js to ship the real client.`
  );
}

console.log(`✓ realtime stub check: covers this.realtime.{${[...called].sort().join(', ')}}; no realtime usage in src.`);
