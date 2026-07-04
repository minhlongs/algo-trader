# Phase 7: Load Testing & Performance Validation

**Priority:** Critical (Must validate before production)  
**Status:** Not Started  
**Estimated Effort:** 2-3 days

---

## Context Links

- Target: "1000 RPS per shard validated, 52 strategies concurrent, pass rate >99%"
- Existing tests: `tests/load/raas-gateway-load-test.js` (k6)
- Test framework: `playwright.config.ts`, `vitest.config.ts`
- Load testing tool: k6 (existing in package.json)

---

## Overview

After implementing sharding, multi-region deployment, model tiering, and connection pooling, we must validate that the system meets the target performance under realistic load. This phase creates comprehensive load tests that validate:

1. **Shard throughput**: 1000 RPS per shard (12 shards = 12,000 RPS target)
2. **Strategy distribution**: Even load across 52 strategies
3. **Multi-region latency**: <100ms p95 globally
4. **Memory under load**: No OOM at peak
5. **Error rate**: <1% (99%+ pass rate)
6. **Graceful degradation**: System behavior under overload

**Goal:** Prove the scaling architecture can handle production load with headroom, document performance baselines, and establish regression testing.

---

## Requirements

### Functional Requirements

1. **Shard stress test** - 1000 RPS to each of 12 shards simultaneously
2. **Strategy routing validation** - Verify consistent hashing distributes evenly
3. **Multi-region latency test** - Probe from 3 regions simultaneously
4. **Memory pressure test** - Ramp load until memory limit, verify GC
5. **Failover test** - Kill shard/region, measure recovery
6. **Queue backpressure test** - Verify queue depth limits

### Non-Functional Requirements

1. **Test duration**: Minimum 30 minutes sustained load
2. **Ramp-up**: 5 minute gradual ramp to target RPS
3. **Metrics collection**: Full Prometheus + OTel traces
4. **Pass criteria**: 99%+ success rate, <100ms p95, <128MB memory
5. **Automation**: CI/CD integration for regression testing

---

## Load Testing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Load Generator (k6)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Scenario 1: Shard Stress (12×1000 RPS)                 │  │
│  │  Scenario 2: Multi-Region Latency                       │  │
│  │  Scenario 3: Memory Pressure                            │  │
│  │  Scenario 4: Failover                                  │  │
│  │  Scenario 5: Queue Backpressure                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Target System                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   us-east   │  │    eu       │  │   asia      │            │
│  │  4 shards   │  │  4 shards   │  │  4 shards   │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Metrics Collection                            │
│  • Prometheus (scrape)                                          │
│  • OTel traces (export)                                         │
│  • Cloudflare Analytics                                        │
│  • k6 metrics output                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create Shard Stress Test

**File to create:** `scripts/load-test-sharding.ts`

```typescript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const shardLatency = new Trend('shard_latency_ms', true);
const shardErrors = new Counter('shard_errors_total');
const shardRPS = new Gauge('shard_rps_current');
const memoryUsage = new Gauge('memory_usage_mb');
const strategyDistribution = new Counter('strategy_hits_total');

// Configuration
const SHARDS = 12;
const TARGET_RPS_PER_SHARD = 1000;
const TEST_DURATION = '30m';
const STRATEGIES = [
  'polymarket-arb', 'polymarket-mm', 'polymarket-scalp',
  'kalshi-ml', 'kalshi-stat-arb', 'limitless-surf',
  // ... 52 total
];

// Shard mapping (consistent hashing)
function getShardForStrategy(strategyId: string): number {
  // Use same hash as production
  const hash = simpleHash(strategyId);
  return hash % SHARDS;
}

function simpleHash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0; // unsigned
}

export const options = {
  stages: [
    { duration: '5m', target: SHARDS * TARGET_RPS_PER_SHARD / 2 }, // Warmup
    { duration: '25m', target: SHARDS * TARGET_RPS_PER_SHARD },    // Target
    { duration: '5m', target: 0 },                                 // Ramp down
  ],
  thresholds: {
    shard_latency_ms: ['p(95)<100', 'p(99)<250'],
    shard_errors_total: ['rate<0.01'], // <1% error rate
    memory_usage_mb: ['max<128'],
  },
  noConnectionReuse: false, // Use connection pooling
  maxRedirects: 3,
};

export default function() {
  // Select strategy round-robin
  const strategyIndex = Math.floor(Math.random() * STRATEGIES.length);
  const strategy = STRATEGIES[strategyIndex];
  const shardId = getShardForStrategy(strategy);

  // Build URL with shard routing
  const url = `https://algo-trader.workers.dev/api/v1/strategies/${strategy}/execute`;

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Shard-Id': String(shardId), // Direct routing for test
      'X-Test-Run': 'true',
    },
  };

  const body = JSON.stringify({
    signal: {
      type: 'BUY',
      symbol: 'BTC',
      side: 'long',
      confidence: Math.random(),
    },
    backtest: true, // No real execution
  });

  const start = Date.now();
  const res = http.post(url, body, params);

  const latency = Date.now() - start;
  shardLatency.add(latency);
  strategyDistribution.add({ strategy });

  // Record per-shard metrics
  const shardRpsKey = `shard_${shardId}_rps`;
  shardRPS.add({ shard: String(shardId) }, 1);

  // Check response
  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': () => latency < 200,
    'no error in response': () => !res.body?.includes('error'),
  });

  if (!success) {
    shardErrors.add({ shard: String(shardId), strategy });
  }

  // Track memory (if available)
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const mem = (performance as any).memory;
    memoryUsage.add({ shard: String(shardId) }, mem.usedJSHeapSize / 1024 / 1024);
  }

  // Think time (realistic user behavior)
  sleep(0.1); // 10 RPS per virtual user
}

