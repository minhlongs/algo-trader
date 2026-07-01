# Phase 02 — Activate Cross-Platform Arbitrage

**Priority:** P0 | **Status:** pending | **Est. effort:** Small (wire existing)

## Context Links

- Brainstorm: `plans/reports/brainstorm-260701-1126-marketplace-stocking-phase55.md`
- Source: `src/desk/strategies/cross-platform-arb.ts` (298 lines, fully built)
- Runner: `src/desk/arbitrage/cross-platform-arb-detector.ts` (NATS publisher)
- Plan overview: `plan.md`

## Overview

`CrossPlatformArbDetector` is already built — standalone class with Polymarket WS + Kalshi HTTP + CEX aggregator. It is NOT a `BasePolymarketStrategy` subclass, NOT registered in `strategy-wiring.ts`, and NOT in the marketplace. This phase bridges it into the marketplace subscription system.

## Key Insights

- `CrossPlatformArbDetector` is a **detector**, not a tick-based strategy. It uses `start()`/`stop()` lifecycle.
- Already has a singleton factory: `getCrossPlatformArbDetector(config?)`
- Compatible runner at `src/desk/arbitrage/cross-platform-arb-detector.ts` publishes to NATS `signal.cross-platform-arb`
- To work in marketplace, it needs: (a) marketplace DB listing, (b) execution bridge wiring so subscribers get signals
- Price: $149/mo (premium — multi-platform data feeds have higher infra cost)

## Requirements

### Functional
- Cross-Platform Arb appears in marketplace with $149/mo pricing
- Subscribers can subscribe → receive cross-platform arb signals
- Strategy shows real stats (spreads detected, opportunities/day, historical win rate)

### Non-functional
- Must not break existing `arb-auto` CLI or NATS signal pipeline
- Must follow marketplace execution bridge pattern

## Architecture

**Approach: Marketplace listing + execution bridge adapter**

```
CrossPlatformArbDetector (existing)
        ↓
  marketplace-execution-bridge.ts (existing — extend)
        ↓
  subscriber receives signals via their sandbox
```

The execution bridge already handles strategy → subscriber routing. We:
1. Create a thin adapter that wraps `CrossPlatformArbDetector` events into the bridge format
2. Create marketplace DB records (strategy + listing)
3. Register in strategy loader so the bridge can resolve it

## Related Code Files

| File | Action | Owner |
|------|--------|-------|
| `src/platform/marketplace/services/marketplace.service.ts` | Modify — add listing creation for cross-platform-arb | Phase 02 |
| `src/platform/marketplace/services/marketplace-execution-bridge.ts` | Modify — add cross-platform-arb adapter | Phase 02 |
| `src/desk/strategies/cross-platform-arb.ts` | Read only — reference existing implementation | — |
| `src/desk/arbitrage/cross-platform-arb-detector.ts` | Read only — understand NATS pipeline | — |

## Implementation Steps

1. **Create marketplace DB records** — Insert `marketplace_strategies` row + `marketplace_listings` row for cross-platform-arb ($149/mo)
2. **Add execution bridge adapter** — In `marketplace-execution-bridge.ts`, add a `CrossPlatformArbAdapter` that:
   - Calls `getCrossPlatformArbDetector(config)` to get singleton
   - Registers `onOpportunity` callback → forwards to subscriber sandbox
   - Handles `start()`/`stop()` on subscribe/unsubscribe
3. **Wire lifecycle** — Subscriber subscribe → adapter.start(), unsubscribe → adapter.stop()
4. **Run tests** — Full vitest suite, verify no regressions
5. **TypeScript check** — `pnpm typecheck` → 0 errors

## Todo

- [ ] Create marketplace_strategies row for cross-platform-arb
- [ ] Create marketplace_listings row with $149/mo pricing
- [ ] Add CrossPlatformArbAdapter in marketplace-execution-bridge.ts
- [ ] Wire adapter lifecycle (start on first subscriber, stop on last)
- [ ] Run full test suite → 0 failures
- [ ] Verify marketplace API returns the new strategy

## Success Criteria

- `GET /v1/marketplace/strategies` returns cross-platform-arb listing
- Subscribe flow works: user subscribes → adapter starts → signals flow
- Unsubscribe stops adapter
- All existing tests pass
- TypeScript 0 errors

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `CrossPlatformArbDetector` singleton conflicts with existing `arb-auto` CLI usage | Adapter uses same singleton — compatible; `arb-auto` and marketplace share instance |
| Kalshi HTTP polling cost | Already handled in existing implementation; $149/mo pricing covers infra |
| NATS topic collision | Existing runner publishes to `signal.cross-platform-arb` — bridge reads same topic, no collision |
