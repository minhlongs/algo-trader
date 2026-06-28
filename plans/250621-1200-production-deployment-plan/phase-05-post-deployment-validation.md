# Phase 5: Post-Deployment Validation

**Priority:** High - Verify production stability  
**Status:** Pending  
**Estimated Duration:** 2 hours (30m active + 90m monitoring)

---

## Context Links

- Main Plan: `plan.md`
- Previous: Phase 4 (Full Global Deployment)
- Related: [Runbook Index](../docs/runbook-index.md)
- Scripts: `scripts/global-health-check.sh`, `scripts/verify-shard-consistency.sh`

---

## Overview

Comprehensive validation of production deployment after full global rollout. Includes health checks, metrics validation, data consistency verification, and extended monitoring.

---

## Requirements

### Functional Requirements
1. All health checks passing on all regions
2. All metrics within defined thresholds
3. Data consistency verified across all regions
4. Shard distribution stable and balanced
5. Alert system functioning correctly
6. Integration tests passing in production context

### Non-Functional Requirements
- Monitoring duration: 2 hours minimum
- Zero data loss or corruption
- No P1/P2 incidents triggered
- SLA met: p95 <100ms, error <1%, uptime 100%
- Documentation updated with actual results

---

## Architecture

```
Post-Deployment Validation Flow

T+0m   T+30m   T+60m   T+90m   T+120m
  │      │       │       │        │
  ├──────┼───────┼───────┼────────┼─── Active Monitoring
  │      │       │       │        │
  ├──────┼───────┼───────┼────────┼─── Health Checks
  │      │       │       │        │
  ├──────┼───────┼───────┼────────┼─── Metrics Validation
  │      │       │       │        │
  └──────┴───────┴───────┴────────┴─── Sign-off at T+120m
```

---

## Files to Modify

- `docs/deployment-summary.md` (create if needed)
- `docs/runbook-incident-response.md` (update with lessons learned)

---

## Implementation Steps

### Step 1: Immediate Health Check (T+0m)

```bash
# Run comprehensive health validation
./scripts/global-health-check.sh --full

# Expected output:
# ✓ All 3 regions HEALTHY (9/9 instances)
# ✓ Latency p95: 78ms (us-east), 92ms (eu-central), 110ms (ap-southeast)
# ✓ Error rate: 0.0% globally
# ✓ Memory usage: 98MB avg (under 115MB threshold)
# ✓ Circuit breaker: CLOSED
# ✓ Database replication: lag <2s
# ✓ Redis replication: lag <1s
# ✓ NATS JetStream: no backlog
# ✓ Cloudflare routing: correct weights
```

**If any check fails:**
- Investigate immediately
- Consider rollback if critical
- Document failure and resolution

---

### Step 2: Metrics Validation (T+5m)

```bash
# 1. Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health!="up")'
# Expected: empty array (all targets up)

# 2. Verify Grafana dashboards populated
./scripts/check-grafana-data.sh --dashboard="System Health"
./scripts/check-grafana-data.sh --dashboard="Tenant SLA"
./scripts/check-grafana-data.sh --dashboard="Cost Metrics"
# Expected: All dashboards show data within last 5 minutes

# 3. Check key metrics values
curl -s https://api.algo-trader.workers.dev/metrics \
  | grep -E "algo_trader_(heap|uptime|trades|errors|circuit_breaker)"
# Expected: Reasonable values, no spikes

# 4. Verify metrics collection across all regions
for region in us-east eu-central ap-southeast; do
  echo "Checking $region metrics..."
  curl -s https://$region.algo-trader.workers.dev/metrics \
    | grep 'algo_trader_uptime_seconds' \
    | tail -1
done
# Expected: All regions reporting
```

---

### Step 3: Data Consistency Check (T+15m)

