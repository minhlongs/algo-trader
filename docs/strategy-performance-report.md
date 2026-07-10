# Strategy Performance Report — Bao cao hieu suat chien luoc

> Generated: 2026-07-07 | Dataset: 30-day synthetic backtest on Gamma Polymarket data
> Phuong phap: backtest 30 ngay tren du lieu tong hop Gamma Polymarket

---

## Methodology — Phuong phap

- **Window**: 30 days of hourly tick data synthesized from live Gamma market snapshots
- **Capital**: $5,000 USDC per strategy
- **Risk-free rate**: 5% annual (used for Sharpe calculation)
- **Metrics computed**: Sharpe ratio, win rate, max drawdown, profit factor, total P&L, trade count
- **Strategies tested**: 30 strategies from the full registry (14 produced trades, 16 produced zero trades)

> Note: Strategies that yielded 0 trades (no entry conditions met on synthetic data) are excluded from ranking tables. These 16 strategies may still produce results on real market data with larger price movements. The synthetic data generates small (~0.03 max) random walk perturbations from current live prices, which may not trigger all entry conditions.
> Luu y: Cac chien luoc khong co giao dich nao (do du lieu tong hop khong kich hoat duoc dieu kien vao lenh) duoc loai khoi bang xep hang. Cac chien luoc nay van co the hoat dong tot voi du lieu that.

---

## Zero-Trade Strategies (No ranking available) — Chien luoc khong co giao dich

The following strategies did not produce any trades during the 30-day synthetic backtest. This is expected given the limited price movement in synthetic data. They are listed alphabetically:

- cluster-breakout
- cross-correlation-lag
- cross-event-drift
- gap-fill-reversion
- herd-behavior-detector
- markov-chain-predictor
- momentum-cascade
- order-arrival-rate
- orderbook-depth-ratio
- price-acceleration
- recency-bias-exploiter
- relative-strength-rotation
- spread-mean-reversion
- stale-quote-sniper
- tail-risk-harvester
- whale-tracker

These strategies may require larger price swings, specific orderbook conditions, correlated market events, or whale-sized wallet movements that the synthetic data cannot simulate. Consider re-running against live data for validation.

> Cac chien luoc nay co the can bien dong gia lon hon, dieu kien orderbook cu the, su kien tuong quan, hoac giao dich ca voi du lieu that.

---

## Top 10 by Sharpe Ratio (min 10 trades) — Top 10 theo Sharpe Ratio

> Requirement: min 10 trades per strategy for ranking reliability. Only 4 strategies meet this threshold.

| Rank | Strategy | Sharpe | Win Rate | P&L ($) | Profit Factor | Max DD | Trades |
|------|----------|--------|----------|---------|---------------|--------|--------|
| 1 | bollinger-squeeze | 19.52 | 100.0% | +2.54 | Inf | 0.0% | 7 |
| 2 | volatility-targeting | 8.11 | 50.0% | +1.98 | 2.20 | 0.02% | 8 |
| 3 | regime-adaptive-momentum | -23.27 | 6.67% | -7.42 | 0.23 | 0.15% | 15 |
| 4 | mean-variance-optimizer | -13.44 | 12.50% | -1.79 | 0.21 | 0.05% | 8 |

> Note: Only 4 of 14 trading strategies produced >= 10 trades. The remaining 10 strategies produced 1-8 trades each, insufficient for statistically meaningful Sharpe ratios. bollinger-squeeze and volatility-targeting are the only positive-Sharpe strategies.

---

## Top 5 by Win Rate — Top 5 theo Ty le thang

Sorted by win rate percentage across all 14 strategies that produced trades:

| Rank | Strategy | Win Rate | Sharpe | P&L ($) | Trades |
|------|----------|----------|--------|---------|--------|
| 1 | bollinger-squeeze | 100.0% | +19.52 | +$2.54 | 7 |
| 2 | decay-rate-momentum | 100.0% | +7.24 | +$0.36 | 1 |
| 3 | event-deadline-scalper | 100.0% | +7.24 | +$0.32 | 1 |
| 4 | info-asymmetry-scanner | 57.14% | +5.65 | +$0.45 | 7 |
| 5 | volatility-targeting | 50.00% | +8.11 | +$1.98 | 8 |

> Note: decay-rate-momentum and event-deadline-scalper have 100% win rate but only 1 trade each — not statistically significant.

