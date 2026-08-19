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

`vercel.json` takes **no comments of any kind.** Vercel validates it against
https://openapi.vercel.sh/vercel.json, which sets `additionalProperties: false`
at the top level *and* on every entry in `headers`/`redirects`/`rewrites`. A
`"//"` key — the usual trick for annotating JSON — fails the deploy with
`Additional properties are not allowed ('//' was unexpected)` before anything
is built. `$schema` is the one non-functional key the schema permits. Explain
config decisions here instead. To check a change before pushing:

```sh
curl -sS https://openapi.vercel.sh/vercel.json -o /tmp/vercel-schema.json
python3 -c "
import json; from jsonschema import Draft7Validator
print(list(Draft7Validator(json.load(open('/tmp/vercel-schema.json')))
      .iter_errors(json.load(open('vercel.json')))) or 'valid')"
```

**Order matters in `vercel.json` `headers`.** Every matching rule is applied,
and where two rules set the same header key, the **last match wins**. The
`/assets/(.*)` immutable rule therefore has to sit *below* the `/(.*)`
catch-all, not above it. It sat above for a long time, so the catch-all's
`Cache-Control: max-age=0, must-revalidate` quietly overwrote it and every
content-hashed bundle was revalidated on every visit — the rule was present
and had never once taken effect. The catch-all still supplies the security
headers to `/assets/` because it matches first; only `Cache-Control` is
overridden. After changing this, verify against the deploy rather than
assuming:

```sh
curl -sI https://<deployment>/assets/<hashed>.js | grep -i cache-control
```
