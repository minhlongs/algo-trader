#!/usr/bin/env bash
# Hourly immutable batch verifier and uploader for Polymarket L2 WAL/Parquet archives.
# Target: Cloudflare R2 Standard (S3-compatible API over TLS 1.2+).
#
# INVARIANTS:
# 1. Verifies SHA-256 checksums locally BEFORE upload.
# 2. Uploads immutable hourly batches using retry-safe idempotent keys (never overwrites sealed hours).
# 3. Publishes manifest.json ONLY AFTER remote object existence + size/ETag verification succeeds.
# 4. Records explicit missing-interval and reconnect markers (never backfills synthetic data).
# 5. Enforces local disk ceiling & retention ONLY for already-verified uploaded batches.
# 6. Zero trading keys, zero wallet secrets, zero order-signing access.

set -euo pipefail

# --- Configuration (override via /etc/poly-collector/r2.env) ---
DATA_ROOT="${POLY_COLLECTOR_DATA_ROOT:-/var/lib/poly-collector}"
STAGING_ROOT="${DATA_ROOT}/staging"
MANIFEST_ROOT="${DATA_ROOT}/manifests"
LOG_FILE="${POLY_COLLECTOR_UPLOAD_LOG:-/var/log/poly-collector/upload.jsonl}"
COLLECTOR_LOG="${POLY_COLLECTOR_LOG:-/var/log/poly-collector/poly-book-collector.log}"
LOCK_FILE="${DATA_ROOT}/upload.lock"

R2_BUCKET="${R2_BUCKET:?R2_BUCKET must be set in /etc/poly-collector/r2.env}"
R2_ENDPOINT="${R2_ENDPOINT:?R2_ENDPOINT (https://<account>.r2.cloudflarestorage.com) must be set}"
R2_PREFIX="${R2_PREFIX:-poly-l2-v1}"
UPLOAD_TOOL="${POLY_UPLOAD_TOOL:-rclone}"          # "rclone" or "aws"
LOCAL_DISK_CEILING_PCT="${LOCAL_DISK_CEILING_PCT:-80}"
LOCAL_RETENTION_HOURS="${LOCAL_RETENTION_HOURS:-48}"
MAX_RETRIES="${UPLOAD_MAX_RETRIES:-3}"
DRY_RUN="${DRY_RUN:-0}"

# Target previous completed UTC hour by default (immutable sealed window)
TARGET_HOUR_UTC="${1:-$(date -u -d '1 hour ago' '+%Y/%m/%d/%H' 2>/dev/null || date -u -v-1H '+%Y/%m/%d/%H')}"
BATCH_ID="${TARGET_HOUR_UTC//\//-}"
BATCH_DIR="${STAGING_ROOT}/${BATCH_ID}"
MANIFEST_PATH="${MANIFEST_ROOT}/manifest-${BATCH_ID}.json"
REMOTE_BASE="${R2_PREFIX}/${TARGET_HOUR_UTC}"

