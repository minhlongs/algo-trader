# Brainstorm: Full Marketplace Stocking — Phase 5.5

**Date:** 2026-07-01 | **Stage:** PMF→Early Scale | **Verdict:** GO

## Problem

Marketplace has 1 active strategy (Market Making) + 2 "coming soon" placeholders. 30+ Polymarket strategies already built but invisible to subscribers. Cross-Platform Arb is 298 lines of working code marked as unavailable.

## Solution

Stock marketplace to 6 strategies: 1 new build + 1 activation + 4 surfacing of existing implementations.

## Strategy Lineup

| # | Strategy | Type | Effort | Price |
|---|----------|------|--------|-------|
| 1 | Market Making | Existing (active) | Done | $99/mo |
| 2 | Listing Arbitrage Sniper | **New build** | ~200 lines | $79/mo |
| 3 | Cross-Platform Arbitrage | Activate (298 lines exist) | Wire up | $149/mo |
| 4 | Whale Copy Trader | Surface (194 lines exist) | Wire up | $99/mo |
| 5 | Delta-Neutral Volatility Arb | Surface (152 lines exist) | Wire up | $129/mo |
| 6 | Resolution Frontrunner | Surface (203 lines exist) | Wire up | $79/mo |

## Implementation Phases

### Phase 1: Listing Arbitrage Sniper (new build)
- Extend `BasePolymarketStrategy`
- Poll Gamma API `/markets` for fresh markets (<30 min old, volume <5K)
- Entry: yes+no spread >2%, max 50 USDC per snipe
- Exit: volume >25K or spread converges to <1%
- Risk: max 3 concurrent positions, 60 min cooldown

### Phase 2: Activate Cross-Platform Arb
- Wire `cross-platform-arb.ts` into marketplace listing system
- Set price, billing cycle, publish to marketplace
- Update frontend card

### Phase 3: Surface Existing Strategies (4×)
- Whale Copy Trader, Delta-Neutral Vol Arb, Resolution Frontrunner, Regime-Adaptive Momentum
- Add marketplace listings with appropriate pricing tiers
- Update frontend cards with real data

### Phase 4: Frontend Update
- Replace static STRATEGIES array with dynamic marketplace data
- Each card shows real price, real stats, real CTA
- Subscribe flow works for all 6 strategies

## Files

| File | Action |
|------|--------|
| `src/desk/strategies/polymarket/listing-arbitrage-sniper.ts` | Create |
| `src/desk/strategies/polymarket/__tests__/listing-arbitrage-sniper.test.ts` | Create |
| `src/desk/strategies/polymarket/index.ts` | Modify |
| `dashboard/src/pages/marketplace-page.tsx` | Modify |
| Marketplace backend listings | 6× publish |
| Strategy loader | Modify (register new strategy) |

## Risk

Low. All patterns exist. Base class handles position/risk management. Gamma API already integrated. 4 of 6 strategies already built and tested.
