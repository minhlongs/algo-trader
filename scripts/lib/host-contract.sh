#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Single source of truth for the deployed API host.
#
# The CF Worker is deployed behind one route (see wrangler.toml):
#   api.cashclaw.cc/*   zone cashclaw.cc
#
# Old scripts assumed per-region subdomains "<region>.algo-trader.workers.dev".
# Those hostnames DO NOT RESOLVE — every script that used them silently failed.
# Source this file instead of hardcoding a host:
#
#   source scripts/lib/host-contract.sh
#   echo "$API_HOST" "$API_HEALTH_URL" "$API_RING_URL"
#
# Override for staging / preview deploys:
#   API_HOST=staging.example.com source scripts/lib/host-contract.sh
# ─────────────────────────────────────────────────────────────────────────────

export API_HOST="${API_HOST:-api.cashclaw.cc}"
export API_SCHEME="${API_SCHEME:-https}"
export API_BASE_URL="${API_SCHEME}://${API_HOST}"
export API_HEALTH_URL="${API_BASE_URL}/api/health"
export API_RING_URL="${API_BASE_URL}/api/v1/shard/ring"
export API_METRICS_URL="${API_BASE_URL}/metrics"

# Whether the deployment is actually multi-region. False until multi-region is built;
# scripts must not fabricate per-region hosts while this is 0.
export MULTI_REGION_ENABLED="${MULTI_REGION_ENABLED:-0}"
