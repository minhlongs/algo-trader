# 25-Step Open-Core Public GitHub & SaaS Monetization Blueprint
# Chiến Lược 25 Bước Tái Cấu Trúc Mã Nguồn Mở & Thương Mại Hóa SaaS (`--deep`)

**Project / Dự án:** `@mekong/algo-trader` (`cashclaw`)  
**License Core / Giấy phép Core:** MIT (Open-Core)  
**Hosted RaaS / Dịch vụ Cloud:** Proprietary SaaS Control Plane  
**Pricing & Entitlement Tiers:** `BASIC | PREMIUM | ENTERPRISE | MASTER`  

---

## 1. Executive Summary / Tóm Tắt Dành Cho Lãnh Đạo
- **English:** This blueprint establishes an open-core flywheel for `algo-trader`. Developers adopt the MIT-licensed quantitative core (52+ trading strategies, CCXT/Polymarket BYOK connectors, local paper-trading CLI) via public GitHub. High-frequency execution, multi-tenant isolation, 24/7 cloud daemons, and strategy sharding are monetized through recurring cloud subscriptions (`BASIC`, `PREMIUM`, `ENTERPRISE`, `MASTER`) gated by cryptographic HMAC-SHA256 licenses and HTTP 402 quota metering.
- **Tiếng Việt:** Bản kế hoạch thiết lập cỗ máy tăng trưởng mở (Open-Core Flywheel) cho `algo-trader`. Cộng đồng lập trình viên tiếp cận mã nguồn mở MIT (hơn 52 chiến lược giao dịch định lượng, cổng kết nối sàn CCXT/Polymarket BYOK, CLI giả lập) trên GitHub. Các tính năng giao dịch cao tần, phân mảnh đám mây, vận hành daemon 24/7 và cách ly multi-tenant được thương mại hóa qua các gói SaaS định kỳ bảo vệ bởi chữ ký số HMAC-SHA256 và cổng HTTP 402 kiểm soát hạn mức.

---

## 2. 5 Architectural Phases & 25 Steps / 5 Giai Đoạn & 25 Bước Cụ Thể

### Phase 1: Codebase Split & Secret Hygiene / Phân Tách Mã Nguồn & Bảo Vệ Bí Mật
1. **Git History Secret Purge (Thanh lọc lịch sử Git):** Chạy `gitleaks` loại bỏ hoàn toàn các API key, private key hoặc token từng commit trong quá khứ.
2. **OSS vs EE Directory Split (Tách biệt thư mục Core & SaaS):** Giữ `src/desk/`, `src/commands/` làm nhân MIT mở; đóng gói `src/raas/`, `src/billing/` làm cloud control plane thương mại.
3. **Gitignore Quarantine Lock (Khóa cách ly Gitignore):** Chặn toàn bộ file `.env*`, chứng chỉ `*.pem`, hạt giống ví Web3 và cơ sở dữ liệu tạm thời.
4. **Zero-Secret BYOK Template (.env.example an toàn):** Cung cấp template `.env.example` chuẩn để lập trình viên tự điền API key sàn của riêng họ (Bring Your Own Keys).
5. **MIT License & Dependency SBOM (Bản quyền MIT & Kiểm toán SBOM):** Gắn header MIT bản quyền công khai và kiểm toán lỗ hổng thư viện phụ thuộc.

### Phase 2: Plugin Architecture & Extension Seams / Kiến Trúc Plugin & Cổng Mở Rộng
6. **Strategy Plugin Interfaces (Giao diện Plugin Chiến lược):** Mở `IStrategy` và `MarketDataSource` cho cộng đồng tự do phát triển chiến lược riêng.
7. **BYOK Exchange Adapters (Bộ kết nối sàn BYOK):** Tích hợp CCXT kết nối Binance, OKX, Bybit và Polymarket CLOB cục bộ.
8. **Cloud Signal Bridge (Cầu nối tín hiệu đám mây):** Webhook/WebSocket đẩy tín hiệu từ terminal máy trạm lên hệ thống cloud.
9. **Local Paper Trading Sandbox (Giả lập giao dịch máy trạm):** Backtesting xác định và dry-run không rủi ro tài chính ngay trên CLI `algo-trader arb:auto`.
10. **Versioned OpenAPI v3 Spec & SDK (Đặc tả OpenAPI v3 & SDK):** Công bố file OpenAPI v3 chuẩn hóa và SDK TypeScript có định kiểu mạnh.

### Phase 3: Cloud Control Plane & License Gate / Control Plane Đám Mây & Cổng Bản Quyền
11. **HMAC-SHA256 License Gate (Cổng xác thực bản quyền HMAC-SHA256):** Ký và kiểm tra token bản quyền mật mã; trả về `HTTP 402 Payment Required` nếu hết hạn.
12. **MCU & Strategy Quota Metering (Đo lường hạn mức MCU & Chiến lược):** Đo lường lượt gọi API và đơn vị tính toán thuật toán theo thời gian thực.
13. **Four-Tier Entitlements Guard (Phân quyền 4 cấp bậc):** Áp dụng hạn mức nghiêm ngặt: `BASIC` (1,000 MCU), `PREMIUM` (25,000 MCU), `ENTERPRISE` (250,000 MCU), `MASTER` (1,000,000 MCU).
14. **Durable Object Strategy Sharding (Phân mảnh chiến lược Durable Objects):** Phân mảnh dữ liệu giao dịch tần số cao qua Cloudflare Durable Objects và Redis queues.
15. **Encrypted API Key Vault (Kho khóa mã hóa AES-256-GCM):** Lưu trữ API key sàn của người dùng cloud trong kho bảo mật mã hóa AES-256-GCM.

### Phase 4: Enterprise & Monetization Triggers / Kích Hoạt Thương Mại Hóa Doanh Nghiệp
16. **Multi-Tenant RBAC Isolation (Cách ly dữ liệu Multi-Tenant & RBAC):** Đảm bảo mỗi tổ chức giao dịch trong sandbox riêng biệt, có phân quyền quản trị viên / trader.
17. **Immutable Compliance Audit Log (Nhật ký tuân thủ SHA-256 bất biến):** Chuỗi băm SHA-256 gắn kết từng quyết định vào lệnh phục vụ báo cáo kiểm toán minh bạch.
18. **Autonomous 24/7 Desk Daemon (Daemon vận hành tự động 24/7):** Lệnh `desk:auto` chạy liên tục trên server cloud và gửi cảnh báo qua Telegram `@Sophia_Bbot`.
19. **Strategy Marketplace & RevShare (Chợ chiến lược & Chia sẻ doanh thu):** Cho phép các quantitative trader đăng bán thuật toán, chia sẻ doanh thu tự động 70% tác giả / 30% nền tảng.
20. **Crypto & Fiat IPN Webhooks (Kích hoạt thanh toán tự động):** Tích hợp NOWPayments (USDT/Crypto) và PayOS (Chuyển khoản QR ngân hàng VN). *Tuân thủ Sophia Handover Rules: Tuyệt đối không dùng Polar*.

### Phase 5: Growth Loop, OSS Community & CI Gates / Vòng Lặp Tăng Trưởng & Quản Trị
21. **60-Second Quickstart CLI (Onboarding thần tốc 60 giây):** `git clone -> npm install -> algo-trader setup` hoạt động trơn tru trong 60 giây.
22. **CLI HTTP 402 Upgrade Prompt (Nhắc nâng cấp ngay trong Terminal):** Khi hết hạn mức miễn phí, terminal hiển thị thông báo kèm link thanh toán trực tiếp.
23. **CI LOC & Secret Leak Gate (Cổng CI kiểm soát mã nguồn):** Tự động chặn mọi file vượt quá 200 dòng code, chặn kiểu `:any` và phát hiện rò rỉ secret.
24. **Public Backtest Leaderboard (Bảng xếp hạng hiệu suất minh bạch):** Hiển thị chỉ số Sharpe, drawdown và Monte Carlo công khai trên GitHub để tạo độ tin cậy.
25. **CLA & Dual-License Governance (Thỏa thuận đóng góp mã nguồn & Bản quyền kép):** Quy định quyền sở hữu thương hiệu `@mekong/algo-trader` và cơ chế cấp phép kép.

---

## 3. CLI Usage / Hướng Dẫn Sử Dụng Lệnh Terminal

```bash
# Xem danh sách đầy đủ 25 bước
algo-trader idea:25 --steps

# Xem chi tiết một bước cụ thể (ví dụ bước 11: HMAC License Gate)
algo-trader idea:25 --step 11

# Chạy kiểm toán tự động tính sẵn sàng & rò rỉ secret trước khi publish GitHub
algo-trader idea:25 --audit

# Mô phỏng tính toán phễu doanh thu SaaS PLG ARR
algo-trader idea:25 --funnel
```
