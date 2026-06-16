#!/bin/bash
#
# Multi-Region Deployment Script
# Deploys algo-trader to all 3 regions: us-east, eu-central, ap-southeast
#
# Usage: ./scripts/deploy-multi-region.sh [--dry-run] [--skip-verify]
#
# Options:
#   --dry-run     Show what would be deployed without actually deploying
#   --skip-verify Skip post-deployment verification
#   --region X    Deploy only to specific region (us-east, eu-central, ap-southeast)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Configuration
REGIONS=("us-east" "eu-central" "ap-southeast")
DRY_RUN=false
SKIP_VERIFY=false
SPECIFIC_REGION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true ;;
    --skip-verify) SKIP_VERIFY=true ;;
    --region)
      SPECIFIC_REGION="$2"
      shift 2
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate environment
if [[ -z "$(command -v wrangler 2>/dev/null)" ]]; then
  echo "❌ wrangler CLI not found. Install with: npm install -g wrangler"
  exit 1
fi

if [[ ! -f "wrangler.toml" ]]; then
  echo "❌ wrangler.toml not found in project root"
  exit 1
fi

# Build before deploy
echo "🔨 Building project..."
if [[ "$DRY_RUN" == "false" ]]; then
  pnpm build
else
  echo "  [dry-run] Skipping build"
fi

# Deploy function
deploy_region() {
  local region="$1"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🚀 Deploying to $region..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [dry-run] Would execute: wrangler deploy --env $region --minify"
    echo "  [dry-run] Would run health checks for $region"
    return 0
  fi

  # Deploy
  if wrangler deploy --env "$region" --minify; then
    echo "✅ $region deployment successful"
  else
    echo "❌ $region deployment failed"
    return 1
  fi

  # Health check
  echo "  Checking health..."
  local host="${region}.algo-trader.workers.dev"
  local max_attempts=10
  local attempt=1

  while [[ $attempt -le $max_attempts ]]; do
    if curl -sf "https://$host/api/health" > /dev/null 2>&1; then
      echo "  ✅ $region health check passed (attempt $attempt/$max_attempts)"
      return 0
    fi

    echo "  ⏳ Waiting for $region to become healthy... ($attempt/$max_attempts)"
    sleep 5
    attempt=$((attempt + 1))
  done

  echo "❌ $region health check failed after $max_attempts attempts"
  return 1
}

# Verify all regions
verify_deployment() {
  if [[ "$SKIP_VERIFY" == "true" ]]; then
    echo "⏭️  Skipping verification (--skip-verify)"
    return 0
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔍 Verifying multi-region deployment..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local verify_script="$SCRIPT_DIR/verify-multi-region.sh"

  if [[ -f "$verify_script" ]]; then
    if bash "$verify_script"; then
      echo "✅ All regions verified successfully"
      return 0
    else
      echo "❌ Verification failed"
      return 1
    fi
  else
    echo "⚠️  Verification script not found, running basic checks..."

    for region in "${REGIONS[@]}"; do
      if [[ -n "$SPECIFIC_REGION" && "$region" != "$SPECIFIC_REGION" ]]; then
        continue
      fi

      local host="${region}.algo-trader.workers.dev"
      if curl -sf "https://$host/api/health" > /dev/null 2>&1; then
        echo "  ✅ $region: healthy"
      else
        echo "  ❌ $region: unhealthy"
      fi
    done
  fi
}

# Main deployment loop
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌍 Multi-Region Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Target regions: ${REGIONS[*]}"
echo "Dry run: $DRY_RUN"
echo "Skip verify: $SKIP_VERIFY"
if [[ -n "$SPECIFIC_REGION" ]]; then
  echo "Deploying only to: $SPECIFIC_REGION"
fi
echo ""

# Deploy regions in order: us-east → eu-central → ap-southeast
FAILED=0
for region in "${REGIONS[@]}"; do
  if [[ -n "$SPECIFIC_REGION" && "$region" != "$SPECIFIC_REGION" ]]; then
    echo "⏭️  Skipping $region (not in --region filter)"
    continue
  fi

  if deploy_region "$region"; then
    echo "✅ $region deployed successfully"
  else
    echo "❌ $region deployment failed"
    FAILED=$((FAILED + 1))
  fi
done

# Verification
if [[ $FAILED -eq 0 ]]; then
  if verify_deployment; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ Multi-region deployment complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Deployed regions:"
    for region in "${REGIONS[@]}"; do
      [[ -n "$SPECIFIC_REGION" && "$region" != "$SPECIFIC_REGION" ]] && continue
      echo "  • https://$region.algo-trader.workers.dev"
    done
    echo ""
    exit 0
  else
    FAILED=$((FAILED + 1))
  fi
else
  echo ""
  echo "❌ $FAILED region(s) failed to deploy"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  Deployment incomplete. Check logs above for errors."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Troubleshooting:"
echo "  1. Check wrangler login: wrangler whoami"
echo "  2. Verify account limits: wrangler account"
echo "  3. Check region routes in Cloudflare dashboard"
echo "  4. Review logs: wrangler tail --env <region>"
echo ""

exit 1
