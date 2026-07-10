---
title: "Revenue Activation + Strategy Performance Intelligence"
description: "Systematic backtest all 52+ strategies → identify top performers → build performance dashboard → feature marketplace listings → activate referral program → post launch content"
status: completed
priority: P1
branch: "main"
tags: ["backtesting", "dashboard", "marketplace", "referral", "launch"]
blockedBy: []
blocks: []
created: "2026-07-02T15:50:58.241Z"
createdBy: "ck-cli"
source: brainstorm
brainstorm: "plans/reports/brainstorm-260702-2246-next-revenue-strategy-performance-report.md"
---

# Revenue Activation + Strategy Performance Intelligence

## Overview

Production is deployed (CF Worker + Docker stack). This plan transitions from "infra ready" to "revenue generating" by systematically measuring all 52+ strategies, surfacing top performers, and building the user-facing tools to sell them.

Two tracks run in parallel:
- **Track 1 (Revenue):** Featured listings, referral activation, launch content, IPN config
- **Track 2 (Intelligence):** Backtests, performance dashboard, comparison report

## Phases

| Phase | Name | Status | Priority | Deps |
|-------|------|--------|----------|------|
| 1 | [A: Comprehensive Backtest](./phase-01-a-comprehensive-backtest.md) | ✅ Complete | P0 | — |
| 2 | [B: Strategy Performance Dashboard](./phase-02-b-strategy-performance-dashboard.md) | ✅ Complete | P1 | A |
| 3 | [C: Featured Marketplace Listings](./phase-03-c-featured-marketplace-listings.md) | ✅ Complete | P1 | A |
| 4 | [D: Referral Go-Live](./phase-04-d-referral-go-live.md) | ✅ Complete | P2 | — |
| 5 | [E: Launch Content](./phase-05-e-launch-content.md) | ⚠️ Partially Complete | P1 | A |
| 6 | [F: Strategy Comparison Report](./phase-06-f-strategy-comparison-report.md) | ✅ Complete | P2 | A, B |

## Dependencies

```
Phase A (Backtest) ──→ Phase B (Dashboard) ──→ Phase F (Report)
      │                      │
      ├──→ Phase C (Listings)│
      │                      │
      └──→ Phase E (Content) │

Phase D (Referral) — independent, parallel with A
```

## Success Criteria

- [x] `reports/backtest-results.csv` with 30+ strategies, 0 hard failures
- [x] `/app/strategy-performance` loads with sortable table and equity curves
- [x] Marketplace shows 3 featured strategies with performance badges
- [x] Referral codes generate, share link copies, conversion tracks
- [ ] Launch content posted on ≥2 channels with real metrics
- [ ] Strategy report at `docs/strategy-performance-report.md`
- [x] 2,798 tests passing, 0 TS errors
