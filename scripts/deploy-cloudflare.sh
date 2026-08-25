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

if ! command -v pnpm &>/dev/null; then
  echo "ERROR: pnpm not found. Install with: npm install -g pnpm"
  exit 1
fi

# Verify Cloudflare login
if ! wrangler whoami &>/dev/null; then
  echo "ERROR: Not logged in to Cloudflare. Run: wrangler login"
  exit 1
fi

# Build
echo "Step 1/4 Building..."
echo "  - npm run build (tsc)"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "[DRY RUN] Would run: npm run build"
else
  npm run build
fi
echo "  - (cd dashboard && pnpm run build) -> dist/dashboard/"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "[DRY RUN] Would run: (cd dashboard && pnpm run build)"
else
  (cd dashboard && pnpm run build)
fi

# Deploy
echo "Step 2/4 Deploying to Cloudflare Pages..."
if [[ $DRY_RUN -eq 1 ]]; then
  echo "[DRY RUN] wrangler pages deploy dist/dashboard/ --project-name algo-trader"
else
  wrangler pages deploy dist/dashboard/ --project-name algo-trader
fi

echo "Step 3/4 Health check..."
HEALTH_URLS=("https://algo-trader.pages.dev" "https://cashclaw.cc")
if [[ $DRY_RUN -eq 1 ]]; then
  for url in "${HEALTH_URLS[@]}"; do
    echo "[DRY RUN] Would check: curl -s -o /dev/null -w '%{http_code}' -L $url (expect 200)"
  done
else
  for url in "${HEALTH_URLS[@]}"; do
    ok=0
    for i in 1 2 3 4 5; do
      code="$(curl -s -o /dev/null -w '%{http_code}' -L "$url" || true)"
      if [[ "$code" == "200" ]]; then
        echo "✓ Health check passed: $url (HTTP $code)"
        ok=1
        break
      fi
      echo "Waiting for deployment... ($i/5) $url (got HTTP $code)"
      if [[ $i -lt 5 ]]; then
        sleep 10
      fi
    done
    if [[ $ok -eq 0 ]]; then
      echo "ERROR: Health check failed for $url"
      exit 1
    fi
  done
fi

echo "Step 4/4 Done."