// Summary reporter
export function handleSummary(data: any) {
  console.log('\n=== LOAD TEST SUMMARY ===');
  console.log(`Total iterations: ${data.metrics.http_reqs}`);
  console.log(`Test duration: ${data.metrics.http_reqs.rate ? 'N/A' : 'N/A'}`);

  // Strategy distribution check
  const strategyHits = data.metrics.strategy_hits_total;
  console.log('\n--- Strategy Distribution ---');
  for (const [strategy, count] of Object.entries(strategyHits)) {
    const percentage = (count / data.metrics.http_reqs) * 100;
    console.log(`${strategy}: ${count} (${percentage.toFixed(1)}%)`);
  }

  // Shard performance
  console.log('\n--- Shard Performance ---');
  for (let i = 0; i < SHARDS; i++) {
    const latencyKey = `shard_${i}_latency`;
    if (data.metrics[latencyKey]) {
      console.log(`Shard ${i}: p95=${data.metrics[latencyKey].p95.toFixed(1)}ms`);
    }
  }

  // Memory usage
  console.log('\n--- Memory ---');
  console.log(`Peak memory: ${data.metrics.memory_usage_mb.max.toFixed(1)}MB`);
  console.log(`Avg memory: ${data.metrics.memory_usage_mb.avg.toFixed(1)}MB`);

  // Pass/fail assessment
  const passRate = (1 - (data.metrics.shard_errors_total.total / data.metrics.http_reqs)) * 100;
  console.log(`\nPass Rate: ${passRate.toFixed(2)}%`);
  console.log(`Status: ${passRate >= 99 ? '✅ PASS' : '❌ FAIL'}`);

  return { pass: passRate >= 99 };
}
```

### Step 2: Create Multi-Region Latency Test

**File to create:** `scripts/load-test-multi-region.ts`

```typescript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const regionLatency = new Trend('region_latency_ms', true);
const regionErrors = new Counter('region_errors_total');
const regionRouting = new Counter('region_routing_total');

const REGIONS = ['us-east', 'eu-central', 'ap-southeast'];
const ENDPOINTS = ['/api/health', '/api/status', '/api/portfolio'];

export const options = {
  scenarios: {
    us_east_probe: {
      executor: 'constant-vus',
      vus: 50,
      duration: '15m',
      exec: 'usEastProbe',
      tags: { region: 'us-east' },
    },
    eu_probe: {
      executor: 'constant-vus',
      vus: 50,
      duration: '15m',
      exec: 'euProbe',
      tags: { region: 'eu' },
    },
    asia_probe: {
      executor: 'constant-vus',
      vus: 50,
      duration: '15m',
      exec: 'asiaProbe',
      tags: { region: 'asia' },
    },
  },
  thresholds: {
    region_latency_ms: [
      { threshold: 'p(95)<100', abortOnFail: true, delayAbortEval: '10s' },
      { threshold: 'p(99)<250', abortOnFail: false },
    ],
  },
};

function getRegionalUrl(region: string, endpoint: string): string {
  const regionHosts: Record<string, string> = {
    'us-east': 'us-east.algo-trader.workers.dev',
    'eu': 'eu.algo-trader.workers.dev',
    'asia': 'asia.algo-trader.workers.dev',
  };
  return `https://${regionHosts[region]}${endpoint}`;
}

