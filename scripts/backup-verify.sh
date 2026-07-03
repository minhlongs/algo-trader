#!/usr/bin/env bash
# ===========================================================================
# backup-verify.sh — Backup Integrity Checker
# Checks that backup files exist, have non-zero size, and are recent enough.
# ===========================================================================
# Usage:
#   ./scripts/backup-verify.sh                    # check all backups
#   ./scripts/backup-verify.sh /path/to/backups   # custom directory
# ===========================================================================

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"  # allow ~1 day slack past daily cron
ERRORS=0
PASSES=0

if [ ! -d "$BACKUP_DIR" ]; then
  echo "ERROR: Backup directory not found: $BACKUP_DIR"
  exit 1
fi

echo "=== Backup Integrity Check ==="
echo "Directory: $(cd "$BACKUP_DIR" && pwd)"
echo "Max age:   ${MAX_AGE_HOURS}h"
echo ""

# Find backup files (exclude logs and dormant directory)
BACKUP_FILES=$(find "$BACKUP_DIR" -maxdepth 1 -type f \
  ! -name 'backup.log' ! -name 'backup-error.log' \
  ! -name '*.log' | sort)

if [ -z "$BACKUP_FILES" ]; then
  echo "WARNING: No backup files found in $BACKUP_DIR"
  echo "Check the dormant/ subdirectory or custom backup paths."
  exit 0
fi

CUTOFF=$(date -v-${MAX_AGE_HOURS}H +%s 2>/dev/null || date -d "-${MAX_AGE_HOURS} hours" +%s 2>/dev/null || echo "")

while IFS= read -r file; do
  BASENAME=$(basename "$file")

  # Check: file exists
  if [ ! -f "$file" ]; then
    echo "  FAIL  $BASENAME — file missing"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Check: non-zero size
  SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
  if [ "$SIZE" -eq 0 ]; then
    echo "  FAIL  $BASENAME — zero bytes"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Check: recent enough (if we can compute cutoff)
  if [ -n "$CUTOFF" ]; then
    MTIME=$(stat -f%m "$file" 2>/dev/null || stat -c%Y "$file" 2>/dev/null)
    if [ "$MTIME" -lt "$CUTOFF" ]; then
      AGE_H=$(( ( $(date +%s) - MTIME ) / 3600 ))
      echo "  WARN  $BASENAME — ${AGE_H}h old (max ${MAX_AGE_HOURS}h)"
      # Not a hard failure, but worth flagging
    fi
  fi

  echo "  OK    $BASENAME ($(numfmt --to=iec $SIZE 2>/dev/null || echo "${SIZE}B"))"
  PASSES=$((PASSES + 1))
done <<< "$BACKUP_FILES"

# Also check dormant/ subdirectory if it exists
if [ -d "$BACKUP_DIR/dormant" ]; then
  echo ""
  echo "--- Dormant backups ---"
  find "$BACKUP_DIR/dormant" -maxdepth 1 -type f | sort | while IFS= read -r file; do
    BASENAME=$(basename "$file")
    if [ -f "$file" ] && [ "$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)" -gt 0 ]; then
      SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
      echo "  OK    $BASENAME ($(numfmt --to=iec $SIZE 2>/dev/null || echo "${SIZE}B"))"
    else
      echo "  SKIP  $BASENAME (empty or missing)"
    fi
  done
fi

echo ""
echo "=== Summary: ${PASSES} passed, ${ERRORS} failed ==="

exit $ERRORS
