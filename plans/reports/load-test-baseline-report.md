# Load Test 12k RPS Baseline Report

**Date:** 2026-08-16
**Purpose:** Prepare load test baseline for algo-trader go-live gating (12k RPS target)
**Work Context:** /Users/macbook/algo-trader

---

## 1. Infrastructure State

### Installed Tools

| Tool | Version | Path | Status |
|------|---------|------|--------|
| k6 | v2.0.0 (go1.26.3, darwin/arm64) | /opt/homebrew/bin/k6 | OK |
| Node.js | present (runtime for validators) | scripts/*.js | OK |

### Load Test Scripts

| Script | Purpose | Target |
|--------|---------|--------|
| `scripts/load-test-sharding.ts` | 12 DO shards x 1000 RPS = 12k RPS | `reports/shard-stress.json` |
| `tests/load/scaling-target-12k-rps.js` | 12k RPS integrated scenario (health/trades/queue) | k6 JSON |
| `scripts/load-test-failover.ts` | Region failover + recovery | `reports/failover.json` |
| `scripts/load-test-multi-region.ts` | Multi-region latency | `reports/region-latency.json` |
| `scripts/load-test-memory.ts` | Memory pressure | `reports/memory-pressure.json` |
| `scripts/load-test-queue-backpressure.ts` | Queue backpressure | `reports/queue-backpressure.json` |
| `scripts/load-test-compliance-api.ts` | Compliance API | `reports/compliance-api.json` |


### Existing Reports (artifact presence)

- `reports/load-test/baseline-260703.md`
- `reports/load-test/failover.json`
- `reports/load-test/memory-pressure.json`
- `reports/load-test/queue-backpressure.json`
- `reports/load-test/region-latency.json`
- `reports/load-test/shard-stress.json`
- `reports/load-test/staging-60s-1000vus`

Note: `baseline-260703.md` documented **53.84% failure rate** on previous run. Baseline was localhost:3000 and predates comprehensive auth integration.

---

## 2. CI/CD Integration

File: `.github/workflows/load-test.yml`

- Manual trigger: `workflow_dispatch` (staging/production)
- Schedule: Weekly Sundays 02:00 UTC
- Env var required in CI: `LOAD_TEST_BASE_URL`, `K6_CLOUD_TOKEN` (optional), `TEST_API_KEY` (for auth)
- Uploads `reports/*.json` as artifacts
- Runs `scripts/generate-load-summary.js` and `scripts/validate-load-results.js`

---

## 3. Baseline Test Plan (Execution)

### Target Endpoints

- `GET /api/health`
- `GET /api/trades?limit=20&offset=0`
- `GET /api/pnl`
- `GET /api/v1/metrics/queues`
- Optional: strategy execution POST (per `scaling-target-12k-rps.js`)

### Environment Variables Required

```
LOAD_TEST_BASE_URL=https://<deployed-target>/      # e.g. https://staging.algo-trader.workers.dev
TEST_API_KEY=<valid test license key>              # if protected endpoints are required
X-Test-Run=true                                    # safety header if supported
TARGET_RPS=12000                                   # default for scaling script
REQS_PER_VU=10                                    # default, controls VU count
```

### Ramp-Up Strategy (12k RPS)

**Primary:** `tests/load/scaling-target-12k-rps.js`
- Compute VUs: `ceil(12000 / 10)` = 1200 VUs
- Recommended stages:
  - warmup 2m to 500
  - step 3m to 1200
  - hold 5m at 1200 (steady 12k RPS target)
  - ramp down 2m to 0

**Secondary (by-suite):**
- Shard: 5m warmup -> 25m target -> 5m ramp-down
- Failover: 5m baseline -> 2m kill simulation -> 5m recovery
- Multi-region: latency probe across regions

### Duration Estimate

| Suite | Duration |
|-------|----------|
| 12k scaling target | ~17 min |
| Sharding | ~35 min |
| Failover | ~12 min |
| Multi-region | ~10 min |
| Memory | ~15 min |
| Queue backpressure | ~10 min |
| **Total (serial)** | **~99 min** |

In CI, suites run in sequence. For local baseline, run individually.

---

## 4. Success Criteria

From `docs/load-testing.md` and `scripts/validate-load-results.js`:

- **p95 latency** < 100ms (shard-scoped)
- **Error rate** < 1%
- **Peak memory** < 128MB per DO/process
- **Failover recovery** p95 < 30s
- **Queue rejection rate** < 5%
- **Multi-region p95** < 100ms
- **Overall**: `validate-load-results.js` must exit 0

---

## 5. Commands to Run

### Quick shortcut (single file baseline)
```bash
export LOAD_TEST_BASE_URL=https://staging.algo-trader.workers.dev
export TEST_API_KEY=...
k6 run tests/load/scaling-target-12k-rps.js --out json=reports/scaling-12k-rps.json
```

### Full suite (matches CI)
```bash
mkdir -p reports
export LOAD_TEST_BASE_URL=https://staging.algo-trader.workers.dev
export TEST_API_KEY=...

k6 run --out json=reports/shard-stress.json scripts/load-test-sharding.ts
k6 run --out json=reports/region-latency.json scripts/load-test-multi-region.ts
k6 run --out json=reports/failover.json scripts/load-test-failover.ts
k6 run --out json=reports/memory-pressure.json scripts/load-test-memory.ts
k6 run --out json=reports/queue-backpressure.json scripts/load-test-queue-backpressure.ts

node scripts/generate-load-summary.js reports/
node scripts/validate-load-results.js reports/
```

### Re-run from CI workflow
```bash
gh workflow run load-test.yml -f environment=staging
gh run watch --exit-status
```

---

## 6. Issues and Recommendations (from prior baseline + infra review)

### Confirmed blockers from baseline docs
1. **Auth middleware gap.** `raas-gateway-load-test.js` requires `x-api-key`/`Bearer` auth middleware on Express. Without it, most endpoints return 401/404 in tests.
2. **Missing route** `/api/portfolio` was not registered in `server.ts` at last documented baseline.
3. **High prior failure rate (53.84%)** — baseline was localhost-only and not representative.

### Document gaps in `scripts/load-test-failover.ts`
- Line 55: missing semicolon after `failoverTriggered = true;` (`console.log(...); failoverTriggered = true;` is correct; safe to fix.)
- Missing `baseUrl` import/definition used by later request code; script may fail at script parse/parse-time unless defined elsewhere in file (the read was truncated). Verify script runs standalone via `k6 run scripts/load-test-failover.ts`.

### Recommended fixes before go-live baseline run
1. Implement test auth middleware for `x-api-key` -> `req.license` mapping (or use route whitelisting for tests).
2. Confirm `reports/` directory exists at repo root before running CI steps.
3. Fix any lint/TS issues in `scripts/load-test-*.ts` (CI should compile TS via k6).
4. Add explicit `--vus` and `--duration` or expand `options.stages` in `scaling-target-12k-rps.js` for deterministic ramp control.

---

## 7. Missing Prerequisites

- Deploy target reachable (`LOAD_TEST_BASE_URL`) — staging traffic should not affect live trading.
- Valid `TEST_API_KEY` if testing protected endpoints.
- Artifact storage/upload enabled for `reports/` in runner.
- For failover simulation: regions must be configured in `scripts/load-test-config.ts` and reachable.

---

## 8. Next Steps

1. Fix load-test script issues noted above.
2. Deploy test auth middleware or whitelist `/api/health`, `/api/trades`, `/api/pnl` for baseline runs.
3. Run `scaling-target-12k-rps.js` against staging and capture `reports/scaling-12k-rps.json`.
4. Validate via `node scripts/validate-load-results.js reports/`.
5. Update `reports/load-test/baseline-YYYYMMDD.md` with captured values and thresholds.
6. Gate go-live on CI `load-test.yml` passing with green results.