# Algo Trader / CashClaw Documentation Index

Comprehensive technical documentation for Algo Trader / CashClaw v3.1.96.

---

## Overview

Algo Trader is an enterprise algorithmic trading platform supporting 52+ automated strategies, cross-exchange routing (Binance, OKX, Bybit, Polymarket CLOB), crypto billing, and subscriber lifecycle management.

### Key Documentation Links

- **Architecture**: [`docs/system-architecture.md`](./system-architecture.md)
- **Product Overview & PDR**: [`docs/project-overview-pdr.md`](./project-overview-pdr.md)
- **Code Standards**: [`docs/code-standards.md`](./code-standards.md)
- **Development Roadmap**: [`docs/project-roadmap.md`](./project-roadmap.md)
- **Technology Stack**: [`docs/tech-stack.md`](./tech-stack.md)
- **Design Guidelines**: [`docs/design-guidelines.md`](./design-guidelines.md)
- **Interactive Wireframe**: [`docs/wireframes/onboarding-checkout.html`](./wireframes/onboarding-checkout.html)

---

## Core Subsystems

### 1. Trading Desk & Execution Engine (`src/desk/`, `src/engine/`)
- Polymarket CLOB, Binance, OKX, and Bybit order execution.
- Smart order routing (SOR) with millisecond latency bounds.
- Dual-kernel isolation: desk execution vs. platform RaaS services.

### 2. Billing & Subscription Gateway (`src/billing/`, `src/platform/billing/`)
- **NOWPayments Webhook Verification**: Recursive key sorting (`ksort`) for HMAC-SHA512 validation with timing-safe comparison (`crypto.timingSafeEqual` and `constantTimeEqual`).
- **Tier Activation**: Auto-provisions subscriber quotas (`BASIC`, `PREMIUM`, `ENTERPRISE`, `MASTER`).
- **Proactive Invalidation**: Downgrades (`refunded`, `failed`, `expired`) trigger immediate Cloudflare KV eviction (`tier:${tenantId}`), eliminating stale authorization windows.

### 3. Edge Notifications & Email Provider (`src/platform/notifications/`)
- Zero-dependency edge email delivery via `resend-email-provider.ts` utilizing native `fetch`.
- Compatible with Cloudflare Workers runtime and Node.js.
- Automated token sanitization and rate-limit backoff handling.

### 4. Customer Onboarding State Machine (`src/platform/billing/onboarding-service.ts`)
- 3-step activation workflow: `signup` (validation + 6-digit OTP) -> `verify` (code + TTL match) -> `activate` (cryptographic license generation).
- PostgreSQL storage with drip sequence enrollment.

---

## Quality Ratchet & CI Gates

Algo Trader enforces Quality Ratchet v1.1.0 across 12 automated gates:
1. **Test Suite**: 100% pass rate across all unit & integration test files.
2. **Line Coverage**: $\ge 95.00\%$.
3. **Function Coverage**: $\ge 93.00\%$.
4. **Branch Coverage**: $\ge 86.00\%$.
5. **Statement Coverage**: $\ge 94.00\%$.
6. **Strict Types**: 0 `:any` types in TypeScript.
7. **Console Sanitation**: $\le 2$ non-logger console calls.
8. **File Size Boundary**: 0 oversized files ($>200$ LOC in `src/`).
9. **Import Quarantine**: 0 banned legacy imports.
10. **ESLint Baseline**: 0 new ESLint suppressions.
11. **Typecheck Gate**: `tsc --noEmit` exit 0.
12. **Build Gate**: `npm run build` exit 0.

---

## Quick Reference Commands

```bash
# Typecheck
npm run typecheck

# Run unit tests
npm test

# Run quality ratchet verification
node scripts/check-quality-baseline.mjs --quality

# Build platform
npm run build
```
