#!/bin/bash
# Restore PostgreSQL backup from R2 or local file.
# Usage: ./scripts/restore-backup.sh <TIMESTAMP>
#   TIMESTAMP: backup timestamp in YYYYMMDD-HHMMSS format
#
# Requires either:
#   - R2 env vars (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) to download
#   - Local file at /tmp/algo-trader-db-<TIMESTAMP>.sql.gz
#
# Target DB: DATABASE_URL_RESTORE env var (separate from DATABASE_URL for safety)

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <TIMESTAMP>"
  echo "  TIMESTAMP: backup timestamp in YYYYMMDD-HHMMSS format"
  echo ""
  echo "Example: $0 20261201-143022"
  exit 1
fi

TIMESTAMP="$1"
BACKUP_DIR="/tmp"
BACKUP_FILE="${BACKUP_DIR}/algo-trader-db-${TIMESTAMP}.sql.gz"
RESTORE_LOG="${BACKUP_DIR}/restore-${TIMESTAMP}.log"

# ── Config ──────────────────────────────────────────────────────────────────
R2_BUCKET="${R2_BACKUP_BUCKET:-algo-trader-backups}"
R2_ENDPOINT="${R2_ENDPOINT:-}"
R2_ACCESS_KEY="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_KEY="${R2_SECRET_ACCESS_KEY:-}"

# ── Prerequisites ───────────────────────────────────────────────────────────
if [ -z "${DATABASE_URL_RESTORE:-}" ]; then
  echo "ERROR: DATABASE_URL_RESTORE is not set. Target database URL is required."
  echo "  Set DATABASE_URL_RESTORE to the restoration target (not the source)."
  exit 1
fi

if ! [ -f "${BACKUP_FILE}" ]; then
  echo "Local backup not found: ${BACKUP_FILE}"

  # Try downloading from R2
  if [ -n "${R2_ENDPOINT}" ] && [ -n "${R2_ACCESS_KEY}" ] && [ -n "${R2_SECRET_KEY}" ]; then
    if command -v aws &>/dev/null; then
      echo "Downloading from R2: s3://${R2_BUCKET}/postgres/algo-trader-db-${TIMESTAMP}.sql.gz"
      AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY}" \
      AWS_SECRET_ACCESS_KEY="${R2_SECRET_KEY}" \
      aws s3 cp \
        "s3://${R2_BUCKET}/postgres/algo-trader-db-${TIMESTAMP}.sql.gz" \
        "${BACKUP_FILE}" \
        --endpoint-url="${R2_ENDPOINT}" \
        --region auto \
        --quiet
    else
      echo "ERROR: aws CLI not found and no local backup available."
      exit 1
    fi
  else
    echo "ERROR: R2 env vars not configured and no local backup available."
    echo "  Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY for remote download."
    exit 1
  fi
fi

if ! [ -f "${BACKUP_FILE}" ]; then
  echo "ERROR: Backup file not found after download attempt: ${BACKUP_FILE}"
  exit 1
fi

BACKUP_SIZE=$(wc -c < "${BACKUP_FILE}")
echo "Backup file size: ${BACKUP_SIZE} bytes"

if [ "${BACKUP_SIZE}" -lt 1024 ]; then
  echo "ERROR: Backup file is too small (${BACKUP_SIZE} bytes). Corrupt or empty."
  exit 1
fi

# ── Restore ─────────────────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting restore from ${BACKUP_FILE} to target DB..."
echo "Target: ${DATABASE_URL_RESTORE}"

# Decompress and restore
gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL_RESTORE}" > "${RESTORE_LOG}" 2>&1

echo "Restore completed. Log: ${RESTORE_LOG}"

# ── Verify ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Verification ==="
echo "Running count(*) on key tables..."

TABLES=("users" "trades" "signals" "strategies")
for TABLE in "${TABLES[@]}"; do
  COUNT=$(psql "${DATABASE_URL_RESTORE}" -t -c "SELECT COUNT(*) FROM \"${TABLE}\";" 2>/dev/null || echo "ERROR")
  echo "  TABLE ${TABLE}: ${COUNT} rows"
done

echo ""
echo "RESTORE_COMPLETE:${TIMESTAMP}"
exit 0
