# Phase 3: Negative Risk Scanner Strategy

**Priority:** High (alpha generation)
**Status:** Ready
**Group:** C

## Context

Automatic scanning của tất cả active Polymarket markets để tìm opportunities mua cả YES và NO khi `up_ask + down_ask < 0.98` (locked profit sau fees).

**Mechanism:** Dual reversion arbitrage — khi cả 2 sides trade dưới 50% simultaneously, tổng < 100% tạo arbitrage nếu mua cả 2.

## Target Files

- `src/strategies/polymarket/negative-risk-scanner.ts` (new strategy)
- `src/strategies/polymarket/index.ts` (modify - barrel export)
- `src/commands/neg-risk-scan.ts` (new CLI command)
- `tests/strategies/polymarket/negative-risk-scanner.test.ts` (new)

## Strategy Architecture

```typescript
// createNegativeRiskScannerTick(config, deps) => tickFunction
export interface NegativeRiskScannerConfig {
  threshold: number;           // e.g., 0.98
  maxOpportunitySizeUsdc: number;
  cooldownMs: number;
  minVolumeUsdc: number;
}

export interface NegativeRiskScannerDeps {
  polymarket: PolymarketClient;
  orderManager: OrderManager;
  eventBus: EventBus;
}

export function createNegativeRiskScannerTick(
  config: NegativeRiskScannerConfig,
  deps: NegativeRiskScannerDeps
): (market: GammaMarket, orderBook: RawOrderBook) => Signal | null {
  return (market, orderBook) => {
    const upAsk = orderBook.asks[0]?.price ?? 1;
    const downAsk = orderBook.bids[0]?.price ?? 1; // NO token bid is ask for opposite side
    
    if (upAsk + downAsk < config.threshold) {
      return {
        type: 'negative-risk-arbitrage',
        marketId: market.market_id,
        legs: [
          { side: 'BUY', assetId: market.token_id_yes, price: upAsk, size: config.maxOpportunitySizeUsdc },
          { side: 'BUY', assetId: market.token_id_no, price: downAsk, size: config.maxOpportunitySizeUsdc }
        ],
        lockedProfit: 1 - (upAsk + downAsk),
        confidence: 1.0 - (upAsk + downAsk) // higher confidence if more mispriced
      };
    }
    return null;
  };
}
```

## Implementation Steps

1. **Create `negative-risk-scanner.ts` strategy:**
   - Follow pattern trong `src/strategies/polymarket/herd-behavior-detector.ts`
   - Export: `createNegativeRiskScannerTick(config, deps): TickFunction`
   - Types: `NegativeRiskScannerConfig`, `NegativeRiskScannerDeps`
   - Logic: Check order book, return Signal nếu `up_ask + down_ask < threshold`
   - Cooldown: Track last opportunity per market, skip if < cooldownMs

2. **Barrel export:**
   - Add to `src/strategies/polymarket/index.ts`:
     ```typescript
     export { createNegativeRiskScannerTick } from './negative-risk-scanner.js';
     export type { NegativeRiskScannerConfig, NegativeRiskScannerDeps } from './negative-risk-scanner.js';
     ```

3. **CLI command (optional but useful for manual trigger):**
   - `src/commands/neg-risk-scan.ts`
   - Load all active markets, fetch order books, print opportunities
   - Example: `algo neg-risk-scan --threshold 0.98`

4. **Testing:**
   - Unit: Mock order books, verify detection logic
   - Integration: Test with real market data (snapshot), verify no false positives
   - Performance: Scan 100 markets trong ≤5 seconds

5. **Metrics (via existing prometheus middleware):**
   - `neg_risk_opportunities_detected_total`
   - `neg_risk_profit_locked_cents` histogram
   - `neg_risk_strategy_scan_latency_ms`

## Acceptance Criteria

- [ ] Strategy compiled, barrel exported in `index.ts`
- [ ] Detect threshold 0.98 (configurable via config)
- [ ] Cooldown logic prevents duplicate spam (30s per market)
- [ ] Unit + integration tests ≥80% coverage
- [ ] Scan 100 markets trong ≤5s in benchmark test
- [ ] All existing strategy tests pass (570+)

## Risks

- **False positives:** Stale quotes → wasted execution. Mitigation: check order book timestamp (<1s old).
- **Rate limits:** Batch fetch order books, respect Polymarket rate limits.
- **Execution risk:** Opportunities vanish fast. Strategy needs to be active in live trading engine.
- **Capital allocation:** Ensure position sizer respects Kelly sizing từ Phase 2.

## Related

- Phase 1 (HTTP/2) — improves scanner latency (benefit but not dependency)
- Phase 2 (Kelly) — unrelated
- Existing agent pattern: `src/agents/whale-watch.ts`, `src/agents/endgame.ts`