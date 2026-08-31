/**
 * Fails the build if the code stops matching what the privacy pages promise.
 *
 * Privacy.jsx and Dpa.jsx already read `analyticsAllowed()`, so they cannot lie
 * about *whether* analytics runs. They can still lie about what it collects,
 * because that half is prose describing configuration nobody re-reads:
 *
 *   clause 14.2   "no third party analytics that builds a profile of you"
 *                 holds only because nothing calls posthog.identify(). One
 *                 added line makes a published legal claim false, silently,
 *                 with no test failing.
 *
 *   clause 7      "click tracking and session recording are switched off"
 *                 holds only while six separate init options stay set.
 *                 autocapture: false covers none of the other five, and each
 *                 defaults to whatever the PostHog dashboard says. On
 *                 2026-08-29 the dashboard said yes to four of them and they
 *                 ran in production for about 25 minutes.
 *
 * So the claims are asserted here instead of trusted. This one DOES fail the
 * build, unlike check-legal-entity.mjs: an unpublished registration number
 * inconveniences the operator, while this makes a document already served to
 * customers untrue.
 *
 * Usage: node scripts/check-privacy-claims.mjs   (runs as part of npm run build)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src');
const MAIN = join(SRC, 'main.jsx');

/** Every init option the notice depends on, and the sentence it holds up. */
const REQUIRED_OPTIONS = [
  ['person_profiles', "'identified_only'", 'clause 14.2: no profile is built against a named person'],
  ['autocapture', 'false', 'clause 7: click tracking is switched off'],
  ['disable_session_recording', 'true', 'clause 7: session recording is switched off'],
  ['capture_heatmaps', 'false', 'clause 7: heatmaps are click tracking'],
  ['capture_dead_clicks', 'false', 'clause 7: dead clicks carry the text of the element clicked'],
  ['capture_exceptions', 'false', 'clause 7: exception capture ships messages and stack traces'],
  ['disable_surveys', 'true', 'clause 7: surveys are not part of what customers were told'],
];

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('._')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const failures = [];

// ── 1. Nothing may identify a person to PostHog ───────────────────────────
for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, 'utf8');
  if (!/posthog/i.test(text)) continue;          // only files that touch PostHog
  text.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;      // comments discuss it freely
    if (/\.identify\s*\(/.test(line)) {
      failures.push(
        `${relative(SRC, file)}:${i + 1} calls .identify()\n`
        + '      Privacy clause 14.2 promises no third party builds a profile of you.\n'
        + '      Identifying a user to PostHog makes that sentence false. Either drop\n'
        + '      the call, or change clause 14.2 and give customers notice first.',
      );
    }
  });
}

// ── 2. The capture switches the notice describes must still be set ────────
const main = readFileSync(MAIN, 'utf8');
const init = main.slice(main.indexOf('posthog.init('));

for (const [option, expected, claim] of REQUIRED_OPTIONS) {
  const found = new RegExp(`${option}\\s*:\\s*([^,\\n]+)`).exec(init);
  const actual = found ? found[1].trim() : null;
  if (actual !== expected) {
    failures.push(
      `main.jsx: ${option} is ${actual === null ? 'not set' : actual}, expected ${expected}\n`
      + `      ${claim}`,
    );
  }
}

if (failures.length === 0) {
  console.log(`✓ privacy claims check: ${REQUIRED_OPTIONS.length} capture options set, nothing identifies a user`);
  process.exit(0);
}

console.error('\n✗ privacy claims check FAILED\n');
console.error('The code no longer matches what /privacy and /dpa tell customers:\n');
for (const f of failures) console.error(`  - ${f}\n`);
console.error('These pages are published. Fix the code, or change the pages and');
console.error('notify customers, before shipping.\n');
process.exit(1);
