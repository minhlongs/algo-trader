# Phase 2: Canary Deployment (us-east 5%)

**Priority:** Critical - First production deployment  
**Status:** Pending  
**Estimated Duration:** 10 minutes

---

## Context Links

- Main Plan: `plan.md`
- Previous: Phase 1 (Pre-Deployment Validation)
- Next: Phase 3 (Ramp Deployment)
- Scripts: `scripts/deploy-region.sh`, `scripts/health-monitor.sh`

---

## Overview

Deploy initial canary instances to us-east region with 5% traffic allocation. Validate health, metrics, and error rates before promoting to full us-east deployment.

---

## Requirements

### Functional Requirements
1. Deploy algo-trader to us-east region
2. Configure Cloudflare to route 5% of global traffic to canary
3. Health checks must pass on all canary instances
4. Metrics must meet thresholds for minimum 5 minutes

### Non-Functional Requirements
- Canary must handle full production load (12k RPS capability)
- Latency p95 <100ms
- Error rate <0.5%
- Memory usage <115MB per instance
- Zero data loss during deployment
- Rollback time <60 seconds if needed

---

## Architecture

```
Deployment Order (Phase 2)

                    ┌─────────────────────┐
                    │   Global Traffic    │
                    │   (100% total)      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Cloudflare Router  │
                    │  (Weighted Rules)   │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
    ┌──────────┐      ┌──────────┐        ┌──────────┐
    │ us-east  │      │ eu-central│        │ ap-se    │
    │ 5% (canary)│      │  0%       │        │  0%      │
    └──────────┘      └──────────┘        └──────────┘
    (3 instances)      (0 instances)       (0 instances)
```

---

## Files to Modify

None (deployment-only phase)

---

## Implementation Steps

### Step 1: Deploy Canary to us-east

```bash
# Deploy with canary flag and 5% weight
./scripts/deploy-region.sh us-east --canary --weight=5

# Expected output:
# [INFO] Deploying us-east-canary instances...
# [INFO] Rolling out 3 new instances...
# [INFO] Health checks initiated...
# [INFO] Traffic weight set to 5%
# [SUCCESS] us-east-canary deployment complete
```

**Wait time:** 2-3 minutes for instances to start and health checks to pass.

---

### Step 2: Monitor Canary Health (5 minutes)

```bash
# Continuous health monitoring (run in separate terminal)
watch -n 5 ./scripts/health-monitor.sh us-east-canary

# Or one-off check
./scripts/health-monitor.sh us-east-canary

# Expected output:
# Region: us-east-canary
# Status: HEALTHY
# Instances: 3/3 healthy
# Avg Latency: 45ms
# Error Rate: 0.0%
# Memory: 98MB avg
# Circuit Breaker: CLOSED
```

**Monitor Grafana dashboard:**
- Open Grafana → "System Health" dashboard
- Filter by region: `us-east-canary`
- Verify:
  - Request rate increasing (some traffic from 5%)
  - Latency stable
  - No error spikes

---

### Step 3: Validate Metrics Thresholds

```bash
# 1. Check latency (p95 < 100ms)
curl -s https://us-east-canary.algo-trader.workers.dev/metrics \
  | grep 'http_request_duration_seconds_bucket{le="0.1"}'
# Expected: count > 0 (most requests under 100ms)

# 2. Check error rate (< 0.5%)
curl -s https://us-east-canary.algo-trader.workers.dev/metrics \
  | grep 'http_requests_total{status=~"5.."}'
# Expected: 5xx rate < 0.005

# 3. Check memory (< 115MB)
curl -s https://us-east-canary.algo-trader.workers.dev/metrics \
  | grep 'algo_trader_heap_used_bytes'
# Expected: value < 120000000 (120MB)

# 4. Check circuit breaker state (should be 0=closed)
curl -s https://us-east-canary.algo-trader.workers.dev/metrics \
  | grep 'algo_trader_circuit_breaker_state'
# Expected: 0

# 5. Check instance uptime (> 2 minutes)
curl -s https://us-east-canary.algo-trader.workers.dev/metrics \
  | grep 'algo_trader_uptime_seconds'
# Expected: > 120
```

---

### Step 4: Smoke Test Canary API

