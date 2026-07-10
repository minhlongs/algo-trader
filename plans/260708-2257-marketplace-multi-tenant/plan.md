---
title: "Phase 36: Marketplace & Multi-Tenant Monetization"
description: "Strategy marketplace (80/20 revenue share), multi-tenant D1 isolation, strategy versioning, backtesting harness, provider dashboard"
status: pending
priority: P1
effort: 8d
branch: main
tags: [marketplace, multi-tenant, billing, strategy, revenue-share]
created: 2026-07-08
---

# Phase 36: Marketplace & Multi-Tenant Monetization

## Overview

Transform algo-trader from a single-tenant trading platform into a multi-tenant marketplace where signal providers publish strategies, subscribers pay per tier, and revenue splits 80/20 (provider/platform).

## Scoped Phases

| # | Phase | Priority | Effort | Status |
|---|-------|----------|--------|--------|
| 1 | Multi-Tenant Schema (PostgreSQL) | P0 | complete | done |
| 2 | Strategy Submission & Versioning | P0 | complete | done |
| 3 | Backtesting Harness (Sandbox) | P1 | complete | done |
| 4 | Provider Dashboard | P1 | complete | done |
| 5 | Revenue Share Calculator | P0 | pending | pending |
| 6 | Strategy Rating & Discovery | P2 | pending | pending |

## Dependency Graph

```
Phase1(tenant schema) ──► Phase2(strategy submission)
Phase2(submission) ──► Phase3(backtesting)
Phase2(submission) ──► Phase4(provider dashboard)
Phase5(revenue share) ◄── Phase4(dashboard shows earnings)
Phase3(backtesting) ──► Phase6(rating uses backtest results)
```

## Key Insights

- Multi-tenant via `tenant_id` FK on all shared tables (standard SaaS pattern, minimal D1 cost)
- Revenue share calculation: 80% provider, 20% platform, settled monthly via D1 ledger
- Backtesting sandbox runs in DO (Durable Object) isolate per provider strategy
- Strategy versioning: semver-like (`major.minor.patch`) with immutable published snapshots

## Acceptance Criteria

- [ ] Providers can register as signal providers via Telegram/Link
- [ ] Providers submit strategies (entry/exit rules, risk params) via API
- [ ] Strategies versioned; subscribers auto-update on minor version bumps
- [ ] Backtesting sandbox validates strategy on historical data before publish
- [ ] Provider dashboard shows: earnings, subscriber count, strategy performance
- [ ] Revenue share calculated automatically; payouts tracked per provider
- [ ] Strategy discovery: subscribers browse/filter/search strategies by tier
- [ ] All existing 1,464+ tests still pass

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Tenant data leak (missing `tenant_id` filter) | Medium | Audit all D1 queries for tenant scoping; add integration tests |
| Backtesting sandbox resource abuse | Medium | Timeout + memory limit per sandbox run |
| Revenue share rounding errors | Low | Use integer cents; round only at display layer |
| Strategy spam/low-quality uploads | Medium | Backtesting gate + community rating |

## Rollback

- New tables `providers`, `strategies`, `strategy_versions`, `revenue_ledger`, `backtest_runs` — no impact on existing tables
- Feature-flag `ENABLE_MARKETPLACE` in wrangler.toml
- Drop new tables = clean rollback

## Files

Phase files contain detailed implementation steps:
- `phase-01-multi-tenant-schema.md`
- `phase-02-strategy-submission.md`
- `phase-03-backtesting-harness.md`
- `phase-04-provider-dashboard.md`
- `phase-05-revenue-share.md`
- `phase-06-strategy-rating.md`
