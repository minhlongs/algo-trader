# Scout Report: Coupon Redeem Endpoint Implementation



## Project Context

- **Project:** algo-trader (CashClaw)
- **Language:** TypeScript (Worker/Express), JavaScript (Landing page)
- **Framework:** Cloudflare Workers + D1 + KV, Express.js
- **Primary directory:** `/Users/macbook/algo-trader`



## Existing Coupon Implementation Files

| Layer | File | Status |
|-------|------|--------|
| Worker D1 | `src/platform/workers/api/coupons.ts` | Has validate + apply |
| Worker KV | `src/platform/workers/coupon-handlers.ts` | Has validate + apply + activate |
| Worker Router | `src/platform/workers/edge-proxy.ts` | Routes validate + apply |
| Express API | `src/platform/api/routes/coupon-routes.ts` | Has create + list + apply + delete |
| Express Svc | `src/platform/billing/coupon-service.ts` | Has validate + apply + recordUse |
| Landing svc | `landing/src/forest/js/services/coupon-service.js` | Has validate + calculate |
| Landing main | `landing/src/forest/js/main.js` | Calls getCheckoutUrl directly |
| Landing checkout | `landing/src/forest/js/services/checkout-service.js` | Pure URL routing |



## Key Finding: Two Separate Coupon Systems

1. **Worker API** (`/api/coupons/validate`, `/api/coupons/apply`) — D1-backed, has `free_access` support, KV fallback
2. **Express API** (`/api/coupons/apply`) — JSON file-backed at `data/coupons.json`, NO `freeAccess` support

Landing page calls Worker API (`API_BASE` = `https://api.cashclaw.cc`). This means the Worker side is the primary target.



## Current Gap

Landing page checkout buttons (`btn-free`, `btn-starter`, `btn-pro`, `btn-elite`) call:
```javascript
const url = getCheckoutUrl(tier, activeCoupon);
window.location.href = url;
```

No coupon usage is recorded. The `handleApplyCoupon` exists but is never called from the landing page.



## Touchpoints Analysis

main.js (landing only calls validate, never calls apply/redeem)
- coupon-service.js (landing only has validate, no redeem)
- edge-proxy.ts (only routes validate + apply)
- api/coupons.ts (only exports validate + apply)

The blast radius is SMALL: none of these functions are called from elsewhere in a way that would break. Adding `redeem` is purely additive.



## Existing Tests

`src/platform/workers/__tests__/coupons-kv-fallback.test.ts` — tests KV fallback for validate + apply. No redeem tests yet.



## Schema Confirmation

Worker D1 coupons table (per migration 046):
- `usage_count INTEGER` exists — this is what redeem should increment



## Endpoint Pattern Consistency

```
handleValidateCoupon  →  /api/coupons/validate  (POST)
handleApplyCoupon     →  /api/coupons/apply     (POST)
handleActivateCoupon  →  /api/coupons/activate  (POST)
[NEW] handleRedeemCoupon →  /api/coupons/redeem  (POST)
```

Consistent naming, consistent routing pattern.
