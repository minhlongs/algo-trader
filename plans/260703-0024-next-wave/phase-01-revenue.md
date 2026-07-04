---
title: "Phase 01: Revenue Growth"
description: "Close the critical gaps that prevent the platform from collecting revenue from PRO/Enterprise signups, enterprise leads, and payment webhooks."
status: pending
priority: P0 (items 1-3), P1 (items 4-5)
---

# Phase 01: Revenue Growth

## Context

Scout 1 identified that the platform has a solid billing foundation (NOWPayments, tier-gating, dunning) but several critical gaps prevent actual revenue collection:
- Signups activate PRO/Enterprise licenses without collecting payment
- Enterprise inquiry form is gated behind an ENTERPRISE tier check (circular)
- IPN webhook route may not be wired correctly
- Revenue analytics are gated to ENTERPRITE tier
- Dunning never emails customers

---

## Item 1.1: Fix Signup — require payment before PRO/Enterprise activation

**Priority:** P0 | **Complexity:** M | **Estimated time:** 2-3 hours

### Context Links
- Scout 1, GAP 1: `/plans/reports/scout-260702-2025-track-a-readiness-report.md`

### Requirements
- After signup with non-free tier (PRO/Enterprise), redirect to NOWPayments checkout
- License should be held in `pending_payment` status until IPN `finished` arrives
- Free tier signups should proceed as-is (no payment required)

### Files to Modify
1. `/Users/macbook/algo-trader/dashboard/src/pages/signup-page.tsx` — add checkout redirect after signup for non-free tiers
2. `/Users/macbook/algo-trader/src/platform/billing/license-service.ts` — add `pending_payment` status support, activation on IPN callback
3. `/Users/macbook/algo-trader/src/platform/api/routes/auth.ts` (or equivalent auth handler) — verify the signup route supports deferred activation

### Implementation Steps
1. In `signup-page.tsx`, after successful signup for `pro` or `enterprise` tiers:
   - Call `NowPaymentsService.createCheckoutUrl()` with the appropriate price
   - Redirect user to the NOWPayments checkout URL
   - Do NOT navigate to `/app` immediately for paid tiers
2. In `license-service.ts`:
   - Add 'pending_payment' to the LicenseStatus union (if not already present)
   - Require status == 'active' for gated operations (currently may accept 'pending_payment')
3. In the IPN handler (see Item 1.3), on `finished` payment status, activate the license

### Testing
- Unit test: signup with `free` tier → no payment redirect
- Unit test: signup with `pro` tier → calls `createCheckoutUrl`
- Manual test: create NOWPayments test invoice, verify redirect
- Verify license stays `pending_payment` until IPN callback

### Risks
- If NOWPayments is down, users cannot complete signup (acceptable — they can retry)
- Missing `NOWPAYMENTS_API_KEY` should be detected early and shown as a friendly error

### Rollback
- Revert `signup-page.tsx` changes; revert license status changes

---

## Item 1.2: Fix Enterprise inquiry form tier gate (circular dependency)

**Priority:** P0 | **Complexity:** S | **Estimated time:** 15 minutes

### Context Links
- Scout 1, GAP 3: enterprise-inquiry-routes.ts line 32

### Requirements
- The `POST /api/v1/enterprise/inquiries` endpoint is a contact form for prospective enterprise customers
- Remove the `requireTier('ENTERPRISE')` gate — it's a public endpoint
- Keep all GET/PATCH endpoints gated (admin-only)

### Files to Modify
1. `/Users/macbook/algo-trader/src/platform/api/routes/enterprise-inquiry-routes.ts`

### Implementation Steps
1. Change the POST handler from `requireTier('ENTERPRISE')` to no auth middleware (or `requireTier('FREE')` which accepts unauthenticated)
2. Verify the endpoint validates inputs (email, company name, contact name, tier, use case) which it already does
3. Ensure rate limiting is still applied (prevent spam)

### Testing
- Make a POST request without auth token → returns 201
- Make a POST request with missing fields → returns 400
- Verify GET/PATCH still require admin

### Risks
- None significant — the endpoint already validates inputs

### Rollback
- Re-add `requireTier('ENTERPRISE')` to the POST handler

---

## Item 1.3: Verify IPN webhook route, add idempotency, add credential guards

**Priority:** P0 | **Complexity:** M | **Estimated time:** 2-3 hours

### Context Links
- Scout Track A report: NOWPayments IPN section
- `/Users/macbook/algo-trader/src/platform/billing/nowpayments-service.ts`