```bash
# Run smoke tests against canary endpoint
BASE_URL=https://us-east-canary.algo-trader.workers.dev

# 1. Health check
curl -f ${BASE_URL}/health
# Expected: {"status":"healthy","timestamp":"..."}

# 2. Ready check
curl -f ${BASE_URL}/ready
# Expected: {"status":"ready"}

# 3. Metrics endpoint
curl -f ${BASE_URL}/metrics | head -5
# Expected: Prometheus metrics format

# 4. API test (create tenant, get API key)
TENANT_ID=$(curl -X POST ${BASE_URL}/api/v1/tenants/test \
  -H "Authorization: Bearer $TEST_TOKEN" | jq -r '.tenant_id')
echo "Created test tenant: $TENANT_ID"
# Expected: tenant_id returned

# 5. Cleanup
curl -X DELETE ${BASE_URL}/api/v1/tenants/$TENANT_ID \
  -H "Authorization: Bearer $TEST_TOKEN"
# Expected: {"deleted":true}
```

---

### Step 5: Decision Point - Promote or Rollback?

**Review all metrics:**

| Metric | Threshold | Actual | Pass? |
|--------|-----------|--------|-------|
| Latency p95 | <100ms | | |
| Error rate | <0.5% | | |
| Memory usage | <115MB | | |
| Instances healthy | 3/3 | | |
| Circuit breaker | closed (0) | | |
| Health checks | 200 OK | | |

**IF ALL PASS → Promote to full us-east**

Proceed to Step 6.

**IF ANY FAIL → Rollback Immediately**

```bash
./scripts/rollback-region.sh us-east-canary
./scripts/alert-team.sh --priority=high "Canary deployment failed - rolling back. Reason: <METRIC_FAILURE>"
exit 1
```

---

### Step 6: Promote Canary to 100% (us-east full)

```bash
# Update Cloudflare routing: us-east 100%, others 0%
./scripts/update-routing-weight.sh us-east 100

# Expected output:
# [INFO] Updating traffic routing...
# [INFO] us-east: 100% (previously 5%)
# [INFO] eu-central: 0%
# [INFO] ap-southeast: 0%
# [SUCCESS] Traffic fully routed to us-east
```

**Note:** This is temporary full us-east deployment before ramping other regions.

---

### Step 7: Monitor Full us-east (5 minutes)

```bash
# Verify all traffic now hitting us-east
./scripts/check-traffic-distribution.sh
# Expected: us-east: 100%, others: 0%

# Monitor for increased load (now 100% traffic)
./scripts/health-monitor.sh us-east
# Expected:
# - Latency still <100ms under full load
# - Error rate still <1%
# - All instances healthy
```

---

## Success Criteria

### Must Pass (All Required)

- [ ] Canary deployed successfully (3/3 instances healthy)
- [ ] Latency p95 <100ms for 5 consecutive minutes
- [ ] Error rate <0.5% for 5 consecutive minutes
- [ ] Memory usage <115MB per instance
- [ ] Health checks passing (200 on /health, /ready)
- [ ] Smoke tests passing (all API endpoints functional)
- [ ] Circuit breaker state = 0 (closed)
- [ ] Promote to full us-east completed successfully
- [ ] Full us-east healthy under 100% load

### Should Pass (Expected)

- [ ] No errors in application logs for 10 minutes
- [ ] Database replication lag <2 seconds
- [ ] Redis memory <70% used
- [ ] NATS streams processing without backlog

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Canary crashes under load | Rollback immediately (L1 kill switch ready) |
| Latency spikes | Check database queries, Redis connectivity |
| Error rate increases | Check exception logs, circuit breaker state |
| Memory leak | Monitor heap_used_bytes trend, restart instances |
| Traffic not routing correctly | Check Cloudflare rules, verify worker routes |

---

## Rollback Procedure (If Needed)

If canary fails validation:

```bash
# 1. Stop canary deployment
./scripts/stop-region.sh us-east-canary

# 2. Route traffic away from canary (back to old us-east)
./scripts/rollback-routing-to-stable.sh

# 3. Alert team
./scripts/alert-team.sh --priority=critical "Canary deployment rolled back - check logs"

# 4. Investigate root cause
./scripts/diagnose-canary-failure.sh us-east-canary

# 5. Fix issues in code/infra, then retry Phase 2
```

---

## Next Steps

Upon successful completion of Phase 2:

1. Record evidence: `/mekong artifact scale-ready platform-operations "Canary deployed and promoted to full us-east"`
2. Proceed to Phase 3: Ramp Deployment (deploy eu-central)
3. Continue monitoring us-east for 15 minutes before adding eu-central
4. Prepare eu-central deployment scripts and validate region readiness

---

## Unresolved Questions

- [ ] Confirm eu-central region capacity available (if not already provisioned)
- [ ] Verify cross-region latency within acceptable bounds (<150ms)
- [ ] Check if any tenant data needs migration before adding eu-central
- [ ] Confirm team availability for Phase 3 deployment
