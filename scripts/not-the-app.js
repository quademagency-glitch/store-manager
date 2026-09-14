/**
 * A tripwire, not a program.
 *
 * The API is built from `store-app/server/`, set as `rootDirectory` on the
 * store-manager-api service. If that setting is ever lost, Railway falls back
 * to building the repository root.
 *
 * Before 2026-09-14 there was no package.json at the root, so that mistake
 * failed immediately and obviously. Adding one, so `railway config plan` can
 * resolve the Railway SDK, quietly removed that protection: the root would
 * install cleanly, `npm start` would find a script, and the deploy would go
 * green while serving nothing. CLAUDE.md opens with the same failure in an
 * older form, where Vercel and Railway built stale root copies for weeks and
 * real changes never reached production.
 *
 * So the root's start script is this file, and it fails loudly on purpose.
 * Reaching it means the build root is wrong, not that this file is broken.
 */
const message = [
  '',
  'This is the repository root, not the API.',
  '',
  'Something started the root package.json, which means Railway lost the',
  'build root for the store-manager-api service. It should be:',
  '',
  '    rootDirectory = store-app/server/',
  '',
  'Check it on the service (Settings, Source) or in .railway/railway.ts, and',
  'see the deploy notes at the top of CLAUDE.md. Nothing is served from here.',
  '',
].join('\n');

console.error(message);
process.exit(1);
