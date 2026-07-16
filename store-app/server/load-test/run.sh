#!/usr/bin/env bash
set -euo pipefail

# ─── QuadERP Load Test Runner ──────────────────────────────────
# Runs Artillery against the production API and generates a report.
#
# Usage:
#   AUTH_EMAIL=you@example.com AUTH_PASSWORD=yourpass ./run.sh
# ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPORT_DIR="${SCRIPT_DIR}/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "${REPORT_DIR}"

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  QuadERP Load Test — 1,000 Concurrent Users           ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║  Target: Railway Production API                        ║"
echo "║  Duration: ~3 minutes                                  ║"
echo "║  Peak: 150 arrivals/sec ≈ 1,000 concurrent users       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

if [ -z "${AUTH_EMAIL:-}" ] || [ -z "${AUTH_PASSWORD:-}" ]; then
  echo "❌ Error: AUTH_EMAIL and AUTH_PASSWORD must be set."
  echo ""
  echo "Usage:"
  echo "  AUTH_EMAIL=admin@test.com AUTH_PASSWORD=test123 ./run.sh"
  echo ""
  exit 1
fi

echo "📊 Starting Artillery..."
echo ""

npx -y artillery@latest run \
  "${SCRIPT_DIR}/config.yml" \
  --output "${REPORT_DIR}/report_${TIMESTAMP}.json"

echo ""
echo "📈 Generating HTML report..."

npx -y artillery@latest report \
  "${REPORT_DIR}/report_${TIMESTAMP}.json" \
  --output "${REPORT_DIR}/report_${TIMESTAMP}.html"

echo ""
echo "✅ Done! Reports saved to:"
echo "   JSON: ${REPORT_DIR}/report_${TIMESTAMP}.json"
echo "   HTML: ${REPORT_DIR}/report_${TIMESTAMP}.html"
echo ""
echo "Open the HTML report:"
echo "   open ${REPORT_DIR}/report_${TIMESTAMP}.html"
