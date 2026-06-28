# Phase 4: Full Global Deployment (100% Traffic)

**Priority:** Critical - Complete multi-region rollout  
**Status:** Pending  
**Estimated Duration:** 5 minutes

---

## Context Links

- Main Plan: `plan.md`
- Previous: Phase 3 (Ramp Deployment)
- Next: Phase 5 (Post-Deployment Validation)
- Scripts: `scripts/deploy-region.sh`, `scripts/set-global-routing.sh`

---

## Overview

Deploy ap-southeast region and enable full global traffic distribution (us-east 33%, eu-central 33%, ap-southeast 34%). Validate full multi-region operation and shard distribution.

---

## Requirements

### Functional Requirements
1. Deploy ap-southeast region to full capacity
2. Configure Cloudflare global routing: all 3 regions active
3. Validate shard distribution balanced across all regions
4. Verify global latency p95 <100ms
5. Confirm tenant data consistency across all regions

### Non-Functional Requirements
- Zero downtime during final traffic shift
- No data inconsistency across regions
- Shard distribution balanced (±10% variance)
- All regions serving traffic within 2 minutes
- Failover to any single region verified

---

## Architecture

```
Final Multi-Region Architecture

                    ┌─────────────────────┐
                    │   Global Traffic    │
                    │   (100% total)      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Cloudflare Router  │
                    │  (Equal Weight)     │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
  ┌──────────┐         ┌──────────┐         ┌──────────┐
  │ us-east  │         │ eu-central│         │ ap-se    │
  │   33%    │         │   33%     │         │   34%    │
  └──────────┘         └──────────┘         └──────────┘
  (3-6 inst)            (3-6 inst)           (3-6 inst)
```

---

## Files to Modify

None (deployment-only phase)

---

## Implementation Steps

### Step 1: Deploy ap-southeast Region

```bash
# Deploy ap-southeast with initial weight 33%
./scripts/deploy-region.sh ap-southeast --weight=33

# Expected output:
# [INFO] Deploying ap-southeast instances...
# [INFO] Creating 3 droplet instances in Singapore...
# [INFO] Configuring NATS JetStream...
# [INFO] Initializing Redis geo-replication...
# [INFO] Health checks initiated...
# [SUCCESS] ap-southeast deployment complete

# Note: ap-southeast may take 7-10 minutes due to DO image sync delays
```

**Monitor deployment progress:**

```bash
# Watch ap-southeast health status
watch -n 10 ./scripts/health-monitor.sh ap-southeast

# Expected progression:
# - Initializing... (0-2min)
# - Starting instances... (2-5min)
# - Health checks passing... (5-7min)
# - HEALTHY (7-10min)
```

---

### Step 2: Verify ap-southeast Health

```bash
# Full health check
./scripts/health-monitor.sh ap-southeast

# Expected output:
# Region: ap-southeast
# Status: HEALTHY
# Instances: 3/3 healthy
# Avg Latency: 110ms (from us-east)
# Error Rate: 0.0%
# Memory: 102MB avg
# Circuit Breaker: CLOSED

# Also check Grafana:
# - ap-southeast metrics visible
# - No error spikes
# - Latency to region acceptable (<150ms from us-east)
```

---

### Step 3: Configure Equal Global Routing

```bash
# Set equal distribution: us-east 33%, eu-central 33%, ap-southeast 34%
./scripts/set-global-routing.sh \
  --us-east=33 \
  --eu-central=33 \
  --ap-southeast=34

# Expected output:
# [INFO] Updating Cloudflare routing rules...
# [INFO] us-east: 33% (was 50%)
# [INFO] eu-central: 33% (was 50%)
# [INFO] ap-southeast: 34% (was 0%)
# [INFO] Rules updated successfully
# [SUCCESS] Global routing configured (all regions active)

# Verify distribution
./scripts/check-traffic-distribution.sh
# Expected (approximate):
# us-east: 33%
# eu-central: 33%
# ap-southeast: 34%
```

---

### Step 4: Validate Shard Distribution Balance

```bash
# Check shard allocation across all 3 regions
curl https://api.algo-trader.workers.dev/api/admin/shard-stats | jq '.'
```

**Expected output (example):**

```json
{
  "total_shards": 100,
  "region_distribution": {
    "us-east": 33,
    "eu-central": 33,
    "ap-southeast": 34
  },
  "variance_percent": 3.0,
  "unassigned": 0,
  "status": "balanced"
}
```

**If variance >10%, rebalance:**

```bash
./scripts/rebalance-shards.sh --regions=us-east,eu-central,ap-southeast
# Wait for rebalance to complete (5-10 minutes)
./scripts/wait-for-shard-migration.sh --timeout=600
```

---

### Step 5: Cross-Region Consistency Validation

```bash
# 1. Create test tenant (will be assigned to some shard)
TENANT_ID=$(curl -X POST https://api.algo-trader.workers.dev/api/v1/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"global-consistency-test"}' | jq -r '.tenant_id')

# 2. Write data from us-east
curl -X POST https://us-east.algo-trader.workers.dev/api/v1/tenants/$TENANT_ID/config \
  -H "Authorization: Bearer $TENANT_TOKEN" \
  -d '{"setting":"test_value_1","enabled":true}' > /dev/null

# 3. Read from eu-central
RESULT_EU=$(curl https://eu-central.algo-trader.workers.dev/api/v1/tenants/$TENANT_ID/config \
  -H "Authorization: Bearer $TENANT_TOKEN")

# 4. Read from ap-southeast
RESULT_AP=$(curl https://ap-southeast.algo-trader.workers.dev/api/v1/tenants/$TENANT_ID/config \
  -H "Authorization: Bearer $TENANT_TOKEN")

# 5. Verify consistency
if [ "$RESULT_EU" = "$RESULT_AP" ]; then
  echo "✓ Data consistent across regions"
else
  echo "✗ Data inconsistency detected!"
  echo "eu-central: $RESULT_EU"
  echo "ap-southeast: $RESULT_AP"
  exit 1
fi

# 6. Cleanup
curl -X DELETE https://api.algo-trader.workers.dev/api/v1/tenants/$TENANT_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

### Step 6: Global Latency Validation

```bash
# Measure end-to-end global latency (Cloudflare → region → DB → response)
./scripts/measure-global-latency.sh --regions=us-east,eu-central,ap-southeast

