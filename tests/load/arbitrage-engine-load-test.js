import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics for arbitrage engine
const arbOpportunitiesSubmitted = new Counter('arb_opportunities_submitted');
const arbExecutionsSucceeded = new Counter('arb_executions_succeeded');
const arbExecutionsFailed = new Counter('arb_executions_failed');
const arbLatency = new Trend('arb_execution_latency_ms');
const arbP95Latency = new Trend('arb_p95_latency_ms');
const arbQueueDepth = new Trend('arb_queue_depth');
const arbTotalProfit = new Trend('arb_total_profit');

// Configuration - can be overridden via env vars
const vusCount = parseInt(__ENV.VUS || '50', 10);
const duration = __ENV.DURATION || '2m';
const rampUpDuration = __ENV.RAMP_UP || '30s';
const targetOpsPerSec = parseInt(__ENV.TARGET_OPS || '100', 10);

// API configuration
const apiHost = __ENV.API_HOST || 'localhost';
const apiPort = __ENV.API_PORT || '3000';
const isSecure = apiHost !== 'localhost' && apiHost !== '127.0.0.1';
const protocol = isSecure ? 'https' : 'http';
const baseUrl = `${protocol}://${apiHost}:${apiPort}`;

// Test API key for authenticated endpoints
const testApiKey = __ENV.TEST_API_KEY;
const commonHeaders = { 'Content-Type': 'application/json' };
if (testApiKey) {
  commonHeaders['x-api-key'] = testApiKey;
  commonHeaders['Authorization'] = `Bearer ${testApiKey}`;
}

