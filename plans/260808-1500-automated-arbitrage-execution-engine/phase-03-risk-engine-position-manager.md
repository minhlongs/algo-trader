# Phase 3: Risk Engine & Position Manager (tree/forest layer)

**File:** `phase-03-risk-engine-position-manager.md`  
**Priority:** High  
**Status:** Pending  
**Dependencies:** Phase 1 (Core Types), Phase 2 (Exchange Clients)

---

## Context Links

- Phase 1 types: `src/seed/types/risk-types.ts`, `position-types.ts`, `event-types.ts`
- Phase 2 clients: `src/tree/exchanges/*`
- Existing risk: `src/risk/` (check for existing risk modules)
- Portfolio tracking: `src/desk/arbitrage/trading-loop.ts`

---

## Overview

Implement the risk engine that enforces pre-trade and post-trade risk controls, and the position manager that tracks real-time positions, P&L, and exposure across all exchanges.

---

## Key Insights

- Risk checks must happen **before** order placement (pre-trade) and **after** fills (post-trade)
- Position manager needs real-time updates from exchange WebSocket feeds
- Daily loss limit resets at UTC midnight
- Drawdown guard should trigger position reduction/liquidation
- Risk engine must be fast (<1ms per check) — no async I/O in hot path
- Position manager aggregates across exchanges for portfolio view

---

## Requirements

### Functional Requirements

**Risk Engine:**
1. **Pre-trade checks**: Position size, daily loss, concurrent orders, slippage, order value, drawdown
2. **Post-trade checks**: Update daily P&L, check drawdown, validate position limits
3. **Risk breach events**: Emit events for WARNING/BLOCK/LIQUIDATE severity
4. **Configurable limits**: Per-exchange, per-symbol, global
5. **Risk state persistence**: Survive restarts (Redis or in-memory with snapshot)

**Position Manager:**
1. **Real-time position tracking**: Update on every fill, mark-to-market on price updates
2. **P&L calculation**: Realized + unrealized, per position and portfolio
3. **Exposure aggregation**: By exchange, by symbol, net/gross
4. **Margin tracking**: Used/available margin per exchange
5. **Position events**: Opened, updated, closed with P&L
6. **Snapshot/restore**: Persist positions for recovery

### Non-Functional Requirements

- Pre-trade check < 1ms (sync, in-memory)
- Event-driven updates (no polling)
- Thread-safe for concurrent order executions
- Audit trail for all risk decisions
- Configurable via Phase 1 config types

---

## Architecture

```
tree/
├── risk/
│   ├── risk-engine.ts              # Pre/post trade risk checks
│   ├── risk-state.ts               # In-memory risk state (daily P&L, order counts)
│   ├── risk-rules.ts               # Individual rule implementations
│   ├── breach-handler.ts           # Breach escalation logic
│   └── index.ts
├── positions/
│   ├── position-manager.ts         # Core position tracking
│   ├── pnl-calculator.ts           # Realized/unrealized P&L
│   ├── exposure-aggregator.ts      # By exchange/symbol
│   ├── margin-tracker.ts           # Margin used/available
│   └── index.ts
├── persistence/
│   ├── risk-persistence.ts         # Risk state persistence
│   ├── position-persistence.ts     # Position persistence
│   └── index.ts
└── index.ts

forest/
├── risk/
│   ├── risk-orchestrator.ts        # Coordinates risk across exchanges
│   └── index.ts
├── positions/
│   ├── portfolio-manager.ts        # Portfolio-level view
│   └── index.ts
└── index.ts
```

---

## Related Code Files

### Files to Create (tree layer)

| Path | Purpose |
|------|---------|
| `src/tree/risk/risk-engine.ts` | Main risk check entry point |
| `src/tree/risk/risk-state.ts` | In-memory risk state |
| `src/tree/risk/risk-rules.ts` | Individual risk rules |
| `src/tree/risk/breach-handler.ts` | Breach escalation |
| `src/tree/risk/index.ts` | Barrel export |
| `src/tree/positions/position-manager.ts` | Position tracking |
| `src/tree/positions/pnl-calculator.ts` | P&L calculations |
| `src/tree/positions/exposure-aggregator.ts` | Exposure by exchange/symbol |
| `src/tree/positions/margin-tracker.ts` | Margin tracking |
| `src/tree/positions/index.ts` | Barrel export |
| `src/tree/persistence/risk-persistence.ts` | Risk state persistence |
| `src/tree/persistence/position-persistence.ts` | Position persistence |
| `src/tree/persistence/index.ts` | Barrel export |
| `src/tree/index.ts` | Tree layer barrel export |

