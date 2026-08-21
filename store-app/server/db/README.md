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
```

Builds the schema the migration files describe in a throwaway Postgres cluster,
introspects it and production, and diffs. Comparison is over catalog queries
rather than `pg_dump`, because pg_dump refuses to read a server newer than
itself (production is 17.x, local binaries are 16.x).

Needs `initdb` and `pg_ctl` on PATH, or a `SHADOW_DATABASE_URL`.
`shadow-bootstrap.sql` fabricates the Supabase surface the migrations expect,
the `anon` / `authenticated` / `service_role` roles, `auth.users`, the `storage`
schema, and Supabase's default grant posture. **It is a test scaffold and must
never run against production.**

### It currently reports drift, and that is the point

Two real findings, both consequences of the missing `027` and `063`, `065`:

1. **A rebuilt database would be less secure than production.** 22 function
   grants exist in a fresh rebuild that production has revoked, including
   `generate_po_number`, `generate_ar_invoice_number`, `handle_new_user` and
   `apply_accounting_starter_pack` being executable by **`anon`**, i.e.
   unauthenticated callers. Migration 063 revoked these in production; no file
   in this repo does. Three functions (`debug_whoami`, `is_manager`,
   `rls_auto_enable`) exist only in production for the same reason.

2. **Three migrations do not replay cleanly** on an empty database:
   `013_fix_user_creation.sql` (drops a constraint other objects depend on),
   `032_inventory_management.sql` (recreates an existing policy), and
   `056_fix_ar_invoices_column_names.sql` (renames a column that is not there
   yet). They succeeded against the live schema at the time; they would not
   survive a rebuild.

So treat the output as a report to read, not a gate to switch on. Do not wire
it into CI until the count reaches zero, or it will simply fail every build.

## Exit codes

`0` success · `1` failed, refused, or drift found · `2` bad usage.
Safe to use in CI, with the caveat about `db:drift` above.
