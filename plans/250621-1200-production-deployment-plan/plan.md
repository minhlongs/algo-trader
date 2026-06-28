# Production Deployment Plan — algo-trader

**Status:** Ready for Deployment  
**Target:** Multi-region production deployment with 12k RPS capacity  
**Timeline:** 30 minutes total deployment, 2h stabilization window  
**Plan ID:** DEPLOY-001  
**Created:** 2026-06-21  
**Owner:** Platform Operations  

---

## Executive Summary

This plan outlines the complete deployment process for algo-trader's production release. The deployment includes multi-region setup (us-east, eu-central, ap-southeast), comprehensive monitoring, automated rollback procedures, and post-deployment validation.

**Success Criteria:**
- All 3 regions deployed successfully
- Health checks passing on all regions
- Latency p95 <100ms globally
- Error rate <1%
- No OOM incidents
- All alerts in normal state

---

## 1. Pre-Deployment Validation

### 1.1 Technical Readiness Checklist

#### Code & Build
- [ ] TypeScript compilation passing (no errors)
- [ ] All linting checks passing
- [ ] Unit tests ≥50 tests passing
- [ ] Integration tests passing (`npx vitest run tests/integration`)
- [ ] E2E tests passing (Playwright)
- [ ] Load test scripts validated (k6 scripts ready)
- [ ] Docker image built and tagged with SHA
- [ ] Docker image pushed to registry (ghcr.io/algo-trader:latest)

#### Infrastructure
- [ ] All 3 DigitalOcean regions provisioned:
  - us-east-1 (New York)
  - eu-central-1 (Frankfurt)
  - ap-southeast-1 (Singapore)
- [ ] Database clusters healthy (D1/PostgreSQL)
- [ ] Redis clusters healthy (with geo-replication)
- [ ] NATS JetStream running with proper stream config
- [ ] Cloudflare Workers deployed and routing configured
- [ ] Load balancer configured with health checks
- [ ] SSL certificates valid (managed by Cloudflare)

#### Monitoring & Alerting
- [ ] Grafana dashboards provisioned:
  - System Health
  - Tenant SLA
  - Cost Metrics
  - P0 Fixes
- [ ] Prometheus rules configured (alert thresholds)
- [ ] Alertmanager routing configured
- [ ] Notification channels tested:
  - Email (SendGrid)
  - Telegram
  - SMS (Twilio)
- [ ] Loki log aggregation configured

#### Data & Migration
- [ ] Database schema up-to-date (Prisma migrations applied)
- [ ] Data replication configured (if using read replicas)
- [ ] Backup strategy validated:
  - Automated daily backups
  - Point-in-time recovery tested
  - Retention policy configured (30 days)
- [ ] Seed data loaded (if required)

#### Security
- [ ] API keys rotated
- [ ] JWT secrets configured with proper rotation policy
- [ ] CORS whitelist configured
- [ ] Rate limiting enabled (Redis-backed)
- [ ] Cloudflare header verification active
- [ ] SOC2 compliance evidence collected
- [ ] Security audit completed

#### Documentation
- [ ] API documentation updated
- [ ] Runbooks published (see docs/runbook-index.md)
- [ ] Architecture diagrams current
- [ ] Deployment procedures documented
- [ ] Incident response playbooks ready

---

### 1.2 Operational Readiness

#### Team Coordination
- [ ] On-call engineer notified and available
- [ ] Team standup completed (deployment sync)
- [ ] Slack #deploy channel active with all stakeholders
- [ ] Incident response runbook reviewed
- [ ] Escalation paths confirmed

#### Pre-Deployment Checks (T-1h)
```bash
# 1. Check all regions healthy in staging
./scripts/check-region-health.sh us-east
./scripts/check-region-health.sh eu-central
./scripts/check-region-health.sh ap-southeast

# 2. Check database replication lag
./scripts/check-replication-lag.sh

# 3. Check Redis cluster memory
redis-cli -h redis-cluster info memory | grep used_memory

# 4. Check NATS JetStream streams
nats stream check ORDERS

# 5. Check recent error logs (last 30m)
./scripts/check-error-logs.sh --last=30m

# 6. Verify backup status
./scripts/verify-backups.sh
```

