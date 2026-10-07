# Plan: Wave 6 Billing Gateway Hardening & Automated Onboarding Delivery

**Status**: COMPLETED  
**Architecture**: Edge Cloudflare Workers + Node.js Express + D1/KV + PostgreSQL

## Objectives
1. Eliminate false 401 signature rejections by implementing recursive alphabetical key sorting (`ksort`) in NOWPayments IPN verification across gateway & origin.
2. Integrate Resend edge-native transactional email provider with AWS SES fallback, unblocking drip sequences.
3. Wire end-to-end 3-step onboarding flow (`signup` -> `verify` -> `activate`) with KV cache synchronization.
4. Verify Quality Ratchet v1.1.0 (100% test pass, lines >=95%, branches >=86.00%, <=200 LOC per file).

## Dependency Graph & Execution Matrix
```
[Phase 1: NOWPayments HMAC Sort] ──┐
                                   ├──> [Phase 3: Onboarding & Activation] ──> [Phase 4: Ratchet & Tests]
[Phase 2: Resend Email Adapter]  ──┘
```

## Phase Breakdown
- **Phase 1**: [phase-01-nowpayments-ipn-sorted-hmac.md](./phase-01-nowpayments-ipn-sorted-hmac.md) — HMAC-SHA512 key sort + timingSafeEqual hardening (Completed)
- **Phase 2**: [phase-02-resend-edge-email-adapter.md](./phase-02-resend-edge-email-adapter.md) — Edge-native Resend transactional email provider (Completed)
- **Phase 3**: [phase-03-onboarding-license-activation-flow.md](./phase-03-onboarding-license-activation-flow.md) — Automated OTP verification & KV sync (Completed)
- **Phase 4**: [phase-04-verification-and-quality-ratchet.md](./phase-04-verification-and-quality-ratchet.md) — Branch coverage & 12/12 ratchet verification (Completed)
