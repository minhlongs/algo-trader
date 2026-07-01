# Phase 01 — Listing Arbitrage Sniper (New Build)

**Priority:** P0 | **Status:** pending | **Est. lines:** ~200

## Overview

Build a new Polymarket strategy that detects newly listed markets and enters before liquidity concentrates. Extends `BasePolymarketStrategy`.

## Core Logic

### Entry Signal
- Poll Gamma API `/markets?closed=false&limit=50` every 60s
- Filter: market age < 30 min (from `created_at` or first observed timestamp), volume < $5K
- Entry condition: `yes + no < 0.98` (spread > 2%)
- Position size: min($50, 2% of portfolio), Kelly-adjusted

### Exit Signal
- Volume crosses $25K threshold (liquidity arrived)
- OR `yes + no > 0.99` (spread converged to <1%)
- OR 4 hours elapsed without convergence (timeout)
- Standard TP/SL from base class (+2%/-1.5%)

### Risk Controls
- Max 3 concurrent positions
- 60 min cooldown between entries
- Max 10 USDC per snipe initially, scale up after validation
- Skip markets with <$500 liquidity (too thin)

## Architecture

```typescript
export class ListingArbitrageSniper extends BasePolymarketStrategy {
  private observedMarkets: Map<string, number>; // marketId → firstSeenAt
  private lastEntryTime: number;

  constructor(config: BaseStrategyConfig) {
    super('listing-arbitrage-sniper', config);
  }

  async scanEntries(): Promise<SignalCandidate[]> {
    // 1. Fetch fresh markets from Gamma API
    // 2. Filter: new (<30min), low volume (<$5K), spread >2%
    // 3. Apply cooldown gate
    // 4. Build SignalCandidate with Kelly sizing
    // 5. Return candidates (max 1 per scan)
  }

  // Base class handles: position mgmt, TP/SL, event emission, cooldowns
}
```

## Files

| File | Action |
|------|--------|
| `src/desk/strategies/polymarket/listing-arbitrage-sniper.ts` | Create |
| `src/desk/strategies/polymarket/__tests__/listing-arbitrage-sniper.test.ts` | Create |
| `src/desk/strategies/polymarket/index.ts` | Modify (export) |
| `src/desk/strategies/loader.ts` | Modify (register) |

## Todo

- [ ] Create `listing-arbitrage-sniper.ts` extending `BasePolymarketStrategy`
- [ ] Implement `scanEntries()` with Gamma API polling + age/volume/spread filters
- [ ] Implement `observedMarkets` tracking to detect new listings
- [ ] Add cooldown + concurrency risk controls
- [ ] Write unit tests (mock Gamma API, verify entry/exit logic)
- [ ] Register in strategy loader + export from index
- [ ] Run full test suite → 0 failures

## Success Criteria

- Strategy compiles with 0 TypeScript errors
- Unit tests pass: mock fresh market → entry signal, mock stale market → no signal
- Full test suite still passes (2,465 baseline)
- Strategy appears in marketplace after publishing (Phase 04)
