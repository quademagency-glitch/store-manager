# Database migrations

```bash
npm run migrate:status     # what is applied, what is pending
npm run migrate:up         # apply everything pending
node db/migrate.js up --dry-run
```

Needs `DIRECT_URL` in `.env` — a direct Postgres connection string. The
Supabase JS client cannot execute DDL, which is why the two previous
"apply migration" scripts never worked.

## Adding a migration

Drop a `NNN_short_name.sql` file in `migrations/` and run `migrate:up`. Each
file runs inside its own transaction, so a failure rolls that file back
completely and stops the run — the recorded history always matches what
actually executed against the database.

**Never edit a migration that has been applied.** The runner stores a checksum
of every file and refuses to run if one changed, because the database no
longer matches the repo and no amount of re-running will fix that. Write a new
migration instead.

## Ordering

Files are applied in lexicographic filename order, not by number — `017` and
`018` each have two files (`017_customer_verification` and
`017_trial_unit_selection`, likewise for `018`), so the number is not unique.
Numbering also has real gaps: there is no `027`, and no `063`–`065`.

If you add a file that sorts *before* the newest applied migration — usually
after a branch merge — `status` flags it. The runner will still apply it;
check it does not assume a schema that only exists later.

## Baselining

`baseline` records every migration file as applied **without running any of
it**. It exists for one situation: a database that was migrated by hand with
no record kept. That was this project's state until 2026-08-06 — 64 files,
nothing tracked, and the only way to know whether a migration had run was to
inspect the schema. Migration 066 sat written-but-unapplied for a week that
way.

Production has already been baselined. You should not need this again.

Both destructive footguns are guarded:

- `up` refuses to run against a database with no migration record at all,
  rather than replaying 64 migrations over a live schema.
- `baseline` refuses when the public schema is empty, since that means the
  migrations genuinely have not run and recording them would strand them
  forever. `--empty` overrides.

## Exit codes

`0` success · `1` failed or refused · `2` bad usage. Safe to use in CI.
