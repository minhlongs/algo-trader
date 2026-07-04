---
phase: 3
title: "Wire Live Trading Metrics"
status: pending
priority: P1
effort: "~1.5h"
dependencies: []
---

# Phase 3: Wire Live Trading Metrics

## Overview

Hiện tại `live-execution-guard.ts`, `live-position-tracker.ts`, `live-trading-orchestrator.ts` không gọi Prometheus metrics. Cần thêm recorder calls để Grafana dashboard hiển thị dữ liệu live.

## Related Code Files

- **Modify:** `src/desk/execution/live-position-tracker.ts` — thêm trade/P&L metrics
- **Modify:** `src/desk/execution/live-execution-guard.ts` — thêm circuit breaker + positions metrics
- **Modify:** `src/desk/polymarket/live-trading-orchestrator.ts` — thêm strategy active metric

## Implementation Steps

### Step 1: Wire live-position-tracker.ts

Add imports:

```typescript
import { recordTrade, dailyPnlUsd, winRatePercent, setWinRate } from '../../platform/middleware/prometheus-metrics';
```

Key places to add metrics:
- Trong `recordFill()` (khi fill được ghi nhận):
  - `recordTrade(tokenId, 'polymarket', side, realizedPnl)`
  - `dailyPnlUsd.inc({ strategy: 'live' }, realizedPnl)`
- Sau khi tính win rate:
  - `setWinRate(winRate)`

**Important:** Prometheus module path cần absolute/relative import đúng. Path từ `src/desk/execution/` → `src/platform/middleware/`:
```
../../platform/middleware/prometheus-metrics
```

### Step 2: Wire live-execution-guard.ts

Add imports:

```typescript
import { setCircuitBreakerState, setOpenPositions } from '../../platform/middleware/prometheus-metrics';
```

Key places to add metrics:
- Trong `guard.check()` sau mỗi lần kiểm tra:
  - `setCircuitBreakerState(isOpen)` — khi circuit breaker thay đổi trạng thái
- `setOpenPositions('polymarket', 'all', count)` — khi concurrent positions thay đổi

### Step 3: Wire live-trading-orchestrator.ts

Add imports:

```typescript
import { setStrategyActive, openPositionsTotal } from '../../platform/middleware/prometheus-metrics';
```

Key places to add metrics:
- Trong `start()`:
  - `setStrategyActive('live-orchestrator', true)`
- Trong `stop()`:
  - `setStrategyActive('live-orchestrator', false)`

### Step 4: Verify

```bash
pnpm typecheck  # 0 errors
pnpm test       # all 2,798+ tests pass (metrics calls are side-effect-free)
```

## Success Criteria

- [ ] `live-position-tracker.ts` — records trades_total, daily_pnl_usd, win_rate_percent
- [ ] `live-execution-guard.ts` — records circuit_breaker_state, open_positions_total
- [ ] `live-trading-orchestrator.ts` — records strategy_active
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm test` — 2,798+ tests pass
- [ ] Metrics appear at `/metrics` endpoint after live trading starts

## Risk

- Import path sai → typecheck lỗi. Import paths: 
  - Từ `src/desk/execution/` → `../../platform/middleware/prometheus-metrics`
  - Từ `src/desk/polymarket/` → `../../platform/middleware/prometheus-metrics`
- `recordTrade`, `dailyPnlUsd` là module-level, an toàn gọi từ async context
- Không ảnh hưởng business logic — chỉ thêm metric recorder calls
