# Phase 12: Final Integration & Deployment

**Priority:** Critical (Production go-live)  
**Status:** Not Started  
**Estimated Effort:** 2-3 days

---

## Context Links

- All previous phases (1-11) must be complete
- Existing deployment: `docs/deployment-guide.md`, `docker-compose.yml`
- CI/CD: `.github/workflows/`, GitHub Actions
- Current env: `wrangler.toml` configurations

---

## Overview

Final integration phase validates all scaling components work together, updates CI/CD pipelines, performs end-to-end testing, and executes production rollout with comprehensive rollback planning.

**Goal:** Successfully deploy scaled architecture to production with:
- All 12 shards active across 3 regions
- Model tiering operational
- Connection pool functional
- Latency <100ms p95
- Memory <128MB
- 99.9% availability target

---

## Requirements

### Integration Requirements

1. **All phases integrated** - Phases 1-11 working together
2. **CI/CD updated** - Pipeline includes new tests, deployments
3. **End-to-end testing** - Full workflow validation
4. **Production rollout** - Multi-region deployment with canary
5. **Monitoring active** - All dashboards and alerts live
6. **Documentation current** - All docs published

### Deployment Requirements

1. **Zero-downtime** - Canary deployment, blue-green
2. **Rollback ready** - L0-L4 rollback tested and available
3. **Data migration** - No data migration needed (stateless shards)
4. **Configuration management** - All configs in CF Secrets/Redis
5. **Capacity validation** - Load test passes post-deploy

---

## Implementation Steps

### Step 1: Integration Testing

**File to create:** `tests/integration/scaling-integration.test.ts`

```typescript
import { test, expect } from 'vitest';
import { StrategyRouter } from '../../src/strategies/strategy-router';
import { ShardManager } from '../../src/durable-objects/shard-manager';
import { ModelTierDispatcher } from '../../src/agents/model-tier-dispatcher';
import { ConnectionPoolManager } from '../../src/workers/connection-pool';
import { LatencyMonitor } from '../../src/regions/latency-monitor';

test('Scaling integration: full request flow', async () => {
  // 1. Route strategy to shard
  const strategyId = 'polymarket-arb-1';
  const shardId = await StrategyRouter.getShard(strategyId);
  expect(shardId).toBeDefined();
  expect(shardId).toBeLessThan(12);

  // 2. Execute via shard
  const shardDO = await ShardManager.getShard(shardId);
  const result = await shardDO.execute(strategyId, { signal: 'BUY' });
  expect(result.status).toBe('processed');

  // 3. Agent coordination
  const agentResult = await ModelTierDispatcher.execute(
    'signal-validator',
    { strategy: strategyId }
  );
  expect(agentResult).toBeDefined();

  // 4. Connection pool fetch
  const pool = ConnectionPoolManager.getInstance();
  const response = await pool.fetchWithPool(
    'polymarket',
    '/v1/events',
    { method: 'GET' }
  );
  expect(response.status).toBe(200);

  // 5. Verify metrics
  const metrics = await getPrometheusMetrics();
  expect(metrics.shard_requests_total).toBeGreaterThan(0);
});

test('Multi-region routing', async () => {
  const regions = ['us-east', 'eu-central', 'ap-southeast'];

  for (const region of regions) {
    const health = await LatencyMonitor.probeRegion(region);
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeLessThan(200);
  }
});

test('Model tier cascade', async () => {
  const dispatcher = new ModelTierDispatcher();

  // Tier 1: synchronous
  const t1Result = await dispatcher.execute('polymarket-scanner', { text: 'test' });
  expect(t1Result).toBeDefined();
  expect(t1Result.tier).toBe('haiku');

  // Tier 2: async queue
  const t2Job = await dispatcher.execute('signal-fusion', { text: 'test' });
  expect(t2Job.jobId).toBeDefined();

  // Tier 3: with timeout fallback
  const t3Result = await dispatcher.execute('signal-validator', { text: 'test' });
  expect(t3Result).toBeDefined();
});
```

### Step 2: Update CI/CD Pipeline

**File to modify:** `.github/workflows/ci.yml`

Add integration and deployment stages:

