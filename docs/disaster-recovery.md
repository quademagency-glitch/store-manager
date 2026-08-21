# Disaster recovery

What to do when data is lost, corrupted, or the platform is unavailable.

Read the first two sections before you need them. The rest is reference.

> **Read this first.** The Supabase project is on the **free plan**, which does
> not include point-in-time recovery. PITR is a paid add-on. An earlier version
> of this document told you to reach for PITR as the first response to a bad
> write, **that option does not exist on this project.** Verified 2026-08-19
> against the live organisation, which reports `plan: free`.
>
> The practical consequence: `backup-db.js` snapshots are not a second line of
> defence behind a managed backup. **They are the only backup that exists.**
> Everything in section 3 follows from that.

## Which tool for which problem

| What happened | Use | Why |
|---|---|---|
| Bad UPDATE/DELETE, or a bad migration | **Latest snapshot** (§4) | PITR is unavailable on the free plan. You lose everything since the last snapshot. |
| Supabase account lost, suspended, or billed out | **Latest snapshot** (§4) | The only copy that isn't inside the thing that failed |
| One tenant wants their records | **`GET /api/businesses/me/export`** | Self-service, no engineer needed |
| API down, database fine | **Railway rollback** (§7) | Not a data problem |
| Frontend broken | **Vercel rollback** (§7) | Not a data problem |

## Targets

Honest numbers, not aspirations.

| | Current reality | What it would be on Supabase Pro + PITR |
|---|---|---|
| **RPO** (data you can lose) | **Up to 24 hours**, since the last nightly snapshot. Before scheduling one (§3), it was "since someone last remembered", which was never. | ~2 minutes |
| **RTO** (time to restore) | 1-2 hours: rebuild schema, load snapshot, reissue credentials, verify | Under 1 hour |
| Verified by a real restore? | **No.** See §9. |, |

**The single highest-value fix here is a Supabase paid plan.** It converts the
worst case from "lose up to a day of every customer's sales" to "lose two
minutes", and it is cheaper than the first afternoon you would spend
reconstructing a day of takings by hand from paper receipts.

---

## 1. Prevention: what runs automatically

| What | Where | How you find out it broke |
|---|---|---|
| Nightly snapshot, 02:00 | launchd on the operator's machine, `docs/ops/app.quaderp.backup.plist` | `backup.log` in `BACKUP_DIR`; the job exits non-zero |
| Snapshot integrity check | Runs inside the same job, immediately after | Same log, a bad snapshot fails the run |
| API uptime probe, every 5 min | GitHub Actions, `.github/workflows/uptime.yml` | GitHub emails the repo owner on failure |

Set up the nightly snapshot by following the instructions at the top of the
plist. **Until that is installed, nothing is backing anything up.**

Both of these run somewhere other than production, on purpose. A check that
runs on Railway cannot tell you Railway is down.

## 2. Taking a snapshot by hand

Do this before anything risky, a migration, a bulk import, a data fix.

```sh
cd store-app/server
node scripts/backup-db.js --gzip                       # all tenants
node scripts/backup-db.js --gzip --out /Volumes/Ext    # somewhere durable
node scripts/backup-db.js --business <uuid>            # one tenant
```

Requires `DIRECT_URL`, a direct Postgres connection string. The Supabase JS
client cannot do this.

It streams through a server-side cursor, so a large table never has to fit in
memory. Output is one `.ndjson` per table plus `manifest.json` recording row
counts, redacted columns and the exact migration state.

**A snapshot on the machine that made it is not a backup.** Copy it somewhere
with a different failure mode.

**Do not put snapshots in CI artifacts.** This repository is public, and
artifacts on a public repository are downloadable by anyone. That would publish
every customer name and phone number in the database.

## 3. Checking a snapshot is intact

```sh
node scripts/restore-db.js --from <snapshot-dir> --dry-run
```

Reads and reparses every row, and compares each table against its manifest
count. Touches no database and needs no credentials.

Worth running on any snapshot you are about to rely on. Truncation is invisible
from the outside, the file exists, the timestamp is right, the size looks
plausible, and it is exactly what a half-finished copy to a USB drive looks
like.

## 4. Restoring

```sh
cd store-app/server

# 1. Point at the new database and rebuild the schema from scratch.
DIRECT_URL=<new-database-url> npm run migrate:up

# 2. Check the snapshot before trusting it.
node scripts/restore-db.js --from <snapshot-dir> --dry-run

# 3. Load it.
DIRECT_URL=<new-database-url> node scripts/restore-db.js \
    --from <snapshot-dir> --i-mean-it
```

`--i-mean-it` is required for anything writing to the `public` schema, because
by far the most likely way to make an incident worse is to run a restore
against the database that is still fine.

Then:

4. **Reissue every credential.** Snapshots deliberately redact manager PINs,
   API keys and gateway secrets, `manifest.json` lists which. They are stored
   irreversibly and are not recoverable by anyone, including you. That is the
   correct behaviour, not a limitation.
5. Point `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DIRECT_URL` at the
   new database in Railway.
6. Run the verification in §6 **before** letting anyone in.

