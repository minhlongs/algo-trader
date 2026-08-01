# Phase 5: Verify Tests

**Agent:** tester
**Depends on:** Phases 1-4 complete

## Test commands

Run in order:

1. npx vitest run src/platform/audit/__tests__/audit-hooks.test.ts
   - Expect 6/6 pass (was 5/5, now 6 with new upsert emitter test)

2. npx vitest run src/forest/rate-limit/__tests__/redis-rate-limiter.test.ts
   - Expect all existing tests pass
   - Verify endpoint parameter is covered (may need new test case)

3. npx vitest run src/platform/audit/__tests__/tenant-audit-chain.test.ts
   - Verify chain verification still passes

4. npx vitest run src/platform/audit/__tests__/immutable-trade-audit.test.ts
   - Verify trade audit still passes (trading-pipeline.ts change should not break file-based audit)

## Acceptance

- All 4 test suites pass
- No TypeScript errors: npx tsc --noEmit
- Coverage for audit-hooks.ts remains 100%
