import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const requestSuccess = new Rate('http_req_success');
const shardLatency = new Trend('shard_latency_ms');
const errorRate = new Rate('http_req_failed');
const shardDistribution = new Counter('shard_distribution');

// Configuration for 12k RPS target
// With ~10 req/sec per VU, need ~1200 VUs
const targetRps = parseInt(__ENV.TARGET_RPS || '12000', 10);
const requestsPerVU = parseInt(__ENV.REQS_PER_VU || '10', 10);
const vusCount = Math.ceil(targetRps / requestsPerVU);

const duration = __ENV.DURATION || '2m';
const rampUpDuration = __ENV.RAMP_UP || '30s';
const rampDownDuration = __ENV.RAMP_DOWN || '30s';

// Target endpoints - use actual deployed Cloudflare Workers URL
const baseUrl = __ENV.API_HOST || 'https://algo-trader.workers.dev';

export const options = {
  scenarios: {
    scaling_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: rampUpDuration, target: vusCount },
        { duration: duration, target: vusCount },
        { duration: rampDownDuration, target: 0 },
      ],
      gracefulRampDown: '30s',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% under 200ms
    http_req_failed: ['rate<0.01'],    // <1% errors
    http_req_success: ['rate>0.99'],   // >99% success
  },
};

function getRandomStrategy() {
  const strategies = [
    'polymarket-arb-1',
    'polymarket-arb-2',
    'signal-fusion-1',
    'signal-validator-1',
    'ml-predictor-1',
    'sentiment-analyzer-1',
    'risk-calculator-1',
    'execution-router-1',
    'portfolio-balancer-1',
    'liquidity-checker-1',
  ];
  return strategies[Math.floor(Math.random() * strategies.length)];
}

export default function () {
  const startTime = Date.now();

  // 1. Health check (10% of requests)
  if (Math.random() < 0.1) {
    const healthRes = http.get(`${baseUrl}/api/health`);
    const success = healthRes.status === 200;
    requestSuccess.add(success);
    errorRate.add(!success);
    shardLatency.add(Date.now() - startTime);
    check(healthRes, { 'health OK': (r) => r.status === 200 });
    sleep(0.05);
    return;
  }

  // 2. Strategy execution (main load - 70% of requests)
  if (Math.random() < 0.7) {
    const strategyId = getRandomStrategy();
    const payload = JSON.stringify({
      strategyId,
      marketData: {
        eventId: 'mock-event-' + Math.floor(Math.random() * 1000),
        currentPrice: 0.5 + Math.random() * 0.5,
        volume: Math.floor(Math.random() * 1000000),
        timestamp: Date.now(),
      },
    });

    const execRes = http.post(
      `${baseUrl}/api/v1/strategy/execute`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': `load-${__VU}-${startTime}`,
        },
        timeout: '5000ms',
      }
    );

    const success = execRes.status === 200;
    requestSuccess.add(success);
    errorRate.add(!success);

    if (success) {
      try {
        const result = JSON.parse(execRes.body || '{}');
        const latency = Date.now() - startTime;
        shardLatency.add(latency);

        // Track which shard handled the request
        const shardId = result.shardId || Math.floor(Math.random() * 12);
        shardDistribution.add(shardId);

        check(execRes, {
          'exec status 200': (r) => r.status === 200,
          'has shardId': (r) => !!result.shardId,
          'has signal': (r) => ['BUY', 'SELL', 'HOLD'].includes(result.signal),
          'latency < 100ms': () => latency < 100,
        });
      } catch (e) {
        errorRate.add(true);
      }
    }
    sleep(0.02);
    return;
  }

  // 3. Queue metrics (10% of requests)
  if (Math.random() < 0.2) {
    const metricsRes = http.get(`${baseUrl}/api/v1/metrics/queues`);
    const success = metricsRes.status === 200;
    requestSuccess.add(success);
    errorRate.add(!success);
    shardLatency.add(Date.now() - startTime);
    check(metricsRes, { 'metrics OK': (r) => r.status === 200 });
    sleep(0.05);
    return;
  }

  // Default short sleep to maintain request rate
  sleep(0.01);
}
