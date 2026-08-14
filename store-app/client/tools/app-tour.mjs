/**
 * App tour — screenshots, a narrated walkthrough video, and load metrics for
 * every route in the app.
 *
 * Drives the same mock harness the Playwright suites use (VITE_USE_MOCKS), so
 * it needs no backend, no login and no real data, and the route list is
 * imported from tests/routes.ts rather than duplicated — adding a page to the
 * manifest puts it in the tour automatically.
 *
 *   node tools/app-tour.mjs --port=5178
 *
 * `--out` is resolved against this file's own directory, not the cwd, so the
 * default already points at the repo's docs/app-tour and is usually what you
 * want. Passing `--out=../../docs/app-tour` — as this line used to suggest —
 * is one level short and silently writes a whole parallel set into
 * store-app/docs/ instead, leaving the real screenshots untouched.
 *
 * Point it at a `vite preview` server (a real production build) rather than
 * the dev server when the numbers matter: dev serves unbundled ESM over
 * hundreds of requests and its timings say nothing about production.
 *
 * Flags:
 *   --port=N        server to drive                        (default 5178)
 *   --out=DIR       output root                            (default ../../docs/app-tour)
 *   --limit=N       first N routes only, for smoke testing (default all)
 *   --no-video      screenshots + metrics only
 *   --themes=a,b    which themes to capture stills for     (default light,dark)
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile, rm, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ROUTES, PUBLIC_ROUTES, FIXED_TIME } from '../tests/routes.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const PORT = Number(arg('port', 5178));
const BASE = `http://localhost:${PORT}`;
const OUT = path.resolve(HERE, arg('out', '../../../docs/app-tour'));
const LIMIT = Number(arg('limit', 0));
const THEMES = arg('themes', 'light,dark').split(',');
const WITH_VIDEO = !flag('no-video');
const VIEWPORT = { width: 1440, height: 900 };

/** Pages worth a second pass in dark mode inside the video reel. */
const DARK_REEL = new Set(['01-dashboard', '03-sales-pos', '11-accounts-receivable', '24-business-overview', '36-profit-loss']);

const SECTIONS = [
  { at: '01-dashboard', title: 'Dashboard' },
  { at: '02-inventory', title: 'Store Operations' },
  { at: '09-reconciliation', title: 'Accounting' },
  { at: '17-customers', title: 'CRM' },
  { at: '21-hr-attendance', title: 'People / HR' },
  { at: '24-business-overview', title: 'Administration' },
  { at: '36-profit-loss', title: 'Reports' },
  { at: '90-login', title: 'Public Pages' },
];

const stops = [...APP_ROUTES, ...PUBLIC_ROUTES];

/* SECTIONS and DARK_REEL address routes by name, so renumbering the manifest
   silently unhooks them — the title cards and the dark reel just stop
   appearing, and the tour still exits 0. Fail here instead. */
{
  const known = new Set(stops.map((r) => r.name));
  const missing = [...SECTIONS.map((s) => s.at), ...DARK_REEL].filter((n) => !known.has(n));
  if (missing.length) {
    console.error(
      `These names are referenced by SECTIONS/DARK_REEL but are not in tests/routes.ts: ${missing.join(', ')}.\n` +
        'The route manifest was probably renumbered — update the names above to match.',
    );
    process.exit(1);
  }
}

/**
 * `--only=90-login,91-forgot-password` re-captures a subset.
 *
 * Needed because the public pages can't be shot from the mock harness at all:
 * mock mode hands the app a signed-in session, so /login immediately redirects
 * to the business dashboard and the "login" screenshot is really a picture of
 * Business Overview. Those two get re-run against a server with mocks off.
 */
const ONLY = arg('only', '').split(',').filter(Boolean);

/**
 * `--skip=90-login,91-forgot-password` protects stills captured elsewhere.
 *
 * Re-running the mock tour over the public pages does not just produce a
 * useless screenshot, it destroys a good one: the mock session redirects
 * /login to the dashboard, so the capture silently overwrites the real login
 * page shot with a picture of Business Overview.
 */
const SKIP = arg('skip', '').split(',').filter(Boolean);
const selected = (ONLY.length ? stops.filter((r) => ONLY.includes(r.name)) : stops).filter(
  (r) => !SKIP.includes(r.name),
);
const routes = LIMIT ? selected.slice(0, LIMIT) : selected;

if (!routes.length) {
  console.error(`No routes matched --only=${ONLY.join(',')}`);
  process.exit(1);
}

/**
 * Seeds an active location so location-scoped pages don't sit in a null state,
 * and a theme *only if one isn't already set* — this script flips the theme at
 * runtime between passes, and an unconditional set would stomp it on every
 * subsequent navigation, since init scripts re-run per document.
 */
