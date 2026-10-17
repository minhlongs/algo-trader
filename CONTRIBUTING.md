# Contributing to `@mekong/algo-trader` (`cashclaw`)
# Hướng Dẫn Đóng Góp Mã Nguồn Mở

Thank you for contributing to `@mekong/algo-trader`! This repository follows a **25-Step Open-Core Public GitHub + Cloud SaaS** architecture.

## 1. Open-Core Directory Boundary / Ranh Giới Mã Nguồn Mở & SaaS

| Layer | Directories | License | Purpose |
|:---|:---|:---:|:---|
| **OSS Core (CE)** | `src/desk/`, `src/engine/`, `src/commands/`, `src/trading/`, `src/paper-trading/` | **MIT** | 52+ strategies, CCXT/Polymarket BYOK adapters, paper trading, CLI (`cashclaw`) |
| **Cloud RaaS (EE)** | `src/raas/`, `src/billing/`, `src/durable-objects/`, `src/seed/security/` | **Proprietary / Dual-License** | Multi-tenant sharding, HMAC-SHA256 LicenseGate, HTTP 402 BillingMeter, NOWPayments/PayOS IPN |

## 2. Mandatory Engineering Rules / Quy Tắc Kỹ Thuật Bắt Buộc

1. **File Size `< 200 LOC`:** Every TypeScript code file must stay under **200 lines of code** (target `< 180 LOC`). Split large modules into focused single-responsibility files using descriptive `kebab-case` names.
2. **Zero `:any` Types:** Strict TypeScript typing is mandatory. Never introduce `:any` or new `eslint-disable` suppressions.
3. **Zero Secret Leaks:** Never commit `.env*`, API keys, private keys (`*.pem`), or tenant data. Run `algo-trader idea:25 --audit` before opening a Pull Request.
4. **Protected Flows (Do Not Break):**
   - Setup Wizard (`algo-trader setup` / `quickstart`)
   - Telegram Bot (`@Sophia_Bbot` webhook and commands)
   - Payment Flow (`NOWPayments` + `PayOS` IPN webhooks — **Polar is strictly forbidden**)
5. **Bilingual Documentation:** Keep user-facing documentation and CLI descriptions bilingual (English + Vietnamese).

## 3. Pre-PR Verification Checklist / Kiểm Tra Trước Khi Gửi PR

```bash
# 1. Verify TypeScript compilation (0 errors)
npm run typecheck

# 2. Run the 25-Step Open-Core & Company Blueprint test suite
npx vitest run tests/unit/desk/wave_316_opencore_saas_suite.test.ts tests/unit/desk/wave_316_company_blueprint_sync.test.ts

# 3. Run the CLI readiness & secret audit
npx ts-node src/index.ts idea:25 --audit
```

## 4. Contributor License Agreement (CLA)

By submitting a Pull Request, you agree to the terms in [`CLA.md`](./CLA.md).