### Files to Create (forest layer)

| Path | Purpose |
|------|---------|
| `src/forest/risk/risk-orchestrator.ts` | Cross-exchange risk coordination |
| `src/forest/risk/index.ts` | Barrel export |
| `src/forest/positions/portfolio-manager.ts` | Portfolio view |
| `src/forest/positions/index.ts` | Barrel export |
| `src/forest/index.ts` | Forest layer barrel export |

---

## Implementation Steps

### Step 1: Risk State (In-Memory)
```typescript
// src/tree/risk/risk-state.ts
import { RiskLimits, RiskBreach, ExchangeId } from '@/seed/types';

export interface RiskState {
  dailyPnl: number;
  dailyPnlResetAt: number; // UTC midnight timestamp
  openOrderCount: number;
  openOrderCountByExchange: Record<ExchangeId, number>;
  openOrderCountBySymbol: Record<string, number>;
  currentDrawdown: number;
  peakEquity: number;
  breaches: RiskBreach[];
}

export class InMemoryRiskState {
  private state: RiskState;
  private limits: RiskLimits;
  
  constructor(limits: RiskLimits) {
    this.limits = limits;
    this.resetDaily();
  }
  
  resetDaily(): void {
    const now = Date.now();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    
    this.state = {
      dailyPnl: 0,
      dailyPnlResetAt: midnight.getTime(),
      openOrderCount: 0,
      openOrderCountByExchange: {} as Record<ExchangeId, number>,
      openOrderCountBySymbol: {},
      currentDrawdown: 0,
      peakEquity: 0,
      breaches: []
    };
  }
  
  // Getters, setters, incrementers...
}
```

### Step 2: Risk Rules (Individual Checks)
```typescript
// src/tree/risk/risk-rules.ts
import { RiskLimits, RiskBreach, OrderRequest, Position, ExchangeId } from '@/seed/types';
import { InMemoryRiskState } from './risk-state';

export interface RiskCheckResult {
  allowed: boolean;
  breaches: RiskBreach[];
}

export class PositionSizeRule {
  check(order: OrderRequest, position: Position | null, limits: RiskLimits, state: InMemoryRiskState): RiskCheckResult;
}

export class DailyLossRule {
  check(limits: RiskLimits, state: InMemoryRiskState): RiskCheckResult;
}

export class ConcurrentOrdersRule {
  check(order: OrderRequest, limits: RiskLimits, state: InMemoryRiskState): RiskCheckResult;
}

export class SlippageRule {
  check(order: OrderRequest, currentPrice: number, limits: RiskLimits): RiskCheckResult;
}

export class OrderValueRule {
  check(order: OrderRequest, limits: RiskLimits): RiskCheckResult;
}

export class DrawdownRule {
  check(currentEquity: number, limits: RiskLimits, state: InMemoryRiskState): RiskCheckResult;
}
```

