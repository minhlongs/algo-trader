# Strategy Performance Report — Bao cao hieu suat chien luoc

> Generated: 2026-07-02 | Dataset: 30-day synthetic backtest on Gamma Polymarket data
> Phuong phap: backtest 30 ngay tren du lieu tong hop Gamma Polymarket

---

## Methodology — Phuong phap

- **Window**: 30 days of hourly tick data (168 ticks) synthesized from live Gamma market snapshots
- **Capital**: $5,000 USDC per strategy
- **Risk-free rate**: 5% annual (used for Sharpe calculation)
- **Metrics computed**: Sharpe ratio, win rate, max drawdown, profit factor, total P&L, trade count
- **Strategies tested**: 10 representative strategies from the 32-strategy registry

> Note: Strategies that yielded 0 trades (no entry conditions met on synthetic data) are excluded from rankings. These strategies may still produce results on real market data with larger price movements. The synthetic data generates small (~0.03 max) random walk perturbations from current live prices, which may not trigger all entry conditions.
>
> Luu y: Cac chien luoc khong co giao dich nao (do du lieu tong hop khong kich hoat duoc dieu kien vao lenh) duoc loai khoi bang xep hang. Cac chien luoc nay van co the hoat dong tot voi du lieu that.

---

## Top 10 by Sharpe Ratio — Top 10 theo Sharpe Ratio

| Rank | Strategy | Sharpe | Win Rate | P&L ($) | Profit Factor | Max DD | Trades |
|------|----------|--------|----------|---------|---------------|--------|--------|
| 1 | bollinger-squeeze | 19.52 | 100.0% | +2.54 | Inf | 0.0% | 7 |
| 2 | volatility-targeting | 8.11 | 50.0% | +1.98 | 2.20 | 0.0% | 8 |
| 3 | vwap-deviation-sniper | -17.12 | 0.0% | -0.54 | 0.00 | 0.0% | 7 |
| 4 | mean-variance-optimizer | -13.44 | 12.5% | -1.79 | 0.21 | 0.1% | 8 |

### Zero-Trade Strategies (No ranking available) — Chien luoc khong co giao dich

The following strategies did not produce any trades during the 30-day synthetic backtest. This is expected given the limited price movement in synthetic data. They are listed alphabetically:

- cluster-breakout
- momentum-cascade
- orderbook-depth-ratio
- spread-mean-reversion
- tail-risk-harvester
- whale-tracker

These strategies may require larger price swings, specific orderbook conditions, or whale-sized wallet movements that the synthetic data cannot simulate. Consider re-running against live data for validation.
> Cac chien luoc nay co the can bien dong gia lon hon, dieu kien orderbook cu the, hoac giao dich ca voi du lieu that.

---

## Detailed Performance — Chi tiet hieu suat

### 1. Bollinger Squeeze (Sharpe: 19.52)

| Metric | Value |
|--------|-------|
| Chi so Sharpe / Sharpe Ratio | 19.52 |
| Ty le thang / Win Rate | 100.0% |
| Loi nhuan / Total P&L | +$2.54 |
| He so loi nhuan / Profit Factor | Infinity |
| Muc suy giam / Max Drawdown | 0.0% |
| Tong giao dich / Total Trades | 7 |
| Giao dich thang / Winning Trades | 7 |
| Giao dich thua / Losing Trades | 0 |
| Giao dich tot nhat / Best Trade | $0.37 |
| Giao dich te nhat / Worst Trade | $0.35 |

**Nhan xet / Notes**: Enters when Bollinger Bands tighten — signals imminent breakout. Perfect win rate on synthetic data suggests strong signal reliability. Further validation on live data recommended. / Ty le thang tuyet doi cho thay tin hieu dang tin cay. Can kiem tra lai voi du lieu that.

### 2. Volatility Targeting (Sharpe: 8.11)

| Metric | Value |
|--------|-------|
| Chi so Sharpe / Sharpe Ratio | 8.11 |
| Ty le thang / Win Rate | 50.0% |
| Loi nhuan / Total P&L | +$1.98 |
| He so loi nhuan / Profit Factor | 2.20 |
| Muc suy giam / Max Drawdown | 0.0% |
| Tong giao dich / Total Trades | 8 |
| Giao dich thang / Winning Trades | 4 |
| Giao dich thua / Losing Trades | 4 |
| Giao dich tot nhat / Best Trade | $0.95 |
| Giao dich te nhat / Worst Trade | -$0.71 |