export function usEastProbe() {
  runRegionProbe('us-east');
}

export function euProbe() {
  runRegionProbe('eu');
}

export function asiaProbe() {
  runRegionProbe('asia');
}

function runRegionProbe(region: string): void {
  for (const endpoint of ENDPOINTS) {
    const url = getRegionalUrl(region, endpoint);
    const start = Date.now();

    const res = http.get(url, {
      headers: { 'X-Region-Test': 'true' },
      timeout: '10000',
    });

    const latency = Date.now() - start;
    regionLatency.add({ region }, latency);
    regionRouting.add({ region, endpoint });

    const success = check(res, {
      `${region} ${endpoint} OK`: () => res.status === 200,
      `${region} latency < 200ms`: () => latency < 200,
    });

    if (!success) {
      regionErrors.add({ region, endpoint });
    }
  }

  sleep(1); // 1 request per second per VU
}
```

### Step 3: Create Memory Pressure Test

**File to create:** `scripts/load-test-memory.ts`

```typescript
import http from 'k6/http';
import { sleep } from 'k6';
import { Gauge } from 'k6/metrics';

const memoryGauge = new Gauge('test_memory_target_mb');

export const options = {
  stages: [
    { duration: '5m', target: 100 },   // 100 VUs
    { duration: '10m', target: 500 },  // Ramp to 500
    { duration: '10m', target: 1000 }, // Peak: 1000 VUs
    { duration: '5m', target: 0 },     // Cool down
  ],
  thresholds: {
    test_memory_target_mb: { avg: 100, max: 120 }, // Monitor test runner memory
  },
};

// Memory-intensive request (loads strategy + LLM context)
function memoryIntensiveRequest(): void {
  const url = 'https://algo-trader.workers.dev/api/v1/intelligence/analyze';
  const body = JSON.stringify({
    strategies: Array.from({ length: 10 }, (_, i) => `strategy-${i}`), // Load 10 strategies
    marketData: generateLargeMarketData(1000), // 1000 market data points
    useFullContext: true, // Load full agent context
  });

  http.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30000',
  });
}

function generateLargeMarketData(count: number): any[] {
  return Array.from({ length: count }, (_, i) => ({
    symbol: `MARKET-${i % 52}`,
    timestamp: Date.now() - i * 60000,
    price: 0.5 + Math.random() * 0.5,
    volume: Math.random() * 10000,
    outcomes: ['yes', 'no', 'maybe'].map(o => ({
      outcome: o,
      price: Math.random(),
    })),
  }));
}

export default function() {
  memoryIntensiveRequest();
  sleep(0.5); // 2 RPS per VU at peak
}
```

### Step 4: Create Failover Test

**File to create:** `scripts/load-test-failover.ts`

```typescript
import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const failoverLatency = new Trend('failover_recovery_ms');
const failoverErrors = new Counter('failover_errors_total');
const regionSwitches = new Counter('region_switch_total');

const PRIMARY_REGION = 'us-east';
const SECONDARY_REGION = 'eu';
const ENDPOINT = '/api/health';

export const options = {
  stages: [
    { duration: '5m', target: 100 }, // Baseline
    { duration: '2m', target: 0 },   // Trigger kill
    { duration: '5m', target: 100 }, // Recovery
  ],
  thresholds: {
    failover_recovery_ms: ['p(95)<30000'], // 30s recovery target
  },
};

let currentRegion = PRIMARY_REGION;
let failoverTriggered = false;

export default function() {
  // Simulate health check
  const url = `https://${currentRegion}.algo-trader.workers.dev${ENDPOINT}`;

  const start = Date.now();
  const res = http.get(url, { timeout: '5000' });
  const latency = Date.now() - start;

  const success = check(res, {
    'health check OK': () => res.status === 200,
    'response contains healthy': () => res.body?.includes('healthy'),
  });

  if (!success) {
    failoverErrors.add({ region: currentRegion });

    // Trigger failover (simulated - in reality this is automatic)
    if (!failoverTriggered) {
      console.log(`[Failover] ${currentRegion} unhealthy, switching to ${SECONDARY_REGION}`);
      currentRegion = SECONDARY_REGION;
      failoverTriggered = true;
      regionSwitches.add({ from: PRIMARY_REGION, to: SECONDARY_REGION });

      // Measure recovery time
      const recoveryStart = Date.now();
      while (true) {
        const healthRes = http.get(`https://${SECONDARY_REGION}.algo-trader.workers.dev${ENDPOINT}`);
        if (healthRes.status === 200) {
          failoverLatency.add(Date.now() - recoveryStart);
          break;
        }
        sleep(1);
        if (Date.now() - recoveryStart > 60000) break; // 60s timeout
      }
    }
  }

  sleep(1);
}
```

### Step 5: Create Queue Backpressure Test

**File to create:** `scripts/load-test-queue-backpressure.ts`

```typescript
import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Gauge, Rate } from 'k6/metrics';

