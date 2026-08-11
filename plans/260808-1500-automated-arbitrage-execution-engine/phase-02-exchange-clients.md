# Phase 2: Exchange Clients with CCXT (tree layer)

**File:** `phase-02-exchange-clients.md`  
**Priority:** High  
**Status:** Pending  
**Dependencies:** Phase 1 (Core Types)

---

## Context Links

- Phase 1 types: `src/seed/types/*.ts`
- Existing CCXT usage: `src/desk/arbitrage/scanner.ts` (MultiExchangeScanner)
- Spread detector: `src/desk/arbitrage/spread-detector.ts`
- CCXT documentation: https://github.com/ccxt/ccxt
- Binance API: https://binance-docs.github.io/apidocs/spot/en/
- KuCoin API: https://www.kucoin.com/docs
- Bybit API: https://bybit-exchange.github.io/docs/v5/intro

---

## Overview

Implement production-ready CCXT-based exchange clients for Binance, KuCoin, and Bybit. Each client wraps CCXT with type-safe interfaces, rate limiting, error handling, WebSocket order updates, and unified order placement/cancellation/monitoring.

---

## Key Insights

- Current `MultiExchangeScanner` uses CCXT for **reading** prices only (no auth)
- Need authenticated clients for **writing** orders (API keys required)
- CCXT returns `any` types — must wrap with branded types from Phase 1
- Each exchange has different rate limits, order formats, WebSocket APIs
- WebSocket order updates critical for real-time fill tracking (no polling)
- Sandbox/testnet support required for PAPER_TRADE mode
- Error handling must distinguish: network, rate limit, auth, exchange errors

---

## Requirements

### Functional Requirements

1. **Unified Exchange Client Interface** — single interface for all 3 exchanges
2. **Authenticated REST Operations** — place order, cancel order, get order, get open orders
3. **WebSocket Order Streams** — real-time order updates (fills, cancellations, rejections)
4. **Rate Limiting** — per-exchange token bucket respecting CCXT rate limits
5. **Error Classification** — retryable vs non-retryable, with exponential backoff
6. **Market Data Access** — reuse scanner's price fetching (or unify)
7. **Balance/Position Queries** — fetch balances, positions for risk engine
8. **Symbol Normalization** — internal symbol format ↔ exchange format

### Non-Functional Requirements

- Zero `:any` types — strict wrapping of CCXT responses
- Connection pooling and reuse
- Automatic reconnection with backoff for WebSockets
- Request/response logging (sanitized) for debugging
- Health checks for each exchange connection
- Graceful degradation (continue if one exchange fails)

---

## Architecture

```
tree/
├── exchanges/
│   ├── base/
│   │   ├── exchange-client.ts          # Abstract base class
│   │   ├── rate-limiter.ts             # Token bucket rate limiter
│   │   ├── error-handler.ts            # Error classification & retry
│   │   ├── websocket-manager.ts        # WS connection lifecycle
│   │   └── index.ts
│   ├── binance/
│   │   ├── binance-client.ts           # Binance-specific implementation
│   │   ├── binance-websocket.ts        # Binance WS streams
│   │   ├── binance-mappers.ts          # CCXT ↔ internal type mappers
│   │   └── index.ts
│   ├── kucoin/
│   │   ├── kucoin-client.ts
│   │   ├── kucoin-websocket.ts
│   │   ├── kucoin-mappers.ts
│   │   └── index.ts
│   ├── bybit/
│   │   ├── bybit-client.ts
│   │   ├── bybit-websocket.ts
│   │   ├── bybit-mappers.ts
│   │   └── index.ts
│   ├── factory.ts                      # Client factory
│   ├── registry.ts                     # Exchange registry
│   └── index.ts                        # Tree layer barrel export
```

---

## Related Code Files

### Files to Create