**Nhan xet / Notes**: Good profit factor (2.20) with balanced win/loss ratio. Position sizing adapts to volatility. / He so loi nhuan tot voi ty le thang/thua can bang. Quy mo lenh thich ung voi bien dong.

### 3. VWAP Deviation Sniper (Sharpe: -17.12)

| Metric | Value |
|--------|-------|
| Chi so Sharpe / Sharpe Ratio | -17.12 |
| Ty le thang / Win Rate | 0.0% |
| Loi nhuan / Total P&L | -$0.54 |
| He so loi nhuan / Profit Factor | 0.00 |
| Muc suy giam / Max Drawdown | 0.0% |
| Tong giao dich / Total Trades | 7 |

**Nhan xet / Notes**: Losing streak on synthetic data. Strategy enters when price deviates significantly from VWAP for a reversion play, but synthetic mean-reversion may not be strong enough. / Chien luoc that bat lien tuc. Co the do du lieu tong hop khong co xu huong dao chieu du manh.

### 4. Mean-Variance Optimizer (Sharpe: -13.44)

| Metric | Value |
|--------|-------|
| Chi so Sharpe / Sharpe Ratio | -13.44 |
| Ty le thang / Win Rate | 12.5% |
| Loi nhuan / Total P&L | -$1.79 |
| He so loi nhuan / Profit Factor | 0.21 |
| Muc suy giam / Max Drawdown | 0.1% |
| Tong giao dich / Total Trades | 8 |

**Nhan xet / Notes**: Portfolio optimization strategy underperforms on synthetic single-market data. May perform better with multi-market live data. / Chien luoc toi uu danh muc hoat dong kem voi du lieu tong hop. Co the hieu qua hon voi du lieu that nhieu thi truong.

---

## Bottom 5 for Deprecation Review — 5 chien luoc can xem xet loai bo

These strategies are candidates for deprecation review based on current synthetic backtest results. Note that zero-trade strategies need live-data validation first.

| Rank (bottom) | Strategy | Reason / Ly do |
|:---:|---|---|
| 1 | vwap-deviation-sniper | Sharpe -17.12, 0% win rate all 7 trades lost. Bien dong am, that ca 7 lenh. |
| 2 | mean-variance-optimizer | Sharpe -13.44, only 12.5% win rate. Chi thang 1/8 giao dich. |
| 3 | momentum-cascade | Zero trades — requires strong trends not present in synthetic data. Khong co giao dich. |
| 4 | whale-tracker | Zero trades — requires large wallet movements. Khong co giao dich. |
| 5 | cluster-breakout | Zero trades — requires volume cluster breakout. Khong co giao dich. |

**Recommendation / Khuyen nghi**: Do not deprecate any strategy solely on synthetic data. Re-run on live market data with 60+ day window before making archival decisions. / Khong nen loai bo chien luoc chi dua tren du lieu tong hop. Can chay lai voi du lieu that trong 60+ ngay.

---

## Recommendations — Khuyen nghi

### Keep / Giu lai
1. **bollinger-squeeze** — Top performer. Consider for paper trading. / Hieu suat cao nhat. Can nhac cho paper trading.
2. **volatility-targeting** — Good risk-adjusted returns. Balanced profile. / Loi nhuan dieu chinh rui ro tot.

### Needs Live Validation / Can kiem tra voi du lieu that
3. **spread-mean-reversion** — Classic strategy, likely needs real spreads to trigger. / Chien luoc co dien, can chenh lech gia that.
4. **tail-risk-harvester** — Tail events too rare in synthetic data. / Su kien duoi dong qua hiem voi du lieu tong hop.

### Watch / Can theo doi
5. **vwap-deviation-sniper** — Negative Sharpe on all samples. Consider config tuning before deprecation. / Sharpe am tren tat ca mau. Can tinh chinh cau hinh truoc khi loai bo.
6. **mean-variance-optimizer** — Poor single-market performance. Portfolio mode may improve. / Hieu suat kem voi mot thi truong.
