#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

REGION=$1
if [[ -z "$REGION" ]]; then
  echo "Usage: $0 <region>"
  echo "Regions: us-east, eu-central, ap-southeast"
  exit 1
fi

VALID_REGIONS=("us-east" "eu-central" "ap-southeast")
valid=0
for r in "${VALID_REGIONS[@]}"; do
  [ "$r" = "$REGION" ] && valid=1
done
if [ "$valid" -eq 0 ]; then
  echo "Invalid region: $REGION"
  echo "Valid regions: ${VALID_REGIONS[*]}"
  exit 1
fi

echo "========================================"
echo "Deploying to region: $REGION"
echo "========================================"

# Set region environment
export CF_WORKER_ENV=$REGION
export DEPLOY_REGION=$REGION

# Build
echo "[1/5] Building..."
npm run build

# Deploy with wrangler
echo "[2/5] Deploying Worker..."
npx wrangler deploy --env $REGION --minify

# Wait for deployment to stabilize
echo "[3/5] Waiting for deployment to stabilize..."
sleep 10

# Health check
echo "[4/5] Running health check..."
HEALTH_URL="https://${REGION}.algo-trader.workers.dev/api/health"
MAX_RETRIES=10
RETRY_COUNT=0
STATUS=0

while [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")
  if [[ "$STATUS" == "200" ]]; then
    echo "  ✓ Health check passed (200)"
    break
  fi
  echo "  Health check returned $STATUS, retry $((RETRY_COUNT + 1))/$MAX_RETRIES..."
  sleep 5
  RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [[ "$STATUS" != "200" ]]; then
  echo "❌ $REGION failed health check after $MAX_RETRIES attempts"
  exit 1
fi

# Verify shard ring
echo "[5/5] Verifying shard ring..."
RING_URL="https://${REGION}.algo-trader.workers.dev/api/v1/shard/ring"
SHARD_COUNT=$(curl -s "$RING_URL" | jq -r '.shards // [] | length' 2>/dev/null || echo "0")
if [[ "$SHARD_COUNT" -ge 4 ]]; then
  echo "  ✓ $SHARD_COUNT shards active"
else
  echo "  ⚠ Only $SHARD_COUNT shards active (expected 4+)"
fi

echo ""
echo "✅ $REGION deployment complete"
echo "URL: https://${REGION}.algo-trader.workers.dev"
echo ""
