# Phase 4: Execution Orchestrator (forest layer)

## Context Links
- Phase 1 types: `phase-01-core-types-interfaces.md` (Order, ExecutionEvent, OrderEvent)
- Phase 2 clients: `phase-02-exchange-clients.md` (IExchangeClient)
- Phase 3 risk/position: `phase-03-risk-engine-position-manager.md` (IRiskEngine, IPositionManager)
- Existing: `src/desk/arbitrage/spread-detector.ts` (onOpportunity callback)
- Existing: `src/desk/arbitrage/unified-executor.ts` (StrategyRouter pattern)
- Existing: `src/desk/arbitrage/types.ts` (ArbitrageOpportunity, ArbitrageLeg)

## Overview
- **Priority**: Critical
- **Status**: Not Started
- **Description**: Build the ExecutionOrchestrator that coordinates multi-leg atomic execution, manages order lifecycle, integrates with spread-detector, and provides execution venue abstraction.

## Key Insights
- Current `ExecutionEngine` in `src/desk/arbitrage/executor.ts` only simulates (dryRun=true)
- `UnifiedExecutionEngine` routes but doesn't handle atomic multi-leg execution
- Cross-exchange arbitrage requires SIMULTANEOUS leg execution - no sequential placement
- Partial fill on one leg requires immediate hedge or cancel on other legs
- Order lifecycle management (place → monitor → fill/cancel → settle) is missing
- Need to integrate with spread-detector's `onOpportunity` callback for automated execution

## Requirements

### Functional Requirements

#### ExecutionOrchestrator
1. **Multi-Leg Atomic Execution**:
   - Place all legs simultaneously (parallel)
   - Wait for all fills or timeout
   - On partial fill: attempt to complete remaining legs, else cancel all
   - Rollback mechanism: cancel unfilled legs, hedge filled legs if needed

2. **Order Lifecycle Management**:
   - Order placement with unique clientOrderId
   - Real-time order status tracking via WebSocket
   - Fill detection and processing
   - Cancellation with confirmation
   - Timeout handling (configurable per order type)

3. **Execution Venue Abstraction**:
   - Unified interface for all exchanges (Binance, KuCoin, Bybit, Polymarket)
   - Handle exchange-specific order types and parameters
   - Normalize order responses to unified format

4. **Spread-Detector Integration**:
   - Subscribe to `onOpportunity` callback
   - Filter opportunities by risk checks
   - Execute qualifying opportunities automatically
   - Configurable: auto-execute vs manual approval

#### OrderManager
1. **Order Placement**:
   - Validate order against RiskEngine
   - Generate clientOrderId (UUID + timestamp)
   - Place via ExchangeClient
   - Track in OrderStore

2. **Order Monitoring**:
   - WebSocket subscription for order updates
   - Polling fallback for exchanges without WS
   - Handle order status transitions

3. **Fill Processing**:
   - Parse fill data from exchange
   - Update PositionManager
   - Update RiskEngine (daily P&L)
   - Emit ExecutionEvent

4. **Cancellation**:
   - Cancel by orderId or clientOrderId
   - Handle partial fill before cancel
   - Confirm cancellation

#### OpportunityFilter
1. **Pre-Execution Validation**:
   - RiskEngine.preTradeCheck()
   - Minimum profit threshold (after fees/slippage)
   - Maximum latency budget
   - Exchange health check

2. **Opportunity Scoring**:
   - Integrate with SignalScorer
   - Rank by risk-adjusted return
   - Deduplicate similar opportunities

### Non-Functional Requirements
- Order placement latency < 50ms p95 (local to exchange)
- Multi-leg coordination overhead < 10ms
- 99.9% order status update delivery via WebSocket
- Zero lost fills (persistent tracking)
- Graceful degradation: continue if one exchange down

## Architecture