const queueDepth = new Gauge('agent_queue_depth');
const queueRejections = new Counter('queue_rejection_total');
const queueWaitTime = new Trend('queue_wait_ms');

const AGENTS = 19;
const PRIORITIES = ['critical', 'normal', 'background'];

export const options = {
  scenarios: {
    burst_load: {
      executor: 'constant-vus',
      vus: 200,
      duration: '10m',
      exec: 'burstRequests',
    },
  },
  thresholds: {
    queue_rejection_total: ['rate<0.05'], // <5% rejection
    queue_wait_ms: ['p(95)<1000'], // <1s wait
  },
};

function randomAgent(): string {
  return `agent-${Math.floor(Math.random() * AGENTS)}`;
}

function randomPriority(): string {
  return PRIORITIES[Math.floor(Math.random() * PRIORITIES.length)];
}

export function burstRequests(): void {
  const agent = randomAgent();
  const priority = randomPriority();

  const url = `https://algo-trader.workers.dev/api/v1/agents/${agent}/execute`;
  const body = JSON.stringify({
    priority,
    input: { text: 'Test input for queue backpressure' },
  });

  const start = Date.now();
  const res = http.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30000',
  });

  const waitTime = Date.now() - start;
  queueWaitTime.add({ priority }, waitTime);

  // Check if queued or rejected
  const isQueued = res.body?.includes('"status":"queued"');
  const isRejected = res.body?.includes('"status":"rejected"');

  if (isRejected) {
    queueRejections.add({ priority });
  }

  // Report current queue depth
  const depthRes = http.get('https://algo-trader.workers.dev/api/v1/queue/stats');
  if (depthRes.status === 200) {
    const stats = JSON.parse(depthRes.body);
    for (const [p, depth] of Object.entries(stats.depth)) {
      queueDepth.add({ priority: p }, depth);
    }
  }

  check(res, {
    'response OK': () => res.status === 200 || res.status === 202,
    'not rejected': () => !isRejected,
  });

  sleep(Math.random() * 2);
}
```

### Step 6: Create CI/CD Integration

**File to create:** `.github/workflows/load-test.yml`

```yaml
name: Load Test

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production
  schedule:
    - cron: '0 2 * * 0' # Weekly Sunday 2am