### Requirements
- The IPN webhook HTTP route (`POST /api/webhooks/nowpayments`) must exist and be wired
- Duplicate `finished` callbacks must be idempotent (dedup by payment_id)
- Missing credential detection: fail fast if NOWPAYMENTS_API_KEY or NOWPAYMENTS_IPN_SECRET are missing
- HMAC-SHA512 signature verification must be enforced

### Files to Modify/Create
1. `/Users/macbook/algo-trader/src/platform/api/routes/webhooks.ts` (or `nowpayments.ts`) — verify/create the IPN route handler
2. `/Users/macbook/algo-trader/src/platform/billing/nowpayments-service.ts` — add idempotency check, add credential validation

### Implementation Steps
1. Check if `POST /api/webhooks/nowpayments` route exists in the Express router. If not, create it.
2. The handler should:
   - Verify HMAC-SHA512 signature from `x-nowpayments-sig` header
   - Check `payment_status === 'finished'`
   - Look up the invoice/order by `order_id` or `payment_id`
   - Check dedup: if already processed, return 200 (idempotent)
   - Activate the license/subscription
   - Return 200
3. In `NowPaymentsService` constructor:
   - Validate `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET` are set
   - Throw if missing (instead of silently logging)
4. Add dedup store (in-memory Map with TTL or DB records)

### Testing
- Unit: HMAC verification with known test secret
- Unit: duplicate callback returns 200 without double-activation
- Unit: missing credentials throws at startup
- Integration: POST to `/api/webhooks/nowpayments` with valid payload → 200
- Integration: POST with invalid signature → 401/403

### Risks
- Breakage if route doesn't exist and we add it without testing end-to-end
- Dedup store needs to survive restarts (use DB table)

### Rollback
- Remove the IPN route; revert error handling to soft-warning

---

## Item 1.4: Lower revenue API gate from ENTERPRISE to PRO

**Priority:** P1 | **Complexity:** S | **Estimated time:** 15 minutes

### Context Links
- Scout 1, GAP 2: revenue.ts lines 68, 97, 112, 146, 177

### Requirements
- `/revenue/summary`, `/revenue/mrr`, `/revenue/usage`, `/revenue/overage`, `/revenue/churn` should be accessible at PRO tier
- ENTERPRITE tier may still see the same data but gate is lowered to PRO
- (Optional) Add admin-only bypass via role check

### Files to Modify
1. `/Users/macbook/algo-trader/src/platform/api/routes/revenue.ts`

### Implementation Steps
1. Change all 5 route handlers from `requireTier('ENTERPRISE')` to `requireTier('PRO')`
2. The data is already computed for PRO tier in the downstream services
3. Verify no admin-only data leaks through the returned objects

### Testing
- Call each endpoint with a PRO-tier JWT → 200 with data
- Call each endpoint with FREE-tier JWT → 403
- Verify response shape unchanged

### Risks
- Low — only the authorization gate changes, not the data logic

### Rollback
- Revert to `requireTier('ENTERPRISE')` on all 5 routes

---

## Item 1.5: Add email notifications to dunning service

**Priority:** P1 | **Complexity:** M | **Estimated time:** 2 hours

### Context Links
- Scout 1, GAP 4: dunning-service.ts lines 68-109

### Requirements
- On first payment failure -> send "Payment failed" email with retry instructions
- On 2nd failure (warning stage) -> send "Action required" email
- On license suspension -> send "License suspended" email with reactivation steps
- On reinstatement -> send "License reinstated" confirmation email

### Files to Modify
1. `/Users/macbook/algo-trader/src/platform/billing/dunning-service.ts` — integrate email sending at each stage
2. `/Users/macbook/algo-trader/src/platform/notifications/email-service.ts` (or equivalent) — verify email service exists and works

### Implementation Steps
1. Identify the existing email service module in `src/platform/notifications/`
2. Import the email sender in `dunning-service.ts`
3. Add email calls at the 4 lifecycle points:
   - After `retryCount === 0` (first failure): warning email
   - After `retryCount >= 2`: escalation email
   - On `suspensionDate` set: suspension notice
   - On `reinstatementDate` set: reinstatement confirmation
4. Add email templates or use plain text with structured content

### Testing
- Unit: dunning workflow sends email at each stage (mock email service)
- Unit: dunning does not send email on first retry success
- Verify email service handles unreachable SMTP gracefully (logs warning, doesn't crash dunning)

### Risks
- If SMTP is misconfigured, dunning still works (license suspension) but emails don't send
- Email templates must be bilingual (Vietnamese + English) per project rules

### Rollback
- Comment out email calls in `dunning-service.ts`
