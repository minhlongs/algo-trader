# Phase 2: Exchange Clients with CCXT (tree layer)

## Context Links
- Phase 1 types: `phase-01-core-types-interfaces.md`
- Existing scanner: `src/desk/arbitrage/scanner.ts`
- CCXT documentation: https://github.com/ccxt/ccxt
- Exchange APIs: Binance, KuCoin, Bybit

## Overview
- **Priority**: Critical
- **Status**: Not Started
- **Description**: Implement production-ready CCXT wrapper clients for Binance, KuCoin, and Bybit with unified interface, rate limiting, retry logic, and WebSocket order updates.

## Key Insights
- Existing `MultiExchangeScanner` in `src/desk/arbitrage/scanner.ts` only reads prices, doesn't execute orders
- CCXT has different method signatures and error formats per exchange
- Need unified interface that abstracts exchange-specific differences
- Rate limits vary significantly: Binance (1200/min), KuCoin (100/10s), Bybit (600/min)
- WebSocket order updates preferred over polling for latency
- Must handle authentication, signature generation, and nonce management

## Requirements

### Functional Requirements
1. **ExchangeClient Interface Implementation**: Full implementation of `IExchangeClient` from Phase 1
2. **Order Placement**: Market, Limit, Stop orders with proper parameter mapping per exchange
3. **Order Management**: Get order status, cancel order, get open orders
4. **Account Management**: Get balances, get positions
5. **WebSocket Order Updates**: Real-time order status via WebSocket (fallback to polling)
5. **Rate Limiting**: Per-exchange rate limiters with token bucket algorithm
6. **Retry Logic**: Exponential backoff for transient errors (network, 5xx, rate limit)
7. **Error Normalization**: Map exchange-specific errors to unified error types
8. **Connection Management**: Auto-reconnect, health checks, graceful shutdown

### Non-Functional Requirements
- Sub-100ms order placement latency p95
- Zero-downtime reconnection
- Comprehensive logging for audit trail
- Type-safe (no `:any`)

## Architecture

### Tree Layer Structure
```
src/tree/arbitrage/
├── index.ts                           # Public exports
├── exchange-clients/
│   ├── base-client.ts                 # Abstract base class with common logic
│   ├── binance-client.ts              # Binance-specific implementation
│   ├── kucoin-client.ts               # KuCoin-specific implementation
│   ├── bybit-client.ts                # Bybit-specific implementation
│   └── exchange-factory.ts            # Factory to create clients
├── rate-limiter/
│   ├── token-bucket.ts                # Token bucket rate limiter
│   └── rate-limit-config.ts           # Per-exchange rate limit configs
├── websocket/
│   ├── order-ws-client.ts             # WebSocket client for order updates
│   ├── binance-ws.ts                  # Binance WebSocket
│   ├── kucoin-ws.ts                   # KuCoin WebSocket
│   └── bybit-ws.ts                    # Bybit WebSocket
├── error-handling/
│   ├── exchange-errors.ts             # Unified error types
│   └── error-mapper.ts                # Map CCXT errors to unified errors
└── utils/
    ├── ccxt-adapter.ts                # CCXT method adapter
    ├── symbol-normalizer.ts           # Normalize symbols across exchanges
    └── credential-manager.ts          # Secure credential handling
```

### Client Hierarchy
```
IExchangeClient (interface from seed)
    ↑
BaseExchangeClient (abstract class)
    ├── BinanceClient
    ├── KuCoinClient
    └── BybitClient
```

## Related Code Files

### Files to Create
- `src/tree/arbitrage/index.ts`
- `src/tree/arbitrage/exchange-clients/base-client.ts`
- `src/tree/arbitrage/exchange-clients/binance-client.ts`
- `src/tree/arbitrage/exchange-clients/kucoin-client.ts`
- `src/tree/arbitrage/exchange-clients/bybit-client.ts`
- `src/tree/arbitrage/exchange-clients/exchange-factory.ts`
- `src/tree/arbitrage/rate-limiter/token-bucket.ts`
- `src/tree/arbitrage/rate-limiter/rate-limit-config.ts`
- `src/tree/arbitrage/websocket/order-ws-client.ts`
- `src/tree/arbitrage/websocket/binance-ws.ts`
- `src/tree/arbitrage/websocket/kucoin-ws.ts`
- `src/tree/arbitrage/websocket/bybit-ws.ts`
- `src/tree/arbitrage/error-handling/exchange-errors.ts`
- `src/tree/arbitrage/error-handling/error-mapper.ts`
- `src/tree/arbitrage/utils/ccxt-adapter.ts`
- `src/tree/arbitrage/utils/symbol-normalizer.ts`
- `src/tree/arbitrage/utils/credential-manager.ts`

