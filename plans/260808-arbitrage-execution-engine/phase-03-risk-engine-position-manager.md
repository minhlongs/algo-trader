# Phase 3: Risk Engine and Position Manager (tree/forest layer)

## Context Links
- Phase 1 types: `phase-01-core-types-interfaces.md` (RiskConfig, Position, RiskCheckResult)
- Phase 2 clients: `phase-02-exchange-clients.md` (IExchangeClient)
- Existing risk: `src/risk/kelly-position-sizer.ts`
- Existing arbitrage: `src/desk/arbitrage/` (binary-arbitrage-executor, split-merge-arb-executor)

## Overview
- **Priority**: Critical
- **Status**: Not Started
- **Description**: Implement RiskEngine for pre/post-trade risk validation and PositionManager for real-time P&L tracking and exposure management across all exchanges.

## Key Insights
- Current arbitrage executors have basic risk checks (slippage, min profit) but no portfolio-level risk management
- Need centralized risk engine that understands total exposure across all exchanges/symbols
- Position tracking must be real-time with WebSocket updates from exchanges
- Kelly position sizing exists but needs integration with multi-exchange portfolio
- Daily loss limit must be enforced across ALL strategies simultaneously
- Emergency stop must cancel ALL open orders across ALL exchanges atomically

## Requirements

### Functional Requirements

#### RiskEngine
1. **Pre-Trade Risk Checks**:
   - Max position size per symbol (configurable per exchange/symbol)
   - Max position size per exchange
   - Max total portfolio exposure (USD value)
   - Max daily loss limit (portfolio-level)
   - Max concurrent open orders
   - Slippage protection (estimated vs max allowed)
   - Correlation risk (avoid correlated positions)

2. **Post-Trade Risk Updates**:
   - Update daily P&L after each fill
   - Update exposure per exchange/symbol
   - Check for limit breaches after fills
   - Trigger alerts on threshold approaches

3. **Risk Limits Configuration**:
   - Per-symbol limits (BTC: $50k, ETH: $30k, etc.)
   - Per-exchange limits (Binance: $100k, Bybit: $50k)
   - Portfolio limits (total: $200k, daily loss: $5k)
   - Strategy-specific limits (arbitrage: $10k per opportunity)

4. **Emergency Controls**:
   - Emergency stop: cancel all orders, flatten positions
   - Kill switch: disable new order placement
   - Circuit breaker: pause on excessive losses

#### PositionManager
1. **Real-Time Position Tracking**:
   - Aggregate positions across all exchanges
   - Calculate unrealized P&L per position
   - Calculate realized P&L per trade
   - Track exposure per exchange, per symbol, per strategy

2. **Position Reconciliation**:
   - Periodic reconciliation with exchange balances
   - Handle partial fills correctly
   - Track fees per trade

3. **Position Events**:
   - Emit PositionUpdateEvent on any change
   - Support snapshots for reporting

### Non-Functional Requirements
- Risk checks < 1ms (in-memory, no external calls)
- Position updates < 10ms after fill notification
- Thread-safe for concurrent access
- Persistent state for recovery after restart

## Architecture

### Tree/Forest Layer Structure
```
src/tree/arbitrage/          # RiskEngine (tree - domain logic)
├── risk/
│   ├── risk-engine.ts       # Main RiskEngine implementation
│   ├── risk-limits.ts       # RiskLimits configuration class
│   ├── risk-check-result.ts # RiskCheckResult with details
│   ├── pre-trade-checks.ts  # Individual pre-trade check functions
│   ├── post-trade-updates.ts# Post-trade update logic
│   ├── daily-pnl-tracker.ts # Daily P&L tracking
│   ├── exposure-calculator.ts # Exposure calculation
│   ├── circuit-breaker.ts   # Circuit breaker pattern
│   └── emergency-stop.ts    # Emergency stop coordinator

src/forest/arbitrage/        # PositionManager (forest - orchestration)
├── position/
│   ├── position-manager.ts  # Main PositionManager implementation
│   ├── position-aggregator.ts # Aggregate across exchanges
│   ├── position-reconciler.ts # Reconcile with exchanges
│   ├── pnl-calculator.ts    # P&L calculation engine
│   ├── position-store.ts    # In-memory + Redis persistence
│   └── position-events.ts   # Event emission
```

### RiskEngine Flow
```
OrderRequest → RiskEngine.checkPreTrade()
    ├── Check position limits (symbol, exchange, portfolio)
    ├── Check daily loss limit
    ├── Check concurrent orders
    ├── Check slippage estimate
    └── Check correlation risk
        ↓
    RiskCheckResult { allowed: boolean, reason?, warnings[] }
        ↓
    If allowed → Place order via ExchangeClient
        ↓
    Fill received → RiskEngine.checkPostTrade(fill)
        ├── Update daily P&L
        ├── Update exposures
        ├── Check for limit breaches
        └── Emit alerts if needed
```

### PositionManager Flow
```
Fill/OrderUpdate → PositionManager.update()
    ├── Update position snapshot
    ├── Recalculate P&L (unrealized + realized)
    ├── Update exposures
    ├── Persist to Redis
    └── Emit PositionUpdateEvent
        ↓
    Periodic (every 30s): PositionManager.reconcile()
        ├── Fetch balances from all exchanges
        ├── Compare with tracked positions
        ├── Fix discrepancies
        └── Alert on unreconciled differences
```

## Related Code Files

### Files to Create (tree layer - RiskEngine)
- `src/tree/arbitrage/risk/risk-engine.ts`
- `src/tree/arbitrage/risk/risk-limits.ts`
- `src/tree/arbitrage/risk/risk-check-result.ts`
- `src/tree/arbitrage/risk/pre-trade-checks.ts`
- `src/tree/arbitrage/risk/post-trade-updates.ts`
- `src/tree/arbitrage/risk/daily-pnl-tracker.ts`
- `src/tree/arbitrage/risk/exposure-calculator.ts`
- `src/tree/arbitrage/risk/circuit-breaker.ts`
- `src/tree/arbitrage/risk/emergency-stop.ts`

### Files to Create (forest layer - PositionManager)
- `src/forest/arbitrage/position/position-manager.ts`
- `src/forest/arbitrage/position/position-aggregator.ts`
- `src/forest/arbitrage/position/position-reconciler.ts`
- `src/forest/arbitrage/position/pnl-calculator.ts`
- `src/forest/arbitrage/position/position-store.ts`
- `src/forest/arbitrage/position/position-events.ts`

### Files to Reference
- `src/seed/arbitrage/interfaces/irisk-engine.ts` (from Phase 1)
- `src/seed/arbitrage/interfaces/iposition-manager.ts` (from Phase 1)
- `src/risk/kelly-position-sizer.ts` (existing Kelly logic)
- `src/desk/arbitrage/binary-arbitrage-executor.ts` (existing risk patterns)

## Implementation Steps

### Step 1: Risk Limits Configuration
1. Define `RiskLimits` class with all configurable limits
2. Load from environment variables / config file
3. Validate limits on startup

### Step 2: Pre-Trade Checks
1. Implement individual check functions:
   - `checkPositionSize(symbol, exchange, newOrder, currentPositions)`
   - `checkDailyLoss(currentPnL, limit)`
   - `checkConcurrentOrders(openOrders, limit)`
   - `checkSlippage(estimatedSlippage, maxSlippage)`
   - `checkCorrelation(newOrder, currentPositions)`
2. Compose into `checkPreTrade()` method
3. Return detailed `RiskCheckResult`

### Step 3: Daily P&L Tracker
1. Track realized P&L per day (UTC midnight reset)
2. Persist to Redis for survival across restarts
3. Provide `getDailyPnL()`, `getDailyPnLPercent()`

### Step 4: Exposure Calculator
1. Calculate notional exposure per symbol
2. Calculate notional exposure per exchange
3. Calculate total portfolio exposure
4. Support long/short netting

### Step 5: Circuit Breaker & Emergency Stop
1. Circuit breaker: trip on N consecutive losses or X% daily drawdown
2. Emergency stop: cancel all orders via ExchangeClients, then flatten positions
3. Kill switch: disable new orders (read-only mode)

### Step 6: RiskEngine Integration
1. Wire all components together
2. Implement `IRiskEngine` interface
3. Add event emission for risk alerts

### Step 7: PositionManager
1. Implement `PositionAggregator` - merge positions from all exchanges
2. Implement `PnLCalculator` - unrealized (mark-to-market) + realized
3. Implement `PositionStore` - in-memory Map + Redis persistence
4. Implement `PositionReconciler` - periodic balance fetching and comparison
5. Wire into `PositionManager` implementing `IPositionManager`

### Step 8: Testing
1. Unit tests for each risk check
2. Integration tests with mock ExchangeClients
3. Stress tests for concurrent order placement
4. Reconciliation accuracy tests

## Todo List
- [ ] Create directory structures
- [ ] Implement RiskLimits configuration
- [ ] Implement pre-trade check functions
- [ ] Implement DailyPnLTracker
- [ ] Implement ExposureCalculator
- [ ] Implement CircuitBreaker
- [ ] Implement EmergencyStop
- [ ] Implement RiskEngine (main)
- [ ] Implement PositionAggregator
- [ ] Implement PnLCalculator
- [ ] Implement PositionStore (Redis)
- [ ] Implement PositionReconciler
- [ ] Implement PositionManager (main)
- [ ] Write unit tests
- [ ] Run `npm run type-check` and `npm test`

## Success Criteria
- All pre-trade checks complete < 1ms
- Position updates propagate < 10ms after fill
- Emergency stop cancels all orders < 500ms
- Daily P&L accurate to cent
- Reconciliation finds 0 discrepancies in normal operation
- Zero `:any` types
- All tests pass with >90% coverage

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Race condition in position updates | High | High | Single-threaded event loop, mutex for critical sections |
| Redis unavailable | Medium | High | In-memory fallback, sync on reconnect |
| Exchange balance discrepancy | Medium | Medium | Tolerance threshold, alert don't auto-fix |
| Kelly sizing integration | Low | Medium | Use existing kelly-position-sizer.ts |

## Security Considerations
- Risk limits cannot be bypassed via API
- Emergency stop requires no external dependencies
- Position data encrypted in Redis
- Audit log for all risk limit changes

## Next Steps
- Phase 4 will use RiskEngine and PositionManager in ExecutionOrchestrator