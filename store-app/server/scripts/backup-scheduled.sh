#!/bin/bash
#
# Scheduled snapshot: take one, prove it is readable, prune old ones.
#
#   ./scripts/backup-scheduled.sh                 # into ~/QuadERP-Backups
#   BACKUP_DIR=/Volumes/Ext/erp ./scripts/backup-scheduled.sh
#   KEEP_DAYS=30 ./scripts/backup-scheduled.sh
#
# WHY THIS EXISTS
#
# The Supabase project is on the FREE plan, which has no point-in-time
# recovery — that is a paid add-on. So this script is not a belt-and-braces
# second copy alongside a managed backup. Until the plan changes, the files it
# writes are the only backup of the business that exists.
#
# WHY IT VERIFIES IMMEDIATELY
#
# A snapshot is worthless if it turns out to be truncated, and truncation is
# invisible: the file exists, the timestamp is right, the size looks plausible.
# The dry-run below reparses every row and compares the count against the
# manifest, so a bad snapshot is caught on the day it is taken rather than on
# the day it is needed. It costs a couple of seconds.
#
# WHY IT DOES NOT UPLOAD ANYWHERE
#
# The obvious move — run this in CI and keep the output as an artifact — is
# wrong here: this repository is PUBLIC, and artifacts on a public repository
# can be downloaded by anyone. That would publish every customer name and phone
# number in the database. Uploading to object storage needs an account and a
# card, which is a decision for the operator, not a default baked into a
# script.
#
# So this writes locally, and the honest limitation is that it only runs while
# the machine is awake. Point BACKUP_DIR at a synced folder (iCloud Drive,
# Dropbox, an external disk) and it becomes an off-machine backup for free.
# A snapshot that only exists on the machine that made it is not a backup.

set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-$HOME/QuadERP-Backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
LOG="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

say() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

say "── starting ─────────────────────────────────────────────"

# 1. Take it. --gzip because these are text and compress by roughly 10x.
if ! node scripts/backup-db.js --gzip --out "$BACKUP_DIR" >>"$LOG" 2>&1; then
  say "FAILED: backup-db.js — see $LOG"
  exit 1
fi

# The script prints where it wrote; find it rather than reconstructing the
# timestamp, which would drift if the naming ever changes.
LATEST=$(ls -dt "$BACKUP_DIR"/backup-* 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  say "FAILED: no snapshot directory appeared in $BACKUP_DIR"
  exit 1
fi

# 2. Prove it is readable. A backup nobody has read is a hope.
if ! node scripts/restore-db.js --from "$LATEST" --dry-run >>"$LOG" 2>&1; then
  say "FAILED: $LATEST did not verify — the snapshot is NOT intact"
  exit 1
fi

SIZE=$(du -sh "$LATEST" | cut -f1)
ROWS=$(node -e "
  const m = require('$LATEST/manifest.json');
  console.log(Object.values(m.tables).reduce((n, t) => n + (t.rows || 0), 0));
")
say "ok: $LATEST ($SIZE, $ROWS rows, verified)"

# 3. Prune. Deliberately after the verify: if today's snapshot is bad, the run
# has already exited and yesterday's is still there. Pruning first would delete
# good backups to make room for a broken one.
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name 'backup-*' -mtime +"$KEEP_DAYS" -print -exec rm -rf {} + 2>/dev/null | wc -l | tr -d ' ')
[ "$DELETED" != "0" ] && say "pruned $DELETED snapshot(s) older than $KEEP_DAYS days"

# 4. Warn if this is the only copy. Impossible to detect properly, so this
# checks the cheap proxy: is the destination somewhere that syncs off-machine?
case "$BACKUP_DIR" in
  *Dropbox*|*"CloudDocs"*|*"Google Drive"*|*OneDrive*|/Volumes/*) ;;
  *) say "note: $BACKUP_DIR is local-only. Point BACKUP_DIR at a synced folder or external disk." ;;
esac

say "── done ─────────────────────────────────────────────────"