```bash
# 1. Verify shard distribution stability
./scripts/check-shard-distribution.sh --stable-window=10m
# Expected: Variance <5% over 10 minutes

# 2. Check replication lag
./scripts/check-replication-lag.sh --max-seconds=3
# Expected: All replicas lag <3 seconds

# 3. Verify Redis geo-replication
./scripts/check-redis-georeplication.sh
# Expected: All Redis clusters synchronized

# 4. Test read-after-write consistency
./scripts/test-consistency-multi-region.sh --iterations=10
# Expected: 100% consistency rate

# 5. Check for orphaned shards (unassigned)
curl https://api.algo-trader.workers.dev/api/admin/shard-stats | jq '.unassigned'
# Expected: 0
```

---

### Step 4: Integration Tests in Production (T+30m)

```bash
# Run smoke tests against production
npx vitest run tests/smoke --environment=production --baseUrl=https://api.algo-trader.workers.dev

# Test categories:
# - Health endpoints (/health, /ready)
# - Authentication flows
# - Tenant CRUD operations
# - Shard routing
# - WebSocket connections
# - Metrics endpoint
# - Rate limiting
# - Circuit breaker

# Expected: All tests passing
```

**If tests fail:**
- Investigate immediately
- May indicate configuration drift or missing environment variables
- Fix and re-run before proceeding

---

### Step 5: Alert Validation (T+45m)

```bash
# 1. Check for firing alerts
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state=="firing")'
# Expected: Empty (no alerts firing)

# 2. Verify alert rules loaded
curl http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | .alert'
# Expected: All expected rules listed (10+ rules)

# 3. Test alert pipeline (send test alert)
./scripts/test-alert-pipeline.sh --alert="TestAlert" --severity=warning
# Expected: Alert received in Slack/Telegram within 30 seconds

# 4. Check Alertmanager silence configuration
curl http://localhost:9094/api/v2/silences | jq
# Expected: Any scheduled maintenances visible
```

---

### Step 6: Extended Monitoring (T+60m to T+120m)

```bash
# Start extended monitoring
./scripts/extended-monitoring.sh \
  --duration=120m \
  --interval=30s \
  --output=deployment-validation.log

# Monitor these continuously:
# - Error rate (must stay <1%)
# - Latency p95 (must stay <100ms)
# - Memory per instance (must stay <115MB)
# - Instance count (all regions 3/3)
# - Shard distribution (±10%)
# - Replication lag (<5s)
# - Disk space (>20% free)
# - Network I/O (no saturation)

# Watch in separate terminal:
tail -f deployment-validation.log
```

**Grafana dashboard checks every 15 minutes:**

1. **System Health:**
   - Request rate: even across regions
   - Latency: stable p95 under 100ms
   - Error rate: flat near 0%
   - Memory: stable under 115MB

2. **Tenant SLA:**
   - Tenant distribution: balanced across regions
   - Cross-region latency: stable
   - Data consistency: 100%

3. **Cost Metrics:**
   - Cost per region: within budget
   - No unexpected spikes

---

### Step 7: User Feedback Check (T+90m)

```bash
# 1. Check support/feedback channels
./scripts/check-support-channels.sh
# Look for:
# - User-reported issues
# - Performance complaints
# - Feature requests related to deployment

# 2. Review application logs for WARN/ERROR
./scripts/aggregate-logs.sh --level=WARN --since=2h | wc -l
# Expected: Minimal warnings (<10 total)

# 3. Check exception tracking (if Sentry/LogRocket configured)
./scripts/check-exception-tracking.sh
# Expected: Zero new critical exceptions

# 4. Verify user-facing SLAs
./scripts/calculate-sla-metrics.sh --window=2h
# Expected:
# - Availability: 100%
# - P95 latency: <100ms
# - Error rate: <1%
```

---

### Step 8: Final Validation & Sign-off (T+120m)

