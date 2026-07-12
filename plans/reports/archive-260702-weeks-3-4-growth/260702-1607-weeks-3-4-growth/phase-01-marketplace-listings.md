---
phase: 1
title: "Marketplace Listings"
status: pending
priority: P2
effort: "~3h"
dependencies: []
---

# Phase 1: Marketplace Listings

## Overview

Add 5 non-V2 strategies to the marketplace. These are built and tested but not surfaced in marketplace listings.

## Non-V2 Strategy Assessment

10 strategies don't extend BasePolymarketStrategy. Marketplace-suitable candidates:
- **whale-copy-trader.ts** (194 lines) — feed-driven, monitoring service. Marketplace: YES
- **cycle-end-sniper.ts** — cycle detection. Marketplace: YES
- **delta-neutral-volatility-arbitrage.ts** (152 lines) — event-driven. Marketplace: YES
- **btc-fifteen-minute-strategy.ts** — CEX-focused. Marketplace: NO (CEX)
- **delta-calculator.ts** — helper. Marketplace: NO
- **delta-neutral-portfolio-monitor.ts** — helper for #3. Marketplace: NO
- **inventory-skew-rebalancer.ts** — portfolio-level. Marketplace: NO (internal)
- **price-impact-estimator.ts** — helper. Marketplace: NO
- **rebalance-engine.ts** — infra. Marketplace: NO
- **strategy-position-manager.ts** — infra. Marketplace: NO

**Target: add whale-copy-trader, cycle-end-sniper, delta-neutral-vol-arb + 2 more**

## Related Code Files

- Modify: `src/platform/marketplace/services/desk-strategy-seeder.ts` — register new strategies
- Modify: `src/platform/marketplace/services/marketplace-execution-bridge.ts` — adapters
- DB: marketplace_strategies + marketplace_listings — INSERT rows

## Implementation Steps

1. **Audit each candidate:** kiểm tra constructor, dependencies, có thể khởi tạo từ marketplace context không
2. **Register in desk-strategy-seeder.ts:** thêm 5 entries với id, name, price, description
3. **Add execution bridge adapters:** nếu strategy cần special handling
4. **Verify:** `GET /api/v1/marketplace/strategies` returns 6+ (was 1 active)
5. **Verify prices:** mỗi strategy có `priceUsdMonthly > 0`

## Success Criteria

- [ ] 5+ new marketplace strategies visible with prices
- [ ] Each strategy has name, description, price, tier requirements
- [ ] `priceUsdMonthly > 0` for all (not $0 ghost listings)
- [ ] `pnpm typecheck` — 0 errors
- [ ] All existing tests pass