# Expected output:
# Region       | p50  | p95  | p99  | Status
# us-east      | 32ms | 78ms | 95ms | ✓ PASS
# eu-central   | 45ms | 92ms | 120ms| ✓ PASS
# ap-southeast | 65ms | 110ms| 145ms| ✓ PASS
# Global avg   | 48ms | 93ms | 120ms| ✓ PASS (<100ms p95)

# If p95 > 100ms:
# - Check DO instance sizes (too small?)
# - Check database query performance
# - Check Redis latency
# - Consider edge caching strategy
```

---

### Step 7: Extended Global Monitoring (10 minutes)

```bash
# Run comprehensive global health check
./scripts/global-health-check.sh --duration=10m

# Monitor:
# - All regions healthy (no failing health checks)
# - Error rate <1% globally
# - Latency p95 <100ms
# - Shard distribution stable (±5% over time)
# - Replication lag <5s for all DB replicas
# - Redis geo-replication healthy
# - NATS JetStream no backlog
```

**Grafana dashboard verification:**

1. **System Health:**
   - Request rate: even distribution across regions
   - Latency p95 chart: flat line under 100ms
   - Error rate: flat line near 0%

2. **Tenant SLA:**
   - Tenant count per region: 33/33/34 split
   - Cross-region latency matrix: all <150ms
   - Data consistency: 100%

3. **Cost Metrics:**
   - Cost per region visible and within budget
   - No unexpected spikes

---

## Success Criteria

### Must Pass (All Required)

- [ ] ap-southeast deployed successfully (3/3 instances healthy)
- [ ] All 3 regions actively serving traffic
- [ ] Traffic distribution: us-east ~33%, eu-central ~33%, ap-southeast ~34% (±5%)
- [ ] Shard distribution balanced (±10% variance)
- [ ] Global latency p95 <100ms
- [ ] Error rate <1% for 10 consecutive minutes
- [ ] Data consistent across all regions (read-after-write)
- [ ] No data loss during deployment
- [ ] All instances healthy (9/9)
- [ ] Replication lag <5s for all databases

### Should Pass (Expected)

- [ ] Memory usage <115MB per instance
- [ ] Circuit breaker remains closed
- [ ] NATS JetStream zero backlog
- [ ] Redis memory <80% on all nodes
- [ ] Grafana dashboards show continuous data (no gaps)
- [ ] Alertmanager no firing alerts
- [ ] Cost per hour within projected budget

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| ap-southeast fails to start | Medium | High | Have backup DO region, extend deployment window |
| Shard rebalancing too slow | Low | Medium | Pre-warm connections, increase batch size |
| Cross-region latency high | Medium | High | Check DO network, consider different region combo |
| Data inconsistency | Low | Critical | Implement strong consistency checks, pause writes during failover test |
| Traffic distribution uneven | Medium | Medium | Fine-tune Cloudflare weights, rebalance shards |

---

## Rollback Procedure

If ap-southeast deployment fails or causes issues:

```bash
# 1. Remove ap-southeast from routing
./scripts/set-global-routing.sh --us-east=50 --eu-central=50 --ap-southeast=0

# 2. Drain and stop ap-southeast
./scripts/drain-region.sh ap-southeast --graceful=30
./scripts/stop-region.sh ap-southeast

# 3. Alert team
./scripts/alert-team.sh --priority=high "ap-southeast deployment failed - reverted to 2-region (us-east/eu-central)"

# 4. Decide:
#    a) Retry ap-southeast deployment (fix issues first)
#    b) Continue with 2-region (not ideal but acceptable temporarily)
#    c) Abort deployment and rollback to single-region us-east

# 5. If continuing with 2 regions:
#    - Document decision and rationale
#    - Adjust capacity planning (50% capacity reduction)
#    - Re-evaluate cost projections
```

---

## Next Steps

Upon successful completion of Phase 4:

1. Record evidence: `/mekong artifact scale-ready platform-operations "Full global deployment complete (100% traffic across 3 regions)"`
2. Proceed to Phase 5: Post-Deployment Validation
3. Continue monitoring for 2-hour stabilization window
4. Document any anomalies observed during deployment
5. Schedule team retrospective within 24 hours

---

## Unresolved Questions

- [ ] Confirm all 9 instances (3 per region) are on correct instance sizes (performance vs cost tradeoff)
- [ ] Verify shard count (100) is sufficient for projected tenant growth
- [ ] Validate that tenant session affinity preserved across regions (users stick to nearest region)
- [ ] Document observed latencies for each region (inform future capacity planning)

---

## Additional Notes

### Phase Transition Criteria

To move from Phase 4 → Phase 5, verify:

1. All regions serving traffic for 10+ minutes
2. No rollback triggered
3. All validation checks pass (see Success Criteria)
4. Team consensus: "System stable, ready for extended monitoring"

If criteria not met, remain in Phase 4 and troubleshoot until resolved.
