#!/usr/bin/env bash
# qwen-ops.sh — Solo-operator CLI for common Qwen admin operations.
#
# Wraps curl + X-Admin-Key header so operator doesn't have to memorize URLs.
# Reads ADMIN_API_KEY from env. Base URL defaults to localhost but respects
# QWEN_OPS_HOST env var for remote use (e.g. CF Tunnel).
#
# Usage: ./scripts/qwen-ops.sh <command> [args]
# Commands: health | backlog | status | kill | unkill | reviews | resolve <id> | runs | help
#
# Exit codes:
#   0  success
#   1  missing ADMIN_API_KEY (for admin commands)
#   2  unknown command or bad usage
#   3  HTTP non-2xx response from server

set -euo pipefail

HOST="${QWEN_OPS_HOST:-http://localhost:3000}"
ADMIN_KEY="${ADMIN_API_KEY:-}"

# ─── Helpers ───────────────────────────────────────────────────────────────

need_key() {
  if [ -z "$ADMIN_KEY" ]; then
    echo "ERROR: ADMIN_API_KEY env var not set (required for admin commands)" >&2
    exit 1
  fi
}

# curl wrapper — prints body + exits 3 on non-2xx
http() {
  local method="$1" path="$2"
  local body_file
  body_file="$(mktemp)"
  local code
  if [ "$method" = "GET" ]; then
    code=$(curl -sS -o "$body_file" -w '%{http_code}' \
      -H "x-admin-key: $ADMIN_KEY" "$HOST$path") || code="000"
  else
    code=$(curl -sS -o "$body_file" -w '%{http_code}' \
      -X "$method" -H "x-admin-key: $ADMIN_KEY" "$HOST$path") || code="000"
  fi
  cat "$body_file"
  echo
  rm -f "$body_file"
  if [ "${code:0:1}" != "2" ]; then
    echo "ERROR: HTTP $code from $method $path" >&2
    exit 3
  fi
}

usage() {
  cat <<EOF
qwen-ops.sh — Solo-operator CLI for Qwen admin operations

Usage: $(basename "$0") <command> [args]

Read-only (no auth required):
  health              GET /health — full service health (Redis, Postgres, engine, qwen booleans)
  backlog             Scrape /metrics for strategy-review backlog size + oldest-age (human-readable)

Admin-key required (set ADMIN_API_KEY):
  status              GET /api/v1/admin/qwen/status — eligibility + kill + drawdown
  kill                POST /api/v1/admin/qwen/kill — activate L1 kill switch
  unkill              POST /api/v1/admin/qwen/unkill — clear L1 kill switch
  reviews             GET /api/v1/admin/qwen/strategy-reviews (?status=pending)
  resolve <id>        POST /api/v1/admin/qwen/strategy-reviews/<id>/resolve
  runs                GET /api/v1/admin/qwen/signals-loop/runs (last 50)

Env:
  QWEN_OPS_HOST       Base URL (default: http://localhost:3000)
  ADMIN_API_KEY       Required for admin commands

Examples:
  ADMIN_API_KEY=xxx $(basename "$0") status
  QWEN_OPS_HOST=https://algo-trader.pages.dev $(basename "$0") health
  ADMIN_API_KEY=xxx $(basename "$0") resolve aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
EOF
}

# ─── Dispatch ──────────────────────────────────────────────────────────────

if [ $# -eq 0 ]; then
  usage
  exit 2
fi

cmd="$1"
shift || true

case "$cmd" in
  health)
    # No admin key needed
    curl -sS "$HOST/health"
    echo
    ;;
  backlog)
    # No admin key needed — /metrics is Prometheus scrape surface (unauth).
    # Extract 2 gauges and present human-readable. Missing gauges → "0" (pre-arm case).
    metrics=$(curl -sS "$HOST/metrics" 2>/dev/null || true)
    if [ -z "$metrics" ]; then
      echo "ERROR: /metrics returned empty (is app up?)" >&2
      exit 3
    fi
    size=$(echo "$metrics" | awk '/^algo_trader_qwen_strategy_review_backlog_size /{print $2; exit}')
    age_sec=$(echo "$metrics" | awk '/^algo_trader_qwen_strategy_review_oldest_pending_age_sec /{print $2; exit}')
    size="${size:-0}"
    age_sec="${age_sec:-0}"
    # Humanise age: seconds → hours (1 decimal). `awk` handles the float.
    age_h=$(awk -v s="$age_sec" 'BEGIN {printf "%.1f", s/3600}')
    printf 'Strategy review backlog\n'
    printf '  size          : %s rows\n' "$size"
    printf '  oldest_pending: %sh (%ss)\n' "$age_h" "$age_sec"
    printf 'Alert fires at > 48h for 30m — see docs/runbooks/qwen-strategy-review-backlog.md\n'
    ;;
  status)
    need_key
    http GET "/api/v1/admin/qwen/status"
    ;;
  kill)
    need_key
    http POST "/api/v1/admin/qwen/kill"
    ;;
  unkill)
    need_key
    http POST "/api/v1/admin/qwen/unkill"
    ;;
  reviews)
    need_key
    http GET "/api/v1/admin/qwen/strategy-reviews?status=pending&limit=50"
    ;;
  resolve)
    need_key
    if [ $# -lt 1 ]; then
      echo "ERROR: resolve requires <id> argument" >&2
      usage
      exit 2
    fi
    http POST "/api/v1/admin/qwen/strategy-reviews/$1/resolve"
    ;;
  runs)
    need_key
    http GET "/api/v1/admin/qwen/signals-loop/runs?limit=50"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "ERROR: unknown command '$cmd'" >&2
    usage
    exit 2
    ;;
esac
