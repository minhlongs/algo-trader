import { LOAD_TEST_BASE_URL } from './load-test-config';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

const shardLatency = new Trend('shard_latency_ms', true);
const shardErrors = new Counter('shard_errors_total');
const shardRPS = new Gauge('shard_rps_current');
const strategyDistribution = new Counter('strategy_hits_total');
const memoryUsage = new Trend('memory_usage_mb', true);

// Configuration
const SHARDS = 12;
const TARGET_RPS_PER_SHARD = 1000;
const TEST_DURATION = '30m';
// 52 strategies (sharded evenly)
const STRATEGIES = Array.from({ length: 52 }, (_, i) => `strategy-${i}`);

// Shard mapping (consistent hashing) - must match production
function getShardForStrategy(strategyId: string): number {
  // Use same hash as production (consistent-hash.ts)
  const hash = simpleHash(strategyId);
  return hash % SHARDS;
}

function simpleHash(str: string): number {
  // FNV-1a hash (matches consistent-hash.ts)
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
  // Select strategy randomly
  const strategyIndex = Math.floor(Math.random() * STRATEGIES.length);
  const strategy = STRATEGIES[strategyIndex];
  const shardId = getShardForStrategy(strategy);

  // Build URL - targeting the edge proxy which routes to appropriate shard
  const url = `${LOAD_TEST_BASE_URL}/api/v1/strategies/${strategy}/execute`;

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Run': 'true', // Prevent real execution
    },
  };

  const body = JSON.stringify({
    signal: {
      type: 'BUY',
      symbol: 'BTC',
      side: 'long',
      confidence: Math.random(),
    },
    backtest: true, // Dry-run mode
  });

  const start = Date.now();
  const res = http.post(url, body, params);

  const latency = Date.now() - start;
  shardLatency.add(latency);
  strategyDistribution.add({ strategy });

  // Record per-shard RPS
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

  // Think time to achieve realistic RPS per VU
  sleep(0.1); // ~10 RPS per virtual user
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
    const percentage = (Number(count) / data.metrics.http_reqs) * 100;
    console.log(`${strategy}: ${count} (${percentage.toFixed(1)}%)`);
  }

  // Shard performance
  console.log('\n--- Shard Performance ---');
  for (let i = 0; i < SHARDS; i++) {
    const latencyMetric = data.metrics[`shard_${i}_latency`];
    if (latencyMetric) {
      console.log(`Shard ${i}: p95=${latencyMetric.p95.toFixed(1)}ms`);
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
