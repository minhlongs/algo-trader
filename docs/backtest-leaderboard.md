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
| Ranked (have trades) / Có xếp hạng (có lệnh) | 30 |
| Statistically significant (≥ 30 trades) / Đủ mẫu thống kê (≥ 30 lệnh) | 27 |
| Small sample (< 30 trades — `INSUFFICIENT_SAMPLE (<30)`) / Cỡ mẫu nhỏ (< 30 lệnh) | 3 |
| Insufficient sample (0 trades — `NO_TRADES`) / Không đủ dữ liệu (0 lệnh) | 0 |
| Total trades backtested / Tổng số lệnh đã kiểm thử | 5131 |
| Net P&L across all rows / Lãi lỗ ròng toàn bộ dòng | -857.82 USD |
| Ranked rows with negative Sharpe / Dòng có Sharpe âm | 21 |
| Ranked rows with infinite profit factor / Dòng có profit factor vô hạn | 0 |

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
 | 1 | `tail-risk-harvester` | 34.42 | -0.00% | 100.00% | 20 (INSUFFICIENT_SAMPLE (<30)) | 100.00 | 243.60 |
 | 2 | `recency-bias-exploiter` | 11.85 | -0.22% | 68.42% | 152 | 1.66 | 29.06 |
 | 3 | `time-weighted-mean-reversion` | 9.67 | -0.23% | 62.03% | 79 | 2.12 | 37.00 |
 | 4 | `vwap-deviation-sniper` | 9.05 | -0.18% | 57.53% | 73 | 2.33 | 32.57 |
 | 5 | `orderbook-depth-ratio` | 8.13 | -0.82% | 62.90% | 124 | 1.81 | 114.64 |
 | 6 | `spread-mean-reversion` | 5.87 | -0.17% | 64.29% | 140 | 1.28 | 10.21 |
 | 7 | `markov-chain-predictor` | 5.64 | -0.68% | 63.73% | 284 | 1.23 | 26.98 |
 | 8 | `cross-correlation-lag` | 3.47 | -0.95% | 58.45% | 361 | 1.12 | 22.03 |
 | 9 | `bollinger-squeeze` | 2.46 | -0.08% | 66.67% | 6 (INSUFFICIENT_SAMPLE (<30)) | 1.59 | 2.38 |
 | 10 | `regime-adaptive-momentum` | -0.41 | -0.49% | 57.58% | 99 | 0.98 | -1.53 |
 | 11 | `order-arrival-rate` | -2.05 | -0.42% | 64.17% | 120 | 0.91 | -4.81 |
 | 12 | `gap-fill-reversion` | -2.22 | -0.73% | 43.70% | 119 | 0.90 | -11.46 |
 | 13 | `info-asymmetry-scanner` | -7.02 | -1.08% | 52.50% | 280 | 0.76 | -37.85 |
 | 14 | `whale-tracker` | -7.04 | -0.26% | 64.71% | 51 | 0.70 | -11.72 |
 | 15 | `cross-event-drift` | -7.26 | -1.24% | 41.27% | 126 | 0.66 | -51.54 |
 | 16 | `herd-behavior-detector` | -10.27 | -0.02% | 50.00% | 8 (INSUFFICIENT_SAMPLE (<30)) | 0.46 | -1.16 |
 | 17 | `mean-variance-optimizer` | -10.36 | -1.70% | 35.29% | 136 | 0.55 | -75.91 |
 | 18 | `vol-compression-breakout` | -10.38 | -0.34% | 10.81% | 37 | 0.36 | -14.27 |
 | 19 | `pivot-point-bounce` | -11.52 | -1.25% | 37.08% | 89 | 0.41 | -62.30 |
 | 20 | `liquidity-migration` | -11.65 | -1.64% | 47.09% | 361 | 0.69 | -70.11 |
 | 21 | `regime-switch-detector` | -12.83 | -0.91% | 24.30% | 107 | 0.50 | -44.81 |
 | 22 | `weighted-sentiment-aggregator` | -13.06 | -1.34% | 37.96% | 324 | 0.67 | -61.23 |
 | 23 | `cluster-breakout` | -17.60 | -0.70% | 50.65% | 77 | 0.24 | -34.85 |
 | 24 | `momentum-cascade` | -19.04 | -1.76% | 45.30% | 234 | 0.49 | -85.12 |
 | 25 | `relative-strength-rotation` | -20.17 | -1.82% | 55.51% | 236 | 0.50 | -80.03 |
 | 26 | `stale-quote-sniper` | -31.29 | -1.40% | 35.59% | 177 | 0.20 | -69.84 |
 | 27 | `decay-rate-momentum` | -31.49 | -2.84% | 38.52% | 270 | 0.40 | -139.14 |
 | 28 | `event-deadline-scalper` | -43.22 | -3.56% | 30.57% | 314 | 0.27 | -177.78 |
 | 29 | `volatility-targeting` | -48.98 | -1.70% | 13.37% | 329 | 0.12 | -84.93 |
 | 30 | `price-acceleration` | -50.53 | -5.15% | 31.16% | 398 | 0.19 | -255.90 |

---

## 3. Insufficient sample / Không đủ dữ liệu

Các chiến lược sau có `total_trades = 0` trong CSV. Chúng **không** được gán Sharpe và **không** được
xếp hạng — cột trạng thái trong CSV của chúng không phải là hiệu năng.

The strategies below have `total_trades = 0` in the CSV. They are given **no** Sharpe value and **no**
rank — their response status is not performance.

| Strategy / Chiến lược | Total Trades / Cỡ mẫu | Status / Trạng thái |
|:---|:---:|:---|

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
4. **Reported numbers are net of venue costs / Mọi số báo cáo đã trừ chi phí sàn:** mọi lợi nhuận trong
   bảng đã trừ phí taker 10 bps cho cả lệnh vào và lệnh ra, cộng $0.05 gas mỗi lần khớp, theo hồ sơ
   `polymarket_clob` trong `src/desk/sor/fee-gas-model.ts`. Nếu không trừ, bảng số không phân biệt
   được lợi thế thật với giao dịch chưa trả tiền. Sổ lệnh mô phỏng sinh theo chỉ số tick nên cùng dữ
   liệu cho ra cùng số; tập thị trường lấy từ Gamma API thật nên các số chỉ so sánh được trong cùng
   một bộ dữ liệu.

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
