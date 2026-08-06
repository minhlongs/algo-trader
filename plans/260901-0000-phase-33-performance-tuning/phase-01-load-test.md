# Phase 01: Load Test 5000+ Concurrent

**Priority:** P0 — Block all other phases
**Status:** COMPLETE
**Updated:** 2026-08-06

## Overview
Prove system handles 5000+ concurrent users with p95<100ms, errors<1%, memory<128MB using k6.

## Key Insights
- 12 shards × 417 RPS target = 5000+ RPS
- Consistent hashing must match production (FNV-1a)
- Thresholds encode acceptance criteria directly

## Requirements
- k6 passes at 5000+ RPS
- p95 latency <100ms, p99 <250ms
- Error rate <1%
- Memory usage reported and passes max<128MB

## Architecture
k6 → edge proxy → shard router → strategy workers

## Related Code Files
- `scripts/load-test-sharding.ts`
- `scripts/load-test-config.ts`
- `scripts/load-test-memory.ts`
- `.github/workflows/load-test.yml`

## Implementation Steps
1. Fix gauge threshold format for memory metric
2. Validate shard count × RPS target = 5000+
3. Ensure handleSummary reports pass/fail per criterion
4. Verify CI workflow runs load test on PR

## Todo List
- [x] Fix k6 gauge threshold (Task #1)
- [x] BASE_URL env var support (Task #2) — `load-test-config.ts` reads `LOAD_TEST_BASE_URL` with fallback to localhost
- [x] Update CI workflow thresholds — `.github/workflows/load-test.yml` runs all 5 suites + validate script that exits non-zero if benchmarks fail
- [x] Document run command (Task #4) — see Run Command section below

## Run Command

```bash
# Set target (uses localhost by default)
export LOAD_TEST_BASE_URL=http://localhost:3000

# Single suite
k6 run scripts/load-test-sharding.ts

# All suites (CI-style)
k6 run --out json=reports/shard-stress.json    scripts/load-test-sharding.ts
k6 run --out json=reports/region-latency.json  scripts/load-test-multi-region.ts
k6 run --out json=reports/memory-pressure.json --vus 1000 --duration 10m scripts/load-test-memory.ts
k6 run --out json=reports/failover.json        scripts/load-test-failover.ts
k6 run --out json=reports/queue-backpressure.json scripts/load-test-queue-backpressure.ts

# Validate all
node scripts/generate-load-summary.js reports/
node scripts/validate-load-results.js reports/
```

Thresholds: p95 <100ms, p99 <250ms, error rate <1%, memory <128MB

## Success Criteria
- `k6 run scripts/load-test-sharding.ts` passes thresholds
- CI workflow present and configured
- REPORT: plans/reports/phase-01-load-test-report.md

## Risk Assessment
- k6 version may not support gauge max threshold → use trend p(95) instead
- Hot shards if strategies unevenly distributed → verify hash distribution

## Security Considerations
- Test endpoints must return 200, not execute real trades (backtest:true)

## Next Steps
- Phase 02 depends on baseline metrics from this phase
