/**
 * Guards how a new deployment reaches someone who already has the app open.
 *
 * This used to be `registerType: 'autoUpdate'`, which reloads every open tab
 * the moment a deploy lands, with no warning. Three deploys in one evening is
 * three reloads, which is how it was reported. On an ERP that is worse than
 * annoying: the reload arrives mid-session and throws away whatever was on
 * screen, so a half-finished sale or a part-filled product form is gone.
 *
 * components/ReloadPrompt.jsx was written to prevent exactly that, and could
 * never appear, because autoUpdate never sets `needRefresh`. It was dead UI
 * sitting next to the behaviour it existed to stop.
 *
 * Three things have to hold together, and any one of them alone is broken:
 *
 *   1. registerType must be 'prompt', or the page reloads on its own again.
 *   2. workbox.skipWaiting must NOT be set. Prompting depends on the new
 *      worker sitting in `waiting` until the reader accepts; skipWaiting
 *      activates it immediately and takes the choice away, which is
 *      autoUpdate wearing a different hat.
 *   3. ReloadPrompt must actually be rendered. Under 'prompt' it is the ONLY
 *      thing that tells anyone an update exists, so without it people sit on
 *      stale code indefinitely, which is the opposite failure and a worse one.
 *
 * The built worker is checked too, because 1 and 2 are only claims about the
 * source until you look at what shipped.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fail = (msg) => { console.error(`\n✗ pwa update check: ${msg}\n`); process.exit(1); };

const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

// ── 1 & 2. The source config ────────────────────────────────────────────
const configPath = join(root, 'vite.config.js');
const config = stripComments(readFileSync(configPath, 'utf8'));

const registerType = config.match(/registerType:\s*['"`](\w+)['"`]/)?.[1];
if (!registerType) fail(`no registerType found in ${configPath}; this check can no longer prove anything.`);
if (registerType !== 'prompt') {
  fail(
    `registerType is '${registerType}', expected 'prompt'.\n` +
    `  'autoUpdate' reloads every open tab the instant a deploy lands, discarding\n` +
    `  whatever the person was in the middle of typing. Use 'prompt' and let\n` +
    `  components/ReloadPrompt.jsx ask first.`
  );
}

if (/skipWaiting:\s*true/.test(config)) {
  fail(
    `workbox.skipWaiting is true, which defeats registerType: 'prompt'.\n` +
    `  The new worker would activate immediately instead of waiting for the\n` +
    `  reader to accept, so the page reloads under them anyway. Remove it; the\n` +
    `  register client posts SKIP_WAITING itself when the button is pressed.`
  );
}

// ── 3. Someone has to surface the update ────────────────────────────────
const app = stripComments(readFileSync(join(root, 'src/App.jsx'), 'utf8'));
if (!/<ReloadPrompt\s*\/>/.test(app)) {
  fail(
    `src/App.jsx does not render <ReloadPrompt />.\n` +
    `  Under registerType: 'prompt' that component is the only thing that tells\n` +
    `  anyone a new version exists. Without it, everyone stays on old code until\n` +
    `  they happen to hard-refresh.`
  );
}

// ── 4. What actually shipped ────────────────────────────────────────────
const swPath = join(root, 'dist/sw.js');
if (!existsSync(swPath)) {
  console.log(`✓ pwa update check: registerType '${registerType}', no skipWaiting, ReloadPrompt rendered. (dist/sw.js absent, run after a build to check the worker too.)`);
  process.exit(0);
}

const sw = readFileSync(swPath, 'utf8');

/* The prompt handshake: the worker waits, and only skips waiting when the
   page asks it to. vite-plugin-pwa emits this listener in prompt mode. */
const handshake = sw.indexOf('SKIP_WAITING');
if (handshake === -1) {
  fail('dist/sw.js has no SKIP_WAITING listener, so the Reload button cannot activate the new worker.');
}

/* Any self.skipWaiting() outside that listener is an unconditional skip, which
   is what autoUpdate emitted:  self.skipWaiting(),s.clientsClaim(),...  */
const stray = [...sw.matchAll(/self\.skipWaiting\(\)/g)]
  .map(m => m.index)
  .filter(i => i < handshake || i > handshake + 160);

if (stray.length > 0) {
  fail(
    `dist/sw.js calls self.skipWaiting() outside the SKIP_WAITING listener, so the\n` +
    `  new worker activates without being asked and the page reloads on its own.\n` +
    `  Check workbox.skipWaiting in vite.config.js.`
  );
}

console.log(`✓ pwa update check: registerType '${registerType}', no skipWaiting, ReloadPrompt rendered, worker waits for consent.`);
