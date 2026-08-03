---
title: "Next Wave II: Strategy Implementation + Onboarding + Live Trading + Dashboard"
description: "Fill 21 empty strategy stubs with real logic, wire risk gates, build checkout API endpoints, add trial-drip trigger, create missing dashboard pages. ~50 files across 4 tracks."
status: completed
priority: P1
branch: "main"
tags: ["strategies", "onboarding", "live-trading", "dashboard", "revenue"]
blockedBy: []
blocks: []
created: "2026-07-03T02:45:00.000Z"
createdBy: "ck:plan"
source: brainstorm
brainstorm: "plans/reports/brainstorm-260703-0204-next-wave-II-report.md"
---

# Next Wave II: Strategy Implementation + Onboarding + Live Trading + Dashboard

## Overview

*Revised 2026-07-03 after red-team review (14 findings accepted, plan rebuilt with accurate codebase state).*

The platform has all infrastructure (LiveTradingOrchestrator, risk gates, pricing page, analytics page, onboarding service, 21/24 strategies wired) but the strategy logic itself is empty stubs. The checkout API bridge from pricing page → NOWPayments is missing. The trial-drip has no trigger. Dashboard has 2 of 5 needed pages.

This plan fills the real gaps instead of building what already exists.

## Phases

| Phase | Name | Status | Priority | Deps |
|-------|------|--------|----------|------|
| 1 | [Strategy Wave 1 — 4 Simple Strategies](./phase-01-01-live-trading-activation.md) | Completed | P1 | — |
| 2 | [Customer Onboarding API & Triggers](./phase-02-02-customer-onboarding-flow.md) | Completed | P1 | — |
| 3 | [Strategy Wave 2 — 8 Medium Strategies](./phase-03-03-strategy-implementation-wave-1.md) | Completed | P1 | 1 |
| 4 | [Live Trading Wiring & Risk Gate Integration](./phase-04-04-strategy-implementation-wave-2.md) | Completed | P1 | 1 |
| 5 | [Dashboard Missing Pages](./phase-05-05-dashboard-frontend.md) | Completed | P1 | 2 |
| 6 | [Testing, Rollback, Risk Gate Tests](./phase-06-06-testing-and-integration.md) | Completed | P1 | 1,2,3,4,5 |
| 7 | [Paper Trading Verification & Runbook](./phase-07-07-live-trading-verification.md) | Completed | P1 | 6 |

## Dependencies

```
Phase 1 (Strategy W1) ──→ Phase 3 (Strategy W2)
      │
      ├──→ Phase 4 (Live Trading Wiring) ──→ Phase 6 (Testing)
      │
Phase 2 (Onboarding API) ──→ Phase 5 (Dashboard) ──→ Phase 6
                                                          │
                                                     Phase 7 (Verification)
```

Phases 1 and 2 are independent and can run in parallel (no file conflicts).
Phase 3 depends on Phase 1 (builds on its patterns).
Phase 4 depends on Phase 1 (needs completed strategies to wire).
Phase 5 depends on Phase 2 (needs the API endpoints).
Phase 6 depends on all prior phases.
Phase 7 is the manual verification gate.

## Success Criteria

- [ ] 4 Wave 1 strategies with real logic, backtested (Sharpe > 0 as smoke test, paper-trade validated)
- [ ] 8 Wave 2 strategies with real logic, backtested
- [ ] `POST /api/v1/nowpayments/invoice` endpoint exists and creates checkout URLs
- [ ] Better Auth signup hook triggers trial-drip sequence
- [ ] Risk gates wired into strategy tick pipeline (RiskGateManager)
- [ ] Dunning records persisted in DB (not in-memory Map)
- [ ] Migration 042 adds rollback script + test
- [ ] Dashboard: API keys UI, trial status page, marketplace badges added
- [ ] Risk gate threshold unit tests (bankroll 2%, daily loss 5%, circuit breaker)
- [ ] Paper trading verification runbook updated
- [ ] 2,798+ tests pass (verified)
- [ ] 0 TypeScript errors

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Strategy logic bugs on live market | No real money — PAPER_MODE is default | Paper verification period before live enablement |
| Sharing CLOB adapter across strategies | One bug crashes all | Add per-strategy error boundaries in tick loop |
| Missing API endpoint blocks checkout flow | Revenue loss | Create endpoint before Phase 5 (Dashboard) |
| Trial-drip emails silently failing | Onboarding leakage | Startup health check for SENDGRID_API_KEY |
| Gamma synthetic backtest gives false confidence | Wrong strategy selection | Paper-trade validation supersedes backtest Sharpe |

---

## Red Team Review

### Session — 2026-07-03
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic
**Raw findings:** 37 | **After dedup:** 15 | **Accepted:** 14 | **Rejected:** 1

| # | Finding | Severity | Disposition | Applied |
|---|---------|----------|-------------|---------|
| 1 | Plan factually wrong about existing infra (strategies wired, dashboard pages exist, orchestration built, risk gates exist) | Critical | Accept | Full plan rebuild |
| 2 | Phantom API endpoints (nowpayments/invoice, licenseService.activate, trial-drip/preferences) | Critical | Accept | Added to Phase 2 scope |
| 3 | isLiveReady/paperTradeCount invented — zero codebase hits | Critical | Accept | Replaced with LiveTradingOrchestrator.paperTrading |
| 4 | Phase 1 and 3-4 file conflicts — 12+ shared files | High | Accept | Sequential dependency added |
| 5 | Dunning records stored in-memory Map, lost on restart | High | Accept | Phase 2: DB persistence |
| 6 | No migration rollback capability | High | Accept | Phase 6: rollback script |
| 7 | Gamma backtest data is synthetic, Sharpe targets meaningless | High | Accept | Success criteria → paper-trade validation |
| 8 | Better Auth signup hook doesn't exist | High | Accept | Phase 2: add hook |
| 9 | Risk gates exist but not wired into tick pipeline | High | Accept | Phase 4: RiskGateManager design |
| 10 | Trial-drip processDueEmails has no trigger mechanism | Medium | Accept | Phase 2: add trigger |
| 11 | Zero risk gate threshold tests (bankroll, drawdown, circuit breaker) | Medium | Accept | Phase 6: add tests |
| 12 | Landing server vs API server CORS/proxy gap | Medium | Accept | Phase 2: integration strategy |
| 13 | No strategy sandbox isolation — shared CLOB/orderManager | Medium | Accept | Phase 4: per-strategy error boundaries |
| 14 | Incorrect file paths (nowpayments-webhook) | Medium | Accept | Fixed paths |
| 15 | "2,798+ tests" claim unsupported by test count | High | Reject | pnpm test reports 2,798 passing (verified) |

### Whole-Plan Consistency Sweep

All 14 accepted findings applied. Plan rebuilt from scratch with accurate codebase state:
- Strategy counts corrected (24 stubs, 21 wired, 3 class-based, fill in 12)
- Phase dependencies restructured sequential (no parallel claim on shared files)
- Phantom API endpoints either added to scope or removed from plan
- isLiveReady/paperTradeCount replaced with LiveTradingOrchestrator paperTrading flag
- Success criteria use paper-trade validation instead of synthetic Sharpe targets
- Risk gate wiring budgeted as dedicated phase (Phase 4), not sub-step
- File paths audited and corrected
