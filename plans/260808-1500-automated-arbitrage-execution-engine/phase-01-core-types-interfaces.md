# Phase 1: Core Types and Interfaces (seed layer)

**File:** `phase-01-core-types-interfaces.md`  
**Priority:** High  
**Status:** Pending  
**Dependencies:** None  

---

## Context Links

- Existing types: `src/desk/arbitrage/types.ts`
- Spread detector: `src/desk/arbitrage/spread-detector.ts`
- Signal scorer: `src/desk/arbitrage/signal-scorer.ts`
- 4-Layer Architecture: `.claude/rules/sophia-layer-architecture.md` (adapted for algo-trader)
- Development Rules: `.claude/rules/development-rules.md`

---

## Overview

Define all foundational TypeScript types, interfaces, and configuration schemas for the automated arbitrage execution engine. This layer provides the contract that all upper layers (tree, forest, land) will implement against.

---

## Key Insights

- Current `ExecutionEngine` in `types.ts` is a placeholder with `dryRun` only
- Need comprehensive order lifecycle types (pending, open, filled, partially_filled, cancelled, rejected, expired)
- Risk parameters must be configurable per exchange and globally
- Position tracking requires real-time P&L calculation types
- Event-driven architecture for order updates (WebSocket/emitter pattern)
- CCXT types need wrapping for type safety (avoid `any`)

---

## Requirements

### Functional Requirements

1. **Order Types**: Complete order lifecycle with all states and transitions
2. **Execution Types**: Request/response for order placement, modification, cancellation
3. **Risk Config Types**: Position limits, loss limits, slippage, concurrency limits
4. **Position Types**: Real-time position with P&L, exposure per exchange/symbol
5. **Event Types**: Order updates, fill notifications, risk breaches
6. **Exchange Config**: API credentials, rate limits, market filters per exchange
7. **Execution Modes**: DRY_RUN, PAPER_TRADE, LIVE with clear type distinctions

### Non-Functional Requirements

- Zero `:any` types — strict TypeScript
- Zod schemas for all runtime validation
- Immutable config objects (readonly)
- Discriminated unions for type-safe pattern matching
- Branded types for IDs (OrderId, PositionId, ExecutionId)

---

## Architecture

```
seed/
├── types/
│   ├── execution-types.ts        # Core execution interfaces
│   ├── order-types.ts            # Order lifecycle types
│   ├── risk-types.ts             # Risk configuration & limits
│   ├── position-types.ts         # Position tracking & P&L
│   ├── event-types.ts            # Event emitter types
│   ├── exchange-config.ts        # Exchange-specific configuration
│   └── index.ts                  # Barrel export
├── config/
│   ├── execution-config.ts       # Execution engine config schema
│   ├── risk-config.ts            # Risk engine config schema
│   └── index.ts                  # Barrel export
├── validation/
│   ├── execution-schemas.ts      # Zod schemas
│   └── index.ts
└── index.ts                      # Seed layer barrel export
```

---

## Related Code Files

### Files to Create

| Path | Purpose |
|------|---------|
| `src/seed/types/execution-types.ts` | Core execution request/result types |
| `src/seed/types/order-types.ts` | Order lifecycle, states, transitions |
| `src/seed/types/risk-types.ts` | Risk limits, breach types |
| `src/seed/types/position-types.ts` | Position, P&L, exposure types |
| `src/seed/types/event-types.ts` | Event emitter interfaces |
| `src/seed/types/exchange-config.ts` | Exchange credentials & settings |
| `src/seed/types/index.ts` | Barrel export |
| `src/seed/config/execution-config.ts` | Execution engine config + Zod schema |
| `src/seed/config/risk-config.ts` | Risk config + Zod schema |
| `src/seed/config/index.ts` | Barrel export |
| `src/seed/validation/execution-schemas.ts` | Zod validation schemas |
| `src/seed/validation/index.ts` | Barrel export |
| `src/seed/index.ts` | Seed layer barrel export |

### Files to Modify

| Path | Change |
|------|--------|
| `src/desk/arbitrage/types.ts` | Extend with new execution types (or deprecate old placeholder) |
| `src/desk/arbitrage/executor.ts` | Update to use new types |

---

## Implementation Steps

### Step 1: Branded Type Utilities
Create branded types for type-safe IDs:
```typescript
// src/seed/types/branded.ts
type Brand<T, B> = T & { __brand: B };
export type OrderId = Brand<string, 'OrderId'>;
export type PositionId = Brand<string, 'PositionId'>;
export type ExecutionId = Brand<string, 'ExecutionId'>;
export type ClientOrderId = Brand<string, 'ClientOrderId'>;
```

### Step 2: Execution Modes
```typescript
// src/seed/types/execution-types.ts
export type ExecutionMode = 'DRY_RUN' | 'PAPER_TRADE' | 'LIVE';

export interface ExecutionConfig {
  mode: ExecutionMode;
  defaultSlippageTolerance: number; // basis points
  defaultTimeoutMs: number;
  maxConcurrentOrders: number;
  enableAtomicExecution: boolean;
}
```

### Step 3: Order Types
```typescript
// src/seed/types/order-types.ts
export type OrderStatus = 
  | 'PENDING' 
  | 'OPEN' 
  | 'PARTIALLY_FILLED' 
  | 'FILLED' 
  | 'CANCELLED' 
  | 'REJECTED' 
  | 'EXPIRED';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT';

export interface OrderRequest {
  clientOrderId: ClientOrderId;
  exchange: ExchangeId;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  amount: number;
  price?: number; // required for LIMIT orders
  stopPrice?: number; // for stop orders
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  reduceOnly?: boolean;
  postOnly?: boolean;
}

export interface Order {
  id: OrderId;
  clientOrderId: ClientOrderId;
  exchange: ExchangeId;
  exchangeOrderId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  amount: number;
  filledAmount: number;
  remainingAmount: number;
  price?: number;
  averagePrice?: number;
  stopPrice?: number;
  fees: number;
  feeCurrency?: string;
  createdAt: number;
  updatedAt: number;
  filledAt?: number;
  metadata?: Record<string, unknown>;
}
```

