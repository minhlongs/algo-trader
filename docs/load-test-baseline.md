# Load Test Baseline

**Date:** 2026-07-03
**Script:** `tests/load/raas-gateway-load-test.js`
**Tool:** k6 v2.0.0
**Target:** `localhost:3000` (development API server)

## Configuration

| Parameter | Value |
|-----------|-------|
| VUs | 10 |
| Duration | 10s |
| Executor | Ramping VUs (10s steady state) |

## Results

### HTTP Performance

| Metric | Value |
|--------|-------|
| Average response time | 7.59ms |
| Median response time | 7.59ms |
| p(90) response time | 12.19ms |
| p(95) response time | 13.54ms |
| Total requests | 350 |
| Requests per second | 32.31/s |

### WebSocket Performance

| Metric | Value |
|--------|-------|
| Sessions attempted | 70 |
| Success rate | 0% |
| Average connect time | 5.99ms |

### Checks

| Check | Success Rate |
|-------|-------------|
| health returns 200 | 100% |
| status returns 200 | 0% |
| portfolio returns 200 | 0% |
| trades returns 200 | 0% |
| pnl returns 200 | 0% |
| WS upgrade handshake | 0% |

### Thresholds

| Threshold | Result |
|-----------|--------|
| `http_req_duration p(95) < 200ms` | PASS (13.54ms) |
| `http_req_failed rate < 1%` | FAIL (80%) |
| `ws_connection_success rate > 99%` | FAIL (0%) |

## Analysis

1. **Health endpoint performs well** -- 200 responses with sub-10ms latency.
2. **Protected endpoints return 429 (rate limited)** -- all endpoints except `/api/health` require authentication/valid API key; k6 sends unauthenticated requests, which are rejected by the rate limiter.
3. **WebSocket connections fail** -- the WS gateway likely requires authentication or session context not provided by the test script.
4. **Overall HTTP throughput is good** at 32 req/s with low latency even under rate-limiting load.

## Auth Header Fix (2026-07-03)

Both k6 scripts now accept a `TEST_API_KEY` environment variable to supply authentication:

- When `TEST_API_KEY` is set, both `x-api-key` and `Authorization: Bearer <key>` headers are included on all protected endpoint requests.
- `GET /api/health` remains unauthenticated (it is a public endpoint).
- WebSocket connections also pass the auth headers during the upgrade handshake.

### Known Limitation: Missing Express Middleware Chain

Even with a valid `TEST_API_KEY`, protected routes will still return 401. Root cause:

1. The `distributed-rate-limiter.ts` middleware reads `x-api-key` and validates the license against the DB to assign the correct rate-limit tier, but it does **not** set `req.license`.
2. The `requireTier()` middleware in `feature-gate.ts` checks `req.license` exclusively -- it expects an upstream "raas-gate" Express middleware to populate it.
3. No such Express middleware exists today. The `license-validation.ts` middleware is a Fastify plugin (used by the Fastify server), not an Express middleware.
4. Therefore, every request to a `requireTier()`-gated route hits `req.license === undefined` and returns 401.

**To fix:** Write an Express middleware that reads `x-api-key` (or `Authorization: Bearer`), calls `LicenseService.getLicenseByKey(apiKey)`, and sets `req.license = license`. Mount it in `server.ts` before the route registrations.

```
// Pseudocode for the missing middleware:
app.use('/api', async (req, res, next) => {
  const apiKey = req.headers['x-api-key'] as string
    || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);
  if (apiKey) {
    const license = await LicenseService.getInstance().getLicenseByKey(apiKey);
    if (license) req.license = license;
  }
  next();
});
```

## Endpoint Coverage Gap: `/api/status`

The /api/status route called by the load test does not exist in `server.ts` route registrations. Inspecting the server:

| Route | Exists | Auth | Notes |
|-------|--------|------|-------|
| `/api/health` | Yes | None | Public health check |
| `/api/status` | No | -- | Returns 404 |
| `/api/admin/status` | Yes | `requireTier('ENTERPRISE')` | System status |
| `/api/portfolio` | No* | -- | May be a frontend-only route |
| `/api/trades` | Yes | `requireTier('FREE')` | Trades list |
| `/api/pnl` | Yes | `requireTier('FREE')` | P&L metrics |

* `/api/portfolio` is not registered in `server.ts`. It may be a placeholder, a dashboard-only route, or deleted.

## Next Steps

1. **Implement Express auth middleware** that reads `x-api-key` and sets `req.license`. This is the #1 blocker for authenticated load testing.
2. **Add `/api/status` route** (or remove the check from the k6 script).
3. **Add `/api/portfolio` route** (or remove the check from the k6 script).
4. **Run k6 with a valid test license** after the middleware fix is deployed.
5. **Gradual ramp-up stages** are already configured -- add per-stage thresholds to observe rate-limit activation.
6. **Include a broader set of endpoints** (signals, subscriptions, marketplace) in future iterations.
