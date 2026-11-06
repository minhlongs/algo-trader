# Quantitative Backtest & Strategy Leaderboard / Bảng Xếp Hạng Chiến Lược

> **Tài liệu được sinh — đừng sửa tay / This file is generated — do not edit by hand.**
> Source / Nguồn: `reports/backtest-results.csv` (read through `src/platform/api/routes/leaderboard-builder.ts`,
> the same parser that serves `GET /api/v1/leaderboard`).
> Regenerate / Tạo lại: `npm run generate:leaderboard`
> Drift guard / Kiểm tra lệch: `npm run check:leaderboard`

---

## 1. What this table reports / Bảng này nói gì

Mỗi số dưới đây được lấy trực tiếp từ một dòng của `reports/backtest-results.csv` — không có số
nào được nhập tay. Chỉ những chiến lược có ít nhất 1 lệnh mới được xếp hạng; các chiến
lược có 0 lệnh được liệt kê riêng và được đánh dấu "không đủ dữ liệu".

Every figure below comes straight from a row of `reports/backtest-results.csv` — none are typed in by
hand. Only strategies with at least 1 trade are ranked; strategies with zero trades are
listed separately and marked "không đủ dữ liệu".

### Sample size / Cỡ mẫu

| Metric / Chỉ số | Value / Giá trị |
|:---|:---:|
| Strategies in CSV / Số chiến lược trong CSV | 30 |
| Ranked (have trades) / Có xếp hạng (có lệnh) | 14 |
| Statistically significant (≥ 30 trades) / Đủ mẫu thống kê (≥ 30 lệnh) | 0 |
| Small sample (< 30 trades — `INSUFFICIENT_SAMPLE (<30)`) / Cỡ mẫu nhỏ (< 30 lệnh) | 14 |
| Insufficient sample (0 trades — `NO_TRADES`) / Không đủ dữ liệu (0 lệnh) | 16 |
| Total trades backtested / Tổng số lệnh đã kiểm thử | 87 |
| Net P&L across all rows / Lãi lỗ ròng toàn bộ dòng | -6.81 USD |
| Ranked rows with negative Sharpe / Dòng có Sharpe âm | 8 |
| Ranked rows with infinite profit factor / Dòng có profit factor vô hạn | 3 |

---

## 2. Ranked strategies / Chiến lược được xếp hạng

Xếp theo Sharpe giảm dần. Cỡ mẫu (`total_trades`) nằm ngay trong bảng — Sharpe cao trên vài lệnh
không phải là bằng chứng chất lượng. `n/a — profit factor vô hạn trên mẫu quá nhỏ` có nghĩa là chiến lược không có lệnh thua
nào trong mẫu rất nhỏ: con số này không thể so sánh với profit factor hữu hạn.

Ordered by Sharpe, descending. The sample size (`total_trades`) is in the table — a high Sharpe over a
handful of trades is not evidence of quality. `n/a — profit factor vô hạn trên mẫu quá nhỏ` means the strategy had no losing
trade in a very small sample; that number is not comparable to a finite one.

