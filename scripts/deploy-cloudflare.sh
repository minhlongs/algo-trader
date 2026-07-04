#!/usr/bin/env bash
set -euo pipefail

# Deploy to Cloudflare Pages (manual fallback)
# Usage: ./scripts/deploy-cloudflare.sh [--dry-run]

cd "$(dirname "$0")/.."

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  echo "[DRY RUN] Would deploy to Cloudflare Pages"
fi

# Check prerequisites
if ! command -v wrangler &>/dev/null; then
  echo "ERROR: wrangler CLI not found. Install with: npm install -g wrangler"
  exit 1
fi

# Verify Cloudflare login
if ! wrangler whoami &>/dev/null; then
  echo "ERROR: Not logged in to Cloudflare. Run: wrangler login"
  exit 1
fi

# Build
echo "[1/4] Building..."
npm run build

# Deploy
echo "[2/4] Deploying to Cloudflare Pages..."
if [[ $DRY_RUN -eq 1 ]]; then
  echo "[DRY RUN] wrangler pages deploy dist/"
else
  wrangler pages deploy dist/ --project-name algo-trader
fi

echo "[3/4] Health check..."
HEALTH_URL="https://algo-trader-worker.pages.dev/health"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "[DRY RUN] Would check: $HEALTH_URL"
else
  for i in 1 2 3 4 5; do
    if curl -sf "$HEALTH_URL" >/dev/null; then
      echo "✓ Health check passed"
      break
    fi
    echo "Waiting for deployment... ($i/5)"
    sleep 10
  done
fi

echo "[4/4] Done."
