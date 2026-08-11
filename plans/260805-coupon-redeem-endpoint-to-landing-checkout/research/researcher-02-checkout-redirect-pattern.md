# Checkout Redirect Pattern Analysis



## Current main.js flow

```javascript
btn.addEventListener('click', (e) => {
  e.preventDefault();
  if (activeCoupon && activeCoupon.freeAccess) {
    showActivationModal(tier);
    return;
  }
  if (tier === 'FREE') {
    scroll to signup section
    return;
  }
  // ALL TIERS: direct redirect — no coupon recording
  const url = getCheckoutUrl(tier, activeCoupon);
  if (url) {
    window.location.href = url;
  }
});
```



## Required flow with redeem

```javascript
btn.addEventListener('click', async (e) => {
  e.preventDefault();
  if (activeCoupon && activeCoupon.freeAccess) {
    showActivationModal(tier);
    return;
  }
  if (tier === 'FREE') { ... return; }

  // Record coupon redemption before redirect
  if (activeCoupon) {
    const result = await redeemCoupon(tier, activeCoupon.code);
    if (!result.ok) {
      show coupon error message
      return;
    }
    // Use returned URL (may be different from cached one)
    if (result.url) {
      window.location.href = result.url;
    }
    return;
  }

  // No coupon: direct redirect
  const url = getCheckoutUrl(tier, null);
  if (url) {
    window.location.href = url;
  }
});
```



## Button href fallback

For non-JS users, `btn.href = CHECKOUT[tier].url` is set after wiring. This should remain as-is — JS users get the redeem flow, non-JS users get a direct link.



## API contract for redeem

Request: `POST /api/coupons/redeem`
```json
{ "code": "LAUNCH20", "tier": "PRO" }
```

Response:
```json
{
  "ok": true,
  "coupon": { "code": "LAUNCH20", "discountPct": 20, "freeAccess": false },
  "checkoutUrl": "https://nowpayments.io/payment?iid=...",
  "finalPrice": 119.20,
  "originalPrice": 149
}
```

Or error:
```json
{ "ok": false, "error": "Coupon expired" }
```