| Path | Purpose |
|------|---------|
| `src/tree/exchanges/base/exchange-client.ts` | Abstract base with unified interface |
| `src/tree/exchanges/base/rate-limiter.ts` | Token bucket rate limiter |
| `src/tree/exchanges/base/error-handler.ts` | Error classification, retry logic |
| `src/tree/exchanges/base/websocket-manager.ts` | WS connection lifecycle |
| `src/tree/exchanges/base/index.ts` | Base barrel export |
| `src/tree/exchanges/binance/binance-client.ts` | Binance REST implementation |
| `src/tree/exchanges/binance/binance-websocket.ts` | Binance user data stream |
| `src/tree/exchanges/binance/binance-mappers.ts` | Type mappers |
| `src/tree/exchanges/binance/index.ts` | Binance barrel export |
| `src/tree/exchanges/kucoin/kucoin-client.ts` | KuCoin REST implementation |
| `src/tree/exchanges/kucoin/kucoin-websocket.ts` | KuCoin WS |
| `src/tree/exchanges/kucoin/kucoin-mappers.ts` | Type mappers |
| `src/tree/exchanges/kucoin/index.ts` | KuCoin barrel export |
| `src/tree/exchanges/bybit/bybit-client.ts` | Bybit REST implementation |
| `src/tree/exchanges/bybit/bybit-websocket.ts` | Bybit WS |
| `src/tree/exchanges/bybit/bybit-mappers.ts` | Type mappers |
| `src/tree/exchanges/bybit/index.ts` | Bybit barrel export |
| `src/tree/exchanges/factory.ts` | Client factory from config |
| `src/tree/exchanges/registry.ts` | Exchange registry |
| `src/tree/exchanges/index.ts` | Tree layer barrel export |

### Files to Modify

| Path | Change |
|------|--------|
| `src/desk/arbitrage/scanner.ts` | Extract shared CCXT instance or unify with new clients |

---

## Implementation Steps

### Step 1: Base Exchange Client Interface
```typescript
// src/tree/exchanges/base/exchange-client.ts
import { 
  ExchangeId, 
  Order, 
  OrderRequest, 
  OrderStatus, 
  Fill,
  Position,
  ExchangeConfig,
  ExecutionMode 
} from '@/seed/types';

export interface ExchangeClient {
  readonly id: ExchangeId;
  readonly config: ExchangeConfig;
  readonly mode: ExecutionMode;
  
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isHealthy(): boolean;
  
  // Order Management
  placeOrder(request: OrderRequest): Promise<Order>;
  cancelOrder(orderId: OrderId): Promise<Order>;
  cancelAllOrders(symbol?: string): Promise<Order[]>;
  getOrder(orderId: OrderId): Promise<Order>;
  getOpenOrders(symbol?: string): Promise<Order[]>;
  getOrderHistory(symbol: string, limit?: number): Promise<Order[]>;
  
  // Account
  getBalances(): Promise<Record<string, { free: number; locked: number }>>;
  getPositions(): Promise<Position[]>;
  
  // Market Data (reuse or unify with scanner)
  getTicker(symbol: string): Promise<{ bid: number; ask: number; timestamp: number }>;
  getOrderBook(symbol: string, depth?: number): Promise<{ bids: [number, number][]; asks: [number, number][] }>;
  
  // Events
  onOrderUpdate(callback: (order: Order) => void): void;
  onFill(callback: (fill: Fill) => void): void;
  onError(callback: (error: Error) => void): void;
}
```

### Step 2: Rate Limiter (Token Bucket)
```typescript
// src/tree/exchanges/base/rate-limiter.ts
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private readonly capacity: number,
    private readonly refillRate: number // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  async acquire(weight: number = 1): Promise<void> {
    // Refill tokens based on elapsed time
    // Block until enough tokens available
  }
  
  tryAcquire(weight: number = 1): boolean {
    // Non-blocking attempt
  }
}
```

### Step 3: Error Handler
```typescript
// src/tree/exchanges/base/error-handler.ts
export enum ErrorClass {
  NETWORK = 'NETWORK',           // Retryable
  RATE_LIMIT = 'RATE_LIMIT',     // Retryable with backoff
  AUTHENTICATION = 'AUTH',       // Non-retryable
  INSUFFICIENT_BALANCE = 'BALANCE', // Non-retryable
  INVALID_ORDER = 'INVALID',     // Non-retryable
  EXCHANGE_ERROR = 'EXCHANGE',   // Maybe retryable
  TIMEOUT = 'TIMEOUT',           // Retryable
  UNKNOWN = 'UNKNOWN'
}

export class ExchangeError extends Error {
  constructor(
    message: string,
    public readonly class: ErrorClass,
    public readonly exchange: ExchangeId,
    public readonly statusCode?: number,
    public readonly originalError?: Error,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'ExchangeError';
  }
}

export function classifyError(error: unknown, exchange: ExchangeId): ExchangeError;
export async function withRetry<T>(
  fn: () => Promise<T>,
  exchange: ExchangeId,
  maxRetries: number = 3
): Promise<T>;
```