### Step 4: Risk Types
```typescript
// src/seed/types/risk-types.ts
export interface RiskLimits {
  maxPositionSizeUsd: number;        // per symbol
  maxPositionSizePct: number;        // % of equity
  maxDailyLossUsd: number;           // absolute
  maxDailyLossPct: number;           // % of equity
  maxConcurrentOrders: number;       // total across exchanges
  maxConcurrentOrdersPerExchange: number;
  maxConcurrentOrdersPerSymbol: number;
  maxSlippageBps: number;            // basis points
  minProfitThresholdBps: number;     // minimum edge to execute
  maxOrderValueUsd: number;          // single order cap
  drawdownLimitPct: number;          // portfolio drawdown guard
}

export interface RiskBreach {
  type: 'POSITION_SIZE' | 'DAILY_LOSS' | 'CONCURRENT_ORDERS' | 'SLIPPAGE' | 'DRAWDOWN' | 'ORDER_VALUE';
  severity: 'WARNING' | 'BLOCK' | 'LIQUIDATE';
  message: string;
  currentValue: number;
  limitValue: number;
  timestamp: number;
  exchange?: ExchangeId;
  symbol?: string;
}
```

### Step 5: Position Types
```typescript
// src/seed/types/position-types.ts
export interface Position {
  id: PositionId;
  exchange: ExchangeId;
  symbol: string;
  side: 'LONG' | 'SHORT';
  amount: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  pnlPct: number;
  marginUsed?: number;
  leverage?: number;
  openedAt: number;
  updatedAt: number;
}

export interface PortfolioExposure {
  totalEquity: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  totalMarginUsed: number;
  availableMargin: number;
  positions: Position[];
  exposureByExchange: Record<ExchangeId, number>;
  exposureBySymbol: Record<string, number>;
  dailyPnl: number;
  dailyPnlPct: number;
}
```

### Step 6: Event Types
```typescript
// src/seed/types/event-types.ts
export interface ExecutionEvents {
  'order:placed': Order;
  'order:updated': Order;
  'order:filled': { order: Order; fill: Fill };
  'order:partially_filled': { order: Order; fill: Fill };
  'order:cancelled': Order;
  'order:rejected': { order: Order; reason: string };
  'order:expired': Order;
  'risk:breach': RiskBreach;
  'position:opened': Position;
  'position:updated': Position;
  'position:closed': { position: Position; realizedPnl: number };
  'execution:started': { executionId: ExecutionId; opportunityId: string };
  'execution:completed': ExecutionResult;
  'execution:failed': { executionId: ExecutionId; error: Error };
}

export interface Fill {
  id: string;
  orderId: OrderId;
  exchange: ExchangeId;
  symbol: string;
  side: OrderSide;
  price: number;
  amount: number;
  fee: number;
  feeCurrency: string;
  timestamp: number;
  tradeId?: string;
}
```

### Step 7: Exchange Config
```typescript
// src/seed/types/exchange-config.ts
export interface ExchangeCredentials {
  apiKey: string;
  secret: string;
  passphrase?: string; // for KuCoin, etc.
  sandbox?: boolean;
}

export interface ExchangeMarketConfig {
  symbol: string;
  minOrderSize: number;
  maxOrderSize: number;
  stepSize: number;
  tickSize: number;
  makerFeeRate: number;
  takerFeeRate: number;
}

export interface ExchangeConfig {
  id: ExchangeId;
  name: string;
  credentials: ExchangeCredentials;
  markets: ExchangeMarketConfig[];
  rateLimits: {
    requestsPerSecond: number;
    ordersPerSecond: number;
    weightPerRequest: number;
  };
  wsEndpoint?: string;
  restEndpoint?: string;
  enabled: boolean;
}
```

### Step 8: Zod Schemas
Create validation schemas for all config types in `src/seed/validation/execution-schemas.ts`

### Step 9: Update Arbitrage Types
Extend `src/desk/arbitrage/types.ts` to reference new execution types instead of placeholder `ExecutionEngine`

---

## Todo List

- [ ] Create branded type utilities
- [ ] Define execution modes and config
- [ ] Define order lifecycle types (status, side, type)
- [ ] Define order request/response types
- [ ] Define risk limits and breach types
- [ ] Define position and portfolio exposure types
- [ ] Define event emitter interfaces
- [ ] Define exchange configuration types
- [ ] Create Zod validation schemas for all types
- [ ] Create barrel exports
- [ ] Update existing arbitrage types to use new types
- [ ] Run `npm run type-check` to verify zero errors

---

## Success Criteria

- All types compile with `npm run type-check` (0 errors)
- No `:any` types anywhere in seed layer
- Zod schemas validate all config objects at runtime
- Branded types prevent ID confusion
- Discriminated unions enable exhaustive pattern matching
- Barrel exports work correctly

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type conflicts with existing code | Medium | High | Incremental migration, alias exports |
| CCXT type mismatches | Medium | Medium | Wrapper types, strict boundaries |
| Over-engineering types | Low | Medium | YAGNI — only types needed for Phase 2+ |

---

## Next Steps

Phase 2 depends on these types. Once complete, proceed to Phase 2: Exchange Clients (CCXT).