| Rank / Hạng | Strategy / Chiến lược | Sharpe | Max Drawdown | Win Rate | Total Trades / Cỡ mẫu | Profit Factor | P&L (USD) |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|
 | 1 | `bollinger-squeeze` | 19.52 | -0.00% | 100.00% | 7 (INSUFFICIENT_SAMPLE (<30)) | n/a — profit factor vô hạn trên mẫu quá nhỏ | 2.54 |
 | 2 | `volatility-targeting` | 8.11 | -0.02% | 50.00% | 8 (INSUFFICIENT_SAMPLE (<30)) | 2.20 | 1.98 |
 | 3 | `decay-rate-momentum` | 7.24 | -0.00% | 100.00% | 1 (INSUFFICIENT_SAMPLE (<30)) | n/a — profit factor vô hạn trên mẫu quá nhỏ | 0.36 |
 | 4 | `event-deadline-scalper` | 7.24 | -0.00% | 100.00% | 1 (INSUFFICIENT_SAMPLE (<30)) | n/a — profit factor vô hạn trên mẫu quá nhỏ | 0.32 |
 | 5 | `info-asymmetry-scanner` | 5.65 | -0.00% | 57.14% | 7 (INSUFFICIENT_SAMPLE (<30)) | 1.70 | 0.45 |
 | 6 | `liquidity-migration` | 2.37 | -0.01% | 50.00% | 8 (INSUFFICIENT_SAMPLE (<30)) | 1.23 | 0.19 |
 | 7 | `weighted-sentiment-aggregator` | -3.11 | -0.01% | 33.33% | 3 (INSUFFICIENT_SAMPLE (<30)) | 0.60 | -0.17 |
 | 8 | `regime-switch-detector` | -6.16 | -0.02% | 28.57% | 7 (INSUFFICIENT_SAMPLE (<30)) | 0.57 | -0.56 |
 | 9 | `vol-compression-breakout` | -7.24 | -0.00% | 0.00% | 1 (INSUFFICIENT_SAMPLE (<30)) | 0.00 | -0.12 |
 | 10 | `pivot-point-bounce` | -8.24 | -0.02% | 28.57% | 7 (INSUFFICIENT_SAMPLE (<30)) | 0.48 | -0.57 |
 | 11 | `mean-variance-optimizer` | -13.44 | -0.05% | 12.50% | 8 (INSUFFICIENT_SAMPLE (<30)) | 0.21 | -1.79 |
 | 12 | `time-weighted-mean-reversion` | -15.49 | -0.03% | 0.00% | 7 (INSUFFICIENT_SAMPLE (<30)) | 0.00 | -1.48 |
 | 13 | `vwap-deviation-sniper` | -17.12 | -0.01% | 0.00% | 7 (INSUFFICIENT_SAMPLE (<30)) | 0.00 | -0.54 |
 | 14 | `regime-adaptive-momentum` | -23.27 | -0.15% | 6.67% | 15 (INSUFFICIENT_SAMPLE (<30)) | 0.08 | -7.42 |

---

## 3. Insufficient sample / Không đủ dữ liệu

Các chiến lược sau có `total_trades = 0` trong CSV. Chúng **không** được gán Sharpe và **không** được
xếp hạng — cột trạng thái trong CSV của chúng không phải là hiệu năng.

The strategies below have `total_trades = 0` in the CSV. They are given **no** Sharpe value and **no**
rank — their response status is not performance.

| Strategy / Chiến lược | Total Trades / Cỡ mẫu | Status / Trạng thái |
|:---|:---:|:---|
| `spread-mean-reversion` | 0 | không đủ dữ liệu (NO_TRADES) |
| `momentum-cascade` | 0 | không đủ dữ liệu (NO_TRADES) |
| `cross-event-drift` | 0 | không đủ dữ liệu (NO_TRADES) |
| `gap-fill-reversion` | 0 | không đủ dữ liệu (NO_TRADES) |
| `orderbook-depth-ratio` | 0 | không đủ dữ liệu (NO_TRADES) |
| `cluster-breakout` | 0 | không đủ dữ liệu (NO_TRADES) |
| `cross-correlation-lag` | 0 | không đủ dữ liệu (NO_TRADES) |
| `herd-behavior-detector` | 0 | không đủ dữ liệu (NO_TRADES) |
| `markov-chain-predictor` | 0 | không đủ dữ liệu (NO_TRADES) |
| `order-arrival-rate` | 0 | không đủ dữ liệu (NO_TRADES) |
| `price-acceleration` | 0 | không đủ dữ liệu (NO_TRADES) |
| `recency-bias-exploiter` | 0 | không đủ dữ liệu (NO_TRADES) |
| `relative-strength-rotation` | 0 | không đủ dữ liệu (NO_TRADES) |
| `stale-quote-sniper` | 0 | không đủ dữ liệu (NO_TRADES) |
| `tail-risk-harvester` | 0 | không đủ dữ liệu (NO_TRADES) |
| `whale-tracker` | 0 | không đủ dữ liệu (NO_TRADES) |

---

## 4. How these numbers are produced / Các con số được tạo ra như thế nào

1. **Single parser / Một trình đọc CSV:** bảng này được sinh bởi
   `scripts/generate-leaderboard.mjs`, đọc đúng `reports/backtest-results.csv` qua
   `src/platform/api/routes/leaderboard-builder.ts` — chính trình đọc phục vụ
   `GET /api/v1/leaderboard`. Không có trình đọc thứ hai.
2. **Drift guard / Chốt lệch tài liệu:** `npm run check:leaderboard` tạo lại tài liệu trong bộ nhớ và
   so khớp byte-by-byte với file đã commit. Nếu CSV đổi mà tài liệu không, CI fail.
3. **Generated artifact / Tài liệu được sinh ra:** đừng sửa tay file này. Sửa CSV (hoặc cách trình đọc
   diễn giải) rồi chạy lại generator.

Reproduce / Tái tạo:

```bash
npm run generate:leaderboard   # regenerate docs/backtest-leaderboard.md from the CSV
npm run check:leaderboard      # fail if the committed doc has drifted
```

---

## 5. Strategy marketplace / Chợ chiến lược


Regenerate with `pnpm exec tsx scripts/run-all-backtests.ts` (30 days, `capitalUsdc: 5000`, paper mode). Every reported PnL is net of Polymarket CLOB costs — 10 bps taker on both entry and exit legs plus $0.05 gas per fill — applied in `backtest-fee-application.ts` and charged by `BacktestOrderManager` at close. Without that charge the ledger cannot distinguish a real edge from an unpaid trade.

The synthetic order book is derived from the tick index rather than sampled, so the same snapshots produce the same numbers run to run. The market set itself still comes from the live Gamma API, so a re-run months later can differ in which markets were available; numbers are comparable within a snapshot, not across time.

Tạo lại bằng `pnpm exec tsx scripts/run-all-backtests.ts` (30 ngày, `capitalUsdc: 5000`, chế độ paper). Mọi lợi nhuận báo cáo đã trừ chi phí Polymarket CLOB — phí taker 10 bps cho cả lệnh vào và lệnh ra, cộng $0.05 gas mỗi lần khớp — được áp trong `backtest-fee-application.ts` và tính bởi `BacktestOrderManager` khi đóng vị thế. Nếu không trừ, bảng số không phân biệt được lợi thế thật với giao dịch chưa trả tiền.

Sổ lệnh mô phỏng được sinh từ chỉ số tick chứ không lấy mẫu ngẫu nhiên, nên cùng một bộ dữ liệu cho ra cùng số. Tập hợp thị trường vẫn lấy từ Gamma API thật, nên chạy lại sau vài tháng có thể khác ở chỗ có những thị trường nào; các số chỉ so sánh được trong cùng một bộ dữ liệu, không so sánh được qua các mốc thời gian.

**Last run / Lần chạy gần nhất: 2026-11-06 — 30 strategies, 30 OK, 0 with positive net PnL.**

| Strategy | Sharpe | Win Rate | Net PnL (USD) | Profit Factor | Trades |
|:---|:---:|:---:|:---:|:---:|:---:|
| vwap-deviation-sniper | -11.93 | 0.00% | -0.81 | 0.00 | 4 |
| regime-adaptive-momentum | -27.71 | 0.00% | -10.80 | 0.00 | 15 |
| 28 other strategies | — | — | 0.00 | 0.00 | 0 |

**Reading this table / Cách đọc bảng:** 28 of 30 strategies produced no closed round trip at all, and both strategies that traded lost money after costs. Profit factor is capped at 100 rather than reported as `Infinity`, so a zero-loss run stays comparable and serializable. A zero-trade row is a data-coverage result, not a pass: it says the strategy never closed a trade on the snapshots it was given. Positions still open at the end of a run appear in `getTrades()` as fills with `pnl: null`; `getFillCosts()` carries the per-fill cost breakdown for closed fills only.

**Kết luận:** 28 trong 30 chiến lược không có bất kỳ vòng giao dịch đóng nào, và cả 2 chiến lược có giao dịch đều lỗ sau khi trừ phí. Profit factor bị chặn trần ở 100 thay vì báo `Infinity`, nên một chuỗi không lỗ vẫn có thể so sánh và ghi ra dạng số. Dòng "0 lệnh" là kết quả về dữ liệu, không phải điểm đạt: nó nói chiến lược không đóng được lệnh nào trên bộ dữ liệu được cấp. Vị thế còn mở cuối chạy thấy trong `getTrades()` dưới dạng lệnh có `pnl: null`; `getFillCosts()` chỉ chứa phân tích phí cho các lệnh đã đóng.

**Implication for real money / Hệ quả với tiền thật:** on this evidence no strategy qualifies for a live tranche. The next step is a longer paper run with recorded fills, not a guarded $100 live bet.

**Hệ quả:** dựa trên bằng chứng này, chưa có chiến lược nào đủ điều kiện nhận vốn thật. Bước tiếp theo là chạy paper dài hơn với dấu vết lệnh được ghi lại, chứ không phải thử $100 tiền thật có bảo vệ.
fb7934ee (refactor(backtesting): settle entry gas once on the closing fill)

Submit strategies through `src/platform/marketplace/` — that is where the platform's listings,
subscriptions, and reviews live (not `src/desk/strategies/marketplace.ts`, an in-memory store).