---

## 2. Deployment Phases

### Phase 1: Canary Deployment (us-east, 5% traffic)

**Duration:** 10 minutes  
**Risk Level:** Low

**Steps:**

1. **Deploy us-east canary instances**
```bash
# Deploy to us-east region (5% of capacity)
./scripts/deploy-region.sh us-east --canary --weight=5
```

2. **Wait for health check propagation (2 minutes)**
```bash
# Monitor canary health
watch -n 5 ./scripts/health-monitor.sh us-east-canary
```

3. **Verify canary metrics (3 minutes)**
```bash
# Check key metrics
curl https://us-east-canary.algo-trader.workers.dev/metrics | grep -E "algo_trader_(heap|uptime|trades|errors)"
```

4. **Validate metrics thresholds**
- Latency p95: <100ms
- Error rate: <0.5%
- Memory usage: <115MB
- Circuit breaker: closed (state=0)

5. **If issues detected → ROLLBACK**
```bash
./scripts/rollback-region.sh us-east-canary
./scripts/alert-team.sh "Canary deployment failed - rolling back"
exit 1
```

6. **Promote canary to 100% in us-east (temporary)**
```bash
./scripts/update-routing-weight.sh us-east 100
```

---

### Phase 2: Ramp Deployment (50% global traffic)

**Duration:** 15 minutes  
**Risk Level:** Medium

1. **Deploy eu-central region**
```bash
./scripts/deploy-region.sh eu-central --weight=25
```

2. **Verify eu-central health (5 minutes)**
```bash
./scripts/health-monitor.sh eu-central
```

3. **Cross-region latency check (3 minutes)**
```bash
# Measure inter-region latency
./scripts/measure-cross-region-latency.sh
# Expected: <150ms between any two regions
```

4. **Adjust traffic distribution**
```bash
# Set global distribution:
# us-east: 50%, eu-central: 50%, ap-southeast: 0%
./scripts/set-global-routing.sh --us-east=50 --eu-central=50 --ap-southeast=0
```

5. **Monitor for 5 minutes**
- Check error rates aggregated
- Verify shard distribution balanced
- Confirm no tenant affinity violations

---

### Phase 3: Full Global Deployment (100% traffic)

**Duration:** 5 minutes  
**Risk Level:** Medium

1. **Deploy ap-southeast region**
```bash
./scripts/deploy-region.sh ap-southeast --weight=33
```

2. **Wait for health check (2 minutes)**

3. **Enable full global routing**
```bash
# Equal distribution: each region 33%
./scripts/set-global-routing.sh --us-east=33 --eu-central=33 --ap-southeast=34
```

4. **Verify shard routing is active**
```bash
curl https://api.algo-trader.workers.dev/api/admin/sharding/status | jq
# Should show: sharding_enabled: true, regions: ["us-east","eu-central","ap-southeast"]
```

---

## 3. Post-Deployment Validation (T+30m)

### 3.1 Health Checks

Run comprehensive validation:

```bash
# 1. Global health
./scripts/global-health-check.sh

# 2. All regions health
for region in us-east eu-central ap-southeast; do
  ./scripts/check-region-health.sh $region
done

# 3. Integration tests (smoke)
npx vitest run tests/smoke

# 4. API contract validation
./scripts/validate-api-contracts.js
```

### 3.2 Metrics Validation

**Expected thresholds (2h window):**

| Metric | Threshold | Check Command |
|--------|-----------|---------------|
| Latency p95 | <100ms | `curl .../metrics \| grep latency` |
| Error rate | <1% | `curl .../metrics \| grep http_requests_total` |
| Memory per instance | <115MB | Grafana dashboard or `curl .../metrics \| grep heap_used` |
| Active tenants | Normal range | Grafana dashboard |
| P&L volatility | Within 3σ | Grafana dashboard |
| Shard distribution | ±10% variance | `curl .../admin/shard-stats` |

### 3.3 Alert State Verification

```bash
# Check Prometheus alerts
curl http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state=="firing")'

# Should return empty array or only expected firing alerts
```

### 3.4 Data Consistency Check

