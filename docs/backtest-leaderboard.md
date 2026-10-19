# Quantitative Backtest & Strategy Leaderboard / Bảng Xếp Hạng Chiến Lược

> **Bilingual Documentation / Tài Liệu Song Ngữ (Vietnamese + English)**  
> Platform: `@mekong/algo-trader` / `cashclaw.cc`  
> Quality Ratchet: Walk-Forward Overfitting Guard & Monte Carlo Stability

---

## 1. Overview / Tổng Quan

The Quantitative Backtest Leaderboard ranks institutional and community strategies across crypto (Binance, OKX, Bybit) and prediction markets (Polymarket CLOB). All metrics are derived from deterministic out-of-sample backtests with execution slippage and taker fees applied.

Bảng xếp hạng chiến lược định lượng đánh giá các chiến lược giao dịch của tổ chức và cộng đồng trên các sàn giao dịch crypto lớn và thị trường dự đoán Polymarket. Tất cả chỉ số được tính toán từ mô phỏng kiểm thử ngoài mẫu (out-of-sample) với chi phí trượt giá và phí giao dịch thực tế.

---

## 2. Institutional Strategy Rankings / Bảng Xếp Hạng Chiến Lược Tổ Chức

| Rank | Strategy Name | Asset / Market | Sharpe Ratio | Max Drawdown | Win Rate | Annualized Return | Min Tier |
|:---:|:---|:---|:---:|:---:|:---:|:---:|:---:|
| 1 | **Cross-DEX Arbitrage V2** | SOL/USDT, ETH/USDT | **3.82** | -2.4% | 88.5% | +64.2% | `ENTERPRISE` |
| 2 | **Polymarket High-Prob Bias** | Elections & Macro | **3.24** | -4.1% | 82.0% | +48.7% | `PREMIUM` |
| 3 | **Funding Rate Carry Arbitrage** | BTC/USDT Perp | **2.95** | -1.8% | 94.2% | +28.5% | `PREMIUM` |
| 4 | **Statistical Mean Reversion** | Top 20 Altcoins | **2.41** | -8.5% | 63.8% | +42.1% | `BASIC` |
| 5 | **Microstructure Order Flow Imbalance** | BTC Order Book | **2.18** | -6.2% | 59.4% | +36.8% | `BASIC` |

---

## 3. Evaluation Methodology / Phương Pháp Đánh Giá

1. **Deterministic Slippage Modeling / Mô hình hóa trượt giá:**
   - Maker/Taker fees calculated at 7.5 bps baseline (AMM pools at 30 bps).
   - Quadratic market impact model based on order size vs. 1-minute order book depth.
2. **Walk-Forward Validation / Kiểm thử tịnh tiến (Walk-Forward):**
   - 70% in-sample training window, 30% out-of-sample validation window.
   - Strategy must pass 5 consecutive walk-forward folds without Sharpe degradation > 20%.
3. **Monte Carlo Confidence Test / Kiểm định Monte Carlo:**
   - 10,000 synthetic paths generated with randomized trade execution sequencing.
   - Worst 5% Value-at-Risk (VaR) must not breach max drawdown ceiling.

---

## 4. Community Strategy Marketplace / Chợ Chiến Lược Cộng Đồng

Community developers can submit quantitative models via `src/desk/strategies/marketplace.ts`.
- **Revenue Share:** 70% Creator / 30% Platform.
- **Verification Gate:** Must provide reproducible backtest script and achieve Sharpe Ratio ≥ 1.8.
