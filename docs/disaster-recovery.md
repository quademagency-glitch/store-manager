# Disaster recovery

What to do when data is lost, corrupted, or the platform is unavailable.

Read the first section before you need it. The rest is reference.

## Which tool for which problem

| What happened | Use | Why |
|---|---|---|
| Bad UPDATE/DELETE minutes ago | **Supabase PITR** | Rewinds to any second; nothing else is this precise |
| Bad migration | **Supabase PITR** to just before it | Schema and data move together |
| Supabase account lost, suspended, or billed out | **`backup-db.js` snapshot** | The only copy that isn't inside the thing that failed |
| One tenant wants their records | **`GET /api/businesses/me/export`** | Self-service, no engineer needed |
| API down, database fine | **Railway rollback** | Not a data problem |
| Frontend broken | **Vercel rollback** | Not a data problem |

The most common real incident is the first row. Reach for PITR before anything
else — it is faster and more precise than any snapshot.

## Targets

These are the current honest numbers, not aspirations.

| | Target | Reality |
|---|---|---|
| **RPO** (data you can lose) | ~2 minutes | Supabase PITR granularity on the current plan |
| **RTO** (time to restore) | under 1 hour | PITR restore of a small database, plus verification |
| RPO if the Supabase account is gone | since the last snapshot | Depends entirely on how often you run `backup-db.js` |

That last row is the one to fix first: **snapshots are only as good as their
schedule, and there is currently no schedule.** See "Gaps" below.

---

## 1. Recovering from a bad write or migration

Point-in-time recovery. Available on Supabase paid plans; confirm it is enabled
on the project **before** you need it.

1. Stop the bleeding. In Railway, scale the API to 0 replicas, or roll back to
   the previous deployment. Restoring while writes continue means restoring
   twice.
2. Supabase Dashboard → Database → Backups → Point in Time.
3. Choose a timestamp **before** the bad change. If you are unsure, go earlier —
   losing ten extra minutes beats restoring into corruption.
4. Restore. Small databases take minutes.
5. Verify before restarting the API (see Verification).
6. Bring the API back up.

**If PITR is not enabled on this project, this route does not exist.** Check now,
not during an incident.

## 2. Recovering from a lost Supabase account

This is what `scripts/backup-db.js` exists for. A snapshot is portable NDJSON
plus a manifest; nothing about it depends on Supabase.

1. Create a new Postgres database (Supabase or anywhere).
2. Apply migrations up to the version in the snapshot's `manifest.json`:
   ```bash
   cd store-app/server
   DIRECT_URL=<new-database-url> npm run migrate:up
   ```
   The manifest lists exactly which migrations the snapshot was taken at.
   **Restoring data into a schema it predates is the classic way a restore
   appears to work and then fails days later.**
3. Load each table, parents before children — the file order in `TABLES` in
   `backup-db.js` is already dependency-ordered.
4. Reissue every credential. The snapshot deliberately redacts manager PINs,
   API keys and gateway secrets (`manifest.json` lists which). They are not
   recoverable from a backup and should not be.
5. Point `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DIRECT_URL` at the new
   database in Railway.

## 3. Taking a snapshot

```bash
cd store-app/server
node scripts/backup-db.js --gzip                    # all tenants
node scripts/backup-db.js --gzip --out /mnt/backups # somewhere durable
node scripts/backup-db.js --business <uuid>         # one tenant
```

Requires `DIRECT_URL` — a direct Postgres connection string, not the Supabase
JS client, which cannot do this.

It streams through a server-side cursor, so a large table never has to fit in
memory. Output is one `.ndjson` per table plus `manifest.json` recording row
counts, redacted columns and the migration state.

**A snapshot on the machine that made it is not a backup.** Copy it somewhere
else — object storage, another machine, anywhere with a different failure mode.

## 4. Verification — do this every time

A restore you have not verified is a hope.

```sql
-- Row counts should match the snapshot manifest, or the PITR timestamp.
SELECT 'businesses' t, count(*) FROM businesses
UNION ALL SELECT 'users',     count(*) FROM users
UNION ALL SELECT 'products',  count(*) FROM products
UNION ALL SELECT 'sales',     count(*) FROM sales
UNION ALL SELECT 'sale_items',count(*) FROM sale_items;

-- Money is the thing people notice. Compare against a known day's takings.
SELECT date_trunc('day', created_at) d, count(*), sum(total_amount)
FROM sales WHERE created_at > now() - interval '7 days'
GROUP BY 1 ORDER BY 1 DESC;

-- Tenant isolation must survive a restore.
SELECT count(*) AS orphaned_sales
FROM sales s LEFT JOIN businesses b ON b.id = s.business_id
WHERE b.id IS NULL;   -- must be 0
```

Then, in the app: sign in, open the dashboard, ring up a test sale, print a
receipt. `GET /api/health/deep` should report every dependency `ok`.

## 5. Rolling back code

Neither of these touches data.

**API (Railway):** Dashboard → Deployments → pick the last good one → Redeploy.
Or `railway redeploy`. Note the graceful-shutdown handler drains in-flight
requests, so a rollback does not cut anyone off mid-sale.

**Frontend (Vercel):** Dashboard → Deployments → Promote a previous build.

If a migration is involved, roll the code back **first**, then the database —
new code against an old schema fails loudly, old code against a new schema
often fails quietly.

## 6. Escalation

- **Supabase** — dashboard support; paid plans have a support form with an SLA.
  Have the project ref (`dkhwwjzjmfejkkqwrgev`) and the incident window ready.
- **Railway** — dashboard support, and their status page.
- **Paystack** — if payments are affected, check their status page before
  assuming the fault is ours. Webhook deliveries retry automatically via the
  5-minute sweep, so a short Paystack outage is usually self-healing.

## Gaps — known, unresolved

Honesty is more useful here than a document that implies more safety than exists.

1. **Snapshots are manual.** `backup-db.js` runs when someone runs it. Until it
   is scheduled somewhere off this infrastructure, the "Supabase account lost"
   scenario has an RPO of "whenever you last remembered".
2. **PITR is assumed, not verified.** Confirm it is enabled on the project and
   note the retention window.
3. **No restore has ever been rehearsed.** A backup nobody has restored is a
   backup nobody knows works. Restore a snapshot into a scratch database and
   walk the verification queries — that exercise finds the problems, not the
   incident.
4. **No uptime monitoring.** Nothing currently watches `/api/health`. An
   external monitor hitting it every 60 seconds would mean you learn about an
   outage before a customer tells you.