// Generate test arbitrage opportunities
function generateOpportunity(type = 'cross-exchange') {
  const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AVAX/USDT', 'MATIC/USDT'];
  const exchanges = ['binance', 'okx', 'bybit'];
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  const buyExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
  let sellExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
  while (sellExchange === buyExchange) {
    sellExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
  }

  const basePrice = 50000 + Math.random() * 10000;
  const spreadPercent = 0.05 + Math.random() * 0.5; // 0.05% - 0.55%
  const buyPrice = basePrice;
  const sellPrice = basePrice * (1 + spreadPercent / 100);
  const amount = 1000 / buyPrice;

  return {
    id: `arb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    legs: [
      {
        exchange: buyExchange,
        symbol,
        side: 'buy',
        price: buyPrice,
        amount,
        fee: buyPrice * amount * 0.001,
      },
      {
        exchange: sellExchange,
        symbol,
        side: 'sell',
        price: sellPrice,
        amount,
        fee: sellPrice * amount * 0.001,
      },
    ],
    expectedProfit: (sellPrice - buyPrice) * amount - (buyPrice * amount * 0.001) - (sellPrice * amount * 0.001),
    expectedProfitPct: spreadPercent,
    totalFees: buyPrice * amount * 0.001 + sellPrice * amount * 0.001,
    confidence: 0.7 + Math.random() * 0.3,
    detectedAt: Date.now(),
    expiresAt: Date.now() + 10000,
  };
}

// Test different arbitrage strategies
const strategyTypes = [
  'cross-exchange',
  'triangular',
  'dex-cex',
  'funding-rate',
  'binary-arb',
  'settlement-arb',
  'cross-market',
];

function generateStrategyOpportunity() {
  const type = strategyTypes[Math.floor(Math.random() * strategyTypes.length)];
  return generateOpportunity(type);
}

export const options = {
  scenarios: {
    arbitrage_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: rampUpDuration, target: vusCount },
        { duration: duration, target: vusCount },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    // Latency thresholds
    'arb_execution_latency_ms': ['p(95)<500'], // p95 latency under 500ms
    'arb_execution_latency_ms': ['p(99)<1000'], // p99 under 1s
    // Success rate thresholds
    'arb_executions_succeeded': ['rate>0.95'], // 95%+ success rate
    'arb_executions_failed': ['rate<0.05'], // <5% failure rate
    // Throughput
    'arb_opportunities_submitted': ['count>1000'], // At least 1000 submissions
  },
};

export default function () {
  // Health check first
  const healthRes = http.get(`${baseUrl}/api/health`);
  check(healthRes, {
    'health check returns 200': (r) => r.status === 200,
  });
  sleep(0.1);

  // Submit arbitrage opportunity via API
  const opportunity = generateStrategyOpportunity();
  arbOpportunitiesSubmitted.add(1);

  const startTime = Date.now();
  const execRes = http.post(
    `${baseUrl}/api/arbitrage/execute`,
    JSON.stringify(opportunity),
    { headers: commonHeaders }
  );
  const latency = Date.now() - startTime;
  arbLatency.add(latency);

  const success = check(execRes, {
    'execution returns 200 or 201': (r) => r.status === 200 || r.status === 201,
    'execution response has success field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    arbExecutionsSucceeded.add(1);
    try {
      const body = JSON.parse(execRes.body);
      if (body.actualProfit !== undefined) {
        arbTotalProfit.add(body.actualProfit);
      }
      if (body.queueDepth !== undefined) {
        arbQueueDepth.add(body.queueDepth);
      }
    } catch {
      // Ignore parse errors
    }
  } else {
    arbExecutionsFailed.add(1);
  }

  // Also test the orchestrator metrics endpoint
  if (__ITER % 10 === 0) {
    const metricsRes = http.get(`${baseUrl}/api/arbitrage/metrics`, { headers: commonHeaders });
    check(metricsRes, {
      'metrics endpoint returns 200': (r) => r.status === 200,
      'metrics has required fields': (r) => {
        try {
          const body = JSON.parse(r.body);
          return (
            body.scansPerformed !== undefined &&
            body.opportunitiesDetected !== undefined &&
            body.executionsAttempted !== undefined &&
            body.p95ExecutionLatencyMs !== undefined
          );
        } catch {
          return false;
        }
      },
    });

    if (metricsRes.status === 200) {
      try {
        const body = JSON.parse(metricsRes.body);
        if (body.p95ExecutionLatencyMs !== undefined) {
          arbP95Latency.add(body.p95ExecutionLatencyMs);
        }
      } catch {
        // Ignore
      }
    }
  }

  sleep(Math.random() * 0.5); // Small random sleep between 0-500ms
}

export function handleSummary(data) {
  const summary = {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data, null, 2),
  };
  return summary;
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const colors = options.enableColors;
  const green = colors ? '\x1b[32m' : '';
  const red = colors ? '\x1b[31m' : '';
  const yellow = colors ? '\x1b[33m' : '';
  const reset = colors ? '\x1b[0m' : '';

  let output = '\n' + indent + '=== ARBITRAGE ENGINE LOAD TEST SUMMARY ===\n\n';

  // Latency metrics
  if (data.metrics.arb_execution_latency_ms) {
    const m = data.metrics.arb_execution_latency_ms;
    output += indent + 'Execution Latency:\n';
    output += indent + `  Avg: ${m.values.avg.toFixed(2)}ms\n`;
    output += indent + `  p90: ${m.values['p(90)'].toFixed(2)}ms\n`;
    output += indent + `  p95: ${m.values['p(95)'].toFixed(2)}ms ${m.values['p(95)'] < 500 ? green + '✓' + reset : red + '✗' + reset}\n`;
    output += indent + `  p99: ${m.values['p(99)'].toFixed(2)}ms\n`;
    output += indent + `  Max: ${m.values.max.toFixed(2)}ms\n\n`;
  }

  // P95 from orchestrator metrics
  if (data.metrics.arb_p95_latency_ms) {
    const m = data.metrics.arb_p95_latency_ms;
    output += indent + 'Orchestrator Reported P95 Latency:\n';
    output += indent + `  Avg: ${m.values.avg.toFixed(2)}ms\n`;
    output += indent + `  Max: ${m.values.max.toFixed(2)}ms\n\n`;
  }

  // Success rates
  const submitted = data.metrics.arb_opportunities_submitted?.values.count || 0;
  const succeeded = data.metrics.arb_executions_succeeded?.values.count || 0;
  const failed = data.metrics.arb_executions_failed?.values.count || 0;
  const successRate = submitted > 0 ? (succeeded / submitted * 100).toFixed(2) : 0;

  output += indent + 'Execution Results:\n';
  output += indent + `  Submitted: ${submitted}\n`;
  output += indent + `  Succeeded: ${succeeded}\n`;
  output += indent + `  Failed: ${failed}\n`;
  output += indent + `  Success Rate: ${successRate}% ${successRate >= 95 ? green + '✓' + reset : red + '✗' + reset}\n\n`;

  // Queue depth
  if (data.metrics.arb_queue_depth) {
    const m = data.metrics.arb_queue_depth;
    output += indent + 'Queue Depth:\n';
    output += indent + `  Avg: ${m.values.avg.toFixed(2)}\n`;
    output += indent + `  Max: ${m.values.max.toFixed(2)}\n\n`;
  }

  // Profit
  if (data.metrics.arb_total_profit) {
    const m = data.metrics.arb_total_profit;
    output += indent + 'Total Profit:\n';
    output += indent + `  Sum: $${m.values.sum.toFixed(2)}\n`;
    output += indent + `  Avg: $${m.values.avg.toFixed(4)}\n\n`;
  }

  // Thresholds
  output += indent + 'Threshold Checks:\n';
  for (const [name, threshold] of Object.entries(data.thresholds)) {
    const passed = threshold.ok;
    output += indent + `  ${name}: ${passed ? green + 'PASS' + reset : red + 'FAIL' + reset}\n`;
  }

  output += '\n' + indent + '=== END SUMMARY ===\n';
  return output;
}