#!/usr/bin/env npx tsx
/**
 * Load test for compliance and KYC API endpoints.
 * Uses Node.js native http — zero external dependencies.
 * Run: npx tsx scripts/load-test-compliance-api.ts [baseUrl]
 */

import http from 'http';

interface EndpointConfig {
  name: string;
  path: string;
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
}

interface RequestResult {
  status: number;
  latencyMs: number;
}

interface EndpointSummary {
  endpoint: string;
  totalRequests: number;
  successCount: number;
  rateLimitHits: number;
  p50: number;
  p95: number;
  p99: number;
  successRate: string;
}

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const CONCURRENCY = 50;
const RATE_LIMIT_FLOOD_COUNT = 110;

const ENDPOINTS: EndpointConfig[] = [
  {
    name: '/api/compliance/validate',
    path: '/api/compliance/validate',
    method: 'POST',
    body: { symbol: 'BTC/USDT', side: 'buy', quantity: 0.1, price: 65000, strategyId: 'rsi-sma-v1' },
  },
  { name: '/api/compliance/rules', path: '/api/compliance/rules', method: 'GET' },
  { name: '/api/kyc/status', path: '/api/kyc/status', method: 'GET' },
];

function request(url: string, method: string, body?: Record<string, unknown>): Promise<RequestResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const parsed = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
        timeout: 10_000,
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode ?? 0, latencyMs: performance.now() - start }));
      },
    );
    req.on('error', () => resolve({ status: 0, latencyMs: performance.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, latencyMs: performance.now() - start }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function runBatch(label: string, requests: Promise<RequestResult>[]): Promise<EndpointSummary> {
  const results = await Promise.all(requests);
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const successes = results.filter((r) => r.status >= 200 && r.status < 300);
  const rateLimitHits = results.filter((r) => r.status === 429).length;
  return {
    endpoint: label,
    totalRequests: results.length,
    successCount: successes.length,
    rateLimitHits,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    successRate: `${((successes.length / results.length) * 100).toFixed(1)}%`,
  };
}

function printSummary(summaries: EndpointSummary[]): void {
  const header = ['Endpoint', 'Reqs', 'OK', '429', 'p50(ms)', 'p95(ms)', 'p99(ms)', 'OK%'];
  const rows = summaries.map((s) => [
    s.endpoint, String(s.totalRequests), String(s.successCount), String(s.rateLimitHits),
    s.p50.toFixed(1), s.p95.toFixed(1), s.p99.toFixed(1), s.successRate,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const sep = widths.map((w) => '-'.repeat(w)).join(' | ');
  const fmt = (row: string[]) => row.map((c, i) => c.padEnd(widths[i])).join(' | ');
  console.log('\n=== Compliance & KYC Load Test Results ===\n');
  console.log(fmt(header));
  console.log(sep);
  rows.forEach((r) => console.log(fmt(r)));
  console.log();
}

async function main(): Promise<void> {
  console.log(`Target: ${BASE_URL}`);
  console.log(`Concurrency: ${CONCURRENCY} virtual users\n`);
  const summaries: EndpointSummary[] = [];

  for (const ep of ENDPOINTS) {
    process.stdout.write(`Testing ${ep.name} ... `);
    const batch = Array.from({ length: CONCURRENCY }, () => request(`${BASE_URL}${ep.path}`, ep.method, ep.body));
    const s = await runBatch(ep.name, batch);
    summaries.push(s);
    console.log(`${s.successRate} success`);
  }

  process.stdout.write(`Rate limit flood (${RATE_LIMIT_FLOOD_COUNT} requests) ... `);
  const floodBody = { symbol: 'ETH/USDT', side: 'sell', quantity: 1, price: 3500, strategyId: 'test' };
  const floodBatch = Array.from({ length: RATE_LIMIT_FLOOD_COUNT }, () =>
    request(`${BASE_URL}/api/compliance/validate`, 'POST', floodBody),
  );
  const rl = await runBatch('/api/compliance/validate (rate-limit flood)', floodBatch);
  summaries.push(rl);
  console.log(`${rl.rateLimitHits} blocked`);
  printSummary(summaries);
}

main().catch((err: unknown) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