```bash
# Run final comprehensive check
./scripts/final-validation-report.sh --output=validation-summary.json

# Expected output (JSON):
# {
#   "timestamp": "2026-06-21T12:00:00Z",
#   "deployment_status": "successful",
#   "regions": {
#     "us-east": {"healthy": true, "instances": 3, "latency_p95": 78},
#     "eu-central": {"healthy": true, "instances": 3, "latency_p95": 92},
#     "ap-southeast": {"healthy": true, "instances": 3, "latency_p95": 110}
#   },
#   "global_metrics": {
#     "error_rate": 0.003,
#     "latency_p95": 93,
#     "memory_avg_mb": 98,
#     "uptime": 1.0
#   },
#   "shard_distribution": {"variance_percent": 3.2, "unassigned": 0},
#   "data_consistency": {"rate": 1.0, "checks": 50},
#   "alerts": {"firing": 0, "total": 12},
#   "validation_passed": true
# }
```

**Review summary with team:**
```bash
./scripts/generate-validation-summary.sh | tee deployment-summary.txt
# Share in #deploy Slack channel
```

---

## Success Criteria

### Mandatory (All Required)

- [ ] All 9 instances healthy (3 per region)
- [ ] Latency p95 <100ms globally for 2 hours
- [ ] Error rate <1% for 2 hours
- [ ] Memory usage <115MB per instance
- [ ] Shard distribution balanced (±10% variance)
- [ ] Data consistency 100% (read-after-write across regions)
- [ ] Replication lag <5 seconds
- [ ] Zero data loss or corruption
- [ ] No alerts firing (all normal)
- [ ] Integration tests passing in production

### Expected (Should Pass)

- [ ] Grafana dashboards fully populated
- [ ] Cost metrics within budget
- [ ] User feedback channels clear (no outage reports)
- [ ] Log aggregation working (Loki)
- [ ] Audit logging capturing all admin actions
- [ ] Backup jobs successful (last 24h)
- [ ] Security controls validated (rate limiting, auth, etc.)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Latency increases over time | Low | Medium | Monitor DO instance load, scale vertically if needed |
| Memory leak discovered | Medium | High | Monitor heap trend, restart instances if gradual increase |
| Data inconsistency detected | Low | Critical | Implement read-repair, investigate replication lag |
| Alert fatigue from noise | Medium | Low | Tune alert thresholds after first week |
| Cost overrun | Medium | Medium | Monitor daily cost, implement spending alerts |

---

## Documentation Updates

Update these files after successful validation:

1. `docs/deployment-summary.md` (create if doesn't exist)
   - Include: deployment date, regions deployed, metrics achieved
   - Attach validation-summary.json
   - Document any issues encountered and resolutions

2. `docs/runbook-index.md`
   - Add link to new deployment runbooks if created

3. `docs/production-rollout-plan.md`
   - Update status to "Deployed"
   - Add "Actual Results" section with metrics

---

## Next Steps

Upon successful completion of Phase 5:

1. Record evidence: `/mekong artifact scale-ready platform-operations "Post-deployment validation complete - all metrics green"`
2. Maintain active monitoring for remainder of stabilization window (total 2h)
3. Schedule team retrospective within 24 hours
4. Update documentation with final results
5. Close deployment incident (if opened)
6. Celebrate successful deployment! 🎉

---

## Unresolved Questions

- [ ] Document actual cost metrics (compare vs projections)
- [ ] Identify any tuning opportunities (Redis, NATS, DB params)
- [ ] List any open tickets from deployment (non-blocking issues)
- [ ] Plan next deployment cycle (if applicable)
- [ ] Schedule production readiness review meeting

---

## Monitoring During Stabilization Window (T+2h to T+24h)

Even after Phase 5 complete, continue monitoring:

**Hourly checks:**
```bash
./scripts/hourly-health-check.sh
./scripts/check-costs.sh
./scripts/check-error-logs.sh --since=1h
./scripts/verify-backups.sh
```

**Daily at 08:00 UTC:**
```bash
./scripts/daily-health-report.sh
./scripts/daily-cost-report.sh
./scripts/daily-usage-report.sh
```

All findings documented in `docs/operations-log.md`.