jobs:
  load-test:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Run shard stress test
        run: |
          k6 run --out json=reports/shard-stress.json \
            scripts/load-test-sharding.ts
        env:
          K6_OUT: json

      - name: Run multi-region latency test
        run: |
          k6 run --out json=reports/region-latency.json \
            scripts/load-test-multi-region.ts

      - name: Run memory pressure test
        run: |
          k6 run --out json=reports/memory-pressure.json \
            --vus 1000 --duration 10m \
            scripts/load-test-memory.ts

      - name: Upload reports
        uses: actions/upload-artifact@v4
        with:
          name: load-test-reports
          path: reports/*.json

      - name: Generate summary
        run: node scripts/generate-load-summary.js reports/

      - name: Check pass criteria
        run: |
          # Parse results and check thresholds
          node scripts/validate-load-results.js reports/
```

### Step 7: Create Load Test Reporting Script

**File to create:** `scripts/generate-load-summary.js`

```javascript
const fs = require('fs');
const path = require('path');

function generateSummary(reportsDir) {
  console.log('\n=== LOAD TEST SUMMARY REPORT ===\n');

  const reportFiles = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));

  for (const file of reportFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf8'));
    const metrics = data.metrics;

    console.log(`\n📊 ${file}`);
    console.log('─'.repeat(50));

    for (const [name, metric] of Object.entries(metrics)) {
      if (metric.rate) {
        // Trend metrics
        console.log(`  ${name}:`);
        console.log(`    p50: ${metric.avg?.toFixed(1) || metric.p50?.toFixed(1)}ms`);
        console.log(`    p95: ${metric.p95?.toFixed(1)}ms`);
        console.log(`    p99: ${metric.p99?.toFixed(1)}ms`);
        console.log(`    min: ${metric.min?.toFixed(1)}ms`);
        console.log(`    max: ${metric.max?.toFixed(1)}ms`);
      } else if (typeof metric === 'number') {
        console.log(`  ${name}: ${metric}`);
      }
    }

    // Pass/fail assessment
    const pass = assessPass(data);
    console.log(`\n  Result: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  }
}

function assessPass(data) {
  const { metrics } = data;

  // Check thresholds from options
  return (
    (metrics.shard_latency_ms?.p95 || 0) < 100 &&
    (metrics.shard_errors_total?.rate || 0) < 0.01 &&
    (metrics.memory_usage_mb?.max || 0) < 128
  );
}

generateSummary(process.argv[2] || './reports');
```

---

## Todo List

- [ ] Install k6 (if not already): `brew install k6`
- [ ] Create `scripts/load-test-sharding.ts` - 12×1000 RPS test
- [ ] Create `scripts/load-test-multi-region.ts` - latency by region
- [ ] Create `scripts/load-test-memory.ts` - memory pressure validation
- [ ] Create `scripts/load-test-failover.ts` - region failover test
- [ ] Create `scripts/load-test-queue-backpressure.ts` - queue limits
- [ ] Create `scripts/generate-load-summary.js` - report generator
- [ ] Create `scripts/validate-load-results.js` - pass/fail checker
- [ ] Create `.github/workflows/load-test.yml` - CI integration
- [ ] Add Grafana dashboard for load test results
- [ ] Document test scenarios in `docs/load-testing.md`
- [ ] Run baseline tests before scaling (for comparison)
- [ ] Run full suite after Phase 6 completion
- [ ] Archive results in `reports/load-test/YYYY-MM-DD/`
- [ ] Review and tune based on results

---

## Success Criteria

### Load Test Pass Requirements

| Scenario | Target | Pass Threshold |
|----------|--------|----------------|
| Shard stress | 12,000 RPS total | p95 <100ms, <1% errors |
| Multi-region latency | 3 regions | p95 <100ms each |
| Memory pressure | 1000 VUs | <128MB peak, no OOM |
| Failover recovery | Region kill | <30s recovery |
| Queue backpressure | 200 VUs burst | <5% rejection |

### Baseline Established

- [ ] All 5 test scenarios passing
- [ ] Performance metrics documented in `reports/load-test/`
- [ ] Grafana dashboards updated with baseline
- [ ] CI/CD pipeline running weekly regression tests
- [ ] Alert thresholds set based on baseline +20%

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Load test impacts production | Medium | High | Run against staging only, isolated environment |
| k6 resource exhaustion | Low | Medium | Distribute load across multiple runners |
| Tests create real data | Medium | Low | Use `X-Test-Run` header, mock execution |
| Flaky tests due to network | Medium | Low | Add retries, exclude outliers |
| Baseline too aggressive | Low | Medium | Make targets configurable per environment |

---

## Security Considerations

1. **Test isolation**: Use `X-Test-Run` header to prevent real execution
2. **Staging environment**: Never load test production directly
3. **Credentials**: Use test API keys, rotate after tests
4. **Rate limiting**: Test credentials have higher limits
5. **Data cleanup**: Auto-purge test data via cron

---

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/load-test-sharding.ts` | Shard throughput validation |
| `scripts/load-test-multi-region.ts` | Region latency testing |
| `scripts/load-test-memory.ts` | Memory pressure test |
| `scripts/load-test-failover.ts` | Failover recovery test |
| `scripts/load-test-queue-backpressure.ts` | Queue limits test |
| `scripts/generate-load-summary.js` | Report generator |
| `scripts/validate-load-results.js` | Pass/fail validator |
| `.github/workflows/load-test.yml` | CI integration |
| `docs/load-testing.md` | Test documentation |
| `reports/load-test/` | Results archive |

---

## Rollback Plan

1. **Stop load tests**: Ctrl+C or kill k6 processes
2. **Clean test data**: Run cleanup script
3. **Restore configs**: Revert any test-specific configs
4. **Alert silencing**: Disable load test alerts

---

**Definition of Done:** All 5 test scenarios passing with target metrics, CI/CD integration complete, baseline documented, Grafana dashboards showing load test results, <1% error rate at 12,000 RPS, <100ms p95 latency, <128MB memory usage.