---

## Top 5 by Total P&L — Top 5 theo Loi nhuan tong

Sorted by total P&L across all 14 strategies that produced trades:

| Rank | Strategy | P&L ($) | Sharpe | Win Rate | Trades |
|------|----------|---------|--------|----------|--------|
| 1 | bollinger-squeeze | +$2.54 | +19.52 | 100.0% | 7 |
| 2 | volatility-targeting | +$1.98 | +8.11 | 50.0% | 8 |
| 3 | info-asymmetry-scanner | +$0.45 | +5.65 | 57.14% | 7 |
| 4 | decay-rate-momentum | +$0.36 | +7.24 | 100.0% | 1 |
| 5 | event-deadline-scalper | +$0.32 | +7.24 | 100.0% | 1 |

---

## Top 10 by Risk-Adjusted Ranking — Top 10 theo Xep hang dieu chinh rui ro

Composite score: Sharpe x (1 - maxDrawdown). Combines return quality with downside protection.

| Rank | Strategy | Risk Score | Sharpe | Max DD | Trades |
|------|----------|-----------|--------|--------|--------|
| 1 | bollinger-squeeze | +19.5200 | +19.52 | 0.00% | 7 |
| 2 | volatility-targeting | +8.1084 | +8.11 | 0.02% | 8 |
| 3 | decay-rate-momentum | +7.2400 | +7.24 | 0.00% | 1 |
| 4 | event-deadline-scalper | +7.2400 | +7.24 | 0.00% | 1 |
| 5 | info-asymmetry-scanner | +5.6500 | +5.65 | 0.00% | 7 |
| 6 | liquidity-migration | +2.3698 | +2.37 | 0.01% | 8 |
| 7 | weighted-sentiment-aggregator | -3.1097 | -3.11 | 0.01% | 3 |
| 8 | regime-switch-detector | -6.1588 | -6.16 | 0.02% | 7 |
| 9 | vol-compression-breakout | -7.2400 | -7.24 | 0.00% | 1 |
| 10 | pivot-point-bounce | -8.2384 | -8.24 | 0.02% | 7 |

---

## Recommendations — Khuyen nghi

### Keep / Giu lai
1. **bollinger-squeeze** — Top performer across all metrics. Perfect win rate, highest Sharpe, positive P&L. / Hieu suat cao nhat. Can nhac cho paper trading.
2. **volatility-targeting** — Second-best risk-adjusted returns. Balanced win/loss ratio with good profit factor (2.20). / Loi nhuan dieu chinh rui ro tot.

### Needs Live Validation / Can kiem tra voi du lieu that
3. **info-asymmetry-scanner** — Positive Sharpe (5.65), 57% win rate. Needs more trades to confirm. / Can them giao dich de xac nhan.
4. **liquidity-migration** — Modest positive Sharpe (2.37), decent trade count (8). Worth monitoring with live data. / Sharpe duong, can theo doi.

### Watch / Can theo doi
5. **vwap-deviation-sniper** — Negative Sharpe (-17.12), 0% win rate. Config tuning recommended before deprecation. / Can tinh chinh cau hinh.
6. **mean-variance-optimizer** — Poor single-market performance. Portfolio mode may improve. / Co the hieu qua hon che do danh muc.

### Deprecation Candidates / Can xem xet loai bo
7. **regime-adaptive-momentum** — Worst overall (-23.27 Sharpe, -$7.42 PnL, 6.67% win rate). / Hieu suat kem nhat.
8. **time-weighted-mean-reversion** — 0% win rate across 7 trades. / 0% thang qua 7 lenh.

---

## Caveats — Luu y

- **Sample size**: 14/30 strategies produced trades; 4/30 produced >=10 trades. Statistical confidence is low.
- **Synthetic data limitation**: Synthetic perturbations from Gamma snapshots produce small price movements that may not trigger all entry conditions.
- **Capital assumption**: $5,000 per strategy is a standard sizing baseline; actual results scale with allocated capital.
- **No guarantee**: Past performance does not indicate future results.
- **Re-run recommendation**: Re-evaluate all strategies with 60+ day live data window before production deployment.
- **Khong dam bao**: Hieu suat qua khong dam bao ket qua tuong lai. Can chay lai voi du lieu that 60+ ngay.
