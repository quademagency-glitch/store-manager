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
# ONE-TIME PERMISSION, ON THIS MACHINE
#
# macOS will not let a scheduled job read a removable volume without being told
# to. Until that grant exists the job runs, finds the files, and cannot open
# any of them. Grant /bin/bash Full Disk Access, or keep the checkout on the
# internal disk. The preflight below detects this case by name.
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

  # Resolve node NOW, from the shell doing the install, and bake the absolute
  # path into the plist.
  #
  # The previous version set a PATH of /usr/local/bin:/opt/homebrew/bin:... and
  # its comment claimed that solved this. It did not. Node here is installed by
  # nvm, at ~/.nvm/versions/node/<version>/bin/node, which is on none of those
  # paths, so the job would have failed with "node: command not found" even once
  # its other problems were fixed. A list of plausible directories is a guess;
  # asking the shell where node actually is, is not.
  NODE_BIN="$(command -v node || true)"
  if [ -z "$NODE_BIN" ]; then
    echo "Cannot find node on this PATH. Install it, or run this with the" >&2
    echo "right node active (e.g. 'nvm use') so it can be resolved." >&2
    exit 1
  fi
  echo "Using node at: $NODE_BIN"

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
    <key>NODE_BIN</key><string>$NODE_BIN</string>
    <key>PATH</key><string>$(dirname "$NODE_BIN"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
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

# Preflight, in the order the failures actually happen. Each case gets its own
# message, because "backup failed" plus a stack trace is what made the last two
# outages take an afternoon each to explain.

if [ ! -d "$REPO" ]; then
  alarm "the drive holding the code is not mounted" \
        "Expected the checkout at:
    $REPO

Plug the drive in, or set QUADERP_REPO in $PLIST if the checkout moved.
No backup was taken tonight."
  exit 1
fi

# The one that actually bit, on 2026-08-22.
#
# macOS TCC blocks a launchd agent from reading removable volumes, and the
# checkout lives on a USB drive. The tell is that metadata still works while
# every read fails: `stat` on the script returned its mode quite happily, and
# `ls`, `cat` and exec all came back "Operation not permitted". So a `-d` or
# `-f` test passes and tells you nothing, which is exactly why the first
# version of this preflight waved the job straight through into a bare
# "exited 126".
#
# Hence a real read rather than a stat. Reading one byte is the cheapest
# question that distinguishes "the drive is there" from "the drive is there and
# this process is allowed to look at it".
if ! head -c 1 "$REPO/store-app/server/scripts/backup-db.js" >/dev/null 2>&1; then
  alarm "macOS is blocking this job from reading the drive" \
        "The drive is mounted and the files are there, but this background job
cannot read them. macOS requires explicit permission for scheduled jobs to
touch removable volumes, and a launchd agent has none by default.

Metadata is allowed and reads are not, so the files look present and are
unreadable, which is why this needs saying rather than showing you an
'Operation not permitted' from somewhere deep in the script.

Grant it once:
  System Settings > Privacy & Security > Full Disk Access > +
  press Cmd+Shift+G, enter  /bin/bash , add it, and switch it on.

Then run:  launchctl kickstart -k gui/\$(id -u)/app.quaderp.backup

If you would rather not grant that, the alternative is to keep the checkout on
the internal disk, where none of this applies.

No backup was taken tonight."
  exit 1
fi

cd "$REPO/store-app/server" || { alarm "checkout is present but incomplete" "Could not enter $REPO/store-app/server"; exit 1; }

if ! head -c 1 .env >/dev/null 2>&1; then
  alarm "no readable .env, so there are no database credentials" \
        "Expected $REPO/store-app/server/.env containing DIRECT_URL."
  exit 1
fi

# node is resolved at install time and passed in, but the plist outlives the
# node install: an nvm upgrade moves the binary and leaves this pointing at a
# version-numbered path that no longer exists.
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  alarm "node is missing from where the scheduled job was told to look" \
        "Looked for: ${NODE_BIN:-<nothing configured>}

This usually means node was upgraded or reinstalled (nvm puts each version at
its own path) and the scheduled job still points at the old one. Re-run:

  cd \"$REPO/store-app/server\" && ./scripts/backup-runner.sh --install

which resolves node again and rewrites the schedule.

No backup was taken tonight."
  exit 1
fi
PATH="$(dirname "$NODE_BIN"):$PATH"
export PATH

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
