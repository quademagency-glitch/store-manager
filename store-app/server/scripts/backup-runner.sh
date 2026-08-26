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

  # ── Make the job self-contained on the internal disk ──────────────────────
  #
  # Everything above this line was about reporting the failure well. This is
  # about not having it.
  #
  # macOS will not let a launchd agent read a removable volume, and the
  # checkout is on a USB drive, so the scheduled job could see the scripts and
  # not open them. The documented fix is to grant /bin/bash Full Disk Access,
  # which is a broad permission to hand a shell, and five nights after being
  # asked for it nobody had. A backup that depends on someone doing a thing
  # they are not going to do is not a backup.
  #
  # So the install copies what the job needs onto the internal disk, where none
  # of this applies. It runs from the shell you are typing in, which does have
  # access to the drive. Two things fall out of it for free: the nightly backup
  # now works with the drive unplugged, which was the other open gap in the
  # runbook, and it no longer matters where the checkout lives.
  #
  # Re-run --install after changing any of these scripts. The copy is a copy.
  LIB="$INSTALL_DIR/lib"
  mkdir -p "$LIB"
  SRC="$(cd "$(dirname "$0")" && pwd)"
  cp "$SRC/backup-db.js" "$SRC/restore-db.js" "$SRC/backup-scheduled.sh" "$LIB/"
  chmod +x "$LIB/backup-scheduled.sh"

  # pg and dotenv, resolved from $INSTALL_DIR/node_modules because node walks
  # up from lib/. Only these two: backup-db.js and restore-db.js require
  # nothing else outside node's standard library.
  if [ ! -d "$INSTALL_DIR/node_modules/pg" ] || [ ! -d "$INSTALL_DIR/node_modules/dotenv" ]; then
    echo "Installing pg and dotenv into $INSTALL_DIR (one time, needs network)..."
    (cd "$INSTALL_DIR" && npm install --no-audit --no-fund --loglevel=error pg dotenv >/dev/null)
  fi

  # Only DIRECT_URL, not the whole .env. The job needs one line of it, and the
  # rest is service-role keys and gateway secrets that have no business being
  # copied to a second location to sit there unread.
  if [ -f "$REPO/store-app/server/.env" ]; then
    grep '^DIRECT_URL=' "$REPO/store-app/server/.env" > "$INSTALL_DIR/.env" || true
    chmod 600 "$INSTALL_DIR/.env"
  fi
  if [ ! -s "$INSTALL_DIR/.env" ]; then
    echo "Could not read DIRECT_URL from $REPO/store-app/server/.env" >&2
    echo "The scheduled job has no database credentials without it." >&2
    exit 1
  fi
  echo "Self-contained copy ready at: $LIB"

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
    <key>QUADERP_SCRIPT_DIR</key><string>$INSTALL_DIR/lib</string>
    <key>QUADERP_WORK_DIR</key><string>$INSTALL_DIR</string>
    <key>QUADERP_LOG</key><string>$INSTALL_DIR/backup.log</string>
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

# node first, because both paths below need it. Resolved at install time and
# passed in, but re-checked because the plist outlives the node install: an nvm
# upgrade moves the binary and leaves this pointing at a version-numbered path
# that no longer exists.
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

# The self-contained copy on the internal disk, written by --install. Preferred
# over the checkout, and the reason this job survives both a macOS privacy
# restriction on the removable volume and the drive being unplugged.
LIB="$INSTALL_DIR/lib"
if [ -r "$LIB/backup-scheduled.sh" ] && [ -r "$LIB/backup-db.js" ]; then
  if [ ! -s "$INSTALL_DIR/.env" ]; then
    alarm "the installed copy has no database credentials" \
          "Expected DIRECT_URL in $INSTALL_DIR/.env

Re-run the install from the checkout to rewrite it:
  cd \"$REPO/store-app/server\" && ./scripts/backup-runner.sh --install"
    exit 1
  fi
  out=$(QUADERP_SCRIPT_DIR="$LIB" QUADERP_WORK_DIR="$INSTALL_DIR" \
        BACKUP_DIR="$BACKUP_DIR" KEEP_DAYS="$KEEP_DAYS" \
        "$LIB/backup-scheduled.sh" 2>&1)
  status=$?
else
  # Fallback: run straight out of the checkout. This is what happens before
  # --install has been re-run since this change, and it is the path that hits
  # the macOS restriction described below.

  if [ ! -d "$REPO" ]; then
    alarm "the drive holding the code is not mounted" \
          "Expected the checkout at:
    $REPO

Plug the drive in, or re-run --install so the job stops needing the drive at
all. No backup was taken tonight."
    exit 1
  fi

  # macOS TCC blocks a launchd agent from reading removable volumes. The tell is
  # that metadata still works while every read fails: `stat` returns the mode
  # quite happily, and `ls`, `cat` and exec all come back "Operation not
  # permitted". So a `-d` or `-f` test passes and tells you nothing, which is
  # why an earlier version of this preflight waved the job through into a bare
  # "exited 126". Reading one byte is the cheapest question that actually
  # distinguishes the two.
  if ! head -c 1 "$REPO/store-app/server/scripts/backup-db.js" >/dev/null 2>&1; then
    alarm "macOS is blocking this job from reading the drive" \
          "The drive is mounted and the files are there, but this background job
cannot read them. macOS requires explicit permission for scheduled jobs to
touch removable volumes, and a launchd agent has none by default.

The fix no longer needs a permission grant. Re-run the install and the job
copies what it needs onto the internal disk:

  cd \"$REPO/store-app/server\" && ./scripts/backup-runner.sh --install

No backup was taken tonight."
    exit 1
  fi

  cd "$REPO/store-app/server" || { alarm "checkout is present but incomplete" "Could not enter $REPO/store-app/server"; exit 1; }

  if ! head -c 1 .env >/dev/null 2>&1; then
    alarm "no readable .env, so there are no database credentials" \
          "Expected $REPO/store-app/server/.env containing DIRECT_URL."
    exit 1
  fi


  out=$(BACKUP_DIR="$BACKUP_DIR" KEEP_DAYS="$KEEP_DAYS" ./scripts/backup-scheduled.sh 2>&1)
  status=$?
fi


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
