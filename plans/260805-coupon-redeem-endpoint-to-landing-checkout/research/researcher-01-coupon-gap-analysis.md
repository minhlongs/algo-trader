# Coupon Redeem Gap Analysis



## Business Rule

The coupon lifecycle is `validate → apply → redeem`. Currently only `validate` and `apply` exist. The `redeem` step is missing, which means:

1. **Coupon usage is never recorded** when the landing page checkout button is clicked
2. **No server-side verification** that a coupon was actually used before redirecting to payment
3. **Usage count is not atomic** with the checkout redirect — a user could click, get a URL, but the coupon usage isn't tracked



## Schema (D1 `coupons` table)

```sql
code TEXT PK,
discount_pct INTEGER,
tier_lock TEXT,
free_access INTEGER,
expires_at TEXT,
usage_count INTEGER   ← this is what redeem should increment
```

The field exists in the DB but no handler increments it from the landing page checkout flow.



## Current Flow (Broken)

```
User clicks checkout button
  → getCheckoutUrl(tier, activeCoupon) returns NOWPayments URL
  → window.location.href = url
  → Coupon usage_count NEVER incremented
  → Server has no record of which coupon was used
```



## Worker Layer

- `coupon-handlers.ts` (KV layer) — has `handleValidateCoupon`, `handleApplyCoupon`, `handleActivateCoupon`
- `api/coupons.ts` (D1 layer) — has `handleValidateCoupon`, `handleApplyCoupon`
- Neither has `handleRedeemCoupon`

## Express Layer

- `billing/coupon-service.ts` — has `validateCoupon()`, `applyCoupon()`, `recordUse()` (separate from apply)
- `routes/coupon-routes.ts` — has POST `/`, GET `/`, POST `/apply`, DELETE `/:code` — NO `/redeem`

## Landing Page

- `forest/js/services/coupon-service.js` — has `validateCoupon()`, `calculatePrices()`, `activateCoupon()` — NO `redeemCoupon()`
- `forest/js/controllers/coupon-controller.js` — manages coupon state, does NOT call redeem on checkout click
- `forest/js/main.js` — `wireCheckoutButtons()` redirects directly without recording redemption



## Key Finding

The `apply` endpoint already increments `usage_count`. The question is: do we need a separate `redeem` endpoint, or should `apply` suffice?

**Decision:** The existing `apply` endpoint already increments usage count atomically. The gap is that the landing page never calls it before redirecting to checkout. The fix is:

1. Landing page calls `/api/coupons/redeem` before redirect (both Worker and Express)
2. The redeem endpoint validates + records the coupon + returns the checkout URL in one atomic call
3. This prevents double-use and ensures the coupon is properly tracked
