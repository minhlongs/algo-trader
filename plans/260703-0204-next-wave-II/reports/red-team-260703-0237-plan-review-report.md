# Red Team Report — Next Wave II Plan

**Date:** 2026-07-03
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic
**Method:** 4 parallel adversarial reviewers, each running grep/glob evidence against the actual codebase

---

## Red Team Findings

### Finding 1: Plan factually wrong about existing infrastructure — CRITICAL
**Reviewer:** Scope Critic + Failure Mode + Security Adversary (all 4)
**Location:** All phases

Multiple false claims about what already exists:
- "23 no-op strategy stubs" → actually 24, with 21 already wired in strategy-wiring.ts
- "Wire all 23" → wiring is already done for 21/24
- "Build live trading activation" → LiveTradingOrchestrator (361 lines) already fully built
- "Create dashboard pages" → pricing-page.tsx and analytics-page.tsx already exist
- "Risk gates need building" → circuit-breaker.ts, drawdown-monitor.ts, kelly-position-sizer.ts, live-execution-guard.ts all exist
- "Onboarding needs building" → onboarding-service.ts already handles signup/activation/email drip
- The plan was written without auditing the actual codebase state
- **Disposition:** ACCEPT

### Finding 2: Phantom API endpoints — CRITICAL
**Reviewer:** Failure Mode + Security Adversary + Assumption Destroyer
**Location:** Phase 2, Phase 5

Plan claims these endpoints/functions exist but grep proves otherwise:
- `POST /api/v1/nowpayments/invoice` — does not exist (nearest: coupon-routes.ts creates invoices internally)
- `PUT /api/v1/trial-drip/preferences` — does not exist (routes have 5 endpoints, none for preferences)
- `licenseService.activate()` — does not exist (LicenseService has no activate method)
- `GET /pricing (static HTML)` — no Express route serves pricing.html
- **Disposition:** ACCEPT

### Finding 3: Paper→live gate uses invented interfaces — CRITICAL
**Reviewer:** Scope Critic + Failure Mode + Security Adversary
**Location:** Phase 1 steps 5-6, Phase 7 requirements

`isLiveReady()`, `paperTradeCount`, `paperSharpe` — zero grep hits across entire codebase. These are invented constructs the plan treats as existing. The paper→live verification gate is the plan's primary safety mechanism but it doesn't exist at any level.
- **Disposition:** ACCEPT

### Finding 4: Phase 1 and 3-4 have direct file conflicts — HIGH
**Reviewer:** Scope Critic + Assumption Destroyer
**Location:** Plan.md Dependencies section

Plan claims "All phases 1-5 are independent and can run in parallel." But 12+ strategy files appear in BOTH Phase 1 (wire execution) and Phase 3/4 (add logic). These phases cannot run parallel on shared files — the changes would conflict.
- **Disposition:** ACCEPT

### Finding 5: Dunning records stored in-memory — HIGH
**Reviewer:** Failure Mode Analyst
**Location:** Phase 2

DunningService stores all records in a `Map<string, DunningRecord>`. Every restart wipes payment-failure state. No persistence, no recovery.
- **Disposition:** ACCEPT

### Finding 6: No migration rollback capability — HIGH
**Reviewer:** Failure Mode Analyst
**Location:** Phase 6, migrations 039-041

Each migration has a `down()` function but there's no rollback script or command. A failed migration leaves the DB in an inconsistent state with no automated recovery.
- **Disposition:** ACCEPT

### Finding 7: Gamma backtest data is synthetic — HIGH
**Reviewer:** Assumption Destroyer
**Location:** Phase 3, 4 success criteria

GammaHistoricalProvider explicitly generates synthetic data ("Limitation: Gamma API only provides current snapshot"). Backtest Sharpe targets (0.3-0.5) from synthetic data are meaningless as success criteria.
- **Disposition:** ACCEPT

### Finding 8: Better Auth signup hook doesn't exist — HIGH
**Reviewer:** Security Adversary
**Location:** Phase 2

Plan assumes Better Auth signup hook triggers trial-drip emails. auth-server.ts has zero hooks, zero plugins, zero signup callbacks.
- **Disposition:** ACCEPT

### Finding 9: Risk gates not wired into tick pipeline — HIGH
**Reviewer:** Assumption Destroyer
**Location:** Phase 1 Architecture

Risk classes (CircuitBreaker, PositionManager, KellyPositionSizer) exist standalone but have ZERO integration with strategy tick functions. BasePolymarketStrategy doesn't import or reference any risk module. Wiring 23 strategies with risk gates is a substantial architectural effort the plan treats as trivial.
- **Disposition:** ACCEPT

### Finding 10: Trial-drip has no trigger mechanism — MEDIUM
**Reviewer:** Failure Mode Analyst
**Location:** Phase 2

`processDueEmails()` defines the method but nothing calls it. No cron, no trigger, no schedule. The plan doesn't specify how the drip sequence starts.
- **Disposition:** ACCEPT

### Finding 11: Strategy test coverage negligible — MEDIUM
**Reviewer:** Failure Mode Analyst
**Location:** Phase 1, 3, 4

60+ strategy files, only 2 test files. Zero risk gate threshold tests (bankroll, daily loss, circuit breaker). The plan's core safety promise depends on gates that have no test coverage.
- **Disposition:** ACCEPT

### Finding 12: Landing server vs API server integration — MEDIUM
**Reviewer:** Failure Mode Analyst
**Location:** Phase 2, 5

Landing server (pure Node.js HTTP) and API server (Express port 3000) are separate processes. Pricing page CTA making API calls hits CORS/proxy issues. The plan doesn't address which integration strategy to use.
- **Disposition:** ACCEPT

### Finding 13: Strategy sandbox isolation absent — MEDIUM
**Reviewer:** Security Adversary
**Location:** Finding of omission — no phase addresses this

24 strategies share the same `clobClient`, `orderManager`, `eventBus`. A bug in one strategy can corrupt shared state and affect all others.
- **Disposition:** ACCEPT

### Finding 14: Incorrect file paths in plan — MEDIUM
**Reviewer:** Security Adversary
**Location:** Phase 2

`src/platform/api/webhooks/nowpayments-webhook` should be `src/platform/api/routes/webhooks/nowpayments-webhook.ts`. Signals plan was written without reading actual file structure.
- **Disposition:** ACCEPT

### Finding 15: "2,798+ tests" claim — REJECTED
**Reviewer:** Failure Mode Analyst
**Location:** All phases

Reviewer claimed ~993 test/it calls vs 2,798. But `pnpm test` actually reports 2,798 passing (verified). Parameterized tests, multi-assertion tests, and tests outside `src/` account for the difference.
- **Disposition:** REJECTED — actual test count is verified correct

---

## Summary

| Severity | Count | Accepted | Rejected |
|----------|-------|----------|----------|
| Critical | 4 | 4 | 0 |
| High | 5 | 5 | 0 |
| Medium | 5 | 5 | 0 |
| Rejected | 1 | — | 1 |

**Total accepted:** 14 findings

## Key Risks Addressed (If Applied)

1. Plan will be revised with accurate codebase state (no phantom infrastructure)
2. Missing API endpoints will be created or plan references removed
3. Paper→live gate will use existing LiveTradingOrchestrator, not invent new interfaces
4. Phase 1 and 3-4 will be restructured as sequential, not parallel
5. Dunning persistence, migration rollback, trial-drip triggering will be explicitly planned
6. Backtest success criteria will be scoped to paper-trading validation, not synthetic Sharpe
7. Risk gate wiring will be budgeted as architecture work, not a sub-step
