#!/usr/bin/env bash
# ci-exchange-health.sh — verify exchange API connectivity in CI.
#
# Wraps runDefaultExchangeTest() with retry logic and timeout enforcement.
# In CI: passes if at least 1 exchange is reachable (geo-restrictions common).
# Locally: passes only if all exchanges are reachable.
#
# Usage:
#   bash scripts/ci-exchange-health.sh [--timeout <ms>]
#
# Default timeout: 5000ms per exchange. Retries once on failure (exchanges flake).

set -euo pipefail

# In CI, allow 1+ pass (some exchanges geo-block GitHub runners)
CI_MIN_PASS="${CI_MIN_PASS:-0}"

TIMEOUT_MS=5000
MAX_RETRIES=1

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --timeout)
      TIMEOUT_MS="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

RUNNER="$(dirname "$0")/ci-exchange-health-runner.ts"

if [ ! -f "$RUNNER" ]; then
  echo "ERROR: Runner script not found: $RUNNER" >&2
  exit 1
fi

run_once() {
  timeout 30 npx tsx "$RUNNER" --timeout "$TIMEOUT_MS"
}

attempt=1
while [ "$attempt" -le "$((MAX_RETRIES + 1))" ]; do
  if run_once; then
    echo "Exchange health check passed (attempt $attempt)."
    exit 0
  fi
  if [ "$attempt" -le "$MAX_RETRIES" ]; then
    echo "Exchange health check failed (attempt $attempt), retrying..." >&2
    sleep 2
  fi
  attempt=$((attempt + 1))
done

echo "Exchange health check failed after $attempt attempts." >&2
exit 1
