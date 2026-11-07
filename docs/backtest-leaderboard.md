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
| Ranked (have trades) / Có xếp hạng (có lệnh) | 2 |
| Statistically significant (≥ 30 trades) / Đủ mẫu thống kê (≥ 30 lệnh) | 0 |
| Small sample (< 30 trades — `INSUFFICIENT_SAMPLE (<30)`) / Cỡ mẫu nhỏ (< 30 lệnh) | 2 |
| Insufficient sample (0 trades — `NO_TRADES`) / Không đủ dữ liệu (0 lệnh) | 28 |
| Total trades backtested / Tổng số lệnh đã kiểm thử | 19 |
| Net P&L across all rows / Lãi lỗ ròng toàn bộ dòng | -11.61 USD |
| Ranked rows with negative Sharpe / Dòng có Sharpe âm | 2 |
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
 | 1 | `vwap-deviation-sniper` | -11.93 | -0.02% | 0.00% | 4 (INSUFFICIENT_SAMPLE (<30)) | 0.00 | -0.81 |
 | 2 | `regime-adaptive-momentum` | -27.71 | -0.22% | 0.00% | 15 (INSUFFICIENT_SAMPLE (<30)) | 0.00 | -10.80 |

---

## 3. Insufficient sample / Không đủ dữ liệu

Các chiến lược sau có `total_trades = 0` trong CSV. Chúng **không** được gán Sharpe và **không** được
xếp hạng — cột trạng thái trong CSV của chúng không phải là hiệu năng.

The strategies below have `total_trades = 0` in the CSV. They are given **no** Sharpe value and **no**
rank — their response status is not performance.

| Strategy / Chiến lược | Total Trades / Cỡ mẫu | Status / Trạng thái |
|:---|:---:|:---|
| `spread-mean-reversion` | 0 | không đủ dữ liệu (NO_TRADES) |
| `bollinger-squeeze` | 0 | không đủ dữ liệu (NO_TRADES) |
| `momentum-cascade` | 0 | không đủ dữ liệu (NO_TRADES) |
| `cross-event-drift` | 0 | không đủ dữ liệu (NO_TRADES) |
| `decay-rate-momentum` | 0 | không đủ dữ liệu (NO_TRADES) |
| `event-deadline-scalper` | 0 | không đủ dữ liệu (NO_TRADES) |
| `gap-fill-reversion` | 0 | không đủ dữ liệu (NO_TRADES) |
| `liquidity-migration` | 0 | không đủ dữ liệu (NO_TRADES) |
| `orderbook-depth-ratio` | 0 | không đủ dữ liệu (NO_TRADES) |
| `pivot-point-bounce` | 0 | không đủ dữ liệu (NO_TRADES) |
| `regime-switch-detector` | 0 | không đủ dữ liệu (NO_TRADES) |
| `cluster-breakout` | 0 | không đủ dữ liệu (NO_TRADES) |
| `cross-correlation-lag` | 0 | không đủ dữ liệu (NO_TRADES) |
| `herd-behavior-detector` | 0 | không đủ dữ liệu (NO_TRADES) |
| `info-asymmetry-scanner` | 0 | không đủ dữ liệu (NO_TRADES) |
| `markov-chain-predictor` | 0 | không đủ dữ liệu (NO_TRADES) |
| `mean-variance-optimizer` | 0 | không đủ dữ liệu (NO_TRADES) |
| `order-arrival-rate` | 0 | không đủ dữ liệu (NO_TRADES) |
| `price-acceleration` | 0 | không đủ dữ liệu (NO_TRADES) |
| `recency-bias-exploiter` | 0 | không đủ dữ liệu (NO_TRADES) |
| `relative-strength-rotation` | 0 | không đủ dữ liệu (NO_TRADES) |
| `stale-quote-sniper` | 0 | không đủ dữ liệu (NO_TRADES) |
| `tail-risk-harvester` | 0 | không đủ dữ liệu (NO_TRADES) |
| `time-weighted-mean-reversion` | 0 | không đủ dữ liệu (NO_TRADES) |
| `vol-compression-breakout` | 0 | không đủ dữ liệu (NO_TRADES) |
| `volatility-targeting` | 0 | không đủ dữ liệu (NO_TRADES) |
| `weighted-sentiment-aggregator` | 0 | không đủ dữ liệu (NO_TRADES) |
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
