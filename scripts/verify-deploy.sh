#!/usr/bin/env bash
# verify-deploy.sh — Post-deploy health verification for algo-trader
# Checks: Worker SHA match, API health, Docker stack, landing page
#
# Usage:
#   bash scripts/verify-deploy.sh
#   bash scripts/verify-deploy.sh --worker-only
#   bash scripts/verify-deploy.sh --landing-only

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"

MODE="${1:-full}"
ERRORS=0
WARNINGS=0

check() {
  local label="$1" cmd="$2"
  printf "  %-55s " "$label..."
  if eval "$cmd" &>/dev/null; then
    echo -e "$PASS"
    return 0
  else
    echo -e "$FAIL"
    return 1
  fi
}

# ─── Worker Checks ──────────────────────────────────────────────────
check_worker() {
  echo ""
  echo "=== CF Worker: algo-trader.agencyos-openclaw.workers.dev ==="
  local WORKER="https://algo-trader.agencyos-openclaw.workers.dev"

  check "GET /health → 200" "curl -sf -o /dev/null -w '%{http_code}' $WORKER/health | grep -q 200"

  check "GET /api/version → 200 + shortSha" "curl -sf $WORKER/api/version | python3 -c 'import json,sys; d=json.load(sys.stdin); assert \"shortSha\" in d'"

  local LIVE_SHA
  LIVE_SHA=$(curl -sf "$WORKER/api/version" | python3 -c "import json,sys; print(json.load(sys.stdin).get('shortSha',''))" 2>/dev/null || echo "unknown")
  local LOCAL_SHA
  LOCAL_SHA=$(git rev-parse HEAD 2>/dev/null | cut -c1-8 || echo "no-git")

  if [ "$LIVE_SHA" = "$LOCAL_SHA" ]; then
    echo -e "  SHA match: $PASS  local=$LOCAL_SHA live=$LIVE_SHA"
  else
    echo -e "  SHA match: ${YELLOW}⚠${NC}  local=$LOCAL_SHA live=$LIVE_SHA"
    WARNINGS=$((WARNINGS + 1))
  fi

  # Security headers
  local CSP
  CSP=$(curl -sI "$WORKER/health" 2>/dev/null | grep -i 'content-security-policy' || echo "")
  if [ -n "$CSP" ]; then
    echo -e "  CSP header: $PASS  present"
  else
    echo -e "  CSP header: ${YELLOW}⚠ missing${NC}"
    WARNINGS=$((WARNINGS + 1))
  fi
}

# ─── Docker Checks ──────────────────────────────────────────────────
check_docker() {
  echo ""
  echo "=== Docker Stack ==="

  for svc in algo-trade redis nats; do
    local STATUS
    STATUS=$(docker inspect --format='{{.State.Status}}' "algo-trade-${svc}" 2>/dev/null || echo "not-found")
    if [ "$STATUS" = "running" ]; then
      echo -e "  $svc: $PASS $STATUS"
    else
      echo -e "  $svc: ${YELLOW}⚠ $STATUS${NC}"
      WARNINGS=$((WARNINGS + 1))
    fi
  done

  check "API :3000/health → 200" "curl -sf -o /dev/null -w '%{http_code}' http://localhost:3000/health | grep -q 200"
}

# ─── Landing Page Checks ────────────────────────────────────────────
check_landing() {
  echo ""
  echo "=== Landing: cashclaw.cc ==="
  local SITE="https://cashclaw.cc"

  check "GET / → 200" "curl -sf -o /dev/null -w '%{http_code}' $SITE/ | grep -q 200"

  # Semantic HTML
  local HTML
  HTML=$(curl -sf "$SITE/" 2>/dev/null || echo "")
  for tag in '<header' '<main' '<footer' '<script type="module"'; do
    if echo "$HTML" | grep -q "$tag"; then
      echo -e "  $tag: $PASS  present"
    else
      echo -e "  $tag: $FAIL  missing"
      ERRORS=$((ERRORS + 1))
    fi
  done

  # Business sections
  for section in "HOW IT WORKS" "PRICING" "FAQ"; do
    if echo "$HTML" | grep -q "$section"; then
      echo -e "  Section '$section': $PASS  present"
    else
      echo -e "  Section '$section': $FAIL  missing"
      ERRORS=$((ERRORS + 1))
    fi
  done
}

# ─── Main ────────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════"
echo "  algo-trader Deploy Verification"
echo "  $(date -Iseconds)"
echo "══════════════════════════════════════════════"

case "$MODE" in
  --worker-only) check_worker ;;
  --docker-only) check_docker ;;
  --landing-only) check_landing ;;
  *)
    check_worker
    check_docker
    check_landing
    ;;
esac

# ─── Summary ────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "  ${GREEN}All checks passed${NC}"
elif [ "$ERRORS" -eq 0 ]; then
  echo -e "  ${YELLOW}$WARNINGS warning(s) — deploy OK${NC}"
else
  echo -e "  ${RED}$ERRORS error(s), $WARNINGS warning(s)${NC}"
fi
echo "══════════════════════════════════════════════"
exit "$ERRORS"