### Step 3: Risk Engine (Orchestrator)
```typescript
// src/tree/risk/risk-engine.ts
import { 
  OrderRequest, 
  Order, 
  Fill, 
  Position, 
  RiskLimits, 
  RiskBreach,
  ExecutionMode 
} from '@/seed/types';
import { InMemoryRiskState } from './risk-state';
import { 
  PositionSizeRule, 
  DailyLossRule, 
  ConcurrentOrdersRule,
  SlippageRule,
  OrderValueRule,
  DrawdownRule 
} from './risk-rules';
import { EventEmitter } from 'events';

export class RiskEngine extends EventEmitter {
  private state: InMemoryRiskState;
  private rules: RiskRule[];
  
  constructor(
    private readonly limits: RiskLimits,
    private readonly mode: ExecutionMode
  ) {
    super();
    this.state = new InMemoryRiskState(limits);
    this.rules = [
      new DailyLossRule(),
      new ConcurrentOrdersRule(),
      new OrderValueRule(),
      new PositionSizeRule(),
      new SlippageRule(),
      new DrawdownRule()
    ];
  }
  
  // Pre-trade check - MUST be fast (<1ms)
  preTradeCheck(order: OrderRequest, currentPrice: number, position: Position | null): RiskCheckResult {
    // Run all rules synchronously
    // Aggregate breaches
    // Return allowed + breaches
  }
  
  // Post-trade update - after fill
  postTradeUpdate(fill: Fill, position: Position): void {
    // Update daily P&L
    // Update order counts
    // Check drawdown
    // Emit breach events if needed
  }
  
  // Called when order placed
  onOrderPlaced(order: Order): void {
    this.state.incrementOpenOrders(order.exchange, order.symbol);
  }
  
  // Called when order filled/cancelled
  onOrderClosed(order: Order): void {
    this.state.decrementOpenOrders(order.exchange, order.symbol);
  }
  
  // Get current risk state for monitoring
  getState(): Readonly<RiskState>;
  
  // Reset daily (called at UTC midnight)
  resetDaily(): void;
}
```

### Step 4: Breach Handler
```typescript
// src/tree/risk/breach-handler.ts
import { RiskBreach, ExecutionMode } from '@/seed/types';

export class BreachHandler {
  constructor(private readonly mode: ExecutionMode) {}
  
  handle(breach: RiskBreach): BreachAction {
    switch (breach.severity) {
      case 'WARNING':
        return { action: 'LOG', message: breach.message };
      case 'BLOCK':
        return { action: 'BLOCK_ORDER', message: breach.message };
      case 'LIQUIDATE':
        return { action: 'LIQUIDATE_POSITIONS', message: breach.message };
    }
  }
}

export interface BreachAction {
  action: 'LOG' | 'BLOCK_ORDER' | 'REDUCE_POSITION' | 'LIQUIDATE_POSITIONS' | 'PAUSE_TRADING';
  message: string;
  symbol?: string;
  exchange?: ExchangeId;
}
```

### Step 5: Position Manager
```typescript
// src/tree/positions/position-manager.ts
import { 
  Position, 
  Fill, 
  Order, 
  ExchangeId,
  PortfolioExposure 
} from '@/seed/types';
import { PnLCalculator } from './pnl-calculator';
import { ExposureAggregator } from './exposure-aggregator';
import { MarginTracker } from './margin-tracker';
import { EventEmitter } from 'events';

export class PositionManager extends EventEmitter {
  private positions = new Map<string, Position>(); // key: `${exchange}:${symbol}`
  private pnlCalculator: PnLCalculator;
  private exposureAggregator: ExposureAggregator;
  private marginTracker: MarginTracker;
  
  constructor() {
    super();
    this.pnlCalculator = new PnLCalculator();
    this.exposureAggregator = new ExposureAggregator();
    this.marginTracker = new MarginTracker();
  }
  
  // Update from fill
  onFill(fill: Fill): Position {
    const key = `${fill.exchange}:${fill.symbol}`;
    let position = this.positions.get(key);
    
    if (!position) {
      position = this.createPosition(fill);
    } else {
      position = this.pnlCalculator.updateFromFill(position, fill);
    }
    
    this.positions.set(key, position);
    this.exposureAggregator.update(position);
    this.emit('position:updated', position);
    
    if (position.amount === 0) {
      this.emit('position:closed', { position, realizedPnl: position.realizedPnl });
      this.positions.delete(key);
    }
    
    return position;
  }
  
  // Mark to market (called on price updates)
  markToMarket(exchange: ExchangeId, symbol: string, price: number): Position | null;
  
  // Getters
  getPosition(exchange: ExchangeId, symbol: string): Position | undefined;
  getAllPositions(): Position[];
  getPortfolioExposure(): PortfolioExposure;
  
  // Persistence
  snapshot(): PositionSnapshot;
  restore(snapshot: PositionSnapshot): void;
}
```