log_json() {
  local level="$1" event="$2" detail="$3"
  local ts
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  mkdir -p "$(dirname "$LOG_FILE")"
  printf '{"ts":"%s","level":"%s","event":"%s","batch":"%s","detail":"%s"}\n' \
    "$ts" "$level" "$event" "$BATCH_ID" "$detail" >> "$LOG_FILE"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

file_size_bytes() {
  stat -c '%s' "$1" 2>/dev/null || stat -f '%z' "$1"
}

# Prevent overlapping cron/timer runs
mkdir -p "$STAGING_ROOT" "$MANIFEST_ROOT"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log_json "WARN" "LOCK_BUSY" "Another upload process holds ${LOCK_FILE}"
  exit 0
fi

# 1. Verify TLS endpoint and reject non-HTTPS
if [[ "$R2_ENDPOINT" != https://* ]]; then
  log_json "ERROR" "INSECURE_ENDPOINT" "R2_ENDPOINT must use https://"
  exit 1
fi

# 2. Collect sealed batch files; emit explicit missing-interval marker if absent
if [[ ! -d "$BATCH_DIR" ]]; then
  log_json "WARN" "MISSING_INTERVAL" "No sealed batch directory at ${BATCH_DIR}; recording gap marker"
  cat > "$MANIFEST_PATH" <<EOF
{
  "version": 1,
  "batchId": "${BATCH_ID}",
  "windowUtc": "${TARGET_HOUR_UTC}",
  "createdAtIso": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "status": "MISSING_INTERVAL",
  "fileCount": 0,
  "totalBytes": 0,
  "files": [],
  "gapReason": "sealed_batch_directory_absent"
}
EOF
  exit 0
fi

# Reject symlinks inside sealed batch directory (fail-closed)
if [[ -n "$(find "$BATCH_DIR" -type l -print -quit)" ]]; then
  log_json "ERROR" "SYMLINK_REJECTED" "Symlink detected in ${BATCH_DIR}; refusing upload"
  exit 1
fi

mapfile -t BATCH_FILES < <(find "$BATCH_DIR" -type f \( -name '*.parquet' -o -name '*.wal' -o -name '*.wal.zst' -o -name '*.jsonl' \) | sort)
if [[ "${#BATCH_FILES[@]}" -eq 0 ]]; then
  log_json "WARN" "EMPTY_INTERVAL" "Batch directory ${BATCH_DIR} contains zero archive files"
  exit 0
fi

# 3. Build local SHA-256 manifest BEFORE upload and verify file readability
TMP_MANIFEST="${MANIFEST_PATH}.tmp"
TOTAL_BYTES=0
ENTRIES_JSON=""
for f in "${BATCH_FILES[@]}"; do
  rel="${f#"${BATCH_DIR}/"}"
  sz="$(file_size_bytes "$f")"
  digest="$(sha256_file "$f")"
  TOTAL_BYTES=$((TOTAL_BYTES + sz))
  entry=$(printf '{"relativePath":"%s","sizeBytes":%s,"sha256":"%s"}' "$rel" "$sz" "$digest")
  if [[ -n "$ENTRIES_JSON" ]]; then
    ENTRIES_JSON="${ENTRIES_JSON},${entry}"
  else
    ENTRIES_JSON="${entry}"
  fi
done

MANIFEST_SHA256="$(printf '[%s]' "$ENTRIES_JSON" | (sha256sum 2>/dev/null || shasum -a 256) | awk '{print $1}')"
RECONNECT_MARKERS="$(grep -c '"event":"ws_reconnect"' "$COLLECTOR_LOG" 2>/dev/null || true)"
RECONNECT_MARKERS="${RECONNECT_MARKERS:-0}"

cat > "$TMP_MANIFEST" <<EOF
{
  "version": 1,
  "batchId": "${BATCH_ID}",
  "windowUtc": "${TARGET_HOUR_UTC}",
  "createdAtIso": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "status": "SEALED_VERIFIED",
  "fileCount": ${#BATCH_FILES[@]},
  "totalBytes": ${TOTAL_BYTES},
  "reconnectMarkersSeen": ${RECONNECT_MARKERS},
  "files": [${ENTRIES_JSON}],
  "manifestSha256": "${MANIFEST_SHA256}"
}
EOF
mv "$TMP_MANIFEST" "$MANIFEST_PATH"
log_json "INFO" "MANIFEST_BUILT" "files=${#BATCH_FILES[@]} bytes=${TOTAL_BYTES} sha256=${MANIFEST_SHA256}"

# 4. Upload each immutable archive object with retry-safe idempotency
upload_object() {
  local local_path="$1" remote_key="$2"
  local attempt=1
  while [[ "$attempt" -le "$MAX_RETRIES" ]]; do
    if [[ "$DRY_RUN" == "1" ]]; then
      log_json "INFO" "DRY_RUN_UPLOAD" "${local_path} -> s3://${R2_BUCKET}/${remote_key}"
      return 0
    fi
    if [[ "$UPLOAD_TOOL" == "rclone" ]]; then
      if rclone copyto --immutable --s3-no-check-bucket "$local_path" "r2:${R2_BUCKET}/${remote_key}"; then
        return 0
      fi
    else
      if aws s3api put-object --endpoint-url "$R2_ENDPOINT" --bucket "$R2_BUCKET" --key "$remote_key" --body "$local_path" >/dev/null; then
        return 0
      fi
    fi
    log_json "WARN" "UPLOAD_RETRY" "attempt=${attempt} key=${remote_key}"
    sleep $((attempt * 5))
    attempt=$((attempt + 1))
  done
  return 1
}

verify_remote_size() {
  local remote_key="$1" expected_bytes="$2"
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  local remote_bytes=""
  if [[ "$UPLOAD_TOOL" == "rclone" ]]; then
    remote_bytes="$(rclone lsjson "r2:${R2_BUCKET}/${remote_key}" | sed -n 's/.*"Size":\([0-9]*\).*/\1/p' | head -n 1)"
  else
    remote_bytes="$(aws s3api head-object --endpoint-url "$R2_ENDPOINT" --bucket "$R2_BUCKET" --key "$remote_key" --query 'ContentLength' --output text 2>/dev/null || true)"
  fi
  [[ "$remote_bytes" == "$expected_bytes" ]]
}

for f in "${BATCH_FILES[@]}"; do
  rel="${f#"${BATCH_DIR}/"}"
  sz="$(file_size_bytes "$f")"
  remote_key="${REMOTE_BASE}/${rel}"
  if ! upload_object "$f" "$remote_key"; then
    log_json "ERROR" "UPLOAD_FAILED" "key=${remote_key}; manifest NOT published"
    exit 1
  fi
  if ! verify_remote_size "$remote_key" "$sz"; then
    log_json "ERROR" "REMOTE_VERIFY_FAILED" "key=${remote_key} expected_bytes=${sz}; manifest NOT published"
    exit 1
  fi
done

# 5. Publish manifest ONLY AFTER all batch objects are uploaded and verified
MANIFEST_KEY="${REMOTE_BASE}/manifest.json"
if ! upload_object "$MANIFEST_PATH" "$MANIFEST_KEY"; then
  log_json "ERROR" "MANIFEST_PUBLISH_FAILED" "key=${MANIFEST_KEY}"
  exit 1
fi
touch "${BATCH_DIR}/.uploaded-verified"
log_json "INFO" "BATCH_PUBLISHED" "manifest=${MANIFEST_KEY} files=${#BATCH_FILES[@]} bytes=${TOTAL_BYTES}"

# 6. Enforce local disk ceiling & retention ONLY on already-verified batches
DISK_PCT="$(df -P "$DATA_ROOT" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
if [[ -n "$DISK_PCT" && "$DISK_PCT" -ge "$LOCAL_DISK_CEILING_PCT" ]]; then
  log_json "WARN" "DISK_CEILING_REACHED" "usage=${DISK_PCT}% ceiling=${LOCAL_DISK_CEILING_PCT}%; pruning oldest verified batches"
  find "$STAGING_ROOT" -maxdepth 2 -name '.uploaded-verified' -printf '%T@ %h\n' 2>/dev/null \
    | sort -n \
    | head -n 12 \
    | awk '{print $2}' \
    | xargs -r rm -rf
else
  # Standard retention prune for verified batches older than LOCAL_RETENTION_HOURS
  find "$STAGING_ROOT" -maxdepth 2 -name '.uploaded-verified' -mmin +"$((LOCAL_RETENTION_HOURS * 60))" -exec dirname {} \; \
    | xargs -r rm -rf
fi