### Forest Layer Structure
```
src/forest/arbitrage/
├── index.ts                              # Public exports
├── execution/
│   ├── execution-orchestrator.ts         # Main orchestrator
│   ├── order-manager.ts                  # Order lifecycle
│   ├── order-store.ts                    # In-memory + Redis order tracking
│   ├── multi-leg-executor.ts             # Atomic multi-leg execution
│   ├── rollback-coordinator.ts           # Partial fill rollback
│   └── execution-venue.ts                # Venue abstraction
├── opportunity/
│   ├── opportunity-filter.ts             # Filter & validate opportunities
│   ├── opportunity-queue.ts              # Backpressure queue (max 50)
│   └── spread-detector-integration.ts    # Bridge to spread-detector
├── events/
│   ├── execution-event-emitter.ts        # Event emission
│   └── event-types.ts                    # ExecutionEvent, FillEvent, etc.
└── monitoring/
    ├── execution-metrics.ts              # Latency, success rate, etc.
    └── health-check.ts                   # Exchange health monitoring
```

### Execution Flow
```
SpreadDetector.onOpportunity(opportunities[])
    ↓
OpportunityFilter.filter(opportunities)
    ├── RiskEngine.checkPreTrade()
    ├── Min profit threshold
    └── Exchange health
    ↓
OpportunityQueue.enqueue(validOpportunities)
    ↓
ExecutionOrchestrator.dequeue()
    ↓
MultiLegExecutor.execute(opportunity)
    ├── OrderManager.placeAllLegs(legs[])  ← PARALLEL
    │   ├── ExchangeClient.placeOrder(leg) for each leg
    │   └── Track in OrderStore
    ├── Wait for fills (WebSocket + timeout)
    │   ├── On fill: OrderManager.processFill()
    │   │   ├── PositionManager.update()
    │   │   ├── RiskEngine.checkPostTrade()
    │   │   └── Emit FillEvent
    │   ├── On partial: RollbackCoordinator.handle()
    │   │   ├── Cancel unfilled legs
    │   │   └── Hedge or flatten filled legs
    │   └── On timeout: Cancel all pending
    └── Return ExecutionResult
```

### Rollback Strategy
```
Partial Fill Detected:
    1. IMMEDIATELY cancel all unfilled legs (parallel)
    2. For filled legs:
       a. If hedge possible: place opposite order on same exchange
       b. If no hedge: flatten via market order (accept slippage)
    3. Calculate net result
    4. Emit RollbackEvent with details
```

## Related Code Files

### Files to Create
- `src/forest/arbitrage/index.ts`
- `src/forest/arbitrage/execution/execution-orchestrator.ts`
- `src/forest/arbitrage/execution/order-manager.ts`
- `src/forest/arbitrage/execution/order-store.ts`
- `src/forest/arbitrage/execution/multi-leg-executor.ts`
- `src/forest/arbitrage/execution/rollback-coordinator.ts`
- `src/forest/arbitrage/execution/execution-venue.ts`
- `src/forest/arbitrage/opportunity/opportunity-filter.ts`
- `src/forest/arbitrage/opportunity/opportunity-queue.ts`
- `src/forest/arbitrage/opportunity/spread-detector-integration.ts`
- `src/forest/arbitrage/events/execution-event-emitter.ts`
- `src/forest/arbitrage/events/event-types.ts`
- `src/forest/arbitrage/monitoring/execution-metrics.ts`
- `src/forest/arbitrage/monitoring/health-check.ts`

### Files to Reference
- `src/seed/arbitrage/interfaces/iexchange-client.ts` (Phase 1)
- `src/seed/arbitrage/interfaces/iorder-manager.ts` (Phase 1)
- `src/seed/arbitrage/interfaces/irisk-engine.ts` (Phase 1)
- `src/seed/arbitrage/interfaces/iposition-manager.ts` (Phase 1)
- `src/tree/arbitrage/exchange-clients/exchange-factory.ts` (Phase 2)
- `src/tree/arbitrage/risk/risk-engine.ts` (Phase 3)
- `src/forest/arbitrage/position/position-manager.ts` (Phase 3)
- `src/desk/arbitrage/spread-detector.ts` (existing)
- `src/desk/arbitrage/unified-executor.ts` (existing pattern)

