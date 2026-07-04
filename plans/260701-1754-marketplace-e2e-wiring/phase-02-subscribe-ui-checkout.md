# Phase 02 — Subscribe UI + Checkout Redirect

**Priority:** P0 | **Status:** pending | **Est:** 2h | **Deps:** Phase 01 verify

## Goal

Wire dashboard marketplace page so users can click Subscribe, see checkout URL, and complete payment.

## Steps

### 2.1 Audit current subscribe button

- [ ] Read `dashboard/src/pages/marketplace-page.tsx` — find where subscribe button is rendered
- [ ] Check if `onClick` calls `subscribe(listingId, allocationPercent)`
- [ ] Check if `checkoutUrl` from response is handled (redirect or modal)
- [ ] Identify missing UI elements

### 2.2 Implement checkout flow

If checkoutUrl not handled:
- [ ] On subscribe success → show modal with "Pay with USDT" button linking to `checkoutUrl`
- [ ] OR auto-redirect to `window.open(checkoutUrl, '_blank')`
- [ ] Add "I've paid" button that polls subscription status
- [ ] Add loading state while subscribe API call is in-flight

### 2.3 Handle edge cases

- [ ] Already subscribed → show "Already subscribed" message instead of subscribe button
- [ ] Payment pending → show "Payment pending — complete your payment" with link to checkoutUrl
- [ ] Payment failed → allow re-subscribe (cancel old, create new)
- [ ] API error → show error toast/banner

### 2.4 Allocation input

If strategy requires allocation percent:
- [ ] Add allocation slider/input (1-100%) in subscribe flow
- [ ] Validate before calling API

## Expected Output

User can click Subscribe → see checkout URL → pay → subscription activates.

## Files

- `dashboard/src/pages/marketplace-page.tsx` (modify)
- `dashboard/src/hooks/use-marketplace.ts` (modify if needed)
- Possibly new: `dashboard/src/components/marketplace-subscribe-modal.tsx`
