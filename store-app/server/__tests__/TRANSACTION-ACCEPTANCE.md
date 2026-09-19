# Financial transaction acceptance

Run `npm run test:checkout-db` in `store-app/server` with
`TRANSACTION_TEST_DATABASE_URL` pointing to a disposable, loopback PostgreSQL
database whose name starts with `quaderp_test_`. The database role needs permission to
create the fixture roles and schema. **The test replaces the public schema.**
It refuses remote hosts and databases without the test naming guard. Never
point it at production or a database containing data you want to keep.

CI supplies its own PostgreSQL 17 service and synthetic credentials. Tests
load isolated fixture tables plus the actual transaction migrations. They
exercise rollback, concurrent row locks, operation replay, branch boundaries,
financial grants, and historical corrections without calling an external API.

The lifecycle case creates a supplier purchase order, receives stock, records
a customer deposit and gift-card purchase, transfers gift value, settles a
sale using credit and cash, pays commission, and returns an item. It verifies
stock, till cash, customer credit, revenue, cost and commission recovery
against one coherent set of synthetic records. Each case starts with fresh
fixtures and does not share production customer data.

Browser acceptance scripts in `store-app/client/tests` separately cover the
screens, saved requests, reloads and identity changes. Their controlled API
responses are not proof of a hosted financial write or a Supabase Auth account
lifecycle. The database suite supplies transaction evidence; a hosted staging
account is still needed to verify real password change and subsequent login.
