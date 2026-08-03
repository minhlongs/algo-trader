---
title: "Phase 37: Advanced Risk Management"
description: "Portfolio risk engine: VaR/CVaR, correlation matrix, drawdown alerts, ATR trailing stops, Kelly Criterion position sizing"
status: complete
priority: P1
effort: 6d
branch: main
tags: [risk, var, kelly, portfolio, drawdown, atr]
created: 2026-07-08
completed: 2026-08-03
---

# Phase 37: Advanced Risk Management

## Overview

Deploy production-grade risk management: compute portfolio-level risk metrics in real-time, enforce position limits, and alert on drawdown breaches.

## Scoped Phases

| # | Phase | Priority | Effort | Status | Commit |
|---|-------|----------|--------|--------|--------|
| 1 | VaR/CVaR Engine | P0 | 1.5d | complete | src/platform/risk/var-cvar-service.ts |
| 2 | Correlation Matrix | P0 | 1.5d | complete | src/platform/risk/correlation-matrix-service.ts |
| 3 | Drawdown Monitor & Alerts | P1 | 1d | complete | src/platform/risk/drawdown-monitor-service.ts |
| 4 | ATR Trailing Stop Engine | P1 | 1d | complete | src/platform/risk/atr-trailing-stop-service.ts |
| 5 | Kelly Criterion Position Sizer | P1 | 1d | complete | src/platform/risk/kelly-position-sizer-service.ts |

## Implementation Summary

### Files Created
- `src/platform/risk/risk-engine.ts` — orchestrator wiring all services
- `src/platform/risk/var-cvar-service.ts` — historical simulation + parametric VaR/CVaR
- `src/platform/risk/correlation-matrix-service.ts` — Pearson correlation across positions
- `src/platform/risk/drawdown-monitor-service.ts` — rolling P&L drawdown tracking
- `src/platform/risk/atr-trailing-stop-service.ts` — ATR-based dynamic stop-loss
- `src/platform/risk/kelly-position-sizer-service.ts` — Kelly Criterion position sizing
- `src/platform/risk/types.ts` — shared interfaces
- `src/platform/risk/index.ts` — barrel export
- `src/platform/api/routes/risk-routes.ts` — REST API endpoints
- `src/platform/risk/__tests__/*.test.ts` — 5 test files, 40 tests

### API Endpoints
```
POST /api/v1/risk/var — VaR/CVaR computation
POST /api/v1/risk/correlation — Correlation matrix
GET  /api/v1/risk/drawdown — Drawdown status
POST /api/v1/risk/drawdown/alert — Trigger alert check
POST /api/v1/risk/atr/stop — ATR trailing stop
GET  /api/v1/risk/atr/stop/:symbol — Get ATR state
DELETE /api/v1/risk/atr/stop/:symbol — Clear ATR state
POST /api/v1/risk/kelly/size — Kelly position sizing
POST /api/v1/risk/kelly/from-history — Kelly from trade history
DELETE /api/v1/risk/cache — Invalidate cache
```

## Verification
- **Tests**: 40/40 passing (5 test files)
- **Build**: Verified via existing test harness
- **No regressions**: All existing risk tests pass
