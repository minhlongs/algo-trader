# Phase 03 — Verifier Host/Path Correction (evidence)

**Completed:** 2026-10-20T10:21:11Z

## Scope grew: 8 files used the dead host, not 1

Initial plan named only `final-integration-check.js`. A sweep found **23 occurrences of
`algo-trader.workers.dev` across 8 scripts**, of which several are referenced by CI/docs
(`deploy-multi-region.sh` 11 refs, `verify-multi-region.sh` 8). Fixing them one-by-one would
repeat the same edit 8 times, so a single shared source of truth was added instead (DRY).

## New: scripts/lib/host-contract.sh

Exports `API_HOST`, `API_BASE_URL`, `API_HEALTH_URL`, `API_RING_URL`, `API_METRICS_URL`,
plus `MULTI_REGION_ENABLED=0` so scripts cannot fabricate per-region hosts.

## Fixed

| File | Was | Now |
|------|-----|-----|
| \`scripts/final-integration-check.js\` | 3 regions all → dead host; 4 checks | real host; 3 unauth + 1 authed (401 = auth-required, not failure) |
| \`scripts/deploy-region.sh\` | built dead health URL, would hang 50s then exit 1 | sources host-contract.sh |
| \`scripts/verify-multi-region.sh\` | dead host ×3; probed 2 non-existent paths; compared \`status == "healthy"\` but worker returns \`"ok"\`; read \`.latencyMs\` which the payload never has | shared host; probes \`/api/health\` only; expects \`ok\`; measures round-trip |

## Bugs found beyond the hostname (all pre-existing)

1. `verify-multi-region.sh` compared against `"healthy"` while the worker returns `"ok"`
   → status could never be green even with a correct host.
2. It read `.latencyMs`, a field the health payload does not contain → latency always N/A.
3. `final-integration-check.js` listed 3 regions that all mapped to the same host — no
   multi-region verification was actually happening.

## Verified

```
final-integration-check.js  → host resolves; /metrics 200, shardRing 401 (auth),
                               /api/health 501 (expected: fix not yet deployed)
verify-multi-region.sh      → 1 real region; healthy-payload simulation returns status 'ok'
                               so the check goes green once /api/health ships
bash -n + shellcheck --severity=warning → 0 issues on both scripts
git diff scripts/ci-gate-deploy-smoke.mjs → empty (Gate 5 deliberately untouched)
```

## Not done (recorded, not silently dropped)

Remaining dead-host refs still in: `deploy-multi-region.sh`, `verify-edge-multi-region-live.ts`,
`load-test-config.ts`, `load-test-failover.ts`, `load-test-queue-backpressure.ts`,
`load-test-multi-region.ts`. These are multi-region tooling that cannot be correct until
multi-region actually exists; fixing their hostnames alone would only make them fail
earlier. Left for a dedicated multi-region phase and flagged in Phase 06 docs.
