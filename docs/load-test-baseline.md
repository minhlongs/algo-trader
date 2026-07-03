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

## Gap

The existing load test script (`tests/load/raas-gateway-load-test.js`) does not include auth headers or API key setup, so it only validates public endpoint behavior. A meaningful load test requires either:
- A test-specific auth bypass mode on the API, or
- Pre-provisioned test credentials injected via env vars.

## Next Steps

- Add auth token acquisition to the k6 script for authenticated endpoint coverage.
- Add gradual ramp-up stages to observe rate-limit activation thresholds.
- Include a broader set of endpoints (signals, subscriptions, marketplace).
