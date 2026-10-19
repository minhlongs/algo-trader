# AlgoTrade — Master Product Requirements Document (PRD)
## Multi-Tenant Quantitative Engine & Cloud RaaS Control Plane

**Version:** 2026.1-STITCH  
**Target ARR:** $1,000,000 USD (PSF Stage)  
**Target Audience:** Quantitative Traders, Hedge Funds, Prop Desks, Retail Algo Developers, Non-tech Asset Managers  
**Languages:** Bilingual Vietnamese & English (Song ngữ Việt - Anh)  
**Tiers:** `BASIC | PREMIUM | ENTERPRISE | MASTER`  
**Billing:** PayOS (VietQR VND, HMAC-SHA256) + NOWPayments (Crypto USDT, HMAC-SHA512) — *Polar Strictly Blocked*  
**Core Technologies:** Next.js 15, Tailwind CSS, TypeScript (Zero `:any`), Cloudflare Workers & Durable Objects, WebSockets, SHA-256 Audit Chain

---

## 1. Product Overview & Architecture Summary

AlgoTrade kết hợp một engine định lượng mã nguồn mở hiệu năng cao (Community Edition - MIT) với Cloud Control Plane RaaS (Robotics/Quant-as-a-Service) đa tầng. Hệ sinh thái giải quyết trọn vẹn 4 bài toán giao diện:
1. **Cloud RaaS Control Plane & Billing:** Giám sát danh mục, tự động hóa 24/7, đo lường MCU tiêu thụ thời gian thực, quản lý gói cước và thanh toán tức thì qua mã VietQR / USDT.
2. **Institutional Quant Cockpit:** Bảng điều khiển giao dịch độ trễ thấp, trực quan hóa sổ lệnh OFI (Order Flow Imbalance), thực thi tối ưu Almgren-Chriss TWAP/VWAP, và trạng thái phân vùng Durable Objects shard.
3. **Strategy Marketplace & Public Leaderboard:** Sàn giao dịch mô hình định lượng cộng đồng với cơ chế phân chia doanh thu 70/30 (Creator/Platform), bảng xếp hạng backtest minh bạch song ngữ VN/EN.
4. **Mobile Companion & Non-Tech Setup Wizard:** Trải nghiệm thiết lập API Key mã hóa AES-256-GCM không chạm (BYOK) và ứng dụng di động nhận cảnh báo `@Sophia_Bbot` kèm nút ngắt khẩn cấp (Emergency Kill-Switch).

---

## 2. Complete Screen Catalog (8 Core Screens)

1. **Screen 01: Master Cloud RaaS Dashboard (Desktop)**
   - Header hiển thị Portfolio Total Value ($1,248,500), 24h PnL (+3.42%), trạng thái kết nối sàn WebSocket (< 12ms).
   - Bento card hiển thị danh sách bot đang chạy (Almgren-Chriss, Cross-DEX Arb, Mean-Reversion), switch ON/OFF tức thì.
   - MCU Usage Meter: Thanh tiến trình hiển thị 18,400 / 25,000 MCU đã dùng trong tháng kèm nút "Nâng cấp gói / Top-up".
   - Widget cảnh báo rủi ro & Emergency Kill-Switch đỏ nổi bật có mã xác thực 2 lớp.

2. **Screen 02: Institutional Quant Cockpit & Execution Terminal (Desktop)**
   - Chart trung tâm: Nến thời gian thực (Candlestick + Depth Chart) tích hợp chỉ báo vi cấu trúc thị trường (Amihud Illiquidity, Roll Spread, OFI Delta).
   - Order Book kép & Khối thực thi Almgren-Chriss: Bảng đặt lệnh Buy/Sell song song, thanh trượt Half-Kelly sizing, tùy chọn `PAPER` / `SHADOW` / `LIVE`.
   - Shard Telemetry Panel: Theo dõi trạng thái Cloudflare Durable Objects (`shard-asia-1`, `shard-us-east`, `shard-eu-west`), độ trễ khớp lệnh P99.

3. **Screen 03: Strategy Marketplace & Creator Hub (Desktop)**
   - Lưới hiển thị các thuật toán định lượng đã được xác minh (Verified Badge).
   - Card chiến lược: Tên thuật toán, tác giả, phí thuê hàng tháng ($100/mo hoặc 2,500,000 VND/tháng), chỉ số Sharpe (2.85), Max Drawdown (-4.2%), Win Rate (74%).
   - Drawer chi tiết: Biểu đồ Monte Carlo 500 đường phân phối lợi nhuận, phân rã doanh thu 70% Tác giả / 30% Nền tảng, nút "Đăng ký thuê (1-Click Rent)".

4. **Screen 04: Bilingual Backtest & Alpha Leaderboard (Desktop & Mobile)**
   - Bảng xếp hạng chiến lược mở song ngữ Việt/Anh với bộ lọc tài sản (BTC, ETH, SOL, S&P500).
   - Cột chỉ số: Sharpe Ratio, Sortino, Calmar, Profit Factor, Alpha vs BTC Benchmark.
   - Banner chuyển đổi PLG: "Bạn thích chiến lược này? Triển khai ngay trên Cloud chỉ bằng 1 câu lệnh CLI: `algos deploy <strat-id>`".

5. **Screen 05: Multi-Tenant Billing & SHA-256 Audit Chain (Desktop)**
   - Quản lý gói cước: So sánh trực quan 4 gói `BASIC` ($0) | `PREMIUM` ($49/mo) | `ENTERPRISE` ($199/mo) | `MASTER` ($499/mo).
   - Hộp thanh toán tự động: Hiển thị mã VietQR động (PayOS) và địa chỉ ví USDT TRC20/BEP20 (NOWPayments).
   - Compliance Audit Ledger: Bảng nhật ký bất biến ghi nhận mọi lệnh với mã băm SHA-256 (`prev_hash` -> `current_hash`), nút kiểm tra tính toàn vẹn chữ ký số.

6. **Screen 06: Zero-Knowledge BYOK Onboarding Wizard (Desktop & Tablet)**
   - Stepper 4 bước đơn giản: 1. Chọn sàn (Binance, OKX, Bybit, Polymarket) → 2. Nhập API Key / Secret → 3. Cài đặt hạn mức rủi ro tối đa → 4. Kết nối Telegram `@Sophia_Bbot`.
   - Huy hiệu bảo mật: "Khóa của bạn được mã hóa phong bì AES-256-GCM tại Edge — nền tảng không lưu trữ private key".

7. **Screen 07: Mobile Companion & Risk Sentry (Mobile Responsive)**
   - Thẻ PnL thời gian thực với đồ thị Sparkline tối giản.
   - Danh sách vị thế mở kèm nút đóng nhanh (Quick Close Position).
   - Nút lớn đỏ "KILL-SWITCH KHẨN CẤP": Dừng toàn bộ bot và hủy toàn bộ lệnh mở ngay lập tức khi phát hiện biến động bất thường.

8. **Screen 08: Universal Component Design System & Style Guide (Design System Contract)**
   - Toàn bộ bảng màu nền, màu chữ, thẻ trạng thái (Success, Warning, Danger, Neutral).
   - Thư viện Button: Primary, Secondary, Ghost, Danger Kill-Switch, Loading states.
   - Thư viện Input, Select, Badge, Slider, Toggles, và Typography hierarchy scale (Monospace, Display, Body).

---

## 3. Design System Token Specifications

### Direction 1: "Obsidian Quantum" (Institutional Cyber-Quant)
- **Background Canvas:** `#08090C` (Ultra-Deep Black)
- **Surface / Card Background:** `#0F1218` với viền `#1E2430` (1px technical border)
- **Primary Accent (Signal Blue):** `#00F2FE` (Cyan / High Frequency Pulse)
- **Secondary Accent (Alpha Green):** `#00E599` (Mint / Positive PnL)
- **Danger Accent (Drawdown / Kill):** `#FF3B30` (Neon Red / Circuit Breaker)
- **Typography:**
  - Headlines: `Space Grotesk`, `Plus Jakarta Sans`
  - Numbers & Data Tables: `JetBrains Mono`, `Roboto Mono` (Tabular figures)
  - Body Copy: `Inter`, `Manrope`
- **Roundness:** `ROUND_FOUR` (4px - Sharp, precise financial aesthetic)

### Direction 2: "Bento RaaS Glass" (Modern Translucent SaaS)
- **Background Canvas:** `#0D1117` (Deep GitHub Slate)
- **Surface / Card Background:** `#161B22` với độ mờ backdrop blur (Glassmorphism), viền `#30363D`
- **Primary Accent:** `#6366F1` (Indigo Neon)
- **Secondary Accent:** `#10B981` (Emerald) & `#F59E0B` (Amber Warning)
- **Typography:** `Plus Jakarta Sans` cho toàn bộ UI + `Geist Mono` cho giá trị số
- **Roundness:** `ROUND_EIGHT` (8px - Soft bento card styling)

### Direction 3: "Nordic Minimalist Quant" (Clean High-Signal Terminal)
- **Background Canvas:** `#12151A` (Cold Muted Charcoal)
- **Surface / Card Background:** `#181D24`
- **Primary Accent:** `#2563EB` (Cobalt Blue)
- **Secondary Accent:** `#059669` (Subtle Forest Green)
- **Typography:** `Geist` + `Geist Mono`
- **Roundness:** `ROUND_FOUR` (Tối giản tối đa viền và bóng)

---

## 4. Key User Journeys & Interactive Flows

### Flow 1: 1-Click BYOK to 24/7 Cloud Execution (Onboarding to Live)
1. Người dùng mở trang web, chọn "Bắt đầu miễn phí (Community Edition)" hoặc "Đăng nhập RaaS".
2. Hệ thống đưa vào **Screen 06 (BYOK Wizard)**: Hướng dẫn tạo API Key chỉ đọc/giao dịch (tắt quyền rút tiền).
3. Người dùng nhập key, hệ thống mã hóa AES-256-GCM gửi tới Cloudflare Shard tương ứng.
4. Điều hướng tới **Screen 01 (Dashboard)**: Tự động kích hoạt bot Almgren-Chriss ở chế độ `PAPER` với $10,000 tiền ảo để làm quen.

### Flow 2: Thuê chiến lược trên Marketplace & Thanh toán PayOS/NOWPayments
1. Người dùng vào **Screen 03 (Marketplace)**, xem biểu đồ Sharpe 2.85 và lịch sử backtest minh bạch trên **Screen 04**.
2. Nhấn "Thuê thuật toán ($100/tháng)", chọn phương thức thanh toán.
3. Nếu chọn VND: Hệ thống mở popup **Screen 05** với mã VietQR (PayOS). Người dùng quét mã trên ứng dụng ngân hàng, Webhook IPN kích hoạt ngay lập tức (`code: '00'`).
4. Nếu chọn Crypto: Hệ thống tạo cổng thanh toán NOWPayments nhận USDT mạng TRC20/BEP20.
5. Bot tự động xuất hiện trong danh sách bot hoạt động trên **Screen 01**, chia sẻ doanh thu 70% cho tác giả chiến lược.

### Flow 3: Khủng hoảng thị trường & Kích hoạt Emergency Kill-Switch
1. Thị trường gặp biến động mạnh (Flash Crash), hệ thống phát cảnh báo PnL qua Telegram `@Sophia_Bbot` và Web Push notification.
2. Người dùng mở **Screen 07 (Mobile Companion)** hoặc **Screen 01 (Desktop Dashboard)**.
3. Nhấn nút đỏ nổi bật **"EMERGENCY KILL-SWITCH"**.
4. Lệnh gọi API gửi mã xác thực tới Cloud Shard, lập tức hủy toàn bộ lệnh chờ (IOC/GTC) và kích hoạt lệnh Market Close thanh lý vị thế về USDT/Cash an toàn.
5. Sự kiện được băm SHA-256 và lưu vĩnh viễn vào **Screen 05 (Audit Chain)** để đối soát.
