# Technical Blog: How We Built a Non-Custodial Market-Making & Cross-Event Arbitrage Engine on Polymarket (EN + VI)

> **Published:** October 26, 2026  
> **Author:** Solo Founder, CashClaw (`cashclaw.cc`)  
> **Reading time:** 10 min  
> **SEO Keywords:** Polymarket arbitrage engine, CLOB v2 market making, NegRisk arbitrage, Quarter-Kelly sizing, PostgreSQL MCU metering

---

## Part 1: English Edition

### 1. Introduction

In prediction markets, price inefficiencies arise constantly between mutually exclusive outcomes (NegRisk events), complementary binary contracts, and wide bid/ask spreads during high-volume news cycles.

Because Polymarket charges **0% maker fees**, an automated quantitative desk that quotes disciplined spreads and detects cross-outcome mispricings can harvest structural edge without taking unhedged directional gambles.

In this technical deep dive, we break down how **CashClaw & Solo Quant Desk** (`https://cashclaw.cc`) is architected.

---

### 2. Three Layers of Prediction-Market Alpha

#### 2.1 Fair-Value Spread Market Making
CashClaw continuously computes the volume-weighted midpoint across Polymarket CLOB order books and posts resting bid and ask limit orders around fair value. When both sides fill, the desk earns the spread with 0% maker fee leakage.

#### 2.2 NegRisk & Cross-Outcome Arbitrage
In multi-outcome markets where probabilities must sum to `1.00`, temporary retail order flow often pushes the sum of `YES` prices below `$0.98` or above `$1.02`. Our NegRisk scanner detects these deviations in real time and calculates exact fee-adjusted profitability before execution.

#### 2.3 Quarter-Kelly Sizing & Fail-Closed Execution
Every candidate order is sized via Quarter-Kelly `f* = (bp - q) / (4b)` and verified by `LiveExecutionGuard`:
- **Position Size Cap:** Rejects any order exceeding `maxPositionFraction` of desk capital.
- **Daily Drawdown Cap:** Halts trading immediately if realized + unrealized losses hit the daily limit (`$25` on Free, `$500` on Pro, `$10,000` on Enterprise).
- **Consecutive-Loss Circuit Breaker:** Trips automatically after 3 consecutive losing fills.
- **Fail-Closed State Hydration:** If SQLite or PostgreSQL state persistence encounters an error, the guard fails closed and blocks new orders.

---

### 3. Atomic Usage Metering (PostgreSQL MCU)

For our multi-tenant RaaS platform, quota enforcement must be deterministic under concurrent load. CashClaw uses a single-statement atomic PostgreSQL upsert (`INSERT ... ON CONFLICT (tenant_id, period_key) DO UPDATE`) inside `PostgresUsageStore` to track Monthly Compute Units (MCU) with zero race conditions and automatic memory fallback.

---

### 4. Production Pricing Tiers

| Tier | Price | Active Strategies | Daily Trades | Daily Loss Cap | Max Position |
|------|-------|-------------------|--------------|----------------|--------------|
| **Free** | **$0/mo** (forever) | 1 | 10 | $25 | $50 |
| **Pro** | **$49/mo** | 5 | 200 | $500 | $1,000 |
| **Enterprise** | **$199/mo** | Unlimited | Unlimited | $10,000 | $25,000 |

All plans are 100% non-custodial. Your USDC remains in your Polymarket wallet at all times.

👉 **Read the Open Methodology:** https://cashclaw.cc/methodology  
👉 **Deploy Your Desk:** https://cashclaw.cc/pricing

---

## Phần 2: Phiên Bản Tiếng Việt

### 1. Tổng quan Kiến trúc Tạo lập Thị trường & Arbitrage trên Polymarket

Trên các thị trường dự đoán sự kiện của Polymarket, sự chênh lệch giá (spread) và định giá sai giữa các nhánh kết quả loại trừ lẫn nhau (NegRisk) xuất hiện liên tục khi có tin tức mới. Nhờ chính sách **0% phí Maker**, hệ thống tự động đặt lệnh giới hạn (Limit Order) quanh vùng giá hợp lý có thể thu lợi nhuận từ chênh lệch giá mà không cần đánh cược xu hướng một chiều.

### 2. Ba Trụ cột Kỹ thuật của CashClaw

1. **Định cỡ vị thế Quarter-Kelly & Ngắt mạch Fail-Closed:** Tự động giới hạn quy mô từng lệnh, khóa giao dịch ngay khi chạm ngưỡng lỗ ngày (`$25` gói Free, `$500` gói Pro, `$10.000` gói Enterprise) hoặc khi thua 3 lệnh liên tiếp.
2. **Định lượng Trung thực (`INSUFFICIENT_SAMPLE`):** Mọi chiến lược backtest có dưới 30 giao dịch đều được gắn cảnh báo mẫu nhỏ công khai trên bảng xếp hạng.
3. **Đo lường Hạn mức Nguyên tử (Atomic PostgreSQL MCU):** Đảm bảo tính chính xác tuyệt đối cho từng tài khoản thuê bao RaaS với hơn **17.353+ bài kiểm thử tự động** xanh 100%.

### 3. Bắt đầu ngay hôm nay

- **Gói Free ($0/tháng mãi mãi):** 1 chiến lược, 10 lệnh/ngày, giới hạn lỗ $25/ngày.
- **Gói Pro ($49/tháng):** 5 chiến lược, 200 lệnh/ngày, giới hạn lỗ $500/ngày, mở khóa API.
- **Gói Enterprise ($199/tháng):** Không giới hạn chiến lược & số lệnh, giới hạn lỗ $10.000/ngày, hỗ trợ ưu tiên.

👉 **Xem Phương Pháp Luận:** https://cashclaw.cc/methodology  
👉 **Đăng Ký Miễn Phí ($0):** https://cashclaw.cc/signup?tier=free
