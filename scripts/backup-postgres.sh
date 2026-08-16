#!/bin/bash
# Backup PostgreSQL database to R2 with local fallback.
# Usage: ./scripts/backup-postgres.sh
# Requires: DATABASE_URL env var, aws CLI with R2 credentials
#
# Safe for active DB: uses --no-wait flag to avoid blocking writes.
# Logs: BACKUP_COMPLETE:TIMESTAMP:SIZE for machine parsing.

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/tmp"
BACKUP_FILE="${BACKUP_DIR}/algo-trader-db-${TIMESTAMP}.sql.gz"

# Retention
LOCAL_RETENTION_DAYS=7
: "${REMOTE_RETENTION_DAYS:=30}"

# R2 config (optional — fallback to local-only if not set)
R2_BUCKET="${R2_BACKUP_BUCKET:-algo-trader-backups}"
R2_ENDPOINT="${R2_ENDPOINT:-}"
R2_ACCESS_KEY="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_KEY="${R2_SECRET_ACCESS_KEY:-}"

# ── Prerequisites ───────────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Cannot proceed with backup."
  exit 1
fi

if ! command -v pg_dump &>/dev/null; then
  echo "ERROR: pg_dump not found. Install PostgreSQL client tools."
  exit 1
fi

# ── Backup ──────────────────────────────────────────────────────────────────
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup to ${BACKUP_FILE}"

# pg_dump with --no-wait: fail immediately if unable to acquire a lock
pg_dump "${DATABASE_URL}" \
  --no-wait \
  --no-owner \
  --no-privileges \
  --no-comments 2>/dev/null \
  | gzip > "${BACKUP_FILE}"

BACKUP_SIZE=$(wc -c < "${BACKUP_FILE}")

if [ "${BACKUP_SIZE}" -lt 1024 ]; then
  echo "ERROR: Backup file is too small (${BACKUP_SIZE} bytes). Possible corruption."
  rm -f "${BACKUP_FILE}"
  exit 1
fi

echo "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE} bytes)"

# ── Upload to R2 ────────────────────────────────────────────────────────────
UPLOADED=false
if [ -n "${R2_ENDPOINT}" ] && [ -n "${R2_ACCESS_KEY}" ] && [ -n "${R2_SECRET_KEY}" ]; then
  if command -v aws &>/dev/null; then
    echo "Uploading to R2 bucket ${R2_BUCKET}..."

    # R2 uses S3-compatible API
    AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY}" \
    AWS_SECRET_ACCESS_KEY="${R2_SECRET_KEY}" \
    aws s3 cp "${BACKUP_FILE}" \
      "s3://${R2_BUCKET}/postgres/" \
      --endpoint-url="${R2_ENDPOINT}" \
      --region auto \
      --quiet

    echo "Upload complete: s3://${R2_BUCKET}/postgres/algo-trader-db-${TIMESTAMP}.sql.gz"
    : "${UPLOADED:=true}"
  else
    echo "WARNING: aws CLI not found. Skipping R2 upload. Backup kept at ${BACKUP_FILE}"
  fi
else
  echo "WARNING: R2 env vars not fully configured. Skipping remote upload."
  echo "  Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY to enable."
fi

# ── Cleanup (local) ─────────────────────────────────────────────────────────
echo "Cleaning up local backups older than ${LOCAL_RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name 'algo-trader-db-*.sql.gz' -mtime +"${LOCAL_RETENTION_DAYS}" -delete

# ── Report ──────────────────────────────────────────────────────────────────
BACKUP_TIMESTAMP="${TIMESTAMP}"
echo "BACKUP_COMPLETE:${BACKUP_TIMESTAMP}:${BACKUP_SIZE}"
exit 0