const INIT = `
  try {
    localStorage.setItem('active_location_id', 'mock-loc');
    if (!localStorage.getItem('app-theme')) localStorage.setItem('app-theme', 'light');
    // The in-app product tour auto-starts for anyone who hasn't finished it,
    // and storage is fresh on every capture — so its spotlight modal landed on
    // top of all 80 stills, showing the dashboard's opening step over whatever
    // page was really being shot. This tour films the app, not that one.
    localStorage.setItem('tour_completed', 'true');
  } catch (e) {}
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Write metrics.json, keeping rows for routes this run did not visit.
 *
 * A plain overwrite is wrong for exactly the reason `--skip` exists: the public
 * pages are captured in a second pass (`--only=90-login,91-forgot-password`
 * against a server with mocks off), and that pass used to replace the whole
 * file with its own two rows — silently discarding the timings for the other
 * 37 routes that had just been measured. The screenshots were protected from
 * this; the metrics were not.
 *
 * Rows are keyed by route name, this run's rows win, and the order follows the
 * manifest so the file stays readable rather than in whatever order passes ran.
 */
async function writeMetrics(rows, problems) {
  const file = path.join(OUT, 'metrics.json');

  let previous = [];
  try {
    previous = JSON.parse(await readFile(file, 'utf8')).routes ?? [];
  } catch {
    // No usable file yet — first run, or it was hand-edited into invalid JSON.
    // Either way this run's rows are the whole truth.
  }

  const merged = new Map(previous.map((r) => [r.name, r]));
  for (const row of rows) merged.set(row.name, row);

  const order = new Map(stops.map((r, i) => [r.name, i]));
  const routes = [...merged.values()].sort(
    (a, b) => (order.get(a.name) ?? Infinity) - (order.get(b.name) ?? Infinity),
  );

  await writeFile(
    file,
    JSON.stringify({ capturedAt: new Date().toISOString(), base: BASE, viewport: VIEWPORT, routes, problems }, null, 2),
  );
}

async function main() {
  await mkdir(path.join(OUT, 'screenshots'), { recursive: true });
  if (WITH_VIDEO) await rm(path.join(OUT, '.video-raw'), { recursive: true, force: true });

  const browser = await chromium.launch();

  // Timings without re-shooting anything. The capture pass is the slow part
  // (80 full-page screenshots and a 4-minute recording), and re-running it just
  // to refresh numbers also overwrites stills that were deliberately captured
  // against a different server — which is how the real /login screenshots got
  // clobbered once already.
  if (flag('metrics-only')) {
    const perf = await measurePass(browser, () => {});
    await browser.close();
    const rows = routes.map((r) => ({
      name: r.name,
      path: r.path,
      screenshot: `screenshots/${r.name}-light.png`,
      ...(perf.get(r.name) ?? {}),
    }));
    await writeMetrics(rows, []);
    console.log(`metrics refreshed for ${rows.length} routes`);
    return;
  }

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    reducedMotion: 'no-preference',
    ...(WITH_VIDEO ? { recordVideo: { dir: path.join(OUT, '.video-raw'), size: VIEWPORT } } : {}),
  });

  const page = await context.newPage();
  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript(INIT);

  // Console/page errors are attributed to whichever route is on screen, so the
  // report can say which page produced them rather than just a global count.
  let current = 'startup';
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push({ route: current, kind: 'console', text: m.text().slice(0, 300) });
  });
  page.on('pageerror', (e) => problems.push({ route: current, kind: 'pageerror', text: String(e).slice(0, 300) }));

  const metrics = [];
  let index = 0;

  if (WITH_VIDEO) await titleCard(page, 'QuadERP', 'Full application walkthrough');

  for (const theme of ['light']) {
    for (const route of routes) {
      index += 1;
      current = route.name;
      const section = SECTIONS.find((s) => s.at === route.name);
      if (WITH_VIDEO && section) await titleCard(page, section.title, '');

      const m = await visit(page, route, theme, { index, total: routes.length, video: WITH_VIDEO });
      metrics.push(m);
    }
  }

  // Dark-mode reel — a handful of pages, choreographed like the light tour.
  if (WITH_VIDEO && THEMES.includes('dark')) {
    await titleCard(page, 'Dark Mode', 'The same pages, second theme');
    for (const route of routes.filter((r) => DARK_REEL.has(r.name))) {
      current = `${route.name} (dark)`;
      await visit(page, route, 'dark', { video: true, quiet: true });
    }
  }

  if (WITH_VIDEO) await titleCard(page, 'QuadERP', `${routes.length} pages · light + dark`, 2200);

  await page.close();
  await context.close();

  /* The remaining stills run in their own context, with no recorder attached.
     They used to share the tour's page, which meant all 40 dark navigations
     were filmed as well — the recording ended with 40 seconds of uncaptioned
     pages flicking past, because the camera does not care that the loop only
     asked for screenshots. */
  for (const theme of THEMES.filter((t) => t !== 'light')) {
    const stillCtx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
    const stillPage = await stillCtx.newPage();
    await stillPage.clock.setFixedTime(FIXED_TIME);
    await stillPage.addInitScript(INIT);
    for (const route of routes) {
      current = `${route.name} (${theme})`;
      await visit(stillPage, route, theme, { quiet: true });
    }
    await stillCtx.close();
  }

  const perf = await measurePass(browser, (name) => (current = name));

  await browser.close();

  if (WITH_VIDEO) {
    const raw = await readdir(path.join(OUT, '.video-raw'));
    // Skip macOS AppleDouble stubs. On this exFAT volume every real file gets a
    // 4 KB `._name` sidecar, and `.find()` matched that first — the rename then
    // produced a 4 KB "video" that no player could open while the real 21 MB
    // recording sat untouched next to it. Same hazard the Playwright config
    // already filters with `testIgnore: '**/._*'`.
    const webm = raw.find((f) => f.endsWith('.webm') && !f.startsWith('._'));
    if (webm) await rename(path.join(OUT, '.video-raw', webm), path.join(OUT, 'app-tour.webm'));
  }

  for (const m of metrics) Object.assign(m, perf.get(m.name) ?? {});

  await writeMetrics(metrics, problems);

  const failed = metrics.filter((m) => m.error || m.redirectedTo);
  const med = (key) => {
    const v = metrics.map((m) => m[key]).filter((n) => typeof n === 'number').sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : '-';
  };
  console.log(`\ncaptured ${metrics.length} routes · ${problems.length} console/page errors · ${failed.length} route problems`);
  console.log(`median  fcp ${med('fcpMs')}ms · load ${med('loadMs')}ms · interactive ${med('interactiveMs')}ms · ${med('transferredKb')}KB`);
  for (const f of failed) console.log(`  ! ${f.name}: ${f.error ?? `redirected to ${f.redirectedTo}`}`);
}

/** Navigate, settle, screenshot, and (optionally) perform for the camera. */
async function visit(page, route, theme, { index, total, video = false, quiet = false } = {}) {
  const rec = { name: route.name, path: route.path, theme };

  await page.evaluate((t) => localStorage.setItem('app-theme', t), theme).catch(() => {});

  const t0 = Date.now();
  try {
    await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    rec.error = String(e).slice(0, 200);
    return rec;
  }

  // Code-split routes render an empty Suspense fallback until their chunk
  // lands; capturing inside that window yields a blank page.
  await page.locator('.route-suspense-fallback').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  if (await page.locator('.recharts-wrapper').count()) await sleep(1200);
  await sleep(350);
  rec.settledMs = Date.now() - t0;

  // Route-specific setup shared with the Playwright suites — see `prepare` in
  // tests/routes.ts. Failures are recorded rather than thrown: a tour that
  // aborts halfway leaves a half-written screenshot set behind.
  if (route.prepare) {
    await route.prepare(page).catch((e) => {
      rec.prepareError = String(e).slice(0, 160);
    });
    await sleep(250);
  }

  const nonce = await page.evaluate(() => window.__TEST_NONCE__).catch(() => undefined);
  rec.nonce = nonce ?? null;

  const landed = new URL(page.url()).pathname;
  if (landed !== route.path) rec.redirectedTo = landed;
  if (/^\/login/.test(landed) && !route.path.startsWith('/login')) {
    rec.error = 'redirected to /login — mock mode not active on this server';
  }

  const file = path.join(OUT, 'screenshots', `${route.name}-${theme}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }).catch((e) => {
    rec.error = `screenshot failed: ${String(e).slice(0, 120)}`;
  });
  rec.screenshot = path.relative(OUT, file);
  rec.pageHeight = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => null);

  if (!quiet) {
    const label = `${String(index).padStart(2, '0')}/${total}`;
    console.log(`${label}  ${route.name.padEnd(26)} settled ${String(rec.settledMs).padStart(5)}ms  ${rec.error ?? ''}`);
  }

  if (video) {
    await caption(page, prettyName(route.name), route.path, theme);
    await sleep(1100);
    await scrollThrough(page);
    await page.evaluate(() => document.getElementById('__tour_caption__')?.remove()).catch(() => {});
  }

  return rec;
}

