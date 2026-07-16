# QuadERP Load Test Suite

Simulates **1,000 concurrent users** against the QuadERP API to identify bottlenecks and breaking points.

## Prerequisites

- Node.js 20+
- A valid QuadERP user account (email + password)

## Quick Start

```bash
# From this directory:
chmod +x run.sh

AUTH_EMAIL=your@email.com AUTH_PASSWORD=yourpassword ./run.sh
```

Or run Artillery directly:

```bash
AUTH_EMAIL=your@email.com AUTH_PASSWORD=yourpassword \
  npx -y artillery@latest run config.yml --output reports/report.json
```

## What It Tests

| Scenario | Traffic % | Endpoints |
|----------|-----------|-----------|
| Dashboard Load | 40% | `/api/auth/me` → `/api/analytics/summary` |
| Browse Sales | 20% | `/api/auth/me` → `/api/sales?page=1&limit=50` |
| View Inventory | 15% | `/api/auth/me` → `/api/products?page=1&limit=50` |
| View Customers | 10% | `/api/auth/me` → `/api/customers?page=1&limit=50` |
| Health Check | 5% | `/api/health` (no auth) |
| View Ledger | 5% | `/api/auth/me` → `/api/ledger?page=1&limit=50` |
| View HR | 5% | `/api/auth/me` → `/api/hr/employees` |

## Load Phases

1. **Warm-up** (30s): 5 → 30 users/sec
2. **Ramp** (60s): 30 → 150 users/sec
3. **Sustained peak** (90s): 150 users/sec (~1,000 concurrent)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_EMAIL` | ✅ | Login email for test user |
| `AUTH_PASSWORD` | ✅ | Login password for test user |
| `LOAD_TEST_TARGET` | ❌ | Override API URL (default: Railway production) |

## Reports

After the test, find reports in `./reports/`:
- `report_YYYYMMDD_HHMMSS.json` — raw Artillery data
- `report_YYYYMMDD_HHMMSS.html` — visual HTML report (open in browser)

## Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| p50 response time | < 500ms | > 1s |
| p95 response time | < 3s | > 5s |
| p99 response time | < 10s | > 15s |
| Error rate (5xx) | < 5% | > 10% |
