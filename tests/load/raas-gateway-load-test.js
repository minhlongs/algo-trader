import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics to track load test success
const wsConnSuccess = new Rate('ws_connection_success');
const wsConnDuration = new Trend('ws_connection_duration');
const wsMessageCount = new Rate('ws_messages_received');

// Configuration options for the load test
// Configurable via env variables, with fallbacks supporting up to 5000+ VUs
const vusCount = parseInt(__ENV.VUS || '5000', 10);
const duration = __ENV.DURATION || '5m';
const rampUpDuration = __ENV.RAMP_UP || '1m';
const rampDownDuration = __ENV.RAMP_DOWN || '1m';

/*
 * Auth headers for protected endpoints.
 *
 * The API uses Authorization: Bearer with a LOAD_TEST_TOKEN for tier-gated routes.
 * Set LOAD_TEST_TOKEN to a pre-provisioned token to test protected routes.
 * Without it, only unprotected routes (/api/health) will succeed; all protected
 * routes will be rejected (401) by the requireTier middleware.
 *
 * KNOWN AUTH GAP: The requireTier middleware in feature-gate.ts depends on
 * req.license being set by an upstream "raas-gate middleware" that does not
 * yet exist for Express routes. Even with a valid LOAD_TEST_TOKEN, protected
 * routes may still return 401 because no middleware reads the Bearer token and
 * populates req.license. Fix: implement raas-gate Express middleware that
 * validates the token and sets req.license before requireTier runs.
 */
const loadTestToken = __ENV.LOAD_TEST_TOKEN || __ENV.TEST_API_KEY;
const headers = {};
if (loadTestToken) {
  headers['Authorization'] = `Bearer ${loadTestToken}`;
  // Also set x-api-key as fallback in case middleware prefers that
  headers['x-api-key'] = loadTestToken;
}

export const options = {
  scenarios: {
    raas_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: rampUpDuration, target: vusCount },       // Ramp-up stage
        { duration: duration, target: vusCount },             // Steady-state stage
        { duration: rampDownDuration, target: 0 },             // Ramp-down stage
      ],
      gracefulRampDown: '30s',
      gracefulStop: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of REST requests must be under 200ms
    http_req_failed: ['rate<0.01'],    // less than 1% HTTP request failures
    ws_connection_success: ['rate>0.99'], // 99%+ WS connection success rate
  },
};

export default function () {
  const host = __ENV.API_HOST || 'localhost';
  const port = __ENV.API_PORT || '3000';
  const baseUrl = `http://${host}:${port}`;
  const wsUrl = `ws://${host}:${port}/ws`;

  // 1. Target REST endpoints sequentially

  // GET /api/health (UNPROTECTED — no auth required)
  const healthRes = http.get(`${baseUrl}/api/health`);
  check(healthRes, {
    'health returns 200': (r) => r.status === 200,
  });
  sleep(0.1);

  // GET /api/status (PROTECTED — requires LOAD_TEST_TOKEN)
  // NOTE: may return 401 due to raas-gate middleware auth gap (see comment above)
  const statusRes = http.get(`${baseUrl}/api/status`, { headers });
  check(statusRes, {
    'status returns 200': (r) => r.status === 200,
  });
  sleep(0.1);

  // GET /api/portfolio (PROTECTED)
  const portfolioRes = http.get(`${baseUrl}/api/portfolio`, { headers });
  check(portfolioRes, {
    'portfolio returns 200': (r) => r.status === 200,
  });
  sleep(0.1);

  // GET /api/trades (PROTECTED — passing limit and offset pagination parameters)
  const tradesRes = http.get(`${baseUrl}/api/trades?limit=20&offset=0`, { headers });
  check(tradesRes, {
    'trades returns 200': (r) => r.status === 200,
  });
  sleep(0.1);

  // GET /api/pnl (PROTECTED)
  const pnlRes = http.get(`${baseUrl}/api/pnl`, { headers });
  check(pnlRes, {
    'pnl returns 200': (r) => r.status === 200,
  });
  sleep(0.1);

  // 2. Connect to WebSocket gateway (PROTECTED — passes auth headers)
  const startTime = Date.now();
  const wsRes = ws.connect(wsUrl, { headers }, function (socket) {
    socket.on('open', function () {
      wsConnSuccess.add(1);
      wsConnDuration.add(Date.now() - startTime);

      // Subscribe to signals, pnl, trades, and price_update channels
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'signals' }));
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'pnl' }));
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'trades' }));
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'price_update' }));

      // Periodically send ping messages every 3 seconds to keep connection alive
      socket.setInterval(function () {
        socket.send(JSON.stringify({ type: 'ping' }));
      }, 3000);
    });

    socket.on('message', function (message) {
      wsMessageCount.add(1);
    });

    socket.on('close', function () {
      // Closed cleanly
    });

    socket.on('error', function (err) {
      wsConnSuccess.add(0);
    });

    // Close connection cleanly after 5 seconds
    socket.setTimeout(function () {
      socket.close();
    }, 5000);
  });

  check(wsRes, {
    'WS upgrade handshake successful': (r) => r && r.status === 101,
  });

  sleep(1); // Wait before next iteration
}
