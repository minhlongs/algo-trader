# Plan — Marketplace Stocking (Phase 5.5)

**Date:** 2026-07-01 | **Source:** brainstorm-260701-1126-marketplace-stocking-phase55 | **Status:** complete

## Context

Marketplace has 1 active strategy. 30+ Polymarket strategies already built but invisible. Frontend marketplace page is **already dynamic** (fetches from `/v1/marketplace/strategies`). This plan stocks marketplace to 6 strategies: 1 new build + 1 activation + 3 DB publishes + frontend verification.

## Phase Overview

| # | Phase | Effort | Status |
|---|-------|--------|--------|
| 01 | Listing Arbitrage Sniper (new) | ~200 lines | ✅ done (seeded via seedDeskStrategies) |
| 02 | Activate Cross-Platform Arb | Wire existing 298-line standalone class | ✅ done (seeded via seedDeskStrategies) |
| 03 | Surface 3 Existing Strategies | DB records + execution bridge adapters | ✅ done (generic bridge, no per-strategy adapters needed) |
| 04 | Frontend Verification & Polish | Verify + minor badges | ✅ done (typecheck passed, API live, tier-gated) |

## Strategy Lineup

| # | Strategy | Class | Extends | Wired? | Price/mo |
|---|----------|-------|---------|--------|----------|
| 1 | Market Making | (existing) | — | ✅ | $99 |
| 2 | Listing Arbitrage Sniper | **New** | BasePolymarketStrategy | ❌ (new) | $79 |
| 3 | Cross-Platform Arbitrage | CrossPlatformArbDetector | Standalone | ❌ | $149 |
| 4 | Whale Copy Trader | WhaleCopyTrader | Standalone | ❌ | $99 |
| 5 | Delta-Neutral Vol Arb | DeltaNeutralVolatilityArbitrage | EventEmitter | ❌ | $129 |
| 6 | Resolution Frontrunner | ResolutionFrontrunnerStrategy | BasePolymarketStrategy | ✅ | $79 |

## Key Files

| File | Phase | Action |
|------|-------|--------|
| `src/desk/strategies/polymarket/listing-arbitrage-sniper.ts` | 01 | Create |
| `src/desk/strategies/polymarket/__tests__/listing-arbitrage-sniper.test.ts` | 01 | Create |
| `src/desk/strategies/polymarket/index.ts` | 01 | Modify (export) |
| `src/desk/wiring/strategy-wiring.ts` | 01 | Modify (register new strategy) |
| `src/platform/marketplace/services/marketplace-execution-bridge.ts` | 02, 03 | Modify (3 adapters) |
| DB: marketplace_strategies + marketplace_listings | 02, 03 | Insert (4 rows) |
| `dashboard/src/pages/marketplace-page.tsx` | 04 | Read + verify (likely no changes) |

## Dependencies

- Phase 02, 03 can run in parallel (independent adapters)
- Phase 04 depends on 01-03 (needs listings to exist)
- Phase 01 is standalone (new code, no dependencies)

## Success Criteria

- 6 strategies appear in marketplace with real prices
- Subscribe flow works for each strategy
- Listing Arbitrage Sniper has passing tests
- All existing tests still pass (2,465 baseline)
- TypeScript 0 errors
