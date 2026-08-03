---
phase: 3
title: "NOWPayments Billing"
status: completed
effort: "1 day"
---

# Phase 3: NOWPayments Billing

## Overview
NOWPayments billing integration for the Signals API marketplace. IPN webhook handler (handleSignalsIpnFinished/handleSignalsIpnCancelled) routes signals subscription upgrades/cancellations. Tier mapping: Signals Basic=$29, Pro=$99, Enterprise=$299. NOWPAYMENTS_TIERS constant maps plan IDs to SignalTier.

## Implementation Steps
1. Created signals-payment-handler.ts (exported from subscription-handler.ts)
   - handleSignalsIpnFinished: upgrades subscription tier on payment success
   - handleSignalsIpnCancelled: downgrades/freezes on payment failure
2. Added NOWPAYMENTS_TIERS constant mapping plan IDs to SignalTier enum
3. Integrated into webhook routing in subscription-handler.ts
4. Tests: existing billing test suite covers signals payment flow

## Success Criteria
- [x] IPN webhook routes signals payment events (finished/cancelled)
- [x] NOWPAYMENTS_TIERS maps plan IDs to SIGNALS_BASIC/PRO/ENTERPRISE
- [x] Handlers importable and wired into subscription-handler.ts
- [x] 0 regressions in billing tests

## Success Criteria
- [x] IPN webhook routes signals payment events (finished/cancelled)
- [x] NOWPAYMENTS_TIERS maps plan IDs to SIGNALS_BASIC/PRO/ENTERPRISE
- [x] Handlers importable and wired into subscription-handler.ts
- [x] 0 regressions in billing tests