### Files to Reference
- `src/seed/arbitrage/interfaces/iexchange-client.ts` (from Phase 1)
- `src/desk/arbitrage/scanner.ts` (existing CCXT usage patterns)
- `src/desk/arbitrage/config.ts` (EXCHANGE_FEE_RATES)

## Implementation Steps

### Step 1: Rate Limiter (Foundation)
1. Implement `TokenBucket` class with configurable capacity, refill rate
2. Create `RateLimitConfig` with per-exchange limits:
   - Binance: 1200 req/min (20/sec), weight-based
   - KuCoin: 100 req/10s (10/sec), 50 req/10s for orders
   - Bybit: 600 req/min (10/sec), 10 req/sec for orders
3. Integrate with base client - acquire token before each request

### Step 2: Error Handling
1. Define unified error types: `ExchangeError`, `RateLimitError`, `AuthenticationError`, `InsufficientFundsError`, `InvalidOrderError`, `NetworkError`
2. Implement `ErrorMapper` to convert CCXT errors to unified types
3. Add error codes for programmatic handling

### Step 3: Base Client
1. Extend CCXT exchange class
2. Implement credential loading from env vars
3. Add rate limiter integration
4. Implement retry logic with exponential backoff (max 3 retries)
5. Add request/response logging for audit
6. Implement symbol normalization (exchange format ↔ standard format)

### Step 4: Exchange-Specific Clients
For each exchange (Binance, KuCoin, Bybit):
1. Extend `BaseExchangeClient`
2. Configure CCXT with exchange-specific options (enableRateLimit, options)
3. Implement order parameter mapping (e.g., Binance uses `type: 'MARKET'`, KuCoin uses `type: 'market'`)
4. Handle exchange-specific order types (stop-loss, take-profit)
5. Implement WebSocket connection for order updates

### Step 5: WebSocket Order Updates
1. Implement `OrderWebSocketClient` base class
2. Exchange-specific WebSocket implementations:
   - Binance: User Data Stream (listenKey)
   - KuCoin: Private WebSocket (token-based)
   - Bybit: Private WebSocket (authenticated)
3. Handle reconnection with exponential backoff
4. Parse order update messages to unified `OrderEvent`
5. Emit events via callback/EventEmitter

### Step 6: Exchange Factory
1. Implement `ExchangeFactory` with `createClient(exchangeId, config)`
2. Load credentials from environment variables
3. Return `IExchangeClient` implementation
4. Support paper trading mode (testnet)

### Step 7: Testing & Validation
1. Unit tests for rate limiter, error mapper, symbol normalizer
2. Integration tests with CCXT mock (no real API calls)
3. Paper trading tests on testnets

## Todo List
- [ ] Create directory structure for src/tree/arbitrage/
- [ ] Implement TokenBucket rate limiter
- [ ] Implement rate limit configs per exchange
- [ ] Define unified error types
- [ ] Implement error mapper
- [ ] Implement BaseExchangeClient abstract class
- [ ] Implement BinanceClient
- [ ] Implement KuCoinClient
- [ ] Implement BybitClient
- [ ] Implement ExchangeFactory
- [ ] Implement WebSocket clients (base + 3 exchanges)
- [ ] Implement CCXT adapter utilities
- [ ] Implement symbol normalizer
- [ ] Implement credential manager
- [ ] Write unit tests
- [ ] Run `npm run type-check` and `npm test`

## Success Criteria
- All three exchange clients implement `IExchangeClient` fully
- Order placement latency < 100ms p95 (measured locally)
- Rate limiting prevents 429 errors under load
- WebSocket receives order updates within 50ms of fill
- Automatic reconnection works after network disruption
- Zero `:any` types
- All tests pass

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CCXT version breaking changes | Medium | High | Pin CCXT version, integration tests |
| Exchange API changes | Medium | High | Monitor exchange announcements, feature flags |
| WebSocket disconnections | High | Medium | Robust reconnection, polling fallback |
| Rate limit exceeded | High | High | Conservative limits, weight tracking |
| Credential leakage | Low | Critical | Env vars only, never in code/logs |

## Security Considerations
- API keys/secret never logged (redact in logs)
- Use testnet/sandbox for development
- Encrypt credentials at rest if persisted
- Validate all order parameters before sending

## Next Steps
- Phase 3 will use these clients for RiskEngine and PositionManager
- Phase 4 will orchestrate multi-leg execution across clients