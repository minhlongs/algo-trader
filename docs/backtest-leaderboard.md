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
| Insufficient sample / Không đủ dữ liệu | 16 |
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
 | 1 | `bollinger-squeeze` | 19.52 | -0.00% | 100.00% | 7 | n/a — profit factor vô hạn trên mẫu quá nhỏ | 2.54 |
 | 2 | `volatility-targeting` | 8.11 | -0.02% | 50.00% | 8 | 2.20 | 1.98 |
 | 3 | `decay-rate-momentum` | 7.24 | -0.00% | 100.00% | 1 | n/a — profit factor vô hạn trên mẫu quá nhỏ | 0.36 |
 | 4 | `event-deadline-scalper` | 7.24 | -0.00% | 100.00% | 1 | n/a — profit factor vô hạn trên mẫu quá nhỏ | 0.32 |
 | 5 | `info-asymmetry-scanner` | 5.65 | -0.00% | 57.14% | 7 | 1.70 | 0.45 |
 | 6 | `liquidity-migration` | 2.37 | -0.01% | 50.00% | 8 | 1.23 | 0.19 |
 | 7 | `weighted-sentiment-aggregator` | -3.11 | -0.01% | 33.33% | 3 | 0.60 | -0.17 |
 | 8 | `regime-switch-detector` | -6.16 | -0.02% | 28.57% | 7 | 0.57 | -0.56 |
 | 9 | `vol-compression-breakout` | -7.24 | -0.00% | 0.00% | 1 | 0.00 | -0.12 |
 | 10 | `pivot-point-bounce` | -8.24 | -0.02% | 28.57% | 7 | 0.48 | -0.57 |
 | 11 | `mean-variance-optimizer` | -13.44 | -0.05% | 12.50% | 8 | 0.21 | -1.79 |
 | 12 | `time-weighted-mean-reversion` | -15.49 | -0.03% | 0.00% | 7 | 0.00 | -1.48 |
 | 13 | `vwap-deviation-sniper` | -17.12 | -0.01% | 0.00% | 7 | 0.00 | -0.54 |
 | 14 | `regime-adaptive-momentum` | -23.27 | -0.15% | 6.67% | 15 | 0.08 | -7.42 |

---

## 3. Insufficient sample / Không đủ dữ liệu

Các chiến lược sau có `total_trades = 0` trong CSV. Chúng **không** được gán Sharpe và **không** được
xếp hạng — cột trạng thái trong CSV của chúng không phải là hiệu năng.

The strategies below have `total_trades = 0` in the CSV. They are given **no** Sharpe value and **no**
rank — their response status is not performance.

| Strategy / Chiến lược | Total Trades / Cỡ mẫu | Status / Trạng thái |
|:---|:---:|:---|
| `spread-mean-reversion` | 0 | không đủ dữ liệu |
| `momentum-cascade` | 0 | không đủ dữ liệu |
| `cross-event-drift` | 0 | không đủ dữ liệu |
| `gap-fill-reversion` | 0 | không đủ dữ liệu |
| `orderbook-depth-ratio` | 0 | không đủ dữ liệu |
| `cluster-breakout` | 0 | không đủ dữ liệu |
| `cross-correlation-lag` | 0 | không đủ dữ liệu |
| `herd-behavior-detector` | 0 | không đủ dữ liệu |
| `markov-chain-predictor` | 0 | không đủ dữ liệu |
| `order-arrival-rate` | 0 | không đủ dữ liệu |
| `price-acceleration` | 0 | không đủ dữ liệu |
| `recency-bias-exploiter` | 0 | không đủ dữ liệu |
| `relative-strength-rotation` | 0 | không đủ dữ liệu |
| `stale-quote-sniper` | 0 | không đủ dữ liệu |
| `tail-risk-harvester` | 0 | không đủ dữ liệu |
| `whale-tracker` | 0 | không đủ dữ liệu |

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

Nộp chiến lược qua `src/platform/marketplace/` — đó là nơi quản lý danh sách, đăng ký và đánh giá
chiến lược của nền tảng (không phải `src/desk/strategies/marketplace.ts`, một kho lưu trong bộ nhớ).

Submit strategies through `src/platform/marketplace/` — that is where the platform's listings,
subscriptions, and reviews live (not `src/desk/strategies/marketplace.ts`, an in-memory store).
