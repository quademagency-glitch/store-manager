# Repo structure

The canonical app code lives under `store-app/`:
- `store-app/client/` — React + Vite frontend (deployed to Vercel)
- `store-app/server/` — Express + Supabase backend (deployed to Railway)

**Never create `/client/` or `/server/` at the repo root.** Both have existed
before as stale duplicates left over from an earlier repo layout, and both
times Railway/Vercel silently built from the stale root copy instead of
`store-app/`, so real changes never reached production. A CI check
(`.github/workflows/no-stale-root-dirs.yml`) fails the build if either
reappears — if it fails, the fix is almost always to merge the new file into
`store-app/client/` or `store-app/server/` and delete the root copy, not to
disable the check.

Deploy config:
- `railway.json` locks Railway's build root to `store-app/server/`
- Vercel's dashboard Root Directory setting must stay **blank** (repo root) —
  `vercel.json`'s `buildCommand`/`outputDirectory` already `cd` into
  `store-app/client/` themselves.