### Step 4: WebSocket Manager
```typescript
// src/tree/exchanges/base/websocket-manager.ts
export interface WebSocketManager {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(channel: string, params: Record<string, unknown>): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  onMessage(callback: (channel: string, data: unknown) => void): void;
  onOpen(callback: () => void): void;
  onClose(callback: (code: number, reason: string) => void): void;
  onError(callback: (error: Error) => void): void;
}
```

### Step 5: Binance Client Implementation
- REST: `/api/v3/order`, `/api/v3/openOrders`, `/api/v3/account`
- WS: User Data Stream (`/api/v3/userDataStream`) → listenKey → `wss://stream.binance.com:9443/ws/{listenKey}`
- Events: `executionReport` for order updates, `outboundAccountPosition` for balances
- Rate limits: 1200 weight/min (IP), 10 orders/sec, 50 orders/day (per symbol)

### Step 6: KuCoin Client Implementation
- REST: `/api/v1/orders`, `/api/v1/accounts`, `/api/v1/positions`
- WS: `/api/v1/bullet-public` (public) + `/api/v1/bullet-private` (private with token)
- Events: `orderChange`, `accountBalance`
- Rate limits: 30 req/sec (REST), 100 msg/sec (WS)

### Step 7: Bybit Client Implementation
- REST: `/v5/order/create`, `/v5/order/cancel`, `/v5/order/realtime`, `/v5/account/wallet-balance`
- WS: `wss://stream.bybit.com/v5/private` (v5 private)
- Events: `order`, `wallet`
- Rate limits: 120 req/sec (REST), 50 msg/sec (WS)

### Step 8: Type Mappers
Each exchange needs mappers:
```typescript
// CCXT Order → Internal Order
function mapCcxtOrder(ccxtOrder: any, exchange: ExchangeId): Order;

// Internal OrderRequest → CCXT params
function mapOrderRequest(request: OrderRequest): any;

// CCXT Balance → Internal Balance
function mapBalances(ccxtBalances: any): Record<string, { free: number; locked: number }>;
```

### Step 9: Factory & Registry
```typescript
// src/tree/exchanges/factory.ts
export function createExchangeClient(config: ExchangeConfig, mode: ExecutionMode): ExchangeClient;

// src/tree/exchanges/registry.ts
export class ExchangeRegistry {
  private clients = new Map<ExchangeId, ExchangeClient>();
  
  register(client: ExchangeClient): void;
  get(id: ExchangeId): ExchangeClient | undefined;
  getAll(): ExchangeClient[];
  remove(id: ExchangeId): void;
}
```

---

## Todo List

- [ ] Create base exchange client interface
- [ ] Implement token bucket rate limiter
- [ ] Implement error classification and retry logic
- [ ] Implement WebSocket manager base class
- [ ] Implement Binance client (REST + WS + mappers)
- [ ] Implement KuCoin client (REST + WS + mappers)
- [ ] Implement Bybit client (REST + WS + mappers)
- [ ] Create client factory
- [ ] Create exchange registry
- [ ] Add barrel exports
- [ ] Run `npm run type-check` (0 errors)
- [ ] Write unit tests for rate limiter, error handler, mappers

---

## Success Criteria

- All 3 exchange clients implement unified `ExchangeClient` interface
- Rate limiting respects each exchange's limits
- WebSocket connections auto-reconnect with exponential backoff
- Error classification correctly identifies retryable vs non-retryable
- Type mappers produce zero-TypeScript-error conversions
- Factory creates clients from config with correct mode (DRY_RUN/PAPER_TRADE/LIVE)
- Unit tests cover: rate limiter, error handler, each mapper

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CCXT API changes | Low | Medium | Pin CCXT version, wrapper isolation |
| WebSocket disconnections | High | High | Auto-reconnect, message queue during disconnect |
| Rate limit violations | Medium | High | Token bucket + request queuing |
| Exchange-specific quirks | High | Medium | Comprehensive integration tests per exchange |

---

## Next Steps

Phase 3 (Risk Engine & Position Manager) depends on ExchangeClient interface for balance/position queries.