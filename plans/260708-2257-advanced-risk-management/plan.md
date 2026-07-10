---
title: "Phase 37: Advanced Risk Management"
description: "Portfolio risk engine: VaR/CVaR, correlation matrix, drawdown alerts, ATR trailing stops, Kelly Criterion position sizing"
status: pending
priority: P1
effort: 6d
branch: main
tags: [risk, var, kelly, portfolio, drawdown, atr]
created: 2026-07-08
---

# Phase 37: Advanced Risk Management

## Overview

Deploy production-grade risk management: compute portfolio-level risk metrics in real-time, enforce position limits, and alert on drawdown breaches.

## Scoped Phases

| # | Phase | Priority | Effort | Status |
|---|-------|----------|--------|--------|
| 1 | VaR/CVaR Engine | P0 | 1.5d | pending |
| 2 | Correlation Matrix | P0 | 1.5d | pending |
| 3 | Drawdown Monitor & Alerts | P1 | 1d | pending |
| 4 | ATR Trailing Stop Engine | P1 | 1d | pending |
| 5 | Kelly Criterion Position Sizer | P1 | 1d | pending |

## Dependency Graph

```
Phase1(VaR) ──► all downstream (risk input)
Phase2(correlation) ──► Phase1 (VaR needs correlation)
Phase3(drawdown) ──► Phase1 (uses VaR as input)
Phase4(ATR stops) ◄── standalone (execution layer)
Phase5(Kelly) ◄── standalone (sizing layer)
```

## Key Insights

- VaR uses historical simulation + parametric (variance-covariance) for confidence intervals
- Correlation matrix cached in Redis (5-min TTL); recomputed on portfolio change
- Drawdown alerts throttle to 1/15min per user to avoid Telegram spam
- ATR trailing stops computed per-position; ATR period configurable (14 default)
- Kelly Criterion uses win rate and avg win/loss from historical trades

## Acceptance Criteria

- [ ] VaR 95% and 99% computed in <100ms for portfolio of 20 positions
- [ ] Correlation matrix computed across all active positions
- [ ] Drawdown alerts fire when 24h rolling P&L exceeds threshold
- [ ] ATR trailing stops adjust automatically on new candles
- [ ] Kelly Criterion sized positions produce target risk-per-trade
- [ ] All metrics exposed via `/api/v1/risk/*` endpoints
- [ ] All existing 1,464+ tests still pass

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| VaR accuracy misleading | Medium | Show confidence intervals; flag when sample < 100 trades |
| Correlation matrix O(n²) on large portfolio | Low | Cap at 50 positions; paginate computation |
| Alert fatigue from drawdown alerts | Medium | Rate-limit; only alert on threshold breach, not every tick |
| Kelly Criterion negative/zero (bad params) | Low | Clamp to minimum position size |

## Rollback

- New module `src/platform/risk/` — no changes to existing engine
- Feature-flag `ENABLE_RISK_ENGINE`
- Drop `src/platform/risk/` = clean rollback

## Files

Phase files contain detailed implementation steps:
- `phase-01-var-cvar-engine.md`
- `phase-02-correlation-matrix.md`
- `phase-03-drawdown-monitor.md`
- `phase-04-atr-trailing-stop.md`
- `phase-05-kelly-position-sizer.md`
