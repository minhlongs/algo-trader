# Phase 01: Load Test 5000+ Concurrent

**Priority:** P0
**Status:** PARTIAL — scripts exist, tests never confirmed passing
**Updated:** 2026-08-07

## Overview
Prove system handles 5000+ concurrent users with p95<100ms, errors<1%, memory<128MB using k6.

## Verified
- `scripts/load-test-sharding.ts` — k6 sharding test (12 shards, 52 strategies, FNV-1a hash)
- `scripts/load-test-config.ts` — BASE_URL via `LOAD_TEST_BASE_URL` env var
- `scripts/load-test-memory.ts` — 1000 VU memory pressure test
- `.github/workflows/load-test.yml` — CI runs 5 k6 suites
- Supporting scripts: `load-test-multi-region.ts`, `load-test-failover.ts`, `load-test-queue-backpressure.ts`, `generate-load-summary.js`, `validate-load-results.js`

## Blocked
- k6 never confirmed to hit 5000+ VUs with p95<100ms, errors<1%
- Profiling report shows 33.4% error rate — needs investigation
- Memory metric shows N/A (gauge only, not measured)

## Requirements (unverified)
- k6 passes at 5000+ RPS
- p95 latency <100ms, p99 <250ms
- Error rate <1%
- Memory usage <128MB

## Architecture
k6 → edge proxy → shard router → strategy workers

## Related Code Files
- `scripts/load-test-sharding.ts`
- `scripts/load-test-config.ts`
- `scripts/load-test-memory.ts`
- `.github/workflows/load-test.yml`

## Todo List
- [ ] Run k6 sharding test end-to-end and extract real metrics
- [ ] Investigate 33.4% error rate in profiling report
- [ ] Wire memory measurement into k6 output
- [ ] Verify CI workflow passes on green run

## Success Criteria
- `k6 run scripts/load-test-sharding.ts` passes thresholds with real output
- CI workflow runs green on main branch

## Risk Assessment
- k6 version may not support gauge max threshold
- Hot shards if strategies unevenly distributed

## Security Considerations
- Test endpoints must return 200, not execute real trades

## Next Steps
- Phase 02 depends on baseline metrics from this phase
