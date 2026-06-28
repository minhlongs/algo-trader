# Phase 3: Ramp Deployment (50% Global Traffic)

**Priority:** High - Multi-region activation  
**Status:** Pending  
**Estimated Duration:** 15 minutes

---

## Context Links

- Main Plan: `plan.md`
- Previous: Phase 2 (Canary Deployment)
- Next: Phase 4 (Full Global Deployment)
- Scripts: `scripts/deploy-region.sh`, `scripts/set-global-routing.sh`

---

## Overview

Deploy eu-central region and distribute 50% of global traffic between us-east and eu-central. Validate cross-region latency, shard distribution balance, and tenant affinity.

---

## Requirements

### Functional Requirements
1. Deploy eu-central region to full capacity
2. Configure Cloudflare global routing: us-east 50%, eu-central 50%
3. Validate cross-region latency <150ms
4. Verify shard distribution balanced (±10% variance)
5. Confirm tenant data accessible from both regions

### Non-Functional Requirements
- No downtime during traffic shift
- No data loss or corruption
- Shard rebalancing completes within 10 minutes
- Tenant session affinity preserved
- Failover capability validated (kill one region)

---

## Architecture

```
Phase 3 Traffic Distribution

                    ┌─────────────────────┐
                    │   Global Traffic    │
                    │   (100% total)      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Cloudflare Router  │
                    │  Weighted LB        │
                    └──────────┬──────────┘
                               │
               ┌───────────────┼───────────────┐
               │               │               │
               ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ us-east  │   │ eu-central│   │ ap-se    │
        │  50%     │   │   50%     │   │  0%      │
        └──────────┘   └──────────┘   └──────────┘
        (3-6 inst)     (3-6 inst)      (0 inst)
```

---

## Files to Modify

None (deployment-only phase)

---

## Implementation Steps

### Step 1: Deploy eu-central Region

```bash
# Deploy eu-central with 25% initial weight (conservative)
./scripts/deploy-region.sh eu-central --weight=25

# Expected output:
# [INFO] Deploying eu-central instances...
# [INFO] Creating 3 droplet instances...
# [INFO] Configuring NATS JetStream...
# [INFO] Initializing Redis replication...
# [INFO] Health checks passing...
# [SUCCESS] eu-central deployment complete
```

**Wait:** 5 minutes for full initialization.

---

### Step 2: Verify eu-central Health

```bash
# Check eu-central health status
./scripts/health-monitor.sh eu-central

# Expected:
# Region: eu-central
# Status: HEALTHY
# Instances: 3/3 healthy
# Avg Latency: 50ms
# Error Rate: 0.0%
# Memory: 95MB avg

# Also check Grafana dashboard:
# - eu-central metrics appearing
# - No error spikes
# - Replication lag acceptable (<5s)
```

---

### Step 3: Measure Cross-Region Latency

```bash
# Run cross-region latency test
./scripts/measure-cross-region-latency.sh

# Expected output:
# us-east ↔ eu-central: 85ms avg
# us-east ↔ ap-southeast: N/A (not deployed)
# eu-central ↔ ap-southeast: N/A
# [PASS] All latencies <150ms

# If any latency >150ms, investigate:
# - Check DO region network quality
# - Verify Cloudflare routing
# - Consider adjusting deployment strategy
```

---

### Step 4: Configure Global Routing (50/50 Split)

```bash
# Set traffic distribution: us-east 50%, eu-central 50%
./scripts/set-global-routing.sh --us-east=50 --eu-central=50 --ap-southeast=0

# Expected output:
# [INFO] Updating Cloudflare routing rules...
# [INFO] us-east: 50% (was 100%)
# [INFO] eu-central: 50% (was 0%)
# [INFO] ap-southeast: 0%
# [INFO] Rules updated successfully
# [SUCCESS] Global routing configured

# Verify:
./scripts/check-traffic-distribution.sh
# Expected:
# us-east: ~50%
# eu-central: ~50%
# ap-southeast: 0%
```

---

### Step 5: Monitor Shard Distribution Balance

```bash
# Check shard allocation across regions
curl https://api.algo-trader.workers.dev/api/admin/shard-stats | jq

# Expected output:
# {
#   "total_shards": 100,
#   "us-east": 48,
#   "eu-central": 49,
#   "ap-southeast": 0,
#   "unassigned": 3
# }
# [PASS] Distribution balanced (±10%)

# If unbalanced >10%, trigger rebalance:
./scripts/rebalance-shards.sh --regions=us-east,eu-central
```

---

### Step 6: Validate Tenant Affinity & Data Access

