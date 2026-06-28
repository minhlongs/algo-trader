# Phase 1: Pre-Deployment Validation

**Priority:** Critical - Block deployment if incomplete  
**Status:** Pending  
**Estimated Duration:** 1-2 days before deployment

---

## Context Links

- Main Plan: `plan.md`
- Related: [Deployment Guide](../docs/deployment-guide.md)
- Related: [Production Rollout Plan](../docs/production-rollout-plan.md)

---

## Overview

This phase ensures all technical, operational, and security prerequisites are met before initiating production deployment. All checklist items must pass before proceeding to Phase 2.

---

## Requirements

### Functional Requirements
1. All code must compile without TypeScript errors
2. All tests must pass (unit, integration, E2E)
3. Infrastructure must be provisioned in all target regions
4. Monitoring stack must be fully operational
5. Security controls must be validated

### Non-Functional Requirements
- Zero downtime during deployment (via canary strategy)
- <5 minutes detection time for failed deployments
- 100% test coverage for critical paths
- All metrics available in Grafana before deployment

---

## Architecture

```
Pre-Deployment Validation Flow

┌─────────────────────────────────────────────────────────────┐
│                    Validation Stages                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Code Validation → Build Validation → Infra Validation →   │
│  Monitoring Validation → Security Validation →            │
│  Documentation Validation → Sign-off                      │
│                                                             │
│  Any failure BLOCKS deployment                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Files to Modify

None (this phase is validation-only)

---

## Implementation Steps

### Step 1: Code Validation

```bash
# 1. TypeScript compilation
npx tsc --noEmit
# Expected: No errors, exit code 0

# 2. Linting
npm run lint
# Expected: No warnings or errors

# 3. Unit tests (minimum 50 tests)
npx vitest run tests/unit
# Expected: All passing (green)

# 4. Integration tests
npx vitest run tests/integration
# Expected: All passing (green)

# 5. E2E tests (Playwright)
npx playwright test
# Expected: All passing
```

**Validation criteria:** All commands exit with code 0.

---

### Step 2: Build & Docker Validation

```bash
# 1. Build Docker image
docker build -f apps/algo-trader/Dockerfile -t algo-trader:latest .

# 2. Scan for vulnerabilities (if trivy installed)
trivy image algo-trader:latest
# Expected: No HIGH or CRITICAL vulnerabilities

# 3. Push to registry (if credentials available)
docker tag algo-trader:latest ghcr.io/algo-trader:latest
docker push ghcr.io/algo-trader:latest
# Expected: Push successful

# 4. Verify image size (<500MB)
docker images algo-trader:latest --format "{{.Size}}"
# Expected: < 500MB
```

---

### Step 3: Infrastructure Validation

```bash
# 1. Verify all 3 regions are accessible
for region in us-east eu-central ap-southeast; do
  ./scripts/ping-region.sh $region
done
# Expected: All regions respond <100ms

# 2. Check database clusters health
./scripts/check-db-clusters.sh
# Expected: All primary/replica healthy, replication lag <5s

# 3. Check Redis clusters health
./scripts/check-redis-clusters.sh
# Expected: All nodes connected, memory <80%

# 4. Check NATS JetStream
nats stream check ORDERS
nats stream check TENANT_QUEUE
nats stream check METRICS
# Expected: All streams healthy, storage sufficient

# 5. Verify Cloudflare Workers deployed
./scripts/check-cloudflare-deployment.sh
# Expected: All 3 regions deployed, healthy
```

---

### Step 4: Monitoring Stack Validation

```bash
# 1. Start monitoring stack
docker compose -f docker-compose.monitoring.yml up -d

# 2. Verify Prometheus is scraping targets
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.health=="up")'
# Expected: All targets up

# 3. Check Grafana dashboards load
./scripts/check-grafana-dashboards.sh
# Expected: All dashboards return HTTP 200

# 4. Verify Alertmanager
curl http://localhost:9094/api/v2/status
# Expected: Status: "ok"

# 5. Test notification channels
./scripts/test-notifications.sh --channel=slack
./scripts/test-notifications.sh --channel=email
./scripts/test-notifications.sh --channel=telegram
# Expected: All channels deliver test message
```

---

### Step 5: Security Validation

```bash
# 1. Check TLS certificates
./scripts/check-tls-certificates.sh
# Expected: All certs valid, not expiring within 30 days

# 2. Verify API security controls
./scripts/test-api-security.sh
# Expected:
# - Rate limiting active (429 on excessive requests)
# - CORS headers present
# - Cloudflare headers verified
# - JWT validation working

