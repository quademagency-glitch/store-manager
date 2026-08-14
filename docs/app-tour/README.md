# App tour

Screenshots, a walkthrough video and load metrics for every page in the app,
all produced by one script:

```
store-app/client/tools/app-tour.mjs
```

## What's here

| File | What it is |
| --- | --- |
| `screenshots/` | 78 full-page PNGs — 39 routes × light and dark, 1440×900 at 2× |
| `app-tour.mp4` | Narrated walkthrough of every page, H.264, 1440×900 |
| `app-tour.webm` | The same recording as Playwright produced it (VP8) |
| `metrics.json` | Per-route load timings from a production build |

The flow chart that explains how the app fits together is a separate
deliverable — see the artifact link in the chat, or rebuild it from
`docs/app-tour/` if it moves into the repo.

## Reproducing it

The tour drives the same mock harness the Playwright suites use, so it needs
no backend, no login and no real data. It reads its route list from
`store-app/client/tests/routes.ts`, so adding a page to that manifest puts it
in the tour automatically — the map cannot drift from the app without the
visual suite noticing first.

Point it at a **production build**, not the dev server. Dev serves unbundled
ESM over hundreds of requests and its timings mean nothing.

```bash
cd store-app/client

# 1. Build with mocks compiled in, to a throwaway outDir.
#    Never build mocks into dist/ — that is the directory Vercel deploys.
VITE_USE_MOCKS=true npx vite build --outDir dist-tour

# 2. Serve it.
npx vite preview --outDir dist-tour --port 5179

# 3. Capture. Skips the public pages — see below.
node tools/app-tour.mjs --port=5179 --skip=90-login,91-forgot-password

# 4. Transcode for sharing.
cd ../../docs/app-tour
ffmpeg -i app-tour.webm -c:v libx264 -crf 23 -pix_fmt yuv420p \
  -movflags +faststart app-tour.mp4
```

### The two public pages are captured separately

Mock mode hands the app a signed-in session, so `/login` immediately redirects
to the dashboard and the "login" screenshot is really a picture of Business
Overview. Those two pages are shot against a server with mocks **off**, which
is why the command above skips them:

```bash
npx vite --port 5180                      # no VITE_USE_MOCKS
node tools/app-tour.mjs --port=5180 --no-video \
  --only=90-login,91-forgot-password
```

## Flags

| Flag | Effect |
| --- | --- |
| `--port=N` | Server to drive (default 5178) |
| `--out=DIR` | Output root. Resolved against `tools/`, not the cwd, so the default already lands on `docs/app-tour` — passing a relative path here is how a full parallel set once got written into `store-app/docs/` while the real screenshots sat untouched |
| `--only=a,b` | Capture just these routes, by manifest name |
| `--skip=a,b` | Capture everything except these |
| `--limit=N` | First N routes only — for smoke tests |
| `--themes=a,b` | Themes to capture stills for (default `light,dark`) |
| `--no-video` | Screenshots and metrics only |
| `--metrics-only` | Refresh `metrics.json` without re-shooting anything |

## Reading the metrics

Timings are collected in a **second pass with a real wall clock**. The capture
pass pins time with `clock.setFixedTime` so the dashboard greeting and relative
dates stay stable across runs, and that also empties the Performance
timeline — navigation, paint and resource entries all come back missing. The
two cannot share a page.

Two caveats worth keeping in mind when quoting these numbers:

- **They are front-end figures.** Every API call is answered from a local
  fixture, not Railway and Supabase, so real API latency sits on top of
  everything reported here.
- **`transferredKb` reads 0 on warm loads.** The app is a PWA; after the first
  visit the service worker serves the bundle from its precache. For true
  first-visit numbers, measure with `serviceWorkers: 'block'` on a fresh
  context.

## Housekeeping

`dist-tour/` and `docs/app-tour/` are build output, not source. The video and
78 retina PNGs run to roughly 55 MB, so add them to `.gitignore` unless you
specifically want them versioned:

```
store-app/client/dist-tour/
docs/app-tour/screenshots/
docs/app-tour/*.mp4
docs/app-tour/*.webm
```
