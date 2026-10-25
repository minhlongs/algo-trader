# Phase 04 — Load-Test Gate Parameterization (evidence)

**Completed:** 2026-10-20T11:00:47Z

## The load test was testing endpoints that do not exist

The previous test (`tests/load/raas-gateway-load-test.js`, and its CI twin) probed:

| Endpoint | Worker route? |
|----------|---------------|
| /api/health | YES |
| /api/status | **NO** |
| /api/portfolio | **NO** |
| /api/trades | **NO** |
| /api/pnl | **NO** |
| /ws (upgrade) | **NO** — worker registers no WebSocket |

The VPS backend was removed (`notImplementedResponse` returns exactly that message for
unregistered /api/* paths), so 5 of 6 probes could only ever return 501/404. Running
12k RPS against that test would have measured the cost of returning errors.

## New test: tests/load/api-gateway-load-test.js

- Uses k6 `constant-arrival-rate` at `TARGET_RPS` (default 12000) so the pass criterion is
  **measured requests/second**, not a VU count that only implies RPS.
- Rotates the 5 routes the Worker actually serves publicly.
- Thresholds match the documented gate: p95<100ms, error rate <1%.
- No `sleep()` — the arrival-rate executor owns pacing, so a sleep would silently under-deliver.

## Verified (smoke, 12s @ 20 rps, against live host)

```
all 5 routes            → target_success 78.00% (188/241), 22% failures
excluding /api/health   → target_success 100.00%, http_req_failed 0.00%
```

Per-route probe confirms the 22% is entirely the not-yet-deployed `/api/health` fix:

```
/api/health                    ok=0  bad=5   (501 — Phase 02 not deployed yet)
/metrics                       ok=5  bad=0
/api/version                   ok=5  bad=0
/api/markets                   ok=5  bad=0
/api/v1/subscriptions/tiers    ok=5  bad=0
```

So the test is sound: the only failures trace to one known, in-flight change.

## Real finding: p95 already fails the gate at trivial load

```
http_req_duration p95 = 110-112ms   (gate requires <100ms)
measured at only 20 RPS on a single-region CF Worker
```

This is a genuine capacity signal, not a test artifact: at 20 RPS the p95 is already ~12% over
the documented 100ms budget. Any 12k RPS run will almost certainly fail the p95 gate for
infrastructure/single-region reasons. **Recorded for Phase 08; do not discover this after 30 min.**

## Gate status after this phase

- `package.json` test:load / test:load:ci now run the real API surface at 12k RPS explicitly.
- `test:load:smoke` added (50 RPS / 30s) as the safe pre-flight.
- CI (`load-test.yml`) still runs the 4 legacy scripts and uploads artifacts + validates.
- **No CI workflow runs a 12k RPS test.** `deploy.yml` runs the CI twin at VUS=50 for 20s only.
- `plans/reports/load-test-baseline-report.md` (2026-08-16) is a PREPARATION plan, not a result —
  it contains no measured numbers. The 12k gate has never been executed.
  `tests/load/scaling-target-12k-rps.js` exists but nothing invokes it.
