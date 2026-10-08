# Database migrations

```bash
npm run migrate:status     # what is applied, what is pending
npm run migrate:up         # apply everything pending
node db/migrate.js up --dry-run
```

Needs `DIRECT_URL` in `.env`, a direct Postgres connection string. The
Supabase JS client cannot execute DDL, which is why the two previous
"apply migration" scripts never worked.

## Adding a migration

Drop a `NNN_short_name.sql` file in `migrations/` and run `migrate:up`. Each
file runs inside its own transaction, so a failure rolls that file back
completely and stops the run, the recorded history always matches what
actually executed against the database.

**Never edit a migration that has been applied.** The runner stores a checksum
of every file and refuses to run if one changed, because the database no
longer matches the repo and no amount of re-running will fix that. Write a new
migration instead.

## Ordering

Files are applied in lexicographic filename order, not by number, `017` and
`018` each have two files (`017_customer_verification` and
`017_trial_unit_selection`, likewise for `018`), so the number is not unique.
Numbering also has real gaps: there is no `027`, and no `063`, `065`.

If you add a file that sorts *before* the newest applied migration, usually
after a branch merge, `status` flags it. The runner will still apply it;
check it does not assume a schema that only exists later.

## Baselining

`baseline` records every migration file as applied **without running any of
it**. It exists for one situation: a database that was migrated by hand with
no record kept. That was this project's state until 2026-08-06, 64 files,
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

## Schema drift

```bash
npm run db:drift                                  # throwaway local cluster
SHADOW_DATABASE_URL=postgres://… npm run db:drift # reuse a scratch database
npm run db:drift -- --keep                        # leave the cluster up to poke at
npm run db:drift -- --definitions                 # also print the source of production-only objects
```

This machine has Postgres 17 from Homebrew, keg-only, so put it on PATH for
the run: `PATH="/usr/local/opt/postgresql@17/bin:$PATH" npm run db:drift`.

Builds the schema the migration files describe in a throwaway Postgres cluster,
introspects it and production, and diffs. Comparison is over catalog queries
rather than `pg_dump`, because pg_dump refuses to read a server newer than
itself (production is 17.x, local binaries are 16.x).

Needs `initdb` and `pg_ctl` on PATH, or a `SHADOW_DATABASE_URL`.
`shadow-bootstrap.sql` fabricates the Supabase surface the migrations expect,
the `anon` / `authenticated` / `service_role` roles, `auth.users`, the `storage`
schema, and Supabase's default grant posture. **It is a test scaffold and must
never run against production.**

### Where it stands (2026-10-08): 0 differences

The first full run found production holding objects no file created (from 027
and 063-065, applied by hand and never committed), and a rebuild that came out
less secure than production because 072 aborts on a fresh database. Migration
104 reconciled both, removing the two leftovers it found (`debug_whoami()`,
executable by anon, and an unused `is_manager()`) and closing `promotions`,
which no code reads but any signed-in user could list. The report is now
**0 differences**. Since the baseline also recorded 059 and 062 without
running them, a non-zero result after any hand change is worth reading at once.

Two kinds of object are ignored as not ours: the runner's `schema_migrations`
table and Supabase's `rls_auto_enable()`.

Four files still do not replay on an empty database, and they cannot be edited
(the runner checksums applied files): `013_fix_user_creation.sql`,
`032_inventory_management.sql`, `056_fix_ar_invoices_column_names.sql` and
`072_reassert_security_hardening.sql`. The rebuild continues past them and 104
restores what they would have produced, which is why the diff is still zero.
The tool exits 1 while they fail, so keep it out of CI.

## Exit codes

`0` success · `1` failed, refused, or drift found · `2` bad usage.
Safe to use in CI, with the caveat about `db:drift` above.