```bash
# Verify shard consistency across regions
./scripts/verify-shard-consistency.sh

# Check replication lag (if using)
./scripts/check-replication-lag.sh --max-seconds=5

# Verify tenant data accessible from all regions
./scripts/verify-tenant-global-access.sh
```

---

## 4. Rollback Procedures

### 4.1 L1 Kill Switch (Immediate)

If critical issues detected (error rate >5%, OOM, security breach):

```bash
# Disable multi-region routing
curl -X POST https://api.algo-trader.workers.dev/api/admin/rollback/kill/MULTI_REGION \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Disable sharding
curl -X POST https://api.algo-trader.workers.dev/api/admin/rollback/kill/SHARDING \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Force all traffic to us-east only
./scripts/force-us-east-only.sh

# Alert team
./scripts/alert-team.sh --priority=critical "L1 kill switch activated - rolling back to us-east single-region"
```

**Expected result:** All traffic routes to us-east within 60 seconds.

### 4.2 L2 Regional Rollback (Per-region issues)

If single region unhealthy (>3 minutes):

```bash
# Drain traffic from problematic region
./scripts/drain-region.sh eu-central

# Stop deployment on that region
./scripts/stop-region.sh eu-central

# Re-route its shards to other regions
./scripts/redistribute-shards.sh --from=eu-central --to=us-east,ap-southeast

# Verify shard movement complete
./scripts/wait-for-shard-migration.sh --source=eu-central --timeout=300
```

### 4.3 L3 Circuit Breaker (Temporary throttling)

If system overloaded but not catastrophic:

```bash
# Enable read-after-write circuit breaker (pause new tenants)
curl -X POST https://api.algo-trader.workers.dev/api/admin/circuit-breaker/enable/tenant-onboarding

# Reduce model tier to Haiku only
curl -X POST https://api.algo-trader.workers.dev/api/admin/model-tier/set \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"tier": "haiku"}'

# Disable connection pool queues
curl -X POST https://api.algo-trader.workers.dev/api/admin/queues/pause
```

---

## 5. Monitoring & Observability

### 5.1 Grafana Dashboards

Access dashboards at `http://localhost:3002` (admin/admin):

**Dashboard 1: System Health**
- API request rate (RPS)
- Latency p50/p95/p99
- Error rate (4xx, 5xx)
- Memory usage per instance
- CPU usage
- Active connections

**Dashboard 2: Tenant SLA**
- Tenant shard distribution
- Tenant availability per region
- Cross-region latency matrix
- Data consistency lag
- Tenant API error rates

**Dashboard 3: Cost Metrics**
- Provider costs (DO, Redis, NATS, Cloudflare)
- Cost per tenant
- Cost per trade
- Predictive spend (next 30 days)

**Dashboard 4: P0 Fixes**
- Circuit breaker state
- Rate limiter hit rate
- Tenant quota usage
- Strategy shard lag
- Exchange connectivity

### 5.2 Alert Rules

| Alert | Severity | Condition | Duration | Notification |
|-------|----------|-----------|----------|--------------|
| ServiceDown | critical | `up == 0` | 2m | PagerDuty + SMS |
| HighErrorRate | warning | `rate(http_requests_total{status=~"5.."}[5m]) > 0.05` | 5m | Slack + Email |
| LatencyHigh | warning | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.1` | 3m | Slack |
| MemoryHigh | warning | `algo_trader_heap_used_bytes > 115MB` | 5m | Email |
| CircuitBreakerOpen | critical | `algo_trader_circuit_breaker_state == 1` | 1m | SMS + PagerDuty |
| ReplicationLagHigh | warning | `pg_replication_lag_seconds > 5` | 3m | Slack |
| RedisDown | critical | `redis_up == 0` | 1m | SMS + PagerDuty |
| NATSDown | critical | `nats_connections == 0` | 1m | SMS + PagerDuty |
| DiskSpaceLow | warning | `node_filesystem_avail_bytes < 10%` | 10m | Email |

### 5.3 Log Aggregation (Loki)

Access logs at `http://localhost:3000/explore` (Grafana) → Loki data source.

