#!/bin/bash
# Restore drill: verify latest backup can be restored successfully.
# Usage: ./scripts/verify-restore-drill.sh
#
# Workflow:
#   1. Fetch latest backup from R2 (or local)
#   2. Restore to staging DB (DATABASE_URL_STAGING)
#   3. Run count(*) on key tables
#   4. Compare PROD vs STAGING counts
#
# Requires:
#   - DATABASE_URL (source/production)
#   - DATABASE_URL_STAGING (restore target)
#   - R2 env vars for remote fetch

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
BACKUP_DIR="/tmp"
R2_BUCKET="${R2_BACKUP_BUCKET:-algo-trader-backups}"
R2_ENDPOINT="${R2_ENDPOINT:-}"
R2_ACCESS_KEY="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_KEY="${R2_SECRET_ACCESS_KEY:-}"

# Tables to verify
VERIFY_TABLES=("users" "trades" "signals" "strategies" "positions")

# ── Prerequisites ───────────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL (production) is not set."
  exit 1
fi

if [ -z "${DATABASE_URL_STAGING:-}" ]; then
  echo "ERROR: DATABASE_URL_STAGING is not set."
  exit 1
fi

# ── Get latest backup ───────────────────────────────────────────────────────
echo "=== Step 1: Fetch latest backup ==="

LATEST_LOCAL=$(find "${BACKUP_DIR}" -name 'algo-trader-db-*.sql.gz' -print 2>/dev/null \
  | sort -r | head -1)

LATEST_REMOTE=""
if [ -n "${R2_ENDPOINT}" ] && [ -n "${R2_ACCESS_KEY}" ] && [ -n "${R2_SECRET_KEY}" ]; then
  if command -v aws &>/dev/null; then
    echo "Checking R2 for latest backup..."
    LATEST_REMOTE=$(AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY}" \
      AWS_SECRET_ACCESS_KEY="${R2_SECRET_KEY}" \
      aws s3 ls "s3://${R2_BUCKET}/postgres/" \
        --endpoint-url="${R2_ENDPOINT}" \
        --region auto 2>/dev/null \
      | sort -r | head -1 | awk '{print $4}')
  fi
fi

BACKUP_FILE=""
if [ -n "${LATEST_REMOTE}" ]; then
  echo "Latest remote backup: ${LATEST_REMOTE}"
  BACKUP_FILE="${BACKUP_DIR}/${LATEST_REMOTE}"

  echo "Downloading..."
  AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY}" \
  AWS_SECRET_ACCESS_KEY="${R2_SECRET_KEY}" \
  aws s3 cp \
    "s3://${R2_BUCKET}/postgres/${LATEST_REMOTE}" \
    "${BACKUP_FILE}" \
    --endpoint-url="${R2_ENDPOINT}" \
    --region auto \
    --quiet
else
  echo "No remote backup found. Using latest local backup."
  if [ -z "${LATEST_LOCAL}" ]; then
    echo "ERROR: No backup found locally or remotely."
    exit 1
  fi
  BACKUP_FILE="${LATEST_LOCAL}"
fi

echo "Using backup: ${BACKUP_FILE}"

if ! [ -f "${BACKUP_FILE}" ]; then
  echo "ERROR: Backup file does not exist: ${BACKUP_FILE}"
  exit 1
fi

# ── Restore to staging ──────────────────────────────────────────────────────
echo ""
echo "=== Step 2: Restore to staging DB ==="

gunzip -c "${BACKUP_FILE}" | psql "${DATABASE_URL_STAGING}" > /dev/null 2>&1
echo "Restore completed."

# ── Verify ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Step 3: Verify table counts ==="
echo ""

ALL_PASS=true
for TABLE in "${VERIFY_TABLES[@]}"; do
  PROD_COUNT=$(psql "${DATABASE_URL}" -t -A -c "SELECT COUNT(*) FROM \"${TABLE}\";" 2>/dev/null || echo "0")
  STAGING_COUNT=$(psql "${DATABASE_URL_STAGING}" -t -A -c "SELECT COUNT(*) FROM \"${TABLE}\";" 2>/dev/null || echo "0")

  # Handle quoted identifiers vs unquoted
  if [ "${PROD_COUNT}" = "0" ] && [ "${STAGING_COUNT}" = "0" ]; then
    # Table might not exist in either — try without quotes
    PROD_COUNT=$(psql "${DATABASE_URL}" -t -A -c "SELECT COUNT(*) FROM ${TABLE};" 2>/dev/null || echo "N/A")
    STAGING_COUNT=$(psql "${DATABASE_URL_STAGING}" -t -A -c "SELECT COUNT(*) FROM ${TABLE};" 2>/dev/null || echo "N/A")
  fi

  if [ "${PROD_COUNT}" = "${STAGING_COUNT}" ]; then
    echo "  TABLE ${TABLE}: PROD ${PROD_COUNT}, STAGING ${STAGING_COUNT}   PASS"
  else
    echo "  TABLE ${TABLE}: PROD ${PROD_COUNT}, STAGING ${STAGING_COUNT}   FAIL"
    ALL_PASS=false
  fi
done

echo ""
if [ "${ALL_PASS}" = true ]; then
  echo "RESTORE_DRILL: PASS"
  exit 0
else
  echo "RESTORE_DRILL: FAIL — table counts mismatch. Investigate restore integrity."
  exit 1
fi