**Apply migrations before loading data, never after.** Loading a snapshot into
a schema it predates is the classic way a restore appears to work and then
fails days later. `manifest.json` records exactly which migrations the snapshot
was taken at.

## 5. Rehearsing a restore without a second database

```sh
node scripts/restore-db.js --from <snapshot-dir> --schema rehearsal
# ... verify ...
# then, in SQL:  DROP SCHEMA rehearsal CASCADE;
```

Builds a scratch schema from the live table definitions and loads the snapshot
into it, alongside the real data and touching none of it.

**What this proves:** the files parse, the ordering works, the rows are accepted
by the real column types, and the counts come back.

**What it does not prove:** that `npm run migrate:up` builds a correct schema
from empty. Only a genuinely separate database proves that, see §9.

## 6. Verification, do this every time

A restore you have not verified is a hope.

```sql
-- Row counts should match the snapshot manifest.
SELECT 'businesses' t, count(*) FROM businesses
UNION ALL SELECT 'users',      count(*) FROM users
UNION ALL SELECT 'products',   count(*) FROM products
UNION ALL SELECT 'customers',  count(*) FROM customers
UNION ALL SELECT 'sales',      count(*) FROM sales
UNION ALL SELECT 'sale_items', count(*) FROM sale_items;

-- Money is what people notice. Compare against a known day's takings.
SELECT date_trunc('day', created_at) d, count(*), sum(total_amount)
FROM sales WHERE created_at > now() - interval '7 days'
GROUP BY 1 ORDER BY 1 DESC;

-- Tenant isolation must survive a restore.
SELECT count(*) AS orphaned_sales
FROM sales s LEFT JOIN businesses b ON b.id = s.business_id
WHERE b.id IS NULL;   -- must be 0

-- SECURITY: no privileged routine may be callable with the public anon key.
-- Must return zero rows. See migration 072 for why this is checked by hand.
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('process_sale_transaction','record_ar_payment','record_ap_payment',
                    'undo_import_batch','seed_default_accounting_templates')
  AND has_function_privilege('anon', p.oid, 'EXECUTE');

-- SECURITY: customers must be business-scoped, not always-true. Must be 0.
SELECT count(*) FROM pg_policies
WHERE schemaname='public' AND tablename='customers'
  AND COALESCE(qual::text, with_check::text) NOT LIKE '%get_user_business_id%';
```

Then, in the app: sign in, open the dashboard, ring up a test sale, print a
receipt. `GET /api/health/deep` should report every dependency `ok`.

The last two queries exist because of what §9 found. **Do not skip them.**

## 7. Rolling back code

Neither of these touches data.

**API (Railway):** Dashboard → Deployments → pick the last good one → Redeploy.
The graceful-shutdown handler drains in-flight requests, so a rollback does not
cut anyone off mid-sale.

**Frontend (Vercel):** Dashboard → Deployments → Promote a previous build.

If a migration is involved, roll the code back **first**, then the database,
new code against an old schema fails loudly, old code against a new schema
often fails quietly.

## 8. Escalation

- **Supabase**, dashboard support. Free plan has no SLA; this is a queue, not
  a phone number. Have the project ref (`dkhwwjzjmfejkkqwrgev`) and the
  incident window ready.
- **Railway**, dashboard support and their status page.
- **Paystack**, if payments are affected, check their status page before
  assuming the fault is ours. Webhook deliveries retry automatically via the
  5-minute sweep, so a short Paystack outage is usually self-healing.

## 9. What rehearsing found, and what is still open

The first rehearsal, on 2026-08-19, found a defect that had been latent since
July and could not have been found any other way.

**Two migrations existed only in production.** Security hardening applied
directly to the live database on 2026-07-26 was never written to files or
recorded in `schema_migrations`, the directory jumps 062 to 066. Following §4
faithfully after a total loss would have rebuilt production with privileged
`SECURITY DEFINER` routines executable by `anon` (the key that ships in the
browser bundle), and the `customers` RLS policies back to always-true, exposing
every tenant's customer list to every other tenant.

Nothing was ever exposed. The hardening is live and correct. What was broken
was the ability to *rebuild* it, a failure that only surfaces on the day it
matters most, while following the written procedure, under pressure.

Fixed by `072_reassert_security_hardening.sql`, which asserts the end state
idempotently and verifies it before committing. The two security queries in §6
are there so a future gap is caught by the checklist rather than by luck.

**Still open:**

1. **No PITR.** Free plan. Worst-case data loss is a full day. Fixing this is a
   billing decision and is the highest-value item on this page.
2. **No restore into a genuinely separate database has been done.** The scratch
   schema rehearsal (§5) exercises the data path but not `migrate:up` against an
   empty database. Doing it properly needs a spare Postgres; the free
   organisation is at its 2-project limit.
3. **The nightly snapshot only runs while the machine is awake.** It is a
   laptop. A week away is a week without backups, and nothing will say so.
4. **`/api/health/deep` answers unauthenticated callers in full**, including
   container hostname, pid and the proxy chain. Set `HEALTH_CHECK_TOKEN` in
   Railway to reduce it to a bare status for anonymous callers. Minor, but free.