**Key log queries:**
```
# Errors in last 15 minutes
{app="algo-trader"} |= "error" | timestamp >= now()-15m

# Tenant-specific errors
{app="algo-trader", tenant_id="tenant-123"} |= "error"

# Circuit breaker events
{app="algo-trader"} |= "circuit breaker"

# Strategy shard lag
{app="algo-trader"} |= "lag" |= "threshold"
```

---

## 6. Security Hardening

### 6.1 API Security

- [x] Rate limiting configured (100 req/min per API key, burst 200)
- [x] API key rotation enforced (90 day expiry)
- [x] Request size limits (max 1MB)
- [x] JWT token management (1h expiry, refresh via RT)
- [x] CORS whitelist configured (only trusted origins)
- [x] Cloudflare header verification (CF-Worker, CF-Connecting-IP)

### 6.2 Data Protection

- [x] Database encryption at rest (D1 managed)
- [x] TLS 1.3 for all external connections
- [x] Secrets stored in DO secret manager (not in code)
- [x] Audit logging for all admin operations
- [x] GDPR compliance (data deletion endpoint working)

### 6.3 Compliance

- [x] SOC2 Type 1 audit completed
- [x] Evidence collected for:
  - Encryption standards
  - Access controls
  - Incident response
  - Change management
  - Business continuity

---

## 7. Maintenance Procedures

### 7.1 Daily Operations

**Morning checks (08:00 UTC):**
```bash
./scripts/daily-health-check.sh
# Output: status report sent to #operations Slack
```

**Evening checks (20:00 UTC):**
```bash
./scripts/daily-cost-report.sh
./scripts/daily-usage-report.sh
```

### 7.2 Weekly Maintenance

- [ ] Database vacuum and analyze (Sunday 02:00 UTC)
- [ ] Redis memory optimization (Monday 03:00 UTC)
- [ ] NATS JetStream compaction (Tuesday 04:00 UTC)
- [ ] Log rotation and archiving (Wednesday 05:00 UTC)
- [ ] Security patch application (Thursday 06:00 UTC)
- [ ] Full backup verification (Friday 07:00 UTC)

### 7.3 Monthly Tasks

- [ ] Rotate API keys for all service accounts
- [ ] Review and tune alert thresholds
- [ ] Update Grafana dashboard data sources
- [ ] Cost optimization review (identify unused resources)
- [ ] Compliance evidence refresh
- [ ] Disaster recovery drill (simulate region failure)

---

## 8. Cost Management

### 8.1 Monthly Cost Breakdown (Projected)

| Service | Quantity | Unit Cost | Monthly |
|---------|----------|-----------|---------|
| DO Droplets (3 regions) | 9 units @ $12 | $108 | $1,296 |
| DO Managed Database | 3 clusters @ $50 | $150 | $1,800 |
| DO Redis | 3 clusters @ $25 | $75 | $900 |
| Cloudflare Workers | ~12M requests | $0.30/M | $3.60 |
| Cloudflare R2 | 10TB storage | $0.023/GB | $230 |
| NATS JetStream | Included | - | $0 |
| Grafana Cloud | 10 users | $15/user | $150 |
| **Total** | | | **~$4,380** |

### 8.2 Cost Optimization Strategies

- Use spot instances for non-critical workloads (saves 40-60%)
- Implement auto-scaling based on load
- Archive old data to R2 cold storage
- Negotiate volume discounts with DO

---

## 9. Incident Response

### 9.1 Severity Classification

**Severity 1 (Critical):** System down, data loss, security breach  
**Severity 2 (High):** Degraded performance, partial outage  
**Severity 3 (Medium):** Non-critical feature failure  
**Severity 4 (Low):** Cosmetic issues, documentation

### 9.2 Response Playbook

For Severity 1-2 incidents:

1. **T+0m:** On-call engineer acknowledges via PagerDuty
2. **T+5m:** Initial assessment and severity classification
3. **T+10m:** Escalate to engineering leadership if Severity 1
4. **T+15m:** Communicate status to stakeholders via Slack #incident
5. **T+30m:** Implement mitigation (rollback, circuit breaker, etc.)
6. **T+1h:** Post-incident communication drafted
7. **T+4h:** Root cause analysis started
8. **T+24h:** Blameless retro scheduled

### 9.3 Communication Templates

