# Security Policy / Chính Sách Bảo Mật (`@mekong/algo-trader`)

## 1. Supported Versions / Phiên Bản Hỗ Trợ

| Version | License Boundary | Supported | Security Updates |
|:---|:---|:---:|:---|
| `3.1.x` | Open-Core MIT + Cloud RaaS Control Plane | ✅ Yes | Active (HMAC-SHA256 + AES-256-GCM) |
| `< 3.0.0` | Legacy Monolith | ❌ No | Upgrade to `3.1.96+` |

## 2. Security Architecture / Kiến Trúc Bảo Mật Cốt Lõi

1. **Zero-Knowledge BYOK (Bring Your Own Keys):**
   - **English:** Community Edition (`BASIC` tier) users keep exchange API keys (Binance, OKX, Bybit) and Polymarket CLOB credentials strictly on their local workstation via `.env`.
   - **Tiếng Việt:** Người dùng bản Cộng đồng (`BASIC`) lưu trữ khóa API sàn giao dịch hoàn toàn trên máy cá nhân, không gửi khóa thô lên đám mây.
2. **AES-256-GCM Encrypted API Key Vault (`src/seed/security/`):**
   - Cloud RaaS subscribers (`PREMIUM | ENTERPRISE | MASTER`) store exchange keys encrypted at rest with AES-256-GCM and per-tenant key derivation.
3. **Cryptographic LicenseGate (`src/desk/opencoresaas2026monetization/license-gate.ts`):**
   - Cloud entitlements are signed and verified using `HMAC-SHA256` with timing-safe comparison (`crypto.timingSafeEqual`). Expired or under-tiered tokens return `HTTP 402 Payment Required` or `HTTP 401 Unauthorized`.
4. **Immutable SHA-256 Compliance Audit Ledger (`src/desk/security/audit-logger.ts`):**
   - Every automated order and risk gate transition is chained with `SHA-256` hashes to prevent tampering.
5. **Payment Webhook Verification (`src/billing/ipn-webhook.ts`):**
   - NOWPayments IPN (`HMAC-SHA512`) and PayOS VietQR (`HMAC-SHA256`) webhooks are cryptographically verified before activating tiers. Polar is strictly blocked.

## 3. Reporting a Vulnerability / Báo Cáo Lỗ Hổng Bảo Mật

- **DO NOT** open a public GitHub issue for security vulnerabilities or secret leaks.
- Email reports directly to `security@agencyos.network` with reproduction steps and affected module paths.
- We acknowledge valid vulnerability reports within **24 hours** and issue patches within **72 hours**.
