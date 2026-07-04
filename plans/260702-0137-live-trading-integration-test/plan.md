---
title: "Live Trading Integration Test + Adapter Hardening"
description: "Paper-mode E2E integration test for Polymarket live trading pipeline + adapter config hardening (env var unification, testnet toggle)"
status: completed
priority: P2
branch: "main"
tags: ["integration-test", "polymarket", "adapter", "live-trading"]
blockedBy: []
blocks: []
created: "2026-07-01T18:44:02.026Z"
createdBy: "ck:plan"
source: skill
sourceReport: "plans/reports/brainstorm-260702-0137-live-integration-test.md"
---

# Live Trading Integration Test + Adapter Hardening

## Overview

Polymarket live trading infrastructure (CLOB adapter, HMAC signer, order manager, position tracker, execution guard, journal, orchestrator) is fully coded and unit-tested — but zero integration tests validate the pipeline end-to-end. Additionally, the adapter hardcodes mainnet (chainId 137, CLOB URL) with no config override, and env var naming is inconsistent (`POLY_*` vs `POLYMARKET_*`).

This plan delivers a paper-mode E2E integration test using real Gamma API data + paper executor, plus adapter hardening (env var unification, `POLY_CLOB_HOST` toggle, chain ID config). No real money, no API keys needed for the test.

## Phases

| Phase | Name | Status | Priority |
|-------|------|--------|----------|
| 1 | [Adapter hardening (env var unification + testnet toggle)](./phase-01-adapter-hardening-env-var-unification-testnet-toggle.md) | Pending | P2 |
| 2 | [Paper-mode E2E integration test](./phase-02-paper-mode-e2e-integration-test.md) | Pending | P1 |
| 3 | [Verification](./phase-03-verification.md) | Pending | P2 |

## Dependencies

- Phase 2 depends on Phase 1 (adapter config must be plumbed before E2E test)
- Phase 3 depends on Phase 1 + Phase 2

## Success Criteria

- [ ] 12-15 E2E tests pass without real API keys
- [ ] `POLY_CLOB_HOST` env var overrides default CLOB URL
- [ ] All 4 env vars accept both old (`POLY_*`) and new (`POLYMARKET_*`) names
- [ ] Chain ID configurable via `POLY_CHAIN_ID` env var
- [ ] 2,783 existing tests still pass (0 regressions)
- [ ] 0 TypeScript errors, ≤95 lint warnings
- [ ] `.env.example` updated with `POLYMARKET_*` + `POLY_CLOB_HOST` + `POLY_CHAIN_ID` vars
- [ ] Gamma API tests skip gracefully if unreachable (temp dir for journal files)

## Validation Log

### Session 1 — 2026-07-02
**Trigger:** `/ck:plan validate` — post-plan critical questions interview
**Questions asked:** 4

### Verification Results
- **Tier:** Standard (3 phases)
- **Claims checked:** 23
- **Verified:** 23 | **Failed:** 0 | **Unverified:** 0
- All 16 file paths confirmed existing. All 7 key symbols confirmed (PolymarketExecutionConfig, buildPolymarketAdapter, chainId param, apiUrl param, cashclawPath, POLY_CLOB_HOST in clob-client.ts).

**Finding:** `gamma-client.ts` is type definitions only (no fetch implementation). E2E test must fetch directly from `https://gamma-api.polymarket.com/markets` — pattern already used in 5+ files: `market-context-builder.ts`, `prediction-accuracy-tracker.ts`, `cycle-end-sniper.ts`, CLI scan command, `gamma-historical-provider.ts`.

#### Questions & Answers

1. **[Risk]** Gamma API network failures in CI?
   - Options: Skip-on-failure | Hard requirement
   - **Answer:** Skip-on-failure (Recommended)
   - **Rationale:** Public endpoint, no SLA. Mocked fallback tests validate logic regardless.

2. **[Architecture]** Journal file path for tests?
   - Options: Temp dir | Default ~/.cashclaw/
   - **Answer:** Temp dir (Recommended)
   - **Rationale:** Safer for CI, parallel runs. No pollution between test runs.

3. **[Scope]** Update .env.example?
   - Options: Include in plan | Defer to follow-up
   - **Answer:** Update .env.example (Recommended)
   - **Rationale:** Keeps operators informed during transition. Minimal scope addition.

4. **[Architecture]** Deprecation timeline for old POLY_* names?
   - Options: Warn only | Hard removal after 30 days
   - **Answer:** Warn only, no removal (Recommended)
   - **Rationale:** No breaking change. Backward compat trumps cleanup urgency.

#### Confirmed Decisions
- Gamma API: skip-on-failure with mocked fallbacks
- Journal: use `os.tmpdir()` for test journal files
- .env.example: include `POLYMARKET_*`, `POLY_CLOB_HOST`, `POLY_CHAIN_ID`
- Deprecation: warn-on-old-names only, no hard removal date

#### Action Items
- [x] Phase 2: use temp dir for journal persistence in tests — propagated to phase-02
- [x] Phase 2: implement skip-on-failure for Gamma API smoke tests — propagated to phase-02
- [x] Phase 1: add .env.example update to implementation steps — propagated to phase-01
- [x] Phase 1: deprecation is warn-only — no expiry check needed — confirmed in phase-01 risk table