**Initial incident announcement:**
```
[INCIDENT] algo-trader production issue
Severity: 1/2
Time: <timestamp UTC>
Impact: <describe impact>
Status: <investigating/mitigating/resolved>
Next update: <time>
```

**Resolution announcement:**
```
[RESOLVED] algo-trader production issue
Root cause: <brief description>
Duration: <start> to <end>
Impact: <quantify affected tenants/trades>
Actions taken: <list>
Follow-up: <postmortem scheduled>
```

---

## 10. Post-Deployment Stabilization (T+2h)

### 10.1 Monitoring Checklist

- [ ] Error rate <1% sustained for 30 minutes
- [ ] Latency p95 <100ms globally
- [ ] Memory usage stable (<115MB average)
- [ ] All regions healthy (no restarts)
- [ ] Shard distribution balanced (no hot spots)
- [ ] Replication lag <5 seconds
- [ ] No alerts firing (all normal)
- [ ] User feedback channels clear (no outage reports)
- [ ] Billing/usage metrics flowing correctly
- [ ] Grafana dashboards populated with fresh data

### 10.2 Smoke Tests

```bash
# Run comprehensive smoke test suite
npx vitest run tests/smoke --reporter=verbose

# Expected output:
# ✓ API endpoints responding (200)
# ✓ WebSocket connections stable
# ✓ Database queries performing
# ✓ Redis operations successful
# ✓ Message queues processing
# ✓ Sharding routing correct
# ✓ Multi-region failover works
```

### 10.3 Team Retrospective

Schedule retro within 24 hours:

**Agenda:**
1. What went well? (5 min)
2. What could be improved? (10 min)
3. Action items for next deployment (10 min)
4. Update deployment plan based on lessons learned (5 min)

---

## 11. References

### 11.1 Related Documents

- [Deployment Guide](../docs/deployment-guide.md)
- [System Architecture](../docs/system-architecture.md)
- [Runbook Index](../docs/runbook-index.md)
- [Production Rollout Plan](../docs/production-rollout-plan.md)
- [Incident Response Playbook](../docs/incident-response.md)
- [Security Controls](../docs/security-controls.md)

### 11.2 Scripts Directory

```
scripts/
├── deploy-region.sh              # Deploy to specific region
├── health-monitor.sh             # Monitor region health
├── check-region-health.sh        # Validate region health
├── global-health-check.sh        # Comprehensive health validation
├── update-routing-weight.sh      # Adjust traffic distribution
├── set-global-routing.sh         # Configure global routing
├── rollback-region.sh            # Rollback single region
├── drain-region.sh               # Drain traffic from region
├── stop-region.sh                # Stop region deployment
├── redistribute-shards.sh        # Rebalance shards
├── verify-shard-consistency.sh   # Check shard data consistency
├── check-replication-lag.sh      # Monitor DB replication
├── measure-cross-region-latency.sh
├── alert-team.sh                 # Send alerts to Slack/Telegram
├── daily-health-check.sh         # Daily monitoring
├── daily-cost-report.sh          # Cost reporting
├── verify-backups.sh             # Backup validation
└── final-integration-check.js    # Pre-deploy integration tests
```

### 11.3 CI/CD Pipeline

Location: `.github/workflows/ci.yml`

Stages:
1. Build & Test
2. Docker Build & Push
3. Deploy to VPS (staging)
4. Health Check
5. Deploy to Production (multi-region)
6. Post-deployment validation

---

## 12. Sign-off

### Pre-Deployment Sign-off

| Role | Name | Sign-off Date |
|------|------|---------------|
| Engineering Lead | | |
| Platform Operations | | |
| DevOps Engineer | | |
| Security Officer | | |
| Product Owner | | |

### Post-Deployment Sign-off

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| All regions healthy | 3/3 | | |
| Latency p95 | <100ms | | |
| Error rate | <1% | | |
| Memory usage | <115MB | | |
| Uptime | 100% | | |

Deployment completed by: ________________  
Date: ________________  
Time (UTC): ________________  

---

**Document Version:** 1.0  
**Last Updated:** 2026-06-21  
**Next Review:** 2026-07-21 (monthly)  
**Classification:** Internal - Confidential