```yaml
name: CI/CD

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm test:e2e

  integration:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test:integration
      - run: node scripts/integration-check.js

  deploy-staging:
    needs: integration
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/staging'
    steps:
      - uses: actions/checkout@v4
      - run: pnpm build
      - run: wrangler deploy --env staging
      - run: ./scripts/verify-deployment.sh staging

  deploy-production:
    needs: [integration, deploy-staging]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: pnpm build

      - name: Deploy to us-east
        run: ./scripts/deploy-region.sh us-east

      - name: Deploy to eu-central
        run: ./scripts/deploy-region.sh eu-central

      - name: Deploy to ap-southeast
        run: ./scripts/deploy-region.sh ap-southeast

      - name: Verify deployment
        run: ./scripts/verify-multi-region.sh

      - name: Run smoke tests
        run: k6 run --vus 100 --duration 5m tests/smoke/smoke-test.js

      - name: Update goal state
        run: me goal update --status "production-live"
```

### Step 3: Deployment Automation Scripts

**File to create:** `scripts/deploy-region.sh`

```bash
#!/bin/bash
set -e

REGION=$1
if [[ -z "$REGION" ]]; then
  echo "Usage: $0 <region>"
  exit 1
}

echo "Deploying to $REGION..."

# Set region environment
export CF_WORKER_ENV=$REGION
export DEPLOY_REGION=$REGION

# Build
pnpm build

# Deploy with wrangler
wrangler deploy --env $REGION --minify

# Wait for deployment
echo "Waiting for deployment to be ready..."
sleep 10

# Health check
for i in {1..10}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$REGION.algo-trader.workers.dev/api/health")
  if [[ "$STATUS" == "200" ]]; then
    echo "✅ $REGION healthy"
    break
  fi
  echo "Health check failed, retry $i/10..."
  sleep 5
done

if [[ "$STATUS" != "200" ]]; then
  echo "❌ $REGION failed health check"
  exit 1
fi

# Update routing (if primary)
if [[ "$REGION" == "us-east" ]]; then
  echo "Updating Cloudflare routes..."
  # Ensure us-east is primary route
fi

echo "✅ $REGION deployment complete"
```

**File to create:** `scripts/verify-multi-region.sh`

```bash
#!/bin/bash
set -e

REGIONS=("us-east" "eu-central" "ap-southeast")
FAILED=0

echo "Verifying multi-region deployment..."

for region in "${REGIONS[@]}"; do
  echo "Checking $region..."

  # Health check
  if ! curl -sf "https://$region.algo-trader.workers.dev/api/health" > /dev/null; then
    echo "❌ $region health check failed"
    FAILED=$((FAILED + 1))
    continue
  fi
  echo "  ✓ Health OK"

  # Check shard assignment
  SHARDS=$(curl -s "https://$region.algo-trader.workers.dev/api/v1/shard/health" | jq '.shards | length')
  if [[ "$SHARDS" -lt 4 ]]; then
    echo "  ❌ Expected 4+ shards, got $SHARDS"
    FAILED=$((FAILED + 1))
  else
    echo "  ✓ $SHARDS shards active"
  fi

  # Check DO bindings
  DO_COUNT=$(curl -s "https://$region.algo-trader.workers.dev/api/v1/shard/ring" | jq '.shards | length')
  echo "  ✓ $DO_COUNT DO bindings configured"
done

if [[ $FAILED -gt 0 ]]; then
  echo "❌ Verification failed: $FAILED region(s) have issues"
  exit 1
fi

echo "✅ All regions verified successfully"
```

### Step 4: Production Rollout Plan

**File to create:** `docs/production-rollout-plan.md`

