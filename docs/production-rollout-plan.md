# Production Rollout Plan — algo-trader Scaling

**Status:** Ready for Deployment
**Target:** Multi-region production deployment with 12k RPS capacity
**Timeline:** 30 minutes total deployment, 2h stabilization window

---

## Pre-Rollout Checklist

### Technical Readiness
- [x] All scaling phases complete (1-11)
- [x] TypeScript compilation passing
- [x] Integration tests passing
- [x] Load test scripts validated (k6 scripts ready)
- [x] CI/CD pipeline updated with multi-region stages
- [x] Monitoring dashboards provisioned (Grafana)
- [x] Alerting rules configured (Prometheus + Alertmanager)
- [x] Rollback procedures documented and tested

### Operational Readiness
- [ ] On-call engineer notified and available
- [ ] Team standup completed (deployment sync)
- [ ] Slack #deploy channel active
- [ ] Incident response runbook reviewed
- [ ] Database backups verified (if applicable)
- [ ] Redis cluster healthy
- [ ] NATS JetStream running

### Documentation
- [x] Deployment guide updated
- [x] Runbooks published
- [x] Architecture diagrams current
- [x] API contracts documented

---

## Rollback Triggers

| Condition | Threshold | Action | Timeline |
|-----------|-----------|--------|----------|
| Error rate | >5% for 5m | L3 circuit breaker | Immediate |
| Region unhealthy | >3m | Auto-failover to healthy regions | 5m |
| Latency p95 | >200ms global | Alert + investigate | 2m |
| Memory usage | >115MB (90% of 128MB) | Disable tier 3 agents | Immediate |
| Critical bug | Any | L1 kill switch | Immediate |

---

## Rollback Procedure

### L1 Kill Switch (Immediate)
```bash
# Disable multi-region routing
curl -X POST https://api.algo-trader.workers.dev/api/admin/rollback/kill/MULTI_REGION \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Disable sharding
curl -X POST https://api.algo-trader.workers.dev/api/admin/rollback/kill/SHARDING \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Manual Rollback Steps
1. Route all traffic to us-east only (update Cloudflare rules)
2. Disable sharding (single DO mode in us-east)
3. Force model tier to Haiku only (disable Sonnet/Opus)
4. Direct fetch (disable connection pool queues)
5. Notify team via Telegram/Slack
6. Investigate root cause
7. Fix and re-deploy

---

## Deployment Timeline

### T-24h: Staging Dry Run
- [ ] Deploy full multi-region to staging
- [ ] Run full load test (12k RPS for 30m)
- [ ] Verify all alerts fire correctly
- [ ] Team dry-run of rollback procedure
- [ ] Final staging validation: `./scripts/final-integration-check.js`

### T-1h: Final Checks
- [ ] Confirm all regions healthy in staging
- [ ] Check database replication lag (if using)
- [ ] Verify Redis cluster memory usage
- [ ] Confirm NATS JetStream streams healthy
- [ ] Review recent logs for errors

### T-0: Deployment

#### Phase 1: Canary (us-east, 5% traffic)
1. Deploy us-east canary:
   ```bash
   ./scripts/deploy-region.sh us-east
   ```
2. Verify health (5 minutes)
3. Check metrics: latency, error rate, memory
4. If issues → rollback immediately

#### Phase 2: Ramp (50% traffic)
5. Increase us-east to 50% (update routing weights)
6. Deploy eu-central:
   ```bash
   ./scripts/deploy-region.sh eu-central
   ```
7. Verify eu-central health (10 minutes)
8. Monitor cross-region latency

#### Phase 3: Full (100% traffic)
9. Deploy remaining us-east instances
10. Ramp eu-central to 50%, then 100%
11. Deploy ap-southeast:
    ```bash
    ./scripts/deploy-region.sh ap-southeast
    ```
12. Verify ap-southeast health (10 minutes)
13. Enable global routing to 100%

### T+30m: Post-Deployment Validation
- [ ] All regions healthy
- [ ] Shard distribution even (check metrics)
- [ ] Error rate <1%
- [ ] Memory <115MB per instance
- [ ] Latency p95 <100ms globally
- [ ] No rollback triggered
- [ ] All alerts normal (no firing)

### T+2h: Stabilization
- [ ] Continue monitoring
- [ ] Check user feedback channels
- [ ] Verify billing/usage metrics
- [ ] Review logs for warnings/errors
- [ ] Confirm DO shard counts stable

---

## Success Criteria

### Pre-Deployment
- [ ] All 12 phases marked complete
- [ ] Integration tests 100% passing
- [ ] Load test 12k RPS passes (p95 <100ms, error <1%)
- [ ] ME IDEA PSF gate approved
- [ ] Documentation published and reviewed
- [ ] Team training complete

### Deployment
- [ ] All 3 regions deployed successfully
- [ ] Health checks passing on all regions
- [ ] Latency p95 <100ms globally
- [ ] Error rate <1%
- [ ] No OOM incidents
- [ ] All alerts in normal state

### Post-Deployment
- [ ] Canary validation complete
- [ ] Full traffic routed to all regions
- [ ] Monitoring stable for 2h
- [ ] User feedback positive (no outage reports)
- [ ] Rollback NOT needed (or if used, documented and re-deployed successfully)

---

## Communication Plan

### During Deployment
- **Channel:** `#deploy` Slack channel
- **Updates:** Every 5 minutes during deployment phases
- **Escalation:** Ping `@oncall` immediately on any failure

### On Incident
- **Channel:** `#incident` Slack channel
- **Actions:** Follow incident response runbook
- **Communication:** Hourly updates to stakeholders

### Post-Deployment
- **Notification:** `#announcements` channel
- **Document:** Post-mortem if any issues
- **Retro:** Team retro within 24h

---

## References

- [Deployment Guide](../docs/deployment-guide.md)
- [System Architecture](../docs/system-architecture.md)
- [Runbook Index](../docs/runbook-index.md)
- [Load Test Results](../reports/load-test/)
- [CI/CD Pipeline](../.github/workflows/ci.yml)

---

**Last Updated:** 2026-06-16
**Owner:** Platform Operations (Phase 12)
