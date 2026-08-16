# Paper-to-Live Transition Criteria / Tiêu Chí Chuyển Từ Paper Sang Live

> Decision framework for promoting strategies from paper trading to live capital.
> / Khung quyết định để nâng cấp chiến lược từ paper trading sang vốn thực.

---

## 1. Eligibility Gates / Cổng Đủ Điều Kiện

A strategy MUST pass ALL gates before live deployment:

| # | Gate | Threshold | Verified By |
|---|------|-----------|-------------|
| 1 | Paper trading duration | ≥ 30 calendar days | PaperTradingLoop |
| 2 | Total paper trades | ≥ 50 trades | PaperTradingLoop |
| 3 | Win rate | ≥ 55% | evaluation-engine |
| 4 | Profit factor | ≥ 1.3 | evaluation-engine |
| 5 | Max drawdown | ≤ 15% | CapitalReadinessTracker |
| 6 | Sharpe ratio | ≥ 1.0 | evaluation-engine |
| 7 | Out-of-sample consistency | testWinRate > valWinRate - 0.05 | walkforward-evaluator |
| 8 | Regime-aware Kelly wired | Yes | TradingPipeline |
| 9 | Circuit breaker tested | Yes | TieredDrawdownBreaker |
| 10 | Exchange connectivity | All targets green | ExchangeConnectionTester |

---

## 2. Promotion Tiers / Cấp Độ Nâng Cấp

### Tier 1: Paper Only
- New strategies, < 30 days data
- No live capital allocation

### Tier 2: Shadow Mode (0.5% max)
- Passes all eligibility gates
- Trades simulated alongside live prices
- No actual order execution
- Validates execution latency + fill assumptions

### Tier 3: Micro Live (1% max)
- Shadow mode: 14 days green
- Real orders, minimal size
- Hard stop: if drawdown > 5%, auto-revert to Tier 1

### Tier 4: Full Allocation
- Micro live: 30 days green
- Kelly-sized positions within regime constraints
- Continuous monitoring via TieredDrawdownBreaker

---

## 3. Rollback Criteria / Tiêu Chí Rollback

Auto-revert to lower tier when:

| Trigger | Action |
|---------|--------|
| Live drawdown > 10% in 7 days | Tier 4 → Tier 1 |
| Live win rate drops below 50% for 10 trades | Tier 4 → Tier 2 |
| Any regime shows negative expectancy | Freeze that regime's positions |
| Exchange API failure > 5 min | Pause all trading |
| Kelly fraction hits 0 (SHOCK regime) | No new positions, monitor |

---

## 4. Human Approval Required / Cần Phê Duyệt Con Người

The following transitions require explicit human sign-off:
- Tier 2 → Tier 3 (first live capital)
- Tier 3 → Tier 4 (full allocation)
- Any promotion with expectancy < 0.02
- Strategy with fewer than 100 trades in training set

---

## 5. Documentation Requirements / Yêu Cầu Tài Liệu

Before promotion:
1. Full experiment artifact (JSON with all config + metrics)
2. Walk-forward report (train/val/test breakdown by regime)
3. Baseline comparison (strategy beats all 4 baselines)
4. Risk assessment (max drawdown, tail risk, correlation)
5. Monitoring plan (which metrics trigger rollback)

---

*Prepared: 2026-08-16 | Refs: ALPHA_DISCOVERY_ARCHITECTURE.md, docs/go-live-status.md*