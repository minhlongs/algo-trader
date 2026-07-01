# Phase 03 — Surface 3 Existing Strategies as Marketplace Listings

**Priority:** P0 | **Status:** pending | **Est. effort:** Small (DB + wiring)

## Context Links

- Brainstorm: `plans/reports/brainstorm-260701-1126-marketplace-stocking-phase55.md`
- Strategy wiring: `src/desk/wiring/strategy-wiring.ts` (POLY_STRATEGIES array)
- Marketplace service: `src/platform/marketplace/services/marketplace.service.ts`
- Plan overview: `plan.md`

## Overview

3 strategies are already built, tested, and wired in the orchestrator but have no marketplace listings. This phase creates DB records and wires them for subscriber access.

## Strategies to Surface

| # | Strategy | File | Class | Wired? | Price |
|---|----------|------|-------|--------|-------|
| 1 | Whale Copy Trader | `src/desk/strategies/polymarket/whale-copy-trader.ts` | `WhaleCopyTrader` (standalone) | ❌ | $99/mo |
| 2 | Delta-Neutral Vol Arb | `src/desk/strategies/polymarket/delta-neutral-volatility-arbitrage.ts` | `DeltaNeutralVolatilityArbitrage` (EventEmitter) | ❌ | $129/mo |
| 3 | Resolution Frontrunner | `src/desk/strategies/polymarket/resolution-frontrunner-v2.ts` | `ResolutionFrontrunnerStrategy` (BasePolymarketStrategy) | ✅ | $79/mo |

## Key Insights

- **Resolution Frontrunner** is the easiest — already wired as `resolution-frontrunner` in orchestrator, extends `BasePolymarketStrategy`. Just needs marketplace DB records.
- **Whale Copy Trader** is standalone — listens to whale-activity-feed, publishes to NATS. Needs an adapter in the execution bridge similar to Phase 02.
- **Delta-Neutral Vol Arb** is EventEmitter-based — uses DependencyGraph for correlated pairs. Most complex to bridge. Needs an adapter that initializes from graph, monitors portfolios, forwards signals.
- All 3 already have test coverage in their respective `__tests__/` directories.

## Requirements

### Functional
- All 3 strategies appear in marketplace with correct pricing
- Subscribe flow works for each
- Resolution Frontrunner: signals flow immediately (already running in orchestrator)
- Whale Copy Trader + Delta-Neutral: adapter starts on first subscriber

### Non-functional
- Must not break existing orchestrator ticks for Resolution Frontrunner
- Must not break existing NATS signal pipelines
- Must follow marketplace execution bridge pattern

## Architecture

### Resolution Frontrunner (easiest — already wired)
```
StrategyOrchestrator (existing, runs resolution-frontrunner tick)
        ↓
  marketplace-execution-bridge.ts (already copies signals to subscriber sandboxes)
        ↓
  subscriber receives frontrunner signals
```
→ Just create DB records. The execution bridge already handles signal routing for wired strategies.

### Whale Copy Trader (standalone → adapter)
```
WhaleCopyTrader.start() (NATS: signal.validated)
        ↓
  NEW: WhaleCopyTraderAdapter (subscribes to NATS, forwards to bridge)
        ↓
  marketplace-execution-bridge.ts
        ↓
  subscriber receives copy signals
```

### Delta-Neutral Vol Arb (EventEmitter → adapter)
```
DeltaNeutralVolatilityArbitrage (EventEmitter: 'portfolio-update', 'rebalance')
        ↓
  NEW: DeltaNeutralAdapter (listens to events, forwards to bridge)
        ↓
  marketplace-execution-bridge.ts
        ↓
  subscriber receives delta-neutral signals
```

## Related Code Files

| File | Action |
|------|--------|
| `src/platform/marketplace/services/marketplace-execution-bridge.ts` | Modify — add WhaleCopyTraderAdapter + DeltaNeutralAdapter |
| Seed script or direct DB insert | Create — marketplace_strategies + marketplace_listings rows (3×) |
| `src/desk/strategies/polymarket/whale-copy-trader.ts` | Read only |
| `src/desk/strategies/polymarket/delta-neutral-volatility-arbitrage.ts` | Read only |
| `src/desk/strategies/polymarket/resolution-frontrunner-v2.ts` | Read only |

## Implementation Steps

1. **Create marketplace DB records** — Insert 3 strategy + listing rows:
   - `whale-copy-trader` → $99/mo, category: statistical, riskLevel: 5
   - `delta-neutral-vol-arb` → $129/mo, category: arbitrage, riskLevel: 4
   - `resolution-frontrunner` → $79/mo, category: statistical, riskLevel: 3
2. **Resolution Frontrunner** — Verify it already flows through execution bridge (should work automatically since wired in orchestrator). No code changes needed beyond DB records.
3. **WhaleCopyTraderAdapter** — In execution bridge:
   - On first subscribe: `startWhaleCopyTrader(opts)` to activate singleton
   - Subscribe to NATS `signal.validated` for whale copy signals
   - Forward to subscriber sandbox with position sizing
   - On last unsubscribe: stop the tracker
4. **DeltaNeutralAdapter** — In execution bridge:
   - On first subscribe: initialize `DeltaNeutralVolatilityArbitrage` with graph + prices
   - Listen to `portfolio-update` and `rebalance` events
   - Forward signals to subscriber sandbox
   - On last unsubscribe: `stop()` the engine
5. **Run tests** — Full vitest suite → 0 failures
6. **TypeScript check** — `pnpm typecheck` → 0 errors

## Todo

- [ ] Create marketplace_strategies rows (3 strategies)
- [ ] Create marketplace_listings rows with pricing
- [ ] Verify Resolution Frontrunner flows through bridge (no code changes needed)
- [ ] Add WhaleCopyTraderAdapter in marketplace-execution-bridge.ts
- [ ] Add DeltaNeutralAdapter in marketplace-execution-bridge.ts
- [ ] Wire lifecycle: subscribe → adapter.start(), unsubscribe → adapter.stop()
- [ ] Run full test suite → 0 failures
- [ ] Verify all 3 strategies appear in marketplace API

## Success Criteria

- `GET /v1/marketplace/strategies` returns all 3 strategies
- Subscribe flow works for each
- Resolution Frontrunner signals reach subscribers (already wired)
- Whale Copy Trader adapter starts/stops on subscribe/unsubscribe
- Delta-Neutral adapter starts/stops on subscribe/unsubscribe
- All existing tests pass (2,465 baseline)
- TypeScript 0 errors

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| WhaleCopyTrader shares NATS topic with existing consumers | Adapter subscribes as additional consumer — NATS supports multiple subscribers per topic |
| DeltaNeutralVolatilityArbitrage needs DependencyGraph initialized | Graph already built in desk intelligence pipeline; adapter references existing graph |
| Resolution Frontrunner tick interval (30s) may conflict with subscriber expectations | Document interval; subscribers can configure notification preferences |
| Standalone adapters increase execution bridge complexity | Keep adapters thin (<50 lines each) — just event forwarding |
