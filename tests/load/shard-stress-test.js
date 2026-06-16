import http from 'k6/http';
import { check, sleep, Rate, Trend, Counter } from 'k6';
import { SharedArray } from 'k6/data';

// Custom metrics
const shardRoutingLatency = new Trend('shard_routing_latency_ms');
const shardLookupLatency = new Trend('shard_lookup_latency_ms');
const strategyExecutionLatency = new Trend('strategy_execution_latency_ms');
const requestsPerShard = new Counter('requests_per_shard');
const shardErrors = new Counter('shard_errors_total');
const successfulExecutions = new Counter('successful_executions_total');

// Load test configuration
const VUS = parseInt(__ENV.VUS || '200', 10);
const DURATION = __ENV.DURATION || '2m';
const SHARDS = 12;
const STRATEGIES_PER_SHARD = 5;
const TOTAL_STRATEGIES = SHARDS * STRATEGIES_PER_SHARD;

// Generate strategy IDs (simulate 60 strategies across 12 shards = 5 each)
const strategyIds = new SharedArray('strategyIds', function () {
  const ids = [];
  const strategyPrefixes = [
    'polymarket-arb',
    'bollinger-squeeze',
    'momentum-cascade',
    'whale-tracker',
    'event-deadline-scalper',
    'volatility-targeting',
    'orderbook-depth',
    'cross-correlation',
    'herd-detector',
    'info-asymmetry',
    'regime-adaptive',
    'inventory-rebalancer',
  ];

  for (let shard = 0; shard < SHARDS; shard++) {
    for (let s = 0; s < STRATEGIES_PER_SHARD; s++) {
      ids.push(`${strategyPrefixes[shard]}-${s + 1}`);
    }
  }
  return ids;
});

export const options = {
  scenarios: {
    shard_stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: VUS / 4 },
        { duration: '60s', target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    shard_lookup_latency_ms: ['p(95)<5'], // <5ms target for shard lookup
    strategy_execution_latency_ms: ['p(95)<50'], // <50ms for execution
    shard_errors_total: ['rate<0.01'], // <1% error rate
  },
};

// Simulate consistent hash lookup (client-side)
function getShardId(strategyId: string): number {
  // Same algorithm as in consistent-hash.ts
  let hash = 0;
  for (let i = 0; i < strategyId.length; i++) {
    hash = ((hash << 5) - hash) + strategyId.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return (hash >>> 0) % SHARDS;
}

export default function () {
  // Select a random strategy ID
  const strategyIndex = Math.floor(Math.random() * strategyIds.length);
  const strategyId = strategyIds[strategyIndex];

  // Measure shard lookup latency
  const lookupStart = performance.now();
  const shardId = getShardId(strategyId);
  const lookupLatency = performance.now() - lookupStart;
  shardLookupLatency.add(lookupLatency);

  // In production, this would fetch from the actual StrategyShard DO
  // For load test, we're testing the routing logic itself
  const baseUrl = __ENV.API_HOST || 'localhost';
  const port = __ENV.API_PORT || '3000';
  const url = `http://${baseUrl}:${port}/api/shard/${shardId}/execute`;

  // Simulate strategy execution request
  const executeStart = performance.now();

  const payload = JSON.stringify({
    strategyId,
    marketData: {
      symbol: 'BTC-USDC',
      timestamp: Date.now(),
      bid: 50000 + Math.random() * 100,
      ask: 50001 + Math.random() * 100,
      last: 50000.5,
      volume: 1000 + Math.random() * 500,
    },
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    timeout: '5000ms',
  };

  const response = http.post(url, payload, params);

  const execLatency = performance.now() - executeStart;
  strategyExecutionLatency.add(execLatency);
  requestsPerShard.add(1, { shard: shardId.toString() });

  // Check response
  const success = check(response, {
    'execution status 200': (r) => r.status === 200,
    'execution response valid': (r) => {
      if (r.status !== 200) return false;
      try {
        const body = r.json();
        return body.shardId === shardId && typeof body.signal === 'string';
      } catch {
        return false;
      }
    },
  });

  if (success) {
    successfulExecutions.add(1);
  } else {
    shardErrors.add(1);
  }

  shardRoutingLatency.add(lookupLatency);

  // Simulate think time between requests
  sleep(0.05 + Math.random() * 0.1);
}

// Teardown - log summary
export function teardown() {
  console.log('\n=== Shard Load Test Summary ===');
  console.log(`Total requests: ${requestsPerShard.value}`);
  console.log(`Successful executions: ${successfulExecutions.value}`);
  console.log(`Errors: ${shardErrors.value}`);
  console.log(`Error rate: ${(shardErrors.value / Math.max(1, requestsPerShard.value) * 100).toFixed(2)}%`);
  console.log(`Avg shard lookup: ${shardLookupLatency.avg.toFixed(3)}ms`);
  console.log(`p95 shard lookup: ${shardLookupLatency.valueAt(0.95).toFixed(3)}ms`);
  console.log(`Avg execution: ${strategyExecutionLatency.avg.toFixed(3)}ms`);
  console.log(`p95 execution: ${strategyExecutionLatency.valueAt(0.95).toFixed(3)}ms`);
}
