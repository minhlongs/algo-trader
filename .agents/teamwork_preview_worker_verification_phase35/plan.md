# Verification Plan - Phase 35

This plan outline the steps to perform backend/frontend compilation validation, test suite run, scanning modified/untracked files for `any` or `@ts-ignore`, and compiling the results into `handoff.md`.

## Steps

### Step 1: Compile Backend Code
- Command: `npx tsc --noEmit` from root.
- Verification: Exit code 0, no typescript errors.

### Step 2: Compile Frontend Dashboard Code
- Command: `npx tsc --noEmit` inside `dashboard/` directory.
- Verification: Exit code 0, no typescript errors.

### Step 3: Run Full Test Suite
- Command: `npm test` or `npx vitest run` or check package.json for test script.
- Verification: 100% test pass.

### Step 4: Scan for `any` or `@ts-ignore` in modified/untracked code files
- Scan all listed TS files:
  - `src/api/__tests__/api.test.ts`
  - `src/api/routes/admin.ts`
  - `src/api/routes/audit-routes.ts`
  - `src/api/routes/license-routes.ts`
  - `src/api/server.ts`
  - `src/arbitrage/trading-loop.ts`
  - `src/db/migration-runner.ts`
  - `src/execution/order-executor.ts`
  - `src/lib/license-key-crypto.ts`
  - `src/raas/__tests__/subscriber-executor.test.ts`
  - `src/raas/subscriber-executor.ts`
  - `src/risk/circuit-breaker.ts`
  - `src/risk/drawdown-monitor.ts`
  - `src/trading-pipeline.ts`
  - `tests/integration/db-migration-numbering-discipline-sync.test.ts`
  - `tests/integration/migration-prefix-integrity.test.ts`
  - `src/api/__tests__/credentials.test.ts`
  - `src/api/__tests__/rate-limit.test.ts`
  - `src/api/routes/__tests__/audit-routes.test.ts`
  - `src/api/routes/credentials-routes.ts`
  - `src/audit/__tests__/tenant-audit-chain.test.ts`
  - `src/audit/tenant-audit-log.ts`
  - `src/db/tenant-credentials-repository.ts`
  - `src/lib/credentials-crypto.ts`
  - `src/middleware/distributed-rate-limiter.ts`
  - `tests/unit/credentials-crypto.test.ts`
- Verification: Ripgrep/grep search or AST checks. No match of `@ts-ignore` or `: any` (except allowed ones or confirm none are introduced/present). Wait, the rule says "Ensure no `any` or `@ts-ignore` are present in any of the newly modified files."

### Step 5: Write Detailed Report to `handoff.md`
- Verification: File generated with Observation, Logic Chain, Caveats, Conclusion, Verification Method.
