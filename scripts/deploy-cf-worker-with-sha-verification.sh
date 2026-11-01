#!/bin/bash
# deploy-cf.sh — Deploy algo-trader edge proxy to Cloudflare Workers
# Injects COMMIT_SHA/DEPLOYED_AT/DEPLOY_BRANCH secrets so /api/version returns live SHA.
#
# Usage:
#   bash scripts/deploy-cf.sh
#   ALLOW_DIRTY_DEPLOY=1 bash scripts/deploy-cf.sh   # skip dirty check (emergency)

set -euo pipefail

# ─── Constants ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

# ─── Staging Preflight Guard & Target Resolver ─────────────────────────
TARGET_ENV="${CF_WORKER_ENV:-${ENVIRONMENT:-staging}}"
echo "==> Staging Target Resolution: TARGET_ENV=$TARGET_ENV"

if [ "$TARGET_ENV" = "staging" ]; then
  echo "==> Running fail-closed staging preflight safety checks..."
  export DB_NAME="${DB_NAME:-algo_trader_staging}"
  export DB_HOST="${DB_HOST:-staging-db}"
  TARGET_ENV="staging" npx tsx scripts/staging-preflight-check.ts
  WRANGLER_ENV_FLAG="--env staging"
  # Staging must never verify against production custom domain api.cashclaw.cc
  WORKER_URL="${STAGING_WORKER_URL:-https://algo-trader-staging.agencyos-openclaw.workers.dev}"
elif [ "$TARGET_ENV" = "production" ]; then
  if [ "${ALLOW_PRODUCTION_DEPLOY:-0}" != "1" ]; then
    echo "❌ FATAL: Production deploy is strictly blocked by staging safety guard."
    echo "   Set ALLOW_PRODUCTION_DEPLOY=1 only with formal authorized approval."
    exit 1
  fi
  WRANGLER_ENV_FLAG=""
  WORKER_URL="${WORKER_URL:-https://api.cashclaw.cc}"
else
  echo "❌ FATAL: Unrecognized deploy target '$TARGET_ENV'. Must be 'staging' or 'production'."
  exit 1
fi

# ─── Dirty check ───────────────────────────────────────────────────
if [ "${ALLOW_DIRTY_DEPLOY:-0}" != "1" ]; then
  if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: working tree is dirty. Commit or stash before deploy."
    echo "Set ALLOW_DIRTY_DEPLOY=1 for emergency deploy."
    git status --short
    exit 1
  fi
fi

# ─── Git metadata ───────────────────────────────────────────────────
COMMIT_SHA=$(git rev-parse HEAD)
COMMIT_SHORT=$(echo "$COMMIT_SHA" | cut -c1-8)
DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DEPLOY_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "==> Deploying algo-trader edge proxy"
echo "    SHA:    $COMMIT_SHORT"
echo "    Branch: $DEPLOY_BRANCH"
echo "    Time:   $DEPLOYED_AT"

# ─── Build worker ───────────────────────────────────────────────────
echo "==> tsc -p tsconfig.worker.json"
npx tsc -p tsconfig.worker.json

# ─── Deploy ─────────────────────────────────────────────────────────
echo "==> wrangler deploy $WRANGLER_ENV_FLAG"
npx wrangler deploy --config wrangler.toml $WRANGLER_ENV_FLAG

# ─── Inject secrets ─────────────────────────────────────────────────
echo "==> Setting Worker secrets (COMMIT_SHA, DEPLOYED_AT, DEPLOY_BRANCH) for target $TARGET_ENV"
echo "$COMMIT_SHA" | npx wrangler secret put COMMIT_SHA --config wrangler.toml $WRANGLER_ENV_FLAG
echo "$DEPLOYED_AT" | npx wrangler secret put DEPLOYED_AT --config wrangler.toml $WRANGLER_ENV_FLAG
echo "$DEPLOY_BRANCH" | npx wrangler secret put DEPLOY_BRANCH --config wrangler.toml $WRANGLER_ENV_FLAG

# ─── Verify SHA match (target URL) ─────────────────────────────────
echo ""
echo "==> Verifying deploy SHA on $WORKER_URL..."
HTTP_RESPONSE=$(curl -s -S --max-time 15 -w "\n%{http_code}" "$WORKER_URL/api/version" 2>&1 || echo "CURL_ERROR")
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n1)
BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

if [ "$HTTP_RESPONSE" = "CURL_ERROR" ] || [ "$HTTP_CODE" != "200" ]; then
  echo "❌ DEPLOY VERIFICATION FAILED: Endpoint $WORKER_URL/api/version returned HTTP $HTTP_CODE or connection failed"
  echo "   Response: $BODY"
  exit 1
fi

LIVE_SHA=$(echo "$BODY" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('shortSha') or '')" 2>/dev/null || echo "")

if [ -z "$LIVE_SHA" ]; then
  echo "❌ DEPLOY VERIFICATION FAILED: Response from $WORKER_URL/api/version did not contain valid shortSha"
  echo "   Body: $BODY"
  exit 1
fi

if [ "$COMMIT_SHORT" != "$LIVE_SHA" ]; then
  echo "❌ DEPLOY VERIFICATION FAILED: SHA MISMATCH for target $TARGET_ENV"
  echo "   Expected local SHA: $COMMIT_SHORT"
  echo "   Live worker SHA:   $LIVE_SHA"
  exit 1
fi

echo "✅ DEPLOY VERIFIED — SHA $COMMIT_SHORT matches live worker for target $TARGET_ENV"

# ─── Verify custom domain (Only on production) ──────────────────────
if [ "$TARGET_ENV" = "production" ]; then
  echo ""
  CUSTOM_URL="https://cashclaw.cc"
  API_HTTP=$(curl -s -o /tmp/api_health_body -w "%{http_code}" "$CUSTOM_URL/api/health")
  if [ "$API_HTTP" = "200" ]; then
    echo "✅ Custom domain: HTTP $API_HTTP (cashclaw.cc operational)"
  else
    echo "⚠️  Custom domain: HTTP $API_HTTP — check CF Dashboard CNAME for cashclaw.cc"
  fi
fi

echo ""
echo "Deploy step finished for target: $TARGET_ENV ($WORKER_URL)"
