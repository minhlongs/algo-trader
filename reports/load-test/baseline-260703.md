# Load Test Baseline — 2026-07-03

**Script:** `tests/load/raas-gateway-load-test.js`
**Target:** Full Docker stack (localhost:3000)
**Purpose:** Establish baseline performance characteristics for regression detection.

---

## Configuration

| Parameter | Value |
|-----------|-------|
| VUs (ramping) | 0 -> 5000 -> 0 |
| Steady state | 5 min |
| Ramp up | 1 min |
| Ramp down | 1 min |
| HTTP endpoints | `/api/health`, `/api/status`, `/api/portfolio`, `/api/trades`, `/api/pnl` |
| WebSocket | Connect + subscribe to 4 channels (signals, pnl, trades, price_update) |

## Thresholds

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| `http_req_duration` | p(95) < 200ms | Target p95 latency for REST endpoints |
| `http_req_failed` | rate < 0.01 | Less than 1% failure rate |
| `ws_connection_success` | rate > 0.99 | 99%+ WebSocket connection success |

## CI Variant

For CI pipelines, use `tests/load/raas-gateway-load-test.ci.js`:

| Parameter | Value |
|-----------|-------|
| VUs (ramping) | 0 -> 100 -> 0 |
| Steady state | 30s |
| Ramp up/down | 10s |
| Threshold: http_req_duration | p(95) < 500ms |
| Threshold: http_req_failed | rate < 0.05 |
| Threshold: ws_connection_success | rate > 0.95 |

## Expected Baseline Values (to be filled after first run)

```
http_req_duration..............: avg=XXms   p(95)=XXms
http_req_failed................: X.XX%
ws_connection_success..........: X.XX%
```

**Note:** Run `k6 run tests/load/raas-gateway-load-test.js --summary-export=reports/load-test/baseline-260703.json` against a deployed staging environment to capture actual values. The previous run showed 53.84% failure rate — re-run after any performance fixes.

## Regression Check

Before each major release:
1. Run the same load test against staging
2. Compare p95 latency and error rate against this baseline
3. If p95 increased >20% or error rate >2x baseline, investigate before deploying
