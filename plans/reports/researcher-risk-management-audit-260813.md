# Risk Management Capabilities Audit

**Date:** 2026-08-13
**Scope:** Full codebase risk infrastructure vs. Phase 37 roadmap
**Sources:** src/desk/risk/*, src/platform/risk/*, src/db/*, docs/development-roadmap.md

---

## What Exists (3,294 lines across two layers)

### Layer 1: Math Engines (`src/desk/risk/`)

| Module | File | Status | Tests |
|--------|------|--------|-------|
| VaR/CVaR | `value-at-risk.ts` | Parametric + historical, 95%/99%, 1d/10d | 6 tests |
| Correlation Matrix | `portfolio-correlation.ts` | Pearson r, diversification score, high-pair detection | 5 tests |
| Kelly Position Sizer | `kelly-position-sizer.ts` | Quarter-Kelly default, 5% hard cap, managed-capital flag | 6 tests |
| Drawdown Monitor | `drawdown-monitor.ts` | Daily/total drawdown, consecutive loss, Redis-backed, audit logging | 30 tests |
| Tiered Drawdown Breaker | `tiered-drawdown-breaker.ts` | 4-tier HWM system (-5% alert through -20% hard stop), disk persistence | 6 tests |
| Circuit Breaker | `circuit-breaker.ts` | Loss streak, latency, volatility, 5% daily drawdown trigger | 30+ tests |
| ATR Trailing Stop | `atr-trailing-stop.ts` | Dynamic stop-loss, never loosens, per-candle ATR | 6 tests |
| Position Manager | `position-manager.ts` | Exposure per symbol/exchange, max long/short, close-all | 30+ tests |
| Risk Gate Manager | `risk-gate-manager.ts` | Orchestrator wrapper composing guard + circuit breaker | - |

**Total desk/risk tests: 115 passing**

### Layer 2: Platform Services (`src/platform/risk/`)

Wraps desk/risk with Redis caching (5-min TTL), API exposure, alert dispatch:

- `VaRService` — Redis cache, sample-size quality flagging, perf timing
- `CorrelationMatrixService` — 50-position cap, high-correlation pair detection
- `DrawdownMonitorService` — 24h rolling P&L, Telegram + in-app alerts, D1 persistence
- `AtrTrailingStopService` — Per-symbol state in Redis, configurable period/multiplier
- `KellyPositionSizerService` — User config persistence, historical win-rate derivation
- `RiskEngine` — Unified orchestrator, lazy-init, feature flag `ENABLE_RISK_ENGINE`

### API Routes (`/api/v1/risk/*`)

Full REST surface with Zod validation:
- POST `/var`, POST `/correlation`, GET/POST `/drawdown`, POST `/atr/stop`, POST `/kelly/size`, DELETE `/cache`
- Tier-gated: cache invalidation requires PRO tier

### Execution Guard (`LiveExecutionGuard`)

Last line of defense before Polymarket CLOB: position size, daily drawdown, concurrent positions, circuit breaker. Used by `RiskGateManager`.

### Supporting Data

- **PostgreSQL schema:** `trades`, `pnl_daily`, `performance_metrics` tables
- **P&L Service:** Daily summaries, win rate, avg win/loss, Sharpe ratio
- **Subscriber P&L Aggregator:** Tenant-isolated daily P&L, win rate
- **Equity Curve Builder:** Time-series NAV, max drawdown computation
- **Qwen Drawdown Monitor:** L3 rollback layer, 6h scheduled check, Telegram alert

---

## Phase 37 Gap Analysis

Roadmap item (line 169-177 of `docs/development-roadmap.md`):

| Phase 37 Item | Status | Gap |
|---------------|--------|-----|
| Portfolio correlation matrix | DONE | `portfolio-correlation.ts` + platform service |
| VaR calculations (95%, 99%) | DONE | `value-at-risk.ts` + platform service |
| Conditional VaR (CVaR) | DONE | `value-at-risk.ts` includes CVaR parametric + historical |
| Drawdown tracking and alerts | DONE | `drawdown-monitor.ts` + platform service + Qwen monitor |
| Stop-loss automation (ATR) | DONE | `atr-trailing-stop.ts` + platform service |
| Position sizing (Kelly) | DONE | `kelly-position-sizer.ts` + platform service |

**Verdict: Phase 37 is fully implemented across desk + platform layers.** The roadmap status says "PLANNED" but all 6 items exist in code with 115+ tests.

---

## What's Actually Missing

### 1. Integration Gap: Risk Engine Not Wired Into Trading Pipeline

`RiskGateManager` exists but `LiveExecutionGuard` only runs in Polymarket live orchestrator. Generic trading pipeline (`src/engine/`) uses a stub `RiskManager` (22 lines, does nothing). Cross-exchange arbitrage and other strategies bypass risk checks entirely.

### 2. No Real-Time Portfolio-Level VaR Dashboard

VaR/CVaR computes on-demand via API. No continuous background computation or WebSocket push. Operators must poll `/api/v1/risk/var`.

### 3. No Stress Testing / Scenario Analysis

VaR uses historical simulation but no forward-looking stress tests (e.g., "what if BTC drops 20% in 1h?"). Portfolio correlation matrix doesn't feed into scenario-based risk.

### 4. Missing Risk-Adjusted Return Metrics

P&L service computes Sharpe ratio but no Sortino, Calmar, or Information Ratio in production (only in backtest engine). No risk-adjusted ranking for strategy comparison.

### 5. No Cross-Strategy Risk Aggregation

Risk metrics are per-user, not cross-strategy within a user. If user runs 3 strategies, total portfolio risk isn't aggregated before sizing new positions.

---

## Data Sources Available

| Source | Location | Fields |
|--------|----------|--------|
| Trade history | PostgreSQL `trades` | symbol, buy/sell price, amount, profit, fee, status, timestamps |
| Daily P&L | PostgreSQL `pnl_daily` | net_pnl, trade_count, win/loss counts, avg_win/loss, max_drawdown |
| Performance metrics | PostgreSQL `performance_metrics` | metric_name, metric_value, period |
| Redis positions | `position:*` hashes | symbol, exchange, entry price, size, unrealized PnL |
| Redis drawdown | `drawdown:*` hashes | currentValue, peakValue, dailyPnl, halt state |
| Redis risk cache | `risk:var:*`, `risk:correlation:*` | Cached VaR/correlation (5-min TTL) |
| Equity curve | `equity_snapshots` table (referenced by EquityCurveBuilder) | date, NAV |
| Subscriber P&L | Via TenantIsolator queries | Realized P&L, win rate, daily series |

---

## Recommended Implementation Order

### Tier 1 — Wiring (highest impact, lowest effort)

1. **Wire RiskGateManager into generic trading pipeline** — Replace stub `RiskManager` in `src/engine/` with real `RiskGateManager` from `src/desk/risk/`. Every strategy gets drawdown + position size checks.

2. **Wire cross-exchange arbitrage through LiveExecutionGuard** — Currently `neg-risk-arb-scanner` runs without pre-execution risk gate.

### Tier 2 — Portfolio Aggregation

3. **Cross-strategy risk aggregation** — Aggregate open positions across all user strategies before Kelly sizing. Prevents over-leveraging when 3 strategies each size independently.

4. **Real-time portfolio VaR background worker** — Periodic computation (every 5 min) pushed via WebSocket. Low latency for dashboard consumption.

### Tier 3 — Advanced Analytics

5. **Stress test module** — Scenario definitions (e.g., "flash crash", "exchange outage"), impact on current portfolio. Feeds from correlation matrix + position data.

6. **Risk-adjusted return dashboard** — Sortino, Calmar, Information Ratio computed alongside existing Sharpe in `pnl-service.ts`. Strategy comparison by risk-adjusted metrics.

---

## Adoption Risk Assessment

- **Phase 37 gap is zero** — all items implemented. Roadmap status is stale (should be marked DONE).
- **Wiring gap is the real risk** — 3 of 5 strategy types bypass risk checks. This is a production safety issue, not a missing feature.
- **Redis dependency** — All risk state is Redis-backed. Single-node Redis failure disables drawdown monitoring. Mitigated by existing circuit breaker pattern but worth noting.
- **No integration tests for risk wiring** — 115 unit tests exist for individual modules but no end-to-end test verifying risk gates actually block trades in the pipeline.

---

## Unresolved Questions

1. Is the generic `TradingEngine` (`src/engine.ts`) still used in production, or only the Polymarket orchestrator? Determines urgency of wiring risk into it.
2. Should risk features be tier-gated? Currently `ENABLE_RISK_ENGINE` is a global flag. No per-tier risk limits (e.g., BASIC gets basic drawdown only, ENTERPRISE gets VaR).
3. Is there a live `equity_snapshots` table in production Postgres, or only referenced in code?