/**
 * Second pass, in its own context, purely for load metrics.
 *
 * It cannot share the capture pass: `clock.setFixedTime` pins the wall clock so
 * the dashboard greeting and relative dates stay stable across runs, but it
 * also empties the Performance timeline — navigation, paint and resource
 * entries all come back missing, which is what made every timing here null on
 * the first run. So the tour keeps its frozen clock and the numbers are taken
 * again with a real one.
 *
 * Each route gets a full document navigation, so the Navigation Timing entry
 * describes that route's own cold load rather than a client-side transition.
 */
async function measurePass(browser, setCurrent) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.addInitScript(INIT);
  const out = new Map();

  for (const route of routes) {
    setCurrent(`${route.name} (metrics)`);
    const t0 = Date.now();
    try {
      await page.goto(BASE + route.path, { waitUntil: 'load', timeout: 30000 });
      await page.locator('.route-suspense-fallback').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      const t = await timings(page);
      out.set(route.name, { ...t, interactiveMs: Date.now() - t0 });
    } catch (e) {
      out.set(route.name, { metricsError: String(e).slice(0, 160) });
    }
  }

  await context.close();
  return out;
}

/** Real navigation per route means the Navigation Timing entry is meaningful. */
async function timings(page) {
  return page
    .evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      const res = performance.getEntriesByType('resource');
      return {
        ttfbMs: n ? Math.round(n.responseStart - n.startTime) : null,
        domContentLoadedMs: n ? Math.round(n.domContentLoadedEventEnd - n.startTime) : null,
        loadMs: n ? Math.round(n.loadEventEnd - n.startTime) : null,
        fcpMs: fcp ? Math.round(fcp.startTime) : null,
        requests: res.length,
        transferredKb: Math.round(res.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024),
      };
    })
    .catch(() => ({}));
}

