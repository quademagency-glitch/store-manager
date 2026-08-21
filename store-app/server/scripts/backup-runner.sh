#!/bin/bash
#
# The thing launchd actually starts. Wraps backup-scheduled.sh so that a
# failure is visible instead of silent.
#
# WHY A WRAPPER AT ALL
#
# The checkout lives on an external USB drive. If it is unplugged at 02:00,
# launchd tries to run a script that is not there, writes "no such file" to
# /tmp, and stops. Nothing else happens. You would find out weeks later, when
# you needed the backup.
#
# So this script is installed on the INTERNAL disk and the drive is treated as
# optional input rather than as the place the job lives. Install it with:
#
#     ./scripts/backup-runner.sh --install
#
# WHAT IT REPORTS, AND WHERE
#
# Not to a log nobody opens. Backups go to an iCloud folder, so this writes its
# status into the same folder, where it syncs to the phone alongside them:
#
#     LAST-SUCCESS.txt        refreshed on every good run
#     BACKUP-IS-FAILING.txt   created on a bad one, deleted on the next good one
#
# A file appearing in a folder you already look at beats a log file, and beats
# a notification banner that vanishes while you are asleep. It also survives
# the case this is really guarding: the machine being off for a fortnight. The
# date inside LAST-SUCCESS.txt is then simply old, which is the honest signal.
# Nothing can push an alert from a laptop that is not running.

set -uo pipefail

REPO="${QUADERP_REPO:-/Volumes/QUADEM/VIBE CODING/ERP}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/QuadERP-Backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

INSTALL_DIR="$HOME/Library/Application Support/QuadERP"
PLIST="$HOME/Library/LaunchAgents/app.quaderp.backup.plist"

OK_FILE="$BACKUP_DIR/LAST-SUCCESS.txt"
BAD_FILE="$BACKUP_DIR/BACKUP-IS-FAILING.txt"

now() { date '+%Y-%m-%d %H:%M:%S %Z'; }

# Both a file and a banner. The banner is a courtesy for when you happen to be
# at the machine; the file is the part that is actually reliable.
alarm() {
  mkdir -p "$BACKUP_DIR" 2>/dev/null || true
  {
    echo "QuadERP backup FAILED"
    echo "when:   $(now)"
    echo "reason: $1"
    echo ""
    echo "$2"
    echo ""
    echo "This file is rewritten on every failure and deleted automatically"
    echo "once a backup succeeds again. While it exists, you have no current"
    echo "backup of the production database."
  } > "$BAD_FILE"
  osascript -e "display notification \"$1\" with title \"QuadERP backup failed\"" 2>/dev/null || true
  echo "FAILED: $1" >&2
}

# ── Install mode ────────────────────────────────────────────────────────────
if [ "${1:-}" = "--install" ]; then
  set -e
  mkdir -p "$INSTALL_DIR" "$HOME/Library/LaunchAgents"
  # Copied onto the internal disk on purpose. Pointing launchd at the copy on
  # the USB drive would reintroduce exactly the failure this exists to report.
  cp "$0" "$INSTALL_DIR/backup-runner.sh"
  chmod +x "$INSTALL_DIR/backup-runner.sh"

  cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Label</key><string>app.quaderp.backup</string>
  <key>ProgramArguments</key>
  <array><string>$INSTALL_DIR/backup-runner.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>QUADERP_REPO</key><string>$REPO</string>
    <key>BACKUP_DIR</key><string>$BACKUP_DIR</string>
    <key>KEEP_DAYS</key><string>$KEEP_DAYS</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>/tmp/quaderp-backup.out</string>
  <key>StandardErrorPath</key><string>/tmp/quaderp-backup.err</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLISTEOF

  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "Installed. Runs daily at 02:00."
  echo "  runner: $INSTALL_DIR/backup-runner.sh"
  echo "  plist:  $PLIST"
  echo "  output: $BACKUP_DIR"
  echo ""
  echo "Run once now:   launchctl start app.quaderp.backup"
  echo "Remove:         launchctl unload $PLIST && rm $PLIST"
  exit 0
fi

# ── Normal run ──────────────────────────────────────────────────────────────

# StartCalendarInterval makes launchd run a missed job once the machine wakes,
# so this can fire at any hour. That is deliberate, see the plist comments.

if [ ! -d "$REPO" ]; then
  alarm "the drive holding the code is not mounted" \
        "Expected the checkout at:
    $REPO

Plug the drive in, or set QUADERP_REPO in $PLIST if the checkout moved.
No backup was taken tonight."
  exit 1
fi

cd "$REPO/store-app/server" || { alarm "checkout is present but incomplete" "Could not enter $REPO/store-app/server"; exit 1; }

if [ ! -f .env ]; then
  alarm "no .env, so there are no database credentials" \
        "Expected $REPO/store-app/server/.env containing DIRECT_URL."
  exit 1
fi

out=$(BACKUP_DIR="$BACKUP_DIR" KEEP_DAYS="$KEEP_DAYS" ./scripts/backup-scheduled.sh 2>&1)
status=$?

if [ $status -ne 0 ]; then
  alarm "backup-scheduled.sh exited $status" "$(printf '%s\n' "$out" | tail -25)"
  exit 1
fi

# Success. Clear any standing alarm, and leave a dated receipt: the single most
# useful thing to be able to check is not "did tonight work" but "how old is
# the newest backup I have".
rm -f "$BAD_FILE"
{
  echo "QuadERP backup OK"
  echo "when: $(now)"
  echo ""
  printf '%s\n' "$out" | grep '] ok:' || printf '%s\n' "$out" | tail -3
  echo ""
  echo "If the date above is more than a couple of days old, the nightly job"
  echo "has not been running. Check:  launchctl list | grep quaderp"
} > "$OK_FILE"

printf '%s\n' "$out"