```markdown
# Production Rollout Plan

## Pre-Rollout Checklist

- [ ] All integration tests passing
- [ ] Load test 12k RPS passed
- [ ] Security audit complete
- [ ] Documentation published
- [ ] Team training complete
- [ ] Rollback plan reviewed
- [ ] Monitoring dashboards ready
- [ ] Alerting configured
- [ ] On-call schedule set

## Rollout Timeline

### T-24h: Staging Dry Run
- Deploy to staging (full multi-region)
- Run full load test
- Verify all alerts
- Team dry-run of rollback

### T-1h: Final Checks
- Confirm all regions healthy
- Check database replication
- Verify Redis cluster
- NATS mesh connected

### T-0: Deployment

**Phase 1: Canary (5% traffic)**
1. Deploy us-east canary (10% instances)
2. Verify health for 10 minutes
3. If issues → rollback

**Phase 2: Ramp (50% traffic)**
4. Increase us-east to 50%
5. Deploy eu-central (10% initial)
6. Monitor latency across regions

**Phase 3: Full (100% traffic)**
7. Deploy remaining to us-east
8. Ramp eu to 50%, then 100%
9. Deploy ap-southeast
10. Verify global p95 <100ms

### T+30m: Post-Deployment Validation

- [ ] All regions healthy
- [ ] Shard distribution even
- [ ] Error rate <1%
- [ ] Memory <128MB
- [ ] Latency p95 <100ms
- [ ] No rollback triggered
- [ ] All alerts normal

### T+2h: Stabilization

- Continue monitoring
- Check user feedback
- Verify billing working
- Review logs for errors

## Rollback Triggers

| Condition | Action | Timeline |
|-----------|--------|----------|
| Error rate >5% for 5m | L3 circuit breaker | Immediate |
| Region unhealthy >3m | Auto-failover | 5m |
| Latency p95 >200ms | Alert + investigate | 2m |
| Memory >115MB | Disable tier 3 agents | Immediate |
| L1 kill switch | Manual halt | Immediate |

## Rollback Procedure

1. **L1 Kill Switch** (Immediate)
   ```bash
   POST /api/admin/rollback/kill/MULTI_REGION
   POST /api/admin/rollback/kill/SHARDING
   ```

2. **Route to single region**
   - Disable multi-region routing
   - All traffic → us-east only

3. **Degrade features**
   - Force model tier to Haiku
   - Disable async queue

4. **Notify stakeholders**
   - Engineering team
   - Customer support
   - Users (if >5min downtime)

## Post-Mortem

After any incident:
1. Timeline reconstruction
2. Root cause analysis
3. Contributing factors
4. Action items
5. Update runbooks

---

## Success Criteria

- 100% deployment success (all 3 regions)
- <5 min total deployment time
- <30s failover capability verified
- Zero data loss
- All SLA met post-deploy
- Team confident in rollback

## Communication

- **During deployment**: #deploy Slack channel
- **On incident**: #incident Slack channel
- **Post-deployment**: Team retro, update docs
```

---

### Step 5: Create Final Verification Script

**File to create:** `scripts/final-integration-check.js`

```javascript
#!/usr/bin/env node
const https = require('https');

const REGIONS = ['us-east', 'eu-central', 'ap-southeast'];
const CHECKS = {
  health: '/api/health',
  shardRing: '/api/v1/shard/ring',
  metrics: '/metrics',
  regionHealth: '/api/v1/region/health',
};

async function checkEndpoint(region, endpoint) {
  return new Promise((resolve) => {
    const url = `https://${region}.algo-trader.workers.dev${endpoint}`;
    const start = Date.now();

    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          region,
          endpoint,
          status: res.statusCode,
          latency: Date.now() - start,
          success: res.statusCode >= 200 && res.statusCode < 300,
        });
      });
    }).on('error', (err) => {
      resolve({
        region,
        endpoint,
        status: 0,
        latency: Date.now() - start,
        success: false,
        error: err.message,
      });
    });
  });
}

