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
# recovery, that is a paid add-on. So this script is not a belt-and-braces
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
# The obvious move, run this in CI and keep the output as an artifact, is
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

# Relocatable on purpose. The scheduled job copies this script, backup-db.js
# and restore-db.js onto the internal disk and runs them from there, because
# macOS refuses a launchd agent read access to the removable volume this
# checkout lives on. Run from the repo with no overrides, the defaults below
# reproduce the original behaviour exactly.
#
# SCRIPT_DIR holds the .js files; WORK_DIR holds the .env that dotenv reads,
# and is the cwd. In the repo those are scripts/ and server/. In the installed
# copy they are lib/ and the install directory.
SCRIPT_DIR="${QUADERP_SCRIPT_DIR:-$(cd "$(dirname "$0")" && pwd)}"
WORK_DIR="${QUADERP_WORK_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"

cd "$WORK_DIR"

BACKUP_DIR="${BACKUP_DIR:-$HOME/QuadERP-Backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
# The log deliberately does not default into BACKUP_DIR when the scheduled job
# runs. macOS attributes each file to whichever process created it, and a
# launchd agent may not open a file that an interactive shell made, not even to
# delete it. Measured 2026-08-26: append, truncate and rm on such a path all
# return "Operation not permitted". A shared long-lived log is therefore the
# one file guaranteed to break the job the first time a human runs this by
# hand. The scheduled job points QUADERP_LOG at the internal disk instead.
LOG="${QUADERP_LOG:-$BACKUP_DIR/backup.log}"
mkdir -p "$(dirname "$LOG")"

mkdir -p "$BACKUP_DIR"

say() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

say "── starting ─────────────────────────────────────────────"

# 1. Take it. --gzip because these are text and compress by roughly 10x.
if ! TAKE_OUT=$(node "$SCRIPT_DIR/backup-db.js" --gzip --out "$BACKUP_DIR" 2>&1); then
  printf '%s\n' "$TAKE_OUT" >>"$LOG"
  say "FAILED: backup-db.js, see $LOG"
  exit 1
fi
printf '%s\n' "$TAKE_OUT" >>"$LOG"

# Taken from what the run just printed, not by scanning the directory for the
# newest thing in it.
#
# Scanning looks equivalent and is not. Snapshots taken by hand belong to the
# shell that took them, and the scheduled job cannot read inside those at all,
# so a directory listing can hand this job a snapshot it is forbidden to verify
# and the run fails on a backup that is perfectly fine. Parsing the line means
# this always verifies the snapshot it just wrote.
LATEST=$(printf '%s\n' "$TAKE_OUT" | sed -n 's/^Snapshot: //p' | tail -1)
if [ -z "$LATEST" ] || [ ! -d "$LATEST" ]; then
  # Older backup-db.js did not print the path. Falling back keeps this working
  # against a copy that has not been refreshed by --install.
  LATEST=$(ls -dt "$BACKUP_DIR"/backup-* 2>/dev/null | head -1)
fi
if [ -z "$LATEST" ]; then
  say "FAILED: no snapshot directory appeared in $BACKUP_DIR"
  exit 1
fi

# 2. Prove it is readable. A backup nobody has read is a hope.
if ! VERIFY_OUT=$(node "$SCRIPT_DIR/restore-db.js" --from "$LATEST" --dry-run 2>&1); then
  printf '%s\n' "$VERIFY_OUT" >>"$LOG"
  say "FAILED: $LATEST did not verify, the snapshot is NOT intact"
  exit 1
fi
printf '%s\n' "$VERIFY_OUT" >>"$LOG"

# The summary comes from what the two runs above already printed, rather than
# from measuring the directory again.
#
# `du -sh "$LATEST"` was here, and it aborted the run on 2026-08-26 AFTER a
# perfectly good backup had been taken and verified: it walks into the
# directory, and something about a freshly written iCloud folder refuses that
# to this process even though the same process had just created it. With
# `set -e` in force, a cosmetic size string for a log line took the whole job
# down and raised an alarm saying there was no backup, when there was one,
# complete and verified, sitting right there.
#
# Reading the numbers out of the output that has already been captured cannot
# fail, needs no second look at the filesystem, and is what the log line was
# describing anyway.
SIZE=$(printf '%s\n' "$TAKE_OUT" | sed -n 's/^Done\. .*, \(.*\)$/\1/p' | tail -1)
ROWS=$(printf '%s\n' "$VERIFY_OUT" | sed -n 's/^.*tables, \([0-9]*\) rows.*$/\1/p' | tail -1)
say "ok: $LATEST (${SIZE:-size unknown}, ${ROWS:-?} rows, verified)"

# 3. Prune. Deliberately after the verify: if today's snapshot is bad, the run
# has already exited and yesterday's is still there. Pruning first would delete
# good backups to make room for a broken one.
#
# Nothing from here on may fail the run. By this line the backup exists and has
# been verified, so exiting non-zero raises "you have no current backup" about
# a night that went fine. That is not a hypothetical: this script is
# `set -euo pipefail`, and on 2026-08-26 the find below returned non-zero
# because it could not stat a directory a human had created in the same folder.
# pipefail carried that through the command substitution, set -e turned it into
# an exit, and a complete verified snapshot was reported as a failure.
#
# So the housekeeping runs with errors collected rather than fatal, and says so
# when it could not do its job. An unpruned snapshot costs disk. A false alarm
# costs trust in the alarm, which is the only part of this that matters.
set +e
PRUNE_OUT=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name 'backup-*' -mtime +"$KEEP_DAYS" -print -exec rm -rf {} + 2>&1)
PRUNE_STATUS=$?
set -e

DELETED=$(printf '%s\n' "$PRUNE_OUT" | grep -c "$BACKUP_DIR/backup-" || true)
[ "$DELETED" != "0" ] && say "pruned $DELETED snapshot(s) older than $KEEP_DAYS days"
if [ "$PRUNE_STATUS" -ne 0 ]; then
  printf '%s\n' "$PRUNE_OUT" >>"$LOG"
  say "note: could not prune everything (exit $PRUNE_STATUS), see $LOG. The backup itself is fine."
fi

# 4. Warn if this is the only copy. Impossible to detect properly, so this
# checks the cheap proxy: is the destination somewhere that syncs off-machine?
case "$BACKUP_DIR" in
  *Dropbox*|*"CloudDocs"*|*"Google Drive"*|*OneDrive*|/Volumes/*) ;;
  *) say "note: $BACKUP_DIR is local-only. Point BACKUP_DIR at a synced folder or external disk." ;;
esac

say "── done ─────────────────────────────────────────────────"
