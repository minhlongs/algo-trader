# Coupon Redeem Endpoint — CashClaw Landing Page Checkout

**Date:** 2026-08-02 → 2026-08-05
**Status:** Complete
**Objective:** Add `POST /api/coupons/redeem` to close the coupon lifecycle gap (validate → apply → redeem) and wire landing page checkout buttons to call it before redirecting to payment.

## Brainstorm Contract

**Outcome:** Atomic coupon validation + usage tracking + checkout URL creation at the moment the user clicks "Buy" on the landing page.

**Constraints:**
- No secrets in code — env vars only
- Existing `validate` and `apply` endpoints remain unchanged (backward compatibility)
- Free-access coupons (100% discount) bypass payment and show activation modal
- Cloudflare KV‑backed, zero VPS dependency

**Non-goals:**
- Dashboard coupon management (not in scope)
- Multi-step discount stacking
- Coupon generation UI

**Acceptance Criteria:**
1. `POST /api/coupons/redeem` returns `{ ok, coupon, checkoutUrl, finalPrice, originalPrice, discountPercent }`
2. Atomic: validates coupon, increments `currentUses` atomically, creates NOWPayments invoice in one call
3. Landing page checkout buttons call `redeemCoupon()` before redirect
4. Free-access coupons route to activation modal, not payment
5. All error states surface to user via coupon message area
6. Build compiles with 0 errors
