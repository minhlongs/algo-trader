# Phase 02 — Health Contract Reconciliation (evidence)

**Completed:** 2026-10-20T09:43:16Z

## Change 1: register /api/health alias

`src/platform/workers/edge-proxy.ts` (line ~74):
```ts
if (path === '/api/health' && request.method === 'GET') return handleHealthRoute(env, routingEnabled);
```
Alias shares the existing `handleHealthRoute` implementation — no second copy (DRY).

## Change 2: two PRE-EXISTING worker build errors found while verifying (not caused by this plan)

Discovered because `tsconfig.worker.json` declares `"exclude": []` (empty) while `include` takes
`src/**` globs, which also pull in test files, so `wrangler dev` could not build the worker at all.
Building the worker with tests excluded surfaced two genuine source errors:

| File | Error | Fix |
|------|-------|-----|
| \`src/regions/region-health-monitor.ts:11\` | TS1205 re-exporting a type under \`isolatedModules\` | \`export {\` → \`export type {\` |
| \`src/platform/workers/edge-proxy-metrics.ts:9,13\` | TS2724 \`getRegionHealth\` not exported (function never existed) | use the real \`getCachedRegionHealth\` (same signature, returns healthy on cold cache) |

Both errors exist on pristine `HEAD` (verified by stashing this repo's changes) — they were
pre-existing, NOT introduced by this plan.

## Verification (fail-open check)

`src/platform/workers/__tests__/edge-proxy-health-route.test.ts` — 5 tests.
Proved the test is real, not vacuous: with the alias line deleted, 2 of 5 FAIL; restored, 5/5 pass.

```
alias removed   → 2 failed | 3 passed
alias restored  → 5 passed
```

Worker build (`tsc` with tests excluded): **0 errors** after the fix; 3 errors before.

## Phase 02 exit criteria

- [x] `/api/health` returns 200 in the worker test harness
- [x] body parity with `/health` asserted
- [x] never 501 on the aliased path (regression-guarded)
- [x] no secret-bearing fields in payload (asserted by test)
- [x] `npx tsc --noEmit` → 0 errors
- [x] worker suites green
- [ ] **NOT verified against production** — only happens after a deploy
