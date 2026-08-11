# Phase 1: Core Types and Interfaces (seed layer)

## Context Links
- Existing types: `src/desk/arbitrage/types.ts`
- Spread detector types: `src/desk/arbitrage/spread-detector-types.ts`
- Configuration: `src/desk/arbitrage/config.ts`
- 4-layer architecture: `.claude/rules/sophia-layer-architecture.md`

## Overview
- **Priority**: Critical (foundation for all other phases)
- **Status**: Not Started
- **Description**: Define all core TypeScript types and interfaces for the multi-exchange arbitrage execution engine in the seed layer. This provides the type-safe foundation that all other layers will consume.

## Key Insights
- Current types in `src/desk/arbitrage/types.ts` are focused on opportunity detection, not execution
- Need comprehensive order lifecycle types (placement, monitoring, fill, cancellation)
- Risk types must enforce strict limits at compile time
- CCXT wrapper interfaces must abstract exchange-specific differences
- All types must use strict TypeScript (no `:any`)

## Requirements

### Functional Requirements
1. **Order Types**: Market, Limit, Stop orders with exchange-specific parameters
2. **Position Types**: Real-time position tracking with P&L, exposure per exchange/symbol
3. **Risk Types**: Position limits, daily loss limits, concurrent order limits, slippage protection
4. **Exchange Client Interfaces**: Unified interface for Binance, KuCoin, Bybit via CCXT
5. **Order Lifecycle Types**: OrderStatus (NEW, PARTIALLY_FILLED, FILLED, CANCELED, REJECTED, EXPIRED), Fill, Cancellation
6. **Event Types**: OrderUpdateEvent, PositionUpdateEvent, RiskAlertEvent, ExecutionEvent
7. **Configuration Types**: ExecutionConfig, RiskConfig, ExchangeConfig

### Non-Functional Requirements
- Zero `:any` types - all interfaces strictly typed
- Compatible with existing spread-detector opportunity types
- Extensible for future exchanges and order types
- Serialization-friendly for Redis persistence

## Architecture

### Seed Layer Structure
```
src/seed/arbitrage/
├── index.ts                    # Public exports
├── types/
│   ├── order.ts               # Order, OrderRequest, OrderResponse
│   ├── position.ts            # Position, PositionSnapshot
│   ├── risk.ts                # RiskConfig, RiskLimits, RiskCheckResult
│   ├── exchange.ts            # ExchangeClient, ExchangeConfig, ExchangeCapabilities
│   ├── lifecycle.ts           # OrderStatus, Fill, Cancellation, OrderEvent
│   ├── events.ts              # Event types for pub/sub
│   └── config.ts              # ExecutionConfig, EngineConfig
├── interfaces/
│   ├── iexchange-client.ts    # ExchangeClient interface
│   ├── iorder-manager.ts      # OrderManager interface
│   ├── irisk-engine.ts        # RiskEngine interface
│   └── iposition-manager.ts   # PositionManager interface
└── constants/
    ├── order-status.ts        # OrderStatus enum
    ├── order-types.ts         # OrderType enum (MARKET, LIMIT, STOP)
    └── time-in-force.ts       # TimeInForce enum (GTC, IOC, FOK)
```

### Type Relationships
```
ExecutionConfig
  ├── RiskConfig
  ├── ExchangeConfig[]
  ├── OrderDefaults
  └── EngineConfig

ExchangeClient (interface)
  ├── placeOrder(OrderRequest): OrderResponse
  ├── cancelOrder(orderId, symbol): Cancellation
  ├── getOrder(orderId, symbol): Order
  ├── getOpenOrders(symbol): Order[]
  ├── getBalance(asset): Balance
  ├── getPositions(): Position[]
  └── watchOrders(symbol, callback): Subscription

RiskEngine (interface)
  ├── checkPreTrade(order, positions): RiskCheckResult
  ├── checkPostTrade(fill, positions): RiskCheckResult
  ├── getDailyPnL(): number
  ├── getExposure(exchange, symbol): number
  └── emergencyStop(): void
```