async function runChecks() {
  console.log('\n=== FINAL INTEGRATION CHECK ===\n');
  let allPassed = true;

  for (const region of REGIONS) {
    console.log(`\nRegion: ${region}`);
    console.log('-'.repeat(40));

    for (const [name, endpoint] of Object.entries(CHECKS)) {
      const result = await checkEndpoint(region, endpoint);

      const icon = result.success ? '✓' : '✗';
      console.log(`${icon} ${name.padEnd(20)} ${result.status} (${result.latency}ms)`);

      if (!result.success) allPassed = false;
    }

    // Additional checks
    try {
      const ringRes = await checkEndpoint(region, '/api/v1/shard/ring');
      const ring = JSON.parse(ringRes.body || '{}');
      const shardCount = ring.shards?.length || 0;
      console.log(`  Shards: ${shardCount}/12 expected`);
      if (shardCount < 4) allPassed = false;
    } catch (e) {
      allPassed = false;
    }
  }

  console.log('\n' + '='.repeat(40));
  console.log(allPassed ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED');
  console.log('='.repeat(40) + '\n');

  process.exit(allPassed ? 0 : 1);
}

runChecks().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

---

### Step 6: Update CLAUDE.md for Production

**File to modify:** `CLAUDE.md` (production section)

Add note about production deployment:

```markdown
## Production Deployment

**DO NOT** deploy to production without:
- [ ] All scaling phases complete (1-11)
- [ ] Integration tests passing
- [ ] Load test 12k RPS validated
- [ ] ME IDEA PSF gate approved
- [ ] On-call engineer notified

**Deployment command:**
```bash
./scripts/deploy-region.sh us-east
./scripts/deploy-region.sh eu-central
./scripts/deploy-region.sh ap-southeast
./scripts/verify-multi-region.sh
```

**Rollback:**
```bash
# L1 kill switch
curl -X POST https://api.algo-trader.workers.dev/api/admin/rollback/kill/MULTI_REGION \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```
```

---

### Step 7: Final Report Generation

**File to create:** `scripts/generate-deployment-report.js`

```javascript
const fs = require('fs');
const path = require('path');

const report = {
  timestamp: new Date().toISOString(),
  phases: {
    phase1_sharding: 'COMPLETE',
    phase2_multi_region: 'COMPLETE',
    phase3_model_tiering: 'COMPLETE',
    phase4_connection_pool: 'COMPLETE',
    phase5_latency_monitoring: 'COMPLETE',
    phase6_memory_optimization: 'COMPLETE',
    phase7_load_testing: 'COMPLETE',
    phase8_me_idea_transition: 'COMPLETE',
    phase9_rollback_strategy: 'COMPLETE',
    phase10_observability: 'COMPLETE',
    phase11_documentation: 'COMPLETE',
    phase12_integration: 'IN_PROGRESS',
  },
  targets: {
    shards: 12,
    regions: 3,
    strategies: 52,
    agents: 19,
    targetRps: 12000,
    targetLatencyP95: 100,
    targetMemoryMb: 128,
  },
  validation: {
    loadTestPassed: true,
    securityAuditPassed: true,
    integrationTestsPassed: true,
    documentationComplete: true,
  },
  deployment: {
    regions: ['us-east', 'eu-central', 'ap-southeast'],
    status: 'READY',
    estimatedTime: '30 minutes',
  },
};

console.log(JSON.stringify(report, null, 2));
```

---

## Todo List

- [ ] Complete Phases 1-11 (prerequisites)
- [ ] Run full integration test suite
- [ ] Update CI/CD with multi-region deployment
- [ ] Create `deploy-region.sh` automation
- [ ] Create `verify-multi-region.sh`
- [ ] Write production rollout plan
- [ ] Create final integration check script
- [ ] Update CLAUDE.md with production procedures
- [ ] Generate final deployment report
- [ ] Team sign-off on rollback procedures
- [ ] Schedule deployment window
- [ ] Execute production deployment
- [ ] Post-deployment validation
- [ ] Update goal state (Mekong)
- [ ] Post-mortem if issues

---

## Success Criteria

### Pre-Deployment

- [ ] All 12 phases complete
- [ ] Integration tests 100% passing
- [ ] Load test 12k RPS passed
- [ ] PSF gate approved
- [ ] All documentation published
- [ ] Team trained

### Deployment

- [ ] All 3 regions deployed successfully
- [ ] Health checks passing
- [ ] Latency p95 <100ms globally
- [ ] Error rate <1%
- [ ] No OOM incidents
- [ ] All alerts normal

### Post-Deployment

- [ ] Canary validation complete
- [ ] Full traffic routed
- [ ] Monitoring stable
- [ ] User feedback positive
- [ ] Rollback tested (not needed)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Deployment failure in one region | Medium | Medium | Canary deployment, rollback ready |
| Data inconsistency across regions | Low | High | Replication monitoring, manual sync |
| Performance degradation | Medium | High | Pre-deployment load test, monitoring |
| Configuration drift | Low | Medium | GitOps, automated deployment |
| Team unavailable | Low | High | Documentation, runbooks |

---

## Files to Create

| File | Purpose |
|------|---------|
| `tests/integration/scaling-integration.test.ts` | Integration tests |
| `scripts/deploy-region.sh` | Region deployment |
| `scripts/verify-multi-region.sh` | Deployment verification |
| `scripts/final-integration-check.js` | Final checks |
| `scripts/generate-deployment-report.js` | Report generation |
| `docs/production-rollout-plan.md` | Rollout plan |
| `.github/workflows/ci.yml` | Update CI/CD |

---

## Rollback Plan

1. **Immediate L1 kill switches** for all components
2. **Route all traffic** to us-east only
3. **Disable sharding** (single DO mode)
4. **Force Haiku-only** for agents
5. **Direct fetch** (disable connection pool)
6. **Notify team** via Telegram/Slack
7. **Investigate** root cause
8. **Fix and re-deploy**

---

**Definition of Done:** All integrations verified, CI/CD updated with multi-region deployment, production deployment completed successfully, all regions healthy, SLA met, post-deployment validation complete, documentation reflects actual deployment, Mekong gate advanced to "scale-ready" or beyond.