/** Initialisms the app spells in caps; everything else is title-cased. */
const CAPS = new Set(['pos', 'hr', 'ar', 'ap', 'crm', 'pnl']);

const prettyName = (name) =>
  name
    .replace(/^\d+-/, '')
    .split('-')
    .map((w) => (CAPS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');

/**
 * Caption overlay for the video. Injected *after* the screenshot so stills stay
 * clean, and removed before the next navigation.
 */
async function caption(page, title, subtitle, theme) {
  await page
    .evaluate(
      ({ title, subtitle, theme }) => {
        document.getElementById('__tour_caption__')?.remove();
        const el = document.createElement('div');
        el.id = '__tour_caption__';
        el.style.cssText = `
          position:fixed;left:24px;bottom:24px;z-index:2147483647;pointer-events:none;
          font:600 15px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif;
          padding:10px 16px;border-radius:10px;letter-spacing:.2px;
          background:${theme === 'dark' ? 'rgba(15,23,42,.92)' : 'rgba(17,24,39,.88)'};
          color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.28);
          animation:__tourIn .28s ease-out both;`;
        el.innerHTML =
          `<div>${title}</div>` +
          `<div style="font-weight:400;font-size:12px;opacity:.72;margin-top:2px">${subtitle}</div>`;
        const kf = document.createElement('style');
        kf.textContent = '@keyframes __tourIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}';
        el.appendChild(kf);
        document.body.appendChild(el);
      },
      { title, subtitle, theme },
    )
    .catch(() => {});
}

/**
 * Stepped scroll rather than `behavior:'smooth'`: the page clock is pinned, and
 * a fixed number of small jumps is both deterministic and reads as a natural
 * pan in the recording.
 */
async function scrollThrough(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => 0);
  const extra = height - VIEWPORT.height;
  if (extra < 120) {
    await sleep(600);
    return;
  }
  const steps = Math.min(30, Math.max(8, Math.round(extra / 90)));
  for (let i = 1; i <= steps; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round((extra * i) / steps));
    await sleep(55);
  }
  await sleep(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(250);
}

/** Full-bleed interstitial, drawn over whatever page is currently loaded. */
async function titleCard(page, title, subtitle, hold = 1500) {
  await page
    .evaluate(
      ({ title, subtitle }) => {
        const el = document.createElement('div');
        el.id = '__tour_title__';
        el.style.cssText = `
          position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:10px;text-align:center;
          background:linear-gradient(135deg,#0f172a,#1e293b 55%,#0b1220);
          color:#fff;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;
          animation:__tcIn .35s ease-out both;`;
        el.innerHTML =
          `<div style="font-size:44px;font-weight:700;letter-spacing:-.5px">${title}</div>` +
          (subtitle ? `<div style="font-size:17px;opacity:.7;font-weight:400">${subtitle}</div>` : '') +
          `<style>@keyframes __tcIn{from{opacity:0}to{opacity:1}}</style>`;
        document.body.appendChild(el);
      },
      { title, subtitle },
    )
    .catch(() => {});
  await sleep(hold);
  await page.evaluate(() => document.getElementById('__tour_title__')?.remove()).catch(() => {});
  await sleep(120);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
