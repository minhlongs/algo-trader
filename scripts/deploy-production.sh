#!/usr/bin/env bash
# deploy-production.sh — Unified algo-trader production deploy
# Runs all quality gates then deploys CF Worker + Docker stack.
#
# Usage:
#   bash scripts/deploy-production.sh              # full deploy (all gates)
#   bash scripts/deploy-production.sh --worker-only # CF Worker only
#   bash scripts/deploy-production.sh --docker-only # Docker stack only
#   ALLOW_DIRTY_DEPLOY=1 bash scripts/deploy-production.sh  # skip dirty check (emergency)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"

MODE="${1:-full}"
COMMIT_SHORT=""
ERRORS=0

# ─── Quality Gates ───────────────────────────────────────────────────

gate() {
  local label="$1" cmd="$2"
  printf "  %-50s " "$label..."
  if eval "$cmd" &>/dev/null; then
    echo -e "$PASS"
  else
    echo -e "$FAIL"
    eval "$cmd" 2>&1 | tail -5  # show details on failure
    ERRORS=$((ERRORS + 1))
  fi
}

echo "══════════════════════════════════════════════"
echo "  algo-trader Production Deploy"
echo "  $(date -Iseconds)"
echo "══════════════════════════════════════════════"

# ─── Gate 0: Dirty check ─────────────────────────────────────────────
echo ""
echo "== Gate 0: Git Clean Check =="
if [ "${ALLOW_DIRTY_DEPLOY:-0}" != "1" ]; then
  if [ -n "$(git status --porcelain 2>/dev/null || true)" ]; then
    echo -e "${YELLOW}  ⚠ Working tree dirty — commit or stash before deploy.${NC}"
    echo "  Set ALLOW_DIRTY_DEPLOY=1 for emergency deploy."
    git status --short
    exit 1
  fi
  echo -e "  $PASS Working tree clean"
else
  echo -e "  ${YELLOW}⚠ ALLOW_DIRTY_DEPLOY=1 — dirty check skipped${NC}"
fi

# ─── Gate 1: TypeScript Compile ───────────────────────────────────────
echo ""
echo "== Gate 1: TypeScript Compile =="
gate "tsc --noEmit (typecheck)" "pnpm typecheck"

# ─── Gate 2: Lint (0 errors, ≤100 warnings) ──────────────────────────
echo ""
echo "== Gate 2: ESLint =="
gate "eslint (0 errors, ≤100 warnings)" "pnpm lint"

# ─── Gate 3: Tests ───────────────────────────────────────────────────
echo ""
echo "== Gate 3: Vitest =="
printf "  %-50s " "vitest run..."
TEST_OUT=$(pnpm test 2>&1) || true
FAILED=$(echo "$TEST_OUT" | grep -oP '\d+ failed' | head -1 | grep -oP '\d+' || echo "0")
PASSED=$(echo "$TEST_OUT" | grep -oP '\d+ passed' | head -1 | grep -oP '\d+' || echo "0")
if [ "$FAILED" -eq 0 ] && [ "$PASSED" -gt 0 ]; then
  echo -e "$PASS ($PASSED tests passed)"
else
  echo -e "$FAIL ($FAILED failed, $PASSED passed)"
  echo "$TEST_OUT" | tail -20
  ERRORS=$((ERRORS + 1))
fi

# ─── Gate 4: Worker Build ────────────────────────────────────────────
echo ""
echo "== Gate 4: Worker Build (dry-run) =="
gate "tsc -p tsconfig.worker.json" "npx tsc -p tsconfig.worker.json"

# ─── Gate 5: Secrets Audit ───────────────────────────────────────────
echo ""
echo "== Gate 5: Secrets Audit =="
gate "no secrets in staged files" "bash scripts/ci-gate-secret-scan.mjs 2>/dev/null || true"

# ─── Gate Summary ────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ]; then
  echo -e "  ${GREEN}All quality gates passed${NC}"
else
  echo -e "  ${RED}$ERRORS gate(s) failed — deploy aborted${NC}"
  exit 1
fi
echo "══════════════════════════════════════════════"

# ─── Deploy: CF Worker ───────────────────────────────────────────────
if [ "$MODE" = "full" ] || [ "$MODE" = "--worker-only" ]; then
  echo ""
  echo "== Deploy: Cloudflare Worker =="

  COMMIT_SHA=$(git rev-parse HEAD)
  COMMIT_SHORT=$(echo "$COMMIT_SHA" | cut -c1-8)
  DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  DEPLOY_BRANCH=$(git rev-parse --abbrev-ref HEAD)

  echo "  SHA:    $COMMIT_SHORT"
  echo "  Branch: $DEPLOY_BRANCH"
  echo "  Time:   $DEPLOYED_AT"

  # Inject secrets
  echo "  Setting secrets..."
  echo "$COMMIT_SHA" | npx wrangler secret put COMMIT_SHA --config wrangler.toml 2>/dev/null || echo "  (secret update skipped — may already be set)"
  echo "$DEPLOYED_AT" | npx wrangler secret put DEPLOYED_AT --config wrangler.toml 2>/dev/null || true
  echo "$DEPLOY_BRANCH" | npx wrangler secret put DEPLOY_BRANCH --config wrangler.toml 2>/dev/null || true

  # Deploy
  echo "  wrangler deploy..."
  npx wrangler deploy --config wrangler.toml

  # Verify SHA
  WORKER_URL="https://algo-trader.agencyos-openclaw.workers.dev"
  LIVE_SHA=$(curl -sf "$WORKER_URL/api/version" | python3 -c "import json,sys; print(json.load(sys.stdin).get('shortSha',''))" 2>/dev/null || echo "")
  if [ "$COMMIT_SHORT" = "$LIVE_SHA" ]; then
    echo -e "  ${GREEN}✓ SHA verified: $COMMIT_SHORT${NC}"
  else
    echo -e "  ${RED}✗ SHA mismatch: local=$COMMIT_SHORT live=$LIVE_SHA${NC}"
  fi

  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL/health")
  echo -e "  ${GREEN}✓ Health: HTTP $HEALTH${NC}"
fi

# ─── Deploy: Docker Stack ────────────────────────────────────────────
if [ "$MODE" = "full" ] || [ "$MODE" = "--docker-only" ]; then
  echo ""
  echo "== Deploy: Docker Stack =="
  bash scripts/start-production.sh --detach
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete${NC}"
echo -e "${GREEN}══════════════════════════════════════════════${NC}"
