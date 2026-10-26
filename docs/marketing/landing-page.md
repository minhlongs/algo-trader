# CashClaw & Solo Quant Desk — Dual-Funnel Landing Page Copy

> Canonical reference copy for `/` (Solo Quant Desk) and `/cashclaw` & `/pricing` (CashClaw RaaS).
> Polar-safe, verifiable, bilingual VN+EN.

---

## 1. Top of Funnel (`/` — Solo Quant Desk)

### Hero Section (EN)
- **Eyebrow:** Prediction-Market Desk · Polymarket
- **Headline:** Solo Quant Desk — Live on Polymarket
- **Tagline:** One human. Zero overhead. Open methodology.
- **Description:** A single operator runs an entire quantitative desk with an autonomous agent stack, a local model, and a public trade log. The claim is verifiable — every trade is recorded, every batch is published.
- **CTAs:**
  - `[Read Methodology]` → `/methodology`
  - `[Start CashClaw Free ($0)]` → `/pricing`
  - `[Read Manifesto]` → `/manifesto`

### Hero Section (VI)
- **Eyebrow:** Phòng Giao Dịch Định Lượng · Polymarket
- **Headline:** Solo Quant Desk — Trực tiếp trên Polymarket
- **Tagline:** Một người vận hành. Không chi phí thừa. Phương pháp minh bạch.
- **Description:** Một nhà nghiên cứu độc lập vận hành toàn bộ bàn giao dịch định lượng bằng hệ thống tác nhân tự chủ, mô hình cục bộ và nhật ký giao dịch công khai. Mọi số liệu đều có thể kiểm chứng — từng lệnh được ghi nhận, từng chu kỳ được công bố.
- **CTAs:**
  - `[Đọc Phương Pháp Luận]` → `/methodology`
  - `[Bắt Đầu Gói Miễn Phí ($0)]` → `/pricing`
  - `[Đọc Tuyên Ngôn]` → `/manifesto`

---

## 2. Conversion Funnel (`/pricing` — CashClaw RaaS)

### FREE — $0/mo (Forever)
- 1 active strategy
- 10 trades per day
- $25 daily loss cap
- $50 max position size
- Basic market scanning & Fail-Closed safety limits

### PRO — $49/mo (POPULAR)
- 5 active strategies
- 200 trades per day
- $500 daily loss cap
- $1,000 max position size
- Advanced market scanning, Fail-Closed safety limits, and full API access

### ENTERPRISE — $199/mo
- Unlimited active strategies
- Unlimited trades per day
- $10,000 daily loss cap
- $25,000 max position size
- Full coverage scanning, Fail-Closed safety limits, API access, and priority support

---

## 3. Core Differentiators

1. **Non-Custodial Execution:** Connect via trade-only Polymarket CLOB API keys. Capital never leaves your wallet.
2. **Quarter-Kelly Sizing:** Mathematically bounded position sizes `f* = (bp - q) / (4b)` to prevent fat-tail blowups.
3. **Fail-Closed Circuit Breaker:** Automatically trips and blocks orders on consecutive losses, daily drawdown limits, or state-store anomalies.
4. **Truth in Data:** Backtest leaderboards explicitly badge strategies with fewer than 30 trades (`INSUFFICIENT_SAMPLE (<30)`).
