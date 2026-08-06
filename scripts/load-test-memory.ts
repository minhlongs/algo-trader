import { LOAD_TEST_BASE_URL } from './load-test-config';
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
  const url = `${LOAD_TEST_BASE_URL}/api/v1/intelligence/analyze`;
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
