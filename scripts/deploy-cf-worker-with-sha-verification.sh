#!/bin/bash
# deploy-cf.sh — Deploy algo-trader edge proxy to Cloudflare Workers
# Injects COMMIT_SHA/DEPLOYED_AT/DEPLOY_BRANCH secrets so /api/version returns live SHA.
#
# Usage:
#   bash scripts/deploy-cf.sh
#   ALLOW_DIRTY_DEPLOY=1 bash scripts/deploy-cf.sh   # skip dirty check (emergency)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

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

# ─── Inject secrets ─────────────────────────────────────────────────
echo "==> Setting Worker secrets (COMMIT_SHA, DEPLOYED_AT, DEPLOY_BRANCH)"
echo "$COMMIT_SHA" | npx wrangler secret put COMMIT_SHA --config wrangler.toml
echo "$DEPLOYED_AT" | npx wrangler secret put DEPLOYED_AT --config wrangler.toml
echo "$DEPLOY_BRANCH" | npx wrangler secret put DEPLOY_BRANCH --config wrangler.toml

# ─── Deploy ─────────────────────────────────────────────────────────
echo "==> wrangler deploy"
npx wrangler deploy --config wrangler.toml

# ─── Verify SHA match (workers.dev + custom domain) ────────────────
WORKER_URL="https://algo-trader.agencyos-openclaw.workers.dev"
echo ""
echo "==> Verifying deploy SHA..."
LIVE_SHA=$(curl -sf "$WORKER_URL/api/version" | python3 -c "import json,sys; print(json.load(sys.stdin).get('shortSha',''))" 2>/dev/null || echo "")
if [ "$COMMIT_SHORT" = "$LIVE_SHA" ]; then
  echo "✅ DEPLOY VERIFIED — SHA $COMMIT_SHORT matches live worker"
else
  echo "❌ SHA MISMATCH — local=$COMMIT_SHORT live=$LIVE_SHA"
  echo "   Worker may be serving stale code. Try re-running deploy."
  exit 1
fi

# ─── Verify custom domain ───────────────────────────────────────────
echo ""
CUSTOM_URL="https://api.cashclaw.cc"
API_HTTP=$(curl -s -o /tmp/api_health_body -w "%{http_code}" "$CUSTOM_URL/api/health")
if [ "$API_HTTP" = "200" ]; then
  echo "✅ Custom domain: HTTP $API_HTTP (api.cashclaw.cc operational)"
else
  echo "⚠️  Custom domain: HTTP $API_HTTP — check CF Dashboard CNAME for api.cashclaw.cc"
fi

echo ""
echo "Deploy complete: $WORKER_URL | $CUSTOM_URL"
