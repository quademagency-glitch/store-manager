# Repo structure

The canonical app code lives under `store-app/`:
- `store-app/client/`, React + Vite frontend (deployed to Vercel)
- `store-app/server/`, Express + Supabase backend (deployed to Railway)

**Never create `/client/` or `/server/` at the repo root.** Both have existed
before as stale duplicates left over from an earlier repo layout, and both
times Railway/Vercel silently built from the stale root copy instead of
`store-app/`, so real changes never reached production. A CI check
(`.github/workflows/no-stale-root-dirs.yml`) fails the build if either
reappears, if it fails, the fix is almost always to merge the new file into
`store-app/client/` or `store-app/server/` and delete the root copy, not to
disable the check.

Deploy config:
- `railway.json` locks Railway's build root to `store-app/server/`
- Vercel's dashboard Root Directory setting must stay **blank** (repo root), `vercel.json`'s `buildCommand`/`outputDirectory` already `cd` into
  `store-app/client/` themselves.

`vercel.json` takes **no comments of any kind.** Vercel validates it against
https://openapi.vercel.sh/vercel.json, which sets `additionalProperties: false`
at the top level *and* on every entry in `headers`/`redirects`/`rewrites`. A
`"//"` key, the usual trick for annotating JSON, fails the deploy with
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
content-hashed bundle was revalidated on every visit, the rule was present
and had never once taken effect. The catch-all still supplies the security
headers to `/assets/` because it matches first; only `Cache-Control` is
overridden. After changing this, verify against the deploy rather than
assuming:

```sh
curl -sI https://<deployment>/assets/<hashed>.js | grep -i cache-control
```

# Working on this repo from more than one session

Never take the `main` branch into a second working copy. Two working copies on
`main` at once is how the index silently desynchronises, and the symptom looks
completely ordinary.

It happened on 2026-08-19. One session was committing to `main` from a
temporary worktree while the primary checkout ran `git reset` onto `main`:

```
23:46:23  checkout: moving from chore/bump-landing-copy to main
23:46:26  reset: moving to origin/main            <- primary checkout
23:46:55  commit: copy(legal): omit the identity  <- other worktree
```

`main` advanced under the primary checkout, whose index and files stayed on the
older tree. `git status` then showed six staged files, indistinguishable from
work someone had staged deliberately. Committing would have reverted a change
that was already live in production, and nothing would have said so. Git
normally refuses to check out one branch in two worktrees; `checkout -B` and
`reset` walk straight past that.

**Use a detached worktree and push with an explicit refspec.** The branch is
never checked out twice, so the situation cannot arise:

```sh
git worktree add --detach /tmp/work origin/main
cd /tmp/work
# ... commit ...
git push origin HEAD:main
```

Do *not* `git checkout -B main` inside the worktree. That is the step that
caused this.

`.githooks/pre-commit` catches it if it happens anyway: it refuses a commit
whose staged content is byte-identical to an older version of the same file,
which is the signature of a stale index. `git revert` is unaffected, and
`git commit --no-verify` overrides it.

Hooks are versioned in `.githooks/` rather than `.git/hooks`, so a fresh clone
needs one command to arm them:

```sh
git config core.hooksPath .githooks
```

**A hook that is not executable is not a hook.** Git skips it silently, so a
non-executable one looks installed and does nothing. This repo lives on a
volume with `core.fileMode=false`, which means git ignores the executable bit
on disk and records a new file as `100644` however you `chmod` it. The
pre-commit hook was committed that way and was inert in every fresh clone,
which is the same shape of failure it exists to catch. Set the bit in the index
explicitly:

```sh
git update-index --chmod=+x .githooks/<hook>
```

CI's `executable-scripts` job fails the build if any hook in `.githooks/`, or
any tracked `*.sh`, is not `100755` in the index. It covered only `.githooks/`
until 2026-08-21, when `backup-scheduled.sh` turned up committed `100644`, and
the nightly backup job invokes it by path. Tracked `.js` and `.py` files carry
shebangs too but are always run through an interpreter, so they are out of
scope on purpose.
