# Phase 04 — Frontend Marketplace Verification & Polish

**Priority:** P1 | **Status:** pending | **Est. effort:** Small (verify + minor polish)

## Context Links

- Marketplace page: `dashboard/src/pages/marketplace-page.tsx`
- Marketplace hook: `dashboard/src/hooks/use-marketplace.ts`
- API: `GET /v1/marketplace/strategies` (already dynamic)
- Plan overview: `plan.md`

## Overview

Frontend marketplace page is **already dynamic** — fetches from API, renders responsive grid, has subscribe modal with NOWPayments checkout. This phase verifies the new strategies render correctly and adds minor polish for go-live readiness.

## Key Insights

- `use-marketplace.ts` hook queries `/v1/marketplace/strategies` with filters (category, sort, search, page)
- Each strategy card shows: name, category badge, description, backtest summary (Sharpe, Win Rate, Max DD, Trades), "Subscribe — $X/mo" button
- Subscribe modal has allocation slider (1-100%) + NOWPayments checkout link
- No hardcoded strategy list — completely data-driven
- Pagination already implemented

## Requirements

### Functional
- All 6 strategies render correctly in marketplace grid
- Strategy-specific metrics display (where available)
- Subscribe flow works end-to-end for each strategy
- Mobile responsive (already implemented, verify)

### Non-functional
- Page load < 2s (API already paginated)
- No hardcoded strategy names or counts
- Bilingual VN/EN support maintained (if applicable)

## Architecture

**No architectural changes needed.** The frontend is already correctly architected:

```
useMarketplace hook → GET /v1/marketplace/strategies → marketplaceService.listStrategies()
                                                              ↓
                                                    DB: marketplace_strategies
                                                      JOIN marketplace_listings
```

## Related Code Files

| File | Action |
|------|--------|
| `dashboard/src/pages/marketplace-page.tsx` | Read + verify (likely no changes) |
| `dashboard/src/hooks/use-marketplace.ts` | Read + verify |
| `dashboard/src/components/marketplace/` | Check if strategy-card needs new fields |

## Implementation Steps

1. **Verify all 6 strategies render** — After Phases 01-03 complete, load marketplace page, confirm all 6 cards appear
2. **Check strategy card fields** — Ensure each card shows: name, category, price, key metric (Sharpe/win rate if available), description excerpt
3. **Test subscribe flow** — Click subscribe on each strategy → verify modal → verify NOWPayments link
4. **Mobile responsiveness** — Check grid layout at 320px, 768px, 1024px breakpoints
5. **Edge cases**: empty search results, no subscriptions yet, all strategies same category filter
6. **Polish (if needed):**
   - Add "New" badge for Listing Arbitrage Sniper
   - Add "Premium" badge for Cross-Platform Arb ($149)
   - Ensure pricing displays correctly (cents → dollars conversion)

## Todo

- [ ] Verify all 6 strategies render in marketplace grid
- [ ] Test subscribe flow end-to-end for each strategy
- [ ] Verify mobile responsiveness
- [ ] Add "New" / "Premium" badges if not already supported
- [ ] Verify price display (cents → dollars)
- [ ] Run dashboard build → 0 errors
- [ ] Run dashboard tests → 0 failures

## Success Criteria

- 6 strategy cards visible on marketplace page
- Each card shows correct name, price, category, description
- Subscribe modal opens with correct pricing
- NOWPayments checkout link works
- Mobile layout doesn't break
- Dashboard builds with 0 errors
- Dashboard tests pass

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| DB records from Phase 02-03 not yet created when testing | Phase 04 runs last (depends on 01-03) |
| Category filter may not include new categories | All 6 strategies use existing categories (arbitrage, statistical, momentum) |
| Price formatting bug (cents vs dollars) | Check `listingPriceUsdMonthly` field — verify frontend divides by 100 if stored in cents |
