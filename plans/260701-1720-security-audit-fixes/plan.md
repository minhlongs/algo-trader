# Plan — Security Audit Fixes

**Date:** 2026-07-01 | **Source:** security-audit-260701-golive.md | **Mode:** deep-parallel

## Phase Overview

| # | Phase | Severity | Effort | Status |
|---|-------|----------|--------|--------|
| 01 | Fix console.error → logger (referral-routes) | LOW | 10min | pending |
| 02 | Fix auth secret fail-fast (auth-server) | MEDIUM | 15min | pending |
| 03 | Fix as any type bypass (marketplace-review-routes) | MEDIUM | 1hr | pending |
| 04 | Fix CSP unsafe-eval (dashboard _headers) | HIGH | 30min | pending |
| 05 | Dependency update (pnpm update) | HIGH | 1-2hr | pending |
| 06 | Verify (typecheck + tests) | — | 10min | pending |

## Dependencies

- Phase 01, 02, 03, 04 — independent, can run in parallel
- Phase 05 — independent but risky (may break tests)
- Phase 06 — depends on all

## Success Criteria

- 0 TypeScript errors
- All 2,492 tests pass
- CSP no longer contains unsafe-eval
- Auth server throws at startup if no secret configured
- No console.error in referral-routes.ts
- Proper AuthRequest type in marketplace-review-routes.ts

## Risk

- Phase 05 (pnpm update): axios/undici upgrades may break API calls. Skip if tests fail — rollback individual packages