## Related Code Files

### Files to Create
- `src/seed/arbitrage/index.ts`
- `src/seed/arbitrage/types/order.ts`
- `src/seed/arbitrage/types/position.ts`
- `src/seed/arbitrage/types/risk.ts`
- `src/seed/arbitrage/types/exchange.ts`
- `src/seed/arbitrage/types/lifecycle.ts`
- `src/seed/arbitrage/types/events.ts`
- `src/seed/arbitrage/types/config.ts`
- `src/seed/arbitrage/interfaces/iexchange-client.ts`
- `src/seed/arbitrage/interfaces/iorder-manager.ts`
- `src/seed/arbitrage/interfaces/irisk-engine.ts`
- `src/seed/arbitrage/interfaces/iposition-manager.ts`
- `src/seed/arbitrage/constants/order-status.ts`
- `src/seed/arbitrage/constants/order-types.ts`
- `src/seed/arbitrage/constants/time-in-force.ts`

### Files to Reference (Existing)
- `src/desk/arbitrage/types.ts` - Existing opportunity types
- `src/desk/arbitrage/spread-detector-types.ts` - Spread detector types
- `src/desk/arbitrage/config.ts` - Existing configs

## Implementation Steps

1. **Create directory structure** for `src/seed/arbitrage/`
2. **Define constants** (OrderStatus, OrderType, TimeInForce enums)
3. **Define core types**:
   - `order.ts`: OrderRequest, OrderResponse, Order, OrderSide (BUY/SELL)
   - `position.ts`: Position, PositionSnapshot, PnL, Exposure
   - `risk.ts`: RiskConfig, RiskLimits, RiskCheckResult, RiskAlert
   - `exchange.ts`: ExchangeClient, ExchangeConfig, ExchangeCapabilities, ExchangeCredentials
   - `lifecycle.ts`: Fill, Cancellation, OrderEvent, OrderUpdate
   - `events.ts`: ExecutionEvent, PositionUpdateEvent, RiskAlertEvent, EngineEvent
   - `config.ts`: ExecutionConfig, EngineConfig, OrderDefaults
4. **Define interfaces**:
   - `iexchange-client.ts`: ExchangeClient interface with all methods
   - `iorder-manager.ts`: OrderManager interface
   - `irisk-engine.ts`: RiskEngine interface
   - `iposition-manager.ts`: PositionManager interface
5. **Create index.ts** with all public exports
6. **Run type-check** to verify no errors

## Todo List
- [ ] Create src/seed/arbitrage/ directory structure
- [ ] Implement constants (order-status, order-types, time-in-force)
- [ ] Implement order.ts types
- [ ] Implement position.ts types
- [ ] Implement risk.ts types
- [ ] Implement exchange.ts types
- [ ] Implement lifecycle.ts types
- [ ] Implement events.ts types
- [ ] Implement config.ts types
- [ ] Implement interfaces (iexchange-client, iorder-manager, irisk-engine, iposition-manager)
- [ ] Create index.ts exports
- [ ] Run `npm run type-check` to verify

## Success Criteria
- All TypeScript types compile with zero errors (`npm run type-check`)
- Zero `:any` types in all files
- Types are compatible with existing spread-detector ArbitrageOpportunity
- Interfaces are comprehensive for CCXT wrapper implementation
- All enums use string values for serialization compatibility

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type conflicts with existing desk/arbitrage types | Medium | High | Use distinct namespaces, extend not replace |
| Over-engineering types | Low | Medium | YAGNI - only types needed for Phases 2-5 |
| Serialization issues with Redis | Low | Medium | Use string enums, avoid complex nested types |

## Security Considerations
- Exchange credentials never in types (handled at runtime via env vars)
- Order types validate price/amount are positive numbers
- Risk types enforce limits at type level where possible

## Next Steps
- Phase 2 will implement CCXT exchange clients consuming these interfaces
- Phase 3 will implement RiskEngine and PositionManager