---
title: "Next Wave III — From Built to Revenue-Producing"
description: "4 independent parallel tracks: Revenue Engine, Trading Edge Feedback Loop, Infrastructure Survival, Customer Activation"
status: pending
priority: P0
branch: main
tags:
  - revenue
  - trading-edge
  - infrastructure
  - customer-activation
  - parallel
blockedBy: []
blocks: []
created: "2026-07-03T17:27:00.000Z"
createdBy: "ck:plan — deep + parallel"
source: brainstorm
brainstorm: plans/260703-1727-next-wave-III-brainstorm/reports/brainstorm-260703-1727-next-wave-III-report.md
---

# Next Wave III — From Built to Revenue-Producing

## Overview

Three months of build delivered 2,798 passing tests, 52+ strategy definitions, full billing persistence, and a multi-tenant marketplace — but **zero paying users** and **zero validated trading edge**. This wave inverts the priority: revenue before features, edge before scope, survival before scale.

The goal is to prove the a16z solo thesis produces **cash**, not just clean code.

## Phase Structure

| Phase | Name | Effort | Status |
|-------|------|--------|--------|
| **A** | [Revenue Engine](./phase-a-revenue-engine.md) | M (2-4 wk) | Pending |
| **B** | [Trading Edge Feedback Loop](./phase-b-trading-edge-feedback-loop.md) | M (2-3 wk) | Pending |
| **C** | [Infrastructure Survival Baseline](./phase-c-infrastructure-survival.md) | M (2-3 wk) | Pending |
| **D** | [Customer Activation](./phase-d-customer-activation.md) | M (2-4 wk) | Pending |
| **E** | [Verify & Merge](./phase-e-verify-merge.md) | S | Pending |

**Phases A-D run in parallel.** Phase E runs after all four are complete.

## Track Time Allocation (Solo Operator)

| Track | Allocation | Rationale |
|-------|-----------|-----------|
| A: Revenue | **40%** | Directly generates cash |
| B: Trading Edge | **25%** | Validates core value prop |
| C: Infrastructure | **20%** | Risk mitigation at 10+ subs |
| D: Customer | **15%** | Unlocks growth |

## Success Criteria

- [ ] **$1+ revenue** from a paying subscriber (tier activated in DB)
- [ ] **66%+ win rate** on paper trades (up from ~55-60%)
- [ ] **Daily PostgreSQL backup** — automated, restore-drill verified
- [ ] **10 active paid subscribers** (non-FREE, >7 days since signup)
- [ ] **1000+ VUs** authenticated load test with p95 < 500ms
- [ ] **Telegram bot** responding to /campaign /status /results with live data
- [ ] **31 dashboard pages** bilingual (EN/VN)
- [ ] **2,798+ tests passing**, 0 TS errors
- [ ] **Referral code generation** wired on signup

## Fastest Path to First Dollar

1. **Days 1-3:** Fix NOWPayments IPN callback (Track A #2)
2. **Days 4-7:** Add annual prepay at 20% discount (Track A #1)
3. **Days 8-10:** Reach out to past failed crypto payments — offer 1 month free PRO
4. **Days 10-14:** Verify subscriber activation. First $1+ collected.

## Risk Watch

| Risk | Mitigation |
|------|-----------|
| 23 strategy stubs = negative edge | Backtest top 10 first, pre-frame marketing |
| M1 Max hits limits at 100 subs | Load test at 100/500/1000 VUs early |
| Single-operator burnout (4 tracks) | Weekly "kill or continue" review. Tracks die. |

## Key Files

- Brainstorm: `plans/260703-1727-next-wave-III-brainstorm/reports/brainstorm-260703-1727-next-wave-III-report.md`
- Docs: `docs/development-roadmap.md`, `docs/project-changelog.md`
- Source: `src/platform/`, `src/desk/`, `src/shared/`
- Tests: `tests/`, `src/desk/strategies/__tests__/`