# 3. Test authentication/authorization
./scripts/test-auth-flows.sh
# Expected: All auth flows working, unauthorized requests blocked

# 4. Scan for secrets in code
./scripts/scan-for-secrets.sh
# Expected: No hardcoded secrets found

# 5. Verify audit logging
./scripts/test-audit-logging.sh
# Expected: All admin actions logged with user ID, timestamp, IP
```

---

### Step 6: Documentation Validation

```bash
# 1. Verify API documentation current
./scripts/validate-api-docs.sh
# Expected: All endpoints documented with examples

# 2. Check runbooks exist and are accurate
ls docs/runbook-*.md
# Expected: At least 5 runbooks present

# 3. Verify architecture diagrams updated
grep -r "2026-06" docs/system-architecture.md
# Expected: Diagrams have recent dates

# 4. Check deployment guide matches actual process
diff <(grep -A 5 "Deployment Commands" docs/deployment-guide.md) <(cat scripts/deploy-region.sh --help)
# Expected: Minimal differences (only version numbers)
```

---

### Step 7: Backup & Recovery Validation

```bash
# 1. Trigger manual backup
./scripts/trigger-backup.sh
# Expected: Backup initiated, completes within 30 minutes

# 2. Verify backup file exists
./scripts/list-backups.sh --last=1
# Expected: Backup file present, size > 0

# 3. Test restore to staging database
./scripts/test-backup-restore.sh --backup=$(./scripts/list-backups.sh --last=1)
# Expected: Restore successful, data consistent

# 4. Verify point-in-time recovery capability
./scripts/test-pitr.sh --target-time="1 hour ago"
# Expected: PITR successful
```

---

### Step 8: Load Testing (Staging)

```bash
# 1. Deploy full multi-region to staging
./scripts/deploy-multi-region-staging.sh

# 2. Warm up (5 minutes of light traffic)
./scripts/load-test-warmup.sh --duration=5m --rps=1000

# 3. Run full load test (12k RPS for 30 minutes)
./scripts/load-test.sh --duration=30m --target-rps=12000

# 4. Analyze results
./scripts/analyze-load-test-results.sh load-test-results.json
# Expected thresholds:
# - Latency p95: <100ms
# - Error rate: <1%
# - Memory per instance: <115MB
# - No OOM kills
```

---

### Step 9: Final Integration Check

```bash
# Run final integration validation script
node scripts/final-integration-check.js

# Expected output:
# ✓ All services healthy
# ✓ Database connections stable
# ✓ Redis operations <10ms
# ✓ NATS JetStream flowing
# ✓ Sharding routing correct
# ✓ Multi-region sync working
# ✓ API contracts validated
```

---

## Success Criteria

### Mandatory (All Required)

- [ ] TypeScript compilation: 0 errors
- [ ] All test suites: 100% passing
- [ ] Infrastructure: All regions reachable and healthy
- [ ] Monitoring: All dashboards populated, alerts configured
- [ ] Security: All controls validated, no critical findings
- [ ] Load testing: 12k RPS passes with thresholds met
- [ ] Backup/restore: Successfully tested
- [ ] Documentation: All required docs present and current

### Optional (Nice-to-Have)

- [ ] Cost optimization opportunities identified
- [ ] Performance tuning recommendations documented
- [ ] Team training completed
- [ ] Chaos engineering tests executed

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Infrastructure not ready in time | Medium | High | Start provisioning 1 week early, validate daily |
| Load test fails to meet thresholds | Medium | High | Profile and optimize bottlenecks before deployment |
| Security audit findings | Low | High | Address all findings, get security sign-off |
| Team not available (on-call) | Low | Medium | Confirm availability 48h before, have backup |
| Rollback tested insufficiently | Medium | High | Execute full rollback drill in staging |

---

## Security Considerations

- All validation scripts run with minimal privileges
- No production data accessed during validation (staging only)
- Backup/restore tests use anonymized data snapshots
- Security scanning tools run in isolated environment
- API keys for external services rotated after validation

---

## Next Steps

Upon successful completion of Phase 1:

1. Record evidence in Mekong gate: `/mekong artifact scale-ready platform-operations "Pre-deployment validation complete"`
2. Proceed to Phase 2: Canary Deployment
3. Notify on-call engineer: deployment window open
4. Prepare rollback scripts (test in staging)
5. Schedule deployment call with all stakeholders

---

## Unresolved Questions

- [ ] Confirm final deployment date/time with all stakeholders
- [ ] Verify on-call engineer availability for deployment window
- [ ] Get security officer final sign-off
- [ ] Confirm staging environment matches production configuration exactly
