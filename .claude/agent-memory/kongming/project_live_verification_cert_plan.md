---
name: project-live-verification-cert-plan
description: Production Live Verification & Continuous Trading Risk Health Certification — plan produced 2026-09-30 for main HEAD 631f9848
metadata:
  type: project
---

Plan written to `.orchestrate/latest/plan.md` on 2026-09-30 for task "Production Live Verification & Continuous Trading Risk Health Certification".

**Why:** After shipping PR #128 (15,619 tests, 100% pass, merged to main HEAD `631f9848`), a certification run was requested to prove ongoing operational safety — not just CI gate results, but live risk health of all trading desk modules.

**What the plan covers (10 phases):**
1. Pre-flight: git state, banned imports, eslint headcount
2. TypeScript: `tsc --noEmit` exits 0 (hard gate)
3. Full test suite: `vitest run` 0 failures + targeted risk/LiveGuard/SOR suites + quality ratchet (12 checks)
4. Build: `npm run build` exits 0
5. Risk Engine API: `/health`, VaR, Kelly, Drawdown endpoints on `api.cashclaw.cc`; exchange health runner
6. SOR & LiveGuard: `tests/desk/sor/` + `src/desk/execution/__tests__/live-guard-*`; TieredDrawdownBreaker threshold check
7. Edge smoke: `cashclaw.cc` + `algo-trader.pages.dev` HTTP 200; `smoke-test-protected-flows.mjs`; `ci-gate-deploy-smoke.mjs`
8. EOD Risk Ledger: `src/desk/telemetry/` vitest; HMAC chain gap check
9. Region Health Monitor: config validation + `src/regions/` vitest
10. Report: 11-line verification format + risk health addendum + signed result-verdict.md

**Key invariants learned:**
- SOR tests live at `tests/desk/sor/` (not `src/desk/sor/__tests__/`)
- LiveGuard: 8 test files at `src/desk/execution/__tests__/live-guard-handoff-*.test.ts`
- Polymarket CLOB verification: `scripts/verify-polymarket-connection.ts`
- Quality ratchet floors: lines 95, functions 93, branches 86, statements 94; maxConsoleCalls 2; oversized 0
- Phases 1-4 sequential; phases 5-9 parallel; phase 10 after all

**How to apply:** When next certification run or verification task arrives, inherit this phase structure. Verify tests/desk/ path for SOR hasn't moved.