## Implementation Steps

### Step 1: Order Store & Events
1. Implement `OrderStore` with in-memory Map + Redis persistence
2. Define `ExecutionEvent`, `FillEvent`, `OrderEvent`, `RollbackEvent` types
3. Implement `ExecutionEventEmitter` for pub/sub

### Step 2: Execution Venue Abstraction
1. Implement `ExecutionVenue` interface wrapping `IExchangeClient`
2. Add exchange-specific parameter normalization
3. Create `VenueRegistry` to manage venues per exchange

### Step 3: Order Manager
1. Implement `OrderManager` with `placeOrder`, `cancelOrder`, `getOrder`
2. Integrate with `OrderStore` for tracking
3. Add WebSocket subscription management per symbol

### Step 4: Multi-Leg Executor
1. Implement `MultiLegExecutor.execute(legs[])`
2. Parallel order placement via `OrderManager.placeAllLegs()`
3. Wait for fills with `Promise.race` / `Promise.allSettled`
4. Timeout handling per leg

### Step 5: Rollback Coordinator
1. Implement `RollbackCoordinator.handlePartialFill(filledLegs, unfilledLegs)`
2. Cancel unfilled legs in parallel
3. Hedge/flatten filled legs
4. Calculate net P&L impact

### Step 6: Opportunity Filter & Queue
1. Implement `OpportunityFilter` with RiskEngine integration
2. Implement `OpportunityQueue` with backpressure (max 50)
3. Priority queue by score (highest first)

### Step 7: Spread Detector Integration
1. Implement `SpreadDetectorIntegration` class
2. Subscribe to `SpreadDetector.onOpportunity`
3. Filter → Queue → Execute pipeline
4. Configurable: auto-execute vs notify only

### Step 8: Execution Orchestrator (Main)
1. Wire all components together
2. Implement `start()` / `stop()` lifecycle
3. Health monitoring for exchanges
4. Metrics collection

### Step 9: Testing
1. Unit tests for each component
2. Integration test: mock spread-detector → full execution
3. Chaos tests: network failure mid-execution, partial fills
4. Latency benchmarks

## Todo List
- [ ] Create directory structures
- [ ] Implement OrderStore (Redis + memory)
- [ ] Implement event types and emitter
- [ ] Implement ExecutionVenue abstraction
- [ ] Implement OrderManager
- [ ] Implement MultiLegExecutor
- [ ] Implement RollbackCoordinator
- [ ] Implement OpportunityFilter
- [ ] Implement OpportunityQueue
- [ ] Implement SpreadDetectorIntegration
- [ ] Implement ExecutionOrchestrator (main)
- [ ] Implement health check and metrics
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Run `npm run type-check` and `npm test`

## Success Criteria
- Multi-leg execution completes < 200ms (all legs placed)
- Zero lost fills (all fills tracked and processed)
- Rollback activates < 100ms after partial fill detected
- Opportunity filter processes 1000 opps/sec
- Queue backpressure works (max 50, drops oldest on overflow)
- Integration with spread-detector works end-to-end
- Zero `:any` types
- All tests pass

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Partial fill on one leg | High | High | RollbackCoordinator tested extensively |
| WebSocket disconnect during execution | Medium | High | Polling fallback, order status reconciliation |
| Exchange rejects order after partial fill | Medium | High | Pre-validate all legs, atomic placement |
| Clock drift between exchanges | Low | Medium | Use exchange timestamps, not local |
| Redis latency during high load | Medium | Medium | In-memory primary, async Redis write |

## Security Considerations
- ClientOrderId includes no sensitive data
- Order parameters validated before placement
- Emergency stop accessible via API
- Audit log for all executions

## Next Steps
- Phase 5 will integrate this into land layer trading workflow