---
title: Phase 1 — NOWPayments Sandbox Account Setup
status: pending
priority: P1
phase: 1
---

# Phase 1: NOWPayments Sandbox Account

## Overview

Register a test-mode merchant account with NOWPayments to obtain sandbox credentials for staging E2E validation.

## Key Insights

- NOWPayments test mode: `https://api-test.nowpayments.io/v1` (separate from production `api.nowpayments.io`)
- Test mode allows instant payment completion — no real crypto needed
- Merchant signup requires email + company info (KYC-light for test mode)
- Test API keys are issued immediately after email verification

## Requirements

1. NOWPayments test merchant account (email + company name)
2. Test API key (for creating invoices, checking payment status)
3. Test IPN secret (for webhook signature verification)
4. Test invoice IDs for PRO and ENTERPRISE tiers (create in NOWPayments sandbox dashboard)

## Steps

### 1. Sign Up

Go to NOWPayments test merchant registration:
- URL: `https://nowpayments.io` → sign up → enable test mode
- Or: `https://api-test.nowpayments.io` docs link
- Fill: company name, email, password
- Verify email (check inbox)

### 2. Create Test Invoices

In sandbox dashboard:
1. Create invoice for PRO tier ($99) → copy invoice ID
2. Create invoice for ENTERPRISE tier ($299) → copy invoice ID
3. Note these IDs — they map to `NOWPAYMENTS_INVOICE_PRO` and `NOWPAYMENTS_INVOICE_ENTERPRISE`

### 3. Get Credentials

From sandbox dashboard / API settings:
- **API Key**: for REST API calls (create invoice, check status)
- **IPN Secret**: for webhook signature verification
- **Callback URL template**: staging webhook URL (see Phase 2)

## Outputs

Provide to next phase:
```
NOWPAYMENTS_API_KEY=<test-key>
NOWPAYMENTS_IPN_SECRET=<test-secret>
NOWPAYMENTS_INVOICE_PRO=<sandbox-invoice-id-pro>
NOWPAYMENTS_INVOICE_ENTERPRISE=<sandbox-invoice-id-enterprise>
NOWPAYMENTS_IPN_URL=https://algo-trader-staging.workers.dev/api/v1/webhooks/nowpayments
```

## Files Touched

None — this phase is user-executed account setup.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Email verification delayed | Low | Check spam folder; NOWPayments sends immediately |
| Sandbox dashboard UI differs from docs | Medium | Use API directly as fallback |
| Test mode features limited | Low | Core flow (invoice → payment → IPN) is supported |

## Success Criteria

- [ ] Email verified, sandbox dashboard accessible
- [ ] Test API key + IPN secret obtained
- [ ] Two test invoice IDs created (PRO + ENTERPRISE)
- [ ] Credentials documented for Phase 2
