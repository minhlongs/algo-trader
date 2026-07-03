// k6 Load Test — CI Variant (lower load, faster execution)
// ============================================================
// This is a lighter version for CI/CD pipelines.
// Runs shorter duration with fewer VUs to catch major regressions
// without overwhelming the CI runner or the target.
//
// Usage:
//   TEST_API_KEY=<key> k6 run tests/load/raas-gateway-load-test.ci.js
//   pnpm test:load:ci   (via package.json)
//
// Full-scale test (5000 VUs, 5m):
//   pnpm test:load       (default: raas-gateway-load-test.js)
// ============================================================
//
// Auth note
// ---------
// Pass TEST_API_KEY env var to exercise protected endpoints.
// Without it, only /api/health will succeed. The API reads auth from
// x-api-key or Authorization: Bearer headers (set below when key provided).
//
// NOTE: Even with a valid TEST_API_KEY, protected routes may still return 401
// because there is NO Express middleware that reads x-api-key and sets req.license.
// The distributed-rate-limiter (the only consumer of x-api-key today) validates the
// key for rate-limit tier assignment but does NOT propagate it to req.license.
// The requireTier middleware in feature-gate.ts depends on req.license being set
// by an upstream "raas-gate middleware" that does not yet exist for Express routes.
// This is a known auth-chain gap that must be closed before authenticated load
// testing can work.

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const wsConnSuccess = new Rate('ws_connection_success');
const wsConnDuration = new Trend('ws_connection_duration');
const wsMessageCount = new Rate('ws_messages_received');

// CI-friendly defaults: lower concurrency, shorter duration
const vusCount = parseInt(__ENV.VUS || '100', 10);
const duration = __ENV.DURATION || '30s';
const rampUpDuration = __ENV.RAMP_UP || '10s';
const rampDownDuration = __ENV.RAMP_DOWN || '10s';

// Auth headers (optional — set TEST_API_KEY env var to exercise protected routes)
const testApiKey = __ENV.TEST_API_KEY;
const headers = {};
if (testApiKey) {
  headers['x-api-key'] = testApiKey;
  headers['Authorization'] = `Bearer ${testApiKey}`;
}

export const options = {
  scenarios: {
    raas_ci_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: rampUpDuration, target: vusCount },
        { duration: duration, target: vusCount },
        { duration: rampDownDuration, target: 0 },
      ],
      gracefulRampDown: '10s',
      gracefulStop: '15s',
    },
  },
  thresholds: {
    // Friendly thresholds for CI — relaxed from full-scale
    http_req_duration: ['p(95)<500'],    // 95% under 500ms in CI
    http_req_failed: ['rate<0.05'],       // Allow up to 5% failures in CI
    ws_connection_success: ['rate>0.95'], // 95%+ WS connection success
  },
};

export default function () {
  const host = __ENV.API_HOST || 'localhost';
  const port = __ENV.API_PORT || '3000';
  const isSecure = host !== 'localhost' && host !== '127.0.0.1';
  const protocol = isSecure ? 'https' : 'http';
  const wsProtocol = isSecure ? 'wss' : 'ws';
  const baseUrl = `${protocol}://${host}:${port}`;
  const wsUrl = `${wsProtocol}://${host}:${port}/ws`;

  // 1. REST endpoints
  // /api/health is public (no auth required)
  const healthRes = http.get(`${baseUrl}/api/health`);
  check(healthRes, {
    'health returns 200': (r) => r.status === 200,
  });
  sleep(0.1);

  // Protected endpoints — include auth headers when TEST_API_KEY is set
  const statusRes = http.get(`${baseUrl}/api/status`, { headers });
  check(statusRes, {
    'status returns 200': (r) => r.status === 200,
  });
  sleep(0.1);

  const portfolioRes = http.get(`${baseUrl}/api/portfolio`, { headers });
  check(portfolioRes, {
    'portfolio returns 200': (r) => r.status === 200,
  });
  sleep(0.1);

  const tradesRes = http.get(`${baseUrl}/api/trades?limit=20&offset=0`, { headers });
  check(tradesRes, {
    'trades returns 200': (r) => r.status === 200,
  });
  sleep(0.1);

  const pnlRes = http.get(`${baseUrl}/api/pnl`, { headers });
  check(pnlRes, {
    'pnl returns 200': (r) => r.status === 200,
  });
  sleep(0.1);

  // 2. WebSocket connection (shorter duration for CI)
  const startTime = Date.now();
  const wsRes = ws.connect(wsUrl, { headers }, function (socket) {
    socket.on('open', function () {
      wsConnSuccess.add(1);
      wsConnDuration.add(Date.now() - startTime);

      socket.send(JSON.stringify({ type: 'subscribe', channel: 'signals' }));
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'pnl' }));
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'trades' }));
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'price_update' }));

      socket.setInterval(function () {
        socket.send(JSON.stringify({ type: 'ping' }));
      }, 3000);
    });

    socket.on('message', function (message) {
      wsMessageCount.add(1);
    });

    socket.on('close', function () {
      // Clean close
    });

    socket.on('error', function (err) {
      wsConnSuccess.add(0);
    });

    // Close after 3 seconds (shorter for CI)
    socket.setTimeout(function () {
      socket.close();
    }, 3000);
  });

  check(wsRes, {
    'WS upgrade handshake successful': (r) => r && r.status === 101,
  });

  sleep(0.5);
}
