---
phase: 4
title: "Infrastructure Hardening"
status: pending
effort: S
---

# Phase 4: Infrastructure Hardening

## Overview
Fix k6 load test auth headers, run baseline, profile one hot path.

## Related Files
- Read: `tests/load/raas-gateway-load-test.js`
- Read: `tests/load/raas-gateway-load-test.ci.js`
- Read: `docs/load-test-baseline.md`

## Sub-Tasks

### D1: Fix k6 auth headers
1. Read existing k6 scripts
2. Add Bearer token header to all protected endpoint requests
3. Add API key auth for authenticated routes
4. Verify endpoints return 200 instead of 429

### D2: Run load test baseline
1. Run: `k6 run tests/load/raas-gateway-load-test.ci.js` (100 VUs, 30s)
2. Record per-endpoint metrics (p50, p95, p99 latency, error rate)
3. Document baseline in docs/load-test-baseline.md

### D3: Profile one hot path (stretch)
1. Choose highest-traffic API endpoint (e.g., GET /api/v1/subscriber/:id/pnl)
2. Run `node --cpu-prof` or clinic.js flamegraph
3. Document findings

## Success Criteria
- [ ] k6 auth headers fixed — endpoints return 200
- [ ] Load test baseline recorded in docs