```bash
# 1. Create test tenant
TEST_TENANT_ID=$(curl -X POST https://api.algo-trader.workers.dev/api/v1/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"cross-region-test"}' | jq -r '.tenant_id')
echo "Test tenant: $TEST_TENANT_ID"

# 2. Check which shard assigned
SHARD_ID=$(curl https://api.algo-trader.workers.dev/api/admin/tenants/$TEST_TENANT_ID/shard \
  | jq -r '.shard_id')
echo "Assigned to shard: $SHARD_ID"

# 3. Verify shard location (region)
SHARD_REGION=$(curl https://api.algo-trader.workers.dev/api/admin/shard/$SHARD_ID/region \
  | jq -r '.region')
echo "Shard located in: $SHARD_REGION"

# 4. Access tenant data from both regions
# From us-east:
curl https://us-east.algo-trader.workers.dev/api/v1/tenants/$TEST_TENANT_ID/data \
  -H "Authorization: Bearer $TENANT_TOKEN"

# From eu-central:
curl https://eu-central.algo-trader.workers.dev/api/v1/tenants/$TEST_TENANT_ID/data \
  -H "Authorization: Bearer $TENANT_TOKEN"
# Both should return same data (consistent)

# 5. Cleanup
curl -X DELETE https://api.algo-trader.workers.dev/api/v1/tenants/$TEST_TENANT_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

### Step 7: Test Failover (Kill eu-central)

**Important:** Execute this as a controlled test to validate multi-region resilience.

```bash
# 1. Simulate eu-central failure (drain then stop)
./scripts/drain-region.sh eu-central --graceful=60
./scripts/stop-region.sh eu-central

# 2. Verify traffic reroutes to us-east
./scripts/check-traffic-distribution.sh
# Expected: us-east: 100%, eu-central: 0%

# 3. Check tenant availability (should be no downtime)
curl https://api.algo-trader.workers.dev/api/v1/tenants/$TEST_TENANT_ID/data
# Expected: 200 OK (data served from us-east replica)

# 4. Verify alerts fired (expected)
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.alertname=="RegionDown")'
# Expected: Alert firing for eu-central

# 5. Restore eu-central
./scripts/restore-region.sh eu-central
./scripts/health-monitor.sh eu-central
# Expected: Region back online within 5 minutes

# 6. Verify traffic redistribution
./scripts/set-global-routing.sh --us-east=50 --eu-central=50 --ap-southeast=0
```

---

### Step 8: Extended Monitoring (15 minutes)

Monitor all systems for 15 minutes with 50/50 split:

```bash
# Run comprehensive monitor
./scripts/monitor-all-regions.sh --duration=15m

# Watch for:
# - No error rate increase
# - Latency stable (<100ms p95 globally)
# - Memory usage stable
# - Shard distribution stable
# - Replication lag <5s
# - No cache misses due to shard movement
```

**Grafana dashboard checks:**

1. **System Health:**
   - Request rate distributed evenly
   - Error rate chart: flat line near 0%
   - Latency p95: stable under 100ms

2. **Tenant SLA:**
   - Tenant count per region: ~50/50 split
   - Cross-region latency: <150ms
   - Data consistency: 100%

3. **Cost Metrics:**
   - Cost per region visible
   - No unexpected spend spikes

---

## Success Criteria

### Must Pass (All Required)

- [ ] eu-central deployed successfully (3/3 instances healthy)
- [ ] Cross-region latency <150ms (us-east ↔ eu-central)
- [ ] Traffic distribution: us-east 50%, eu-central 50% (±5% tolerance)
- [ ] Shard distribution balanced (±10% variance)
- [ ] Tenant data accessible from both regions (consistency verified)
- [ ] Failover test passed (eu-central killed, traffic routes to us-east)
- [ ] eu-central restored successfully
- [ ] Error rate <1% sustained for 10 minutes
- [ ] No data loss during failover test

### Should Pass (Expected)

- [ ] Redis replication lag <3 seconds
- [ ] Database replication lag <2 seconds
- [ ] NATS JetStream no backlog
- [ ] Grafana dashboards stable, no gaps
- [ ] Alertmanager no firing alerts
- [ ] Circuit breaker remains closed

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cross-region latency >150ms | Medium | High | Test DO region connectivity pre-deploy, adjust Cloudflare routing |
| Shard distribution unbalanced | Medium | Medium | Run rebalance script manually, verify shard movement |
| Tenant data inconsistent | Low | High | Implement read-after-write consistency checks, verify replication |
| Failover fails | Medium | Critical | Test failover before traffic shift, have L1 kill switch ready |
| Resource exhaustion | Low | High | Monitor memory/CPU, autoscale thresholds configured |

---

## Rollback Procedure

If Phase 3 encounters critical issues:

```bash
# 1. Route all traffic back to us-east only
./scripts/set-global-routing.sh --us-east=100 --eu-central=0 --ap-southeast=0

# 2. Disable eu-central from receiving new connections
./scripts/drain-region.sh eu-central --immediate
./scripts/stop-region.sh eu-central

# 3. Alert team
./scripts/alert-team.sh --priority=high "Phase 3 rollback - eu-central issues, traffic us-east only"

# 4. Diagnose
./scripts/diagnose-region-failure.sh eu-central

# 5. Decision: retry eu-central deployment or proceed to ap-southeast
```

---

## Next Steps

Upon successful completion of Phase 3:

1. Record evidence: `/mekong artifact scale-ready platform-operations "50% global traffic across us-east + eu-central"`
2. Proceed to Phase 4: Full Global Deployment (deploy ap-southeast)
3. Prepare ap-southeast region (verify DO capacity available)
4. Document any shard distribution adjustments made
5. Update runbooks with failover test results

---

## Unresolved Questions

- [ ] Validate ap-southeast DO region availability and network latency to other regions
- [ ] Confirm budget for 3-region deployment approved
- [ ] Verify data residency requirements met for ap-southeast (if any)
- [ ] Schedule Phase 4 deployment time (consider team availability)