### Step 6: P&L Calculator
```typescript
// src/tree/positions/pnl-calculator.ts
import { Position, Fill } from '@/seed/types';

export class PnLCalculator {
  updateFromFill(position: Position, fill: Fill): Position {
    // Calculate new average entry price
    // Update realized P&L for closing trades
    // Update unrealized P&L based on current price
  }
  
  calculateUnrealizedPnl(position: Position, currentPrice: number): number {
    if (position.side === 'LONG') {
      return (currentPrice - position.entryPrice) * position.amount;
    } else {
      return (position.entryPrice - currentPrice) * position.amount;
    }
  }
  
  calculateRealizedPnl(position: Position, fill: Fill): number {
    // P&L from reducing/closing position
  }
}
```

### Step 7: Exposure Aggregator & Margin Tracker
```typescript
// src/tree/positions/exposure-aggregator.ts
import { Position, PortfolioExposure, ExchangeId } from '@/seed/types';

export class ExposureAggregator {
  private exposureByExchange = new Map<ExchangeId, number>();
  private exposureBySymbol = new Map<string, number>();
  
  update(position: Position): void {
    // Recalculate aggregates
  }
  
  getExposure(): { byExchange: Map<ExchangeId, number>; bySymbol: Map<string, number> };
}

// src/tree/positions/margin-tracker.ts
import { ExchangeId } from '@/seed/types';

export class MarginTracker {
  private marginUsed = new Map<ExchangeId, number>();
  private availableMargin = new Map<ExchangeId, number>();
  
  updateMargin(exchange: ExchangeId, used: number, available: number): void;
  getMargin(exchange: ExchangeId): { used: number; available: number };
}
```

### Step 8: Forest Layer - Risk Orchestrator & Portfolio Manager
```typescript
// src/forest/risk/risk-orchestrator.ts
import { RiskEngine } from '@/tree/risk';
import { ExchangeClient } from '@/tree/exchanges';
import { RiskLimits } from '@/seed/types';

export class RiskOrchestrator {
  private engines = new Map<string, RiskEngine>(); // per exchange
  
  constructor(
    private readonly globalLimits: RiskLimits,
    private readonly perExchangeLimits: Map<ExchangeId, RiskLimits>
  ) {}
  
  // Check across all exchanges for global limits
  checkGlobalRisk(order: OrderRequest): RiskCheckResult;
  
  // Coordinate emergency actions (liquidate all)
  async emergencyLiquidate(clients: Map<ExchangeId, ExchangeClient>): Promise<void>;
}

// src/forest/positions/portfolio-manager.ts
import { PositionManager } from '@/tree/positions';
import { PortfolioExposure } from '@/seed/types';

export class PortfolioManager {
  private managers = new Map<ExchangeId, PositionManager>();
  
  getAggregatedExposure(): PortfolioExposure;
  getGlobalPnl(): { realized: number; unrealized: number; total: number };
}
```

---

## Todo List

- [ ] Create in-memory risk state with daily reset
- [ ] Implement individual risk rules (position size, daily loss, concurrent orders, slippage, order value, drawdown)
- [ ] Implement risk engine with pre/post trade checks
- [ ] Implement breach handler with escalation
- [ ] Create position manager with fill-based updates
- [ ] Implement P&L calculator (realized + unrealized)
- [ ] Implement exposure aggregator (by exchange, by symbol)
- [ ] Implement margin tracker
- [ ] Add persistence layer (Redis or file-based snapshots)
- [ ] Create forest layer risk orchestrator
- [ ] Create forest layer portfolio manager
- [ ] Add barrel exports
- [ ] Run `npm run type-check` (0 errors)
- [ ] Write unit tests for each risk rule, P&L calc, exposure aggregation

---

## Success Criteria

- Pre-trade risk check completes in <1ms
- All 6 risk rules correctly enforce limits
- Breach events emitted with correct severity
- Position manager tracks P&L accurately (verified with test cases)
- Exposure aggregation matches sum of individual positions
- Portfolio manager provides correct cross-exchange view
- Persistence survives process restart
- Unit tests cover: each rule, P&L calc edge cases, position lifecycle

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Race condition in risk checks | Medium | High | Single-threaded event loop, atomic operations |
| P&L calculation drift | Low | High | Reconcile with exchange balances periodically |
| Daily reset timing issues | Low | Medium | Use UTC, test timezone edge cases |
| Memory leak in position map | Low | Medium | Clean up closed positions, max size guard |

---

## Next Steps

Phase 4 (Execution Orchestrator) depends on RiskEngine and PositionManager for pre-trade checks and post-fill updates.