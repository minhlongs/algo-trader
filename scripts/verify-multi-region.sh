#!/bin/bash
#
# Multi-Region Deployment Verification
# Checks all regions are healthy and properly configured
#
# Usage: ./scripts/verify-multi-region.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Configuration
REGIONS=("us-east" "eu-central" "ap-southeast")
ENDPOINTS=(
  "/api/health"
  "/api/health/region"
)

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_endpoint() {
  local region="$1"
  local endpoint="$2"
  local host="${region}.algo-trader.workers.dev"
  local url="https://$host${endpoint}"

  local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 5)
  local success=false

  if [[ "$status_code" == "200" ]]; then
    success=true
  fi

  if [[ "$success" == "true" ]]; then
    echo -e "  ${GREEN}✓${NC} ${endpoint} (${status_code})"
    return 0
  else
    echo -e "  ${RED}✗${NC} ${endpoint} (${status_code})"
    return 1
  fi
}

check_shard_count() {
  local region="$1"
  local host="${region}.algo-trader.workers.dev"
  local url="https://$host/api/v1/shard/health"

  # This endpoint may not exist yet if Phase 1 (sharding) not complete
  local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 5)

  if [[ "$status_code" == "200" ]]; then
    local shard_count=$(curl -s "$url" | jq -r '.shards | length' 2>/dev/null || echo "0")
    if [[ "$shard_count" -ge 4 ]]; then
      echo -e "  ${GREEN}✓${NC} Shard health: $shard_count shards active"
      return 0
    else
      echo -e "  ${YELLOW}⚠${NC} Shard health: $shard_count shards (expected 4+)"
      return 0
    fi
  else
    echo -e "  ${YELLOW}⚠${NC} Shard health endpoint not available (Phase 1 may not be complete)"
    return 0
  fi
}

check_region() {
  local region="$1"
  echo ""
  echo "Region: $region"
  echo "─────────────────────────────────────"

  local all_ok=true

  # Check endpoints
  for endpoint in "${ENDPOINTS[@]}"; do
    if ! check_endpoint "$region" "$endpoint"; then
      all_ok=false
    fi
  done

  # Check shard assignment
  check_shard_count "$region"

  # Check latency (from health response)
  local host="${region}.algo-trader.workers.dev"
  local health_resp=$(curl -s "https://$host/api/health/region" 2>/dev/null || echo "")
  if [[ -n "$health_resp" ]]; then
    local latency=$(echo "$health_resp" | jq -r '.latencyMs // "N/A"' 2>/dev/null)
    local status=$(echo "$health_resp" | jq -r '.status // "unknown"' 2>/dev/null)

    if [[ "$status" == "healthy" ]]; then
      echo -e "  ${GREEN}✓${NC} Region status: $status (latency: ${latency}ms)"
    else
      echo -e "  ${RED}✗${NC} Region status: $status (latency: ${latency}ms)"
      all_ok=false
    fi
  fi

  return $([ "$all_ok" = true ] && echo 0 || echo 1)
}

# Main
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Multi-Region Deployment Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check dependencies
if ! command -v curl &> /dev/null; then
  echo "❌ curl is required"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "⚠️  jq not found, JSON parsing disabled (install with: brew install jq)"
fi

# Check all regions
FAILED=0
for region in "${REGIONS[@]}"; do
  if ! check_region "$region"; then
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}✅ All regions verified successfully${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  echo -e "${RED}❌ $FAILED region(s) have issues${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Troubleshooting steps:"
  echo "  1. Check wrangler deployment: wrangler tail --env <region>"
  echo "  2. Verify Cloudflare routes in dashboard"
  echo "  3. Ensure VPS_ORIGIN is set in each region's environment"
  echo "  4. Check NATS/Redis replication is healthy"
  echo ""
  exit 1
fi
