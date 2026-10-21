// API gateway load test — targets the routes the CF Worker actually serves.
//
// Replaces the previous RaaS-era test, which probed /api/status, /api/portfolio,
// /api/trades, /api/pnl and a /ws upgrade that the Worker does not register
// (the VPS backend was removed — unregistered /api/* returns 501). It was
// measuring the cost of returning errors, not load.
//
// Run:
//   k6 run -e TARGET_RPS=12000 -e API_HOST=api.cashclaw.cc \
//          tests/load/api-gateway-load-test.js
//
// TARGET_RPS drives the arrival-rate executor directly, so the pass criterion is
// measured requests-per-second rather than a VU count that only *implies* RPS.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ── Configuration ────────────────────────────────────────────────────────────

const TARGET_RPS = Number(__ENV.TARGET_RPS || 12000);
const HOST = __ENV.API_HOST || 'api.cashclaw.cc';
const PORT = __ENV.API_PORT || '443';
// Local/staging runs need an explicit scheme/port; production is https on 443.
const BASE_URL =
  __ENV.BASE_URL || (PORT === '443' ? `https://${HOST}` : `http://${HOST}:${PORT}`);
const DURATION = __ENV.DURATION || '30m';
const PRE_ALLOCATED_VUS = Number(__ENV.PRE_ALLOCATED_VUS || 2000);
const MAX_VUS = Number(__ENV.MAX_VUS || 20000);

const P95_MS = Number(__ENV.P95_MS || 100);
const MAX_ERROR_RATE = Number(__ENV.MAX_ERROR_RATE || 0.01);

// ── Custom metrics ───────────────────────────────────────────────────────────

const successRate = new Rate('target_success');
const rpsObserved = new Counter('requests_completed');
const routeLatency = new Trend('route_latency');

/** Endpoints the Worker registers and serves without credentials. */
const ROUTES = [
  '/api/health',
  '/metrics',
  '/api/version',
  '/api/markets',
  '/api/v1/subscriptions/tiers',
];

export const options = {
  scenarios: {
    api_load: {
      // Constant arrival rate: k6 opens enough VUs to sustain TARGET_RPS, which
      // is the quantity the go-live gate actually specifies.
      executor: 'constant-arrival-rate',
      rate: TARGET_RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
    },
  },
  thresholds: {
    // Go-live gate: p95 < 100ms, error rate < 1%, at the target arrival rate.
    http_req_duration: [`p(95)<${P95_MS}`],
    http_req_failed: [`rate<${MAX_ERROR_RATE}`],
    target_success: [`rate>${1 - MAX_ERROR_RATE}`],
  },
};

export default function () {
  // Rotate routes so the profile exercises the whole public surface rather than
  // hammering one path (which a CDN could absorb while the rest stalls).
  const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];

  const res = http.get(`${BASE_URL}${route}`, {
    tags: { route },
  });

  const ok = check(res, {
    'status is 200': (r) => r.status === 200,
    // A 5xx means the Worker itself failed; 4xx means the contract moved.
    'no server error': (r) => r.status < 500,
  });

  successRate.add(ok);
  rpsObserved.add(1);
  routeLatency.add(res.timings.duration);

  // No sleep: the arrival-rate executor controls pacing, so a sleep here would
  // silently under-deliver the target rate.
}
