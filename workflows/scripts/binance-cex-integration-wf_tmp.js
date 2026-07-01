export const meta = {
  name: 'binance-cex-integration',
  description: 'Complete Binance exchange integration: Spot, Futures, unified adapter, comprehensive testing',
  phases: [
    { title: 'Binance Integration Planning', detail: 'Design unified adapter architecture, test coverage' },
    { title: 'Binance Spot Adapter', detail: 'Implement Spot trading, WebSocket, account API' },
    { title: 'Binance Futures Adapter', detail: 'Implement Futures trading, margin, funding' },
    { title: 'Unified Adapter Integration', detail: 'Integrate with ExchangeRouter, test' },
    { title: 'Comprehensive Testing', detail: 'Unit tests, integration tests, paper trading' },
    { title: 'Production Hardening', detail: 'Rate limiting, error handling, monitoring' },
    { title: 'Sign-off', detail: 'Validate all Binance functionality works' },
  ],
};

phase('Planning');
const planning = await agent('Binance Integration Plan', {
  label: 'binance-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan Binance CEX integration. Task #142.

Binance API coverage needed:
1. Spot:
   - REST: account, orders (place/cancel), trades, balances
   - WebSocket: user data (order updates, account updates)
   - Market data: ticker, OHLCV, depth

2. Futures:
   - USDT-M futures
   - COIN-M futures
   - Order types: LIMIT, MARKET, STOP_LOSS, TAKE_PROFIT
   - Position mode: one-way, hedge
   - Funding: for perpetuals

3. Unified adapter:
   - IExchangeAdapter interface
   - Route to correct (spot/futures) based on symbol
   - Consistent error handling

4. Testing:
   - Sandbox trading (testnet)
   - Paper trading mode
   - All order types tested

Create plan: ./plans/binance-integration/plan.md
`,
});

phase('Binance Spot Adapter');
const spot = await parallel([
  () => agent('Implement Binance Spot REST API', {
    label: 'binance-spot-rest',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Binance Spot REST adapter:

src/exchanges/binance/binance-spot.adapter.ts

1. Authentication:
   - API key + secret
   - Sign requests: HMAC-SHA256 of timestamp + payload
   - Header: X-MBX-APIKEY, recvWindow

2. Account endpoints:
   GET /api/v3/account
   → balances: { asset: "BTC", free: 1.5, locked: 0.1 }
   GET /api/v3/accountSnapshot?type=SPOT

3. Order placement:
   POST /api/v3/order
   Params: symbol, side, type, quantity, price?, timeInForce
   Response: { orderId, clientOrderId, status, ... }

4. Order management:
   GET /api/v3/order  // single order
   GET /api/v3/allOrders  // all orders for symbol
   DELETE /api/v3/order  // cancel

5. Market data:
   GET /api/v3/ticker/24hr?symbol=BTCUSDT
   GET /api/v3/klines (candlesticks)
   GET /api/v3/depth?symbol=BTCUSDT (order book)

6. Error handling:
   - 429 rate limit → retry with backoff
   - 400 validation errors → structured error
   - 5xx server errors → retry 3x

`,
  }),
  () => agent('Implement Binance Spot WebSocket', {
    label: 'binance-spot-ws',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Binance Spot WebSocket:

1. User data stream:
   - Listen key: POST /api/v3/userDataStream → returns listenKey
   - WebSocket: wss://stream.binance.com:9443/ws/{listenKey}

2. Events:
   - executionReport: order fill/partial fill
   - outboundAccountInfo: balance updates
   - balanceUpdate: specific asset balance change
   - orderListStatus: OCO order status

3. Connection management:
   - Keepalive: PUT /api/v3/userDataStream every 30min
   - Reconnect on disconnect with exponential backoff
   - Resubscribe to user data stream

4. Event handling:
   - Parse executionReport
   - Publish ORDER_FILL event to NATS
   - Update order cache

5. Implementation:
   src/workers/binance-spot-stream.worker.ts
   - Maintains WebSocket connection
   - Handles reconnection
   - Emits events to OrderExecutor

`,
  }),
  () => agent('Implement Spot Test (Sandbox)', {
    label: 'binance-spot-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Binance Spot sandbox testing:

1. Testnet setup:
   - Use testnet.binance.vision API
   - Test API keys from Binance testnet account
   - No real funds

2. Test order lifecycle:
   - Place LIMIT order (far from market) → open
   - Place MARKET order → fills immediately
   - Cancel open order → cancelled
   - Partial fills → verify

3. Edge cases:
   - Insufficient balance → INSUFFICIENT_BALANCE error
   - Invalid symbol → INVALID_SYMBOL
   - Too small order → LOT_SIZE error
   - Price too far from market → PRICE_FILTER

4. WebSocket:
   - Order fill event received in <1s
   - Balance update received

5. Rate limit:
   - Burst 20 requests → some throttled (429)
   - Verify retry logic works

`,
  }),
]);

phase('Binance Futures Adapter');
const futures = await parallel([
  () => agent('Implement Binance Futures REST', {
    label: 'binance-futures-rest',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Binance Futures REST adapter:

1. Base URL:
   - USDT-M: https://fapi.binance.com
   - COIN-M: https://dapi.binance.com

2. Account:
   GET /fapi/v2/account  // USDT-M
   → balances: asset, walletBalance, availableBalance
   → positions: symbol, positionAmt, entryPrice, markPrice

3. Order placement:
   POST /fapi/v1/order
   Supports:
   - Position side: LONG/SHORT (for hedge mode)
   - Time in force: GTC, IOC, FOK
   - Reduce only flag
   - Stop loss / Take profit params

4. Position management:
   GET /fapi/v2/positionRisk  // open positions
   POST /fapi/v1/positionSide/dual  // hedge mode toggle

5. Funding (perpetual):
   GET /fapi/v1/fundingRate?symbol=BTCUSDT
   GET /fapi/v1/income  // funding payments received/paid

6. Leverage:
   POST /fapi/v1/leverage  // set leverage
   POST /fapi/v1/marginType  // isolated/cross

`,
  }),
  () => agent('Implement Binance Futures WebSocket', {
    label: 'binance-futures-ws',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Binance Futures WebSocket:

1. User data stream:
   POST /fapi/v1/listenKey
   WS: wss://fstream.binance.com/ws/{listenKey}

2. Events:
   - ORDER_TRADE_UPDATE: order status, fills
   - ACCOUNT_UPDATE: balance, position changes
   - MARGIN_CALL: margin ratio warning
   - BALANCE_UPDATE: wallet balance change

3. Key differences from Spot:
   - Position data included
   - Margin call alerts
   - Funding payments

4. Implementation:
   - Reuse connection logic from Spot
   - Separate listenKey per account
   - Handle both order and account updates

5. Futures-specific:
   - Track position PnL: markPrice * positionAmt
   - Monitor margin ratio: positionAmt * entryPrice / walletBalance

`,
  }),
  () => agent('Implement Futures Paper Trading', {
    label: 'futures-paper',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Futures paper trading:

1. Testnet: testnet.binancefuture.com
   - Separate API keys
   - Start with 1000 USDT test funds

2. Futures-specific tests:
   - Open LONG position: BUY 1 BTCUSDT @ market, leverage 10x
   - Open SHORT position: SELL 1 BTCUSDT
   - Close position: opposite order
   - Reduce only orders: close position only
   - Stop loss / Take profit orders

3. Margin types:
   - Cross margin (default)
   - Isolated margin per symbol

4. Funding simulation:
   - Testnet pays fake funding every 8h
   - Verify funding recorded in income history

5. Liquidation test:
   - Can't fully liquidate in testnet, but can simulate
   - Verify margin ratio monitoring

6. PnL calculation:
   - Unrealized PnL: (markPrice - entryPrice) * positionAmt
   - Realized PnL from fills + funding

`,
  }),
]);

phase('Unified Adapter Integration');
const unified = await parallel([
  () => agent('Enhance ExchangeRouter for Binance', {
    label: 'router-binance',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `ExchangeRouter Binance support:

1. Symbol mapping:
   - Spot: BTCUSDT → Binance Spot
   - Futures: BTCUSDT (perpetual) → Binance USDT-M Futures
   - COIN-M: BTCUSD_250627 → Binance COIN-M Futures

2. Route decision:
   function routeToBinance(symbol, orderType) {
     if (symbol.endsWith('_PERP') || symbol.includes('USDT')) {
       return binanceFuturesAdapter;
     }
     if (symbol.includes('USD') && !symbol.includes('USDT')) {
       return binanceCoinMAdapter;
     }
     return binanceSpotAdapter;
   }

3. Unified error handling:
   - Spot error codes → unified error type
   - Futures error codes → unified error type
   - Map: ERR_ORDER_NOT_FOUND, ERR_INSUFFICIENT_BALANCE, etc.

4. Balance aggregation:
   - Spot balances + Futures balances = total balance
   - For portfolio view

5. Configuration:
   Tenant can enable:
   - Binance Spot: true/false
   - Binance Futures: true/false
   - API keys separate for spot/futures

`,
  }),
  () => agent('Implement Comprehensive Binance Tests', {
    label: 'binance-integration-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Binance integration tests:

1. Spot integration:
   - Order placement (LIMIT, MARKET)
   - Order cancellation
   - Order status query
   - Balance query
   - Trade history
   - WebSocket order updates

2. Futures integration:
   - Position opening (LONG/SHORT)
   - Position closing
   - Stop loss / Take profit
   - Leverage setting
   - Margin type switch
   - Funding history

3. Unified adapter:
   - ExchangeRouter routes correctly
   - Error mapping works
   - Balance aggregation correct

4. Paper trading:
   - Full strategy: signal → order → fill
   - Multiple orders in flight
   - Partial fills handled

5. Error scenarios:
   - API key invalid → AUTH_FAILURE
   - IP banned → NETWORK_ERROR
   - Rate limit → retry then fail
   - Insufficient balance → ORDER_REJECTED

`,
  }),
]);

phase('Production Hardening');
const hardening = await parallel([
  () => agent('Implement Rate Limiting for Binance', {
    label: 'binance-rate-limit',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Binance rate limiting:

1. Binance limits:
   - Spot: 1200 weight/minute (varies by endpoint)
   - Futures: 2400 weight/minute
   - Weight: simple orders = 1, account info = 5

2. Token bucket per API key:
   - Track remaining weight
   - Refill at rate: weight_limit / 60s
   - If insufficient, wait or reject

3. Implementation:
   class BinanceRateLimiter {
     tokens: number;
     refillRate: number;
     lastRefill: Date;

     async reserve(weight: number): Promise<void> {
       this.refill();
       if (this.tokens < weight) {
         await this.waitForTokens(weight);
       }
       this.tokens -= weight;
     }
   }

4. Priority:
   - Order placement: high priority
   - Market data: low priority (can skip)
   - Balance checks: medium

5. WebSocket:
   - No rate limit for user data stream (per connection)
   - Limit concurrent connections per API key

`,
  }),
  () => agent('Implement Circuit Breaker', {
    label: 'binance-circuit-breaker',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Circuit breaker for Binance API:

1. Failure detection:
   - 5xx errors → increment failure count
   - 429 rate limit → increment
   - Connection timeout → increment
   - Success → reset count

2. States:
   - CLOSED (normal): requests pass through
   - OPEN: failures > threshold (e.g., 5 in 1min) → reject immediately
   - HALF_OPEN: after cooloff (5min), allow test request

3. Implementation:
   class CircuitBreaker {
     state: 'closed' | 'open' | 'half-open';
     failures: number;
     lastFailure: Date;

     async call<T>(fn: () => Promise<T>): Promise<T> {
       if (this.state === 'open') {
         throw new Error('Circuit breaker OPEN');
       }
       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (e) {
         this.onFailure();
         throw e;
       }
     }
   }

4. Per-endpoint circuit breakers:
   - Order placement: sensitive
   - Market data: can tolerate failures
   - Account: sensitive

5. Metrics:
   - circuit_breaker_state{exchange="binance",endpoint="order"}
   - Failures count, state transitions

`,
  }),
  () => agent('Create Binance Monitoring Dashboard', {
    label: 'binance-monitoring',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Binance monitoring dashboard:

Grafana dashboard: config/grafana/dashboards/binance.json

Panels:
1. API health:
   - Request rate (per endpoint)
   - Error rate (4xx, 5xx)
   - Rate limit hits (429)
   - Circuit breaker state

2. Account:
   - Spot balance: BTC, USDT, ETH
   - Futures balance: wallet, available
   - Open positions count, total PnL (unrealized)
   - Margin ratio (futures)

3. Orders:
   - Open orders count
   - Order fill rate (fills/minute)
   - Average order latency (place→fill)

4. Trading volume:
   - Spot: volume 24h
   - Futures: volume 24h
   - Number of trades

5. Fills:
   - Recent fills table (time, symbol, side, quantity, price)
   - Total fees paid (BTC equivalent)

6. WebSocket:
   - Connection status (up/down)
   - Messages received/sec
   - Reconnect count

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Run End-to-End Binance Tests', {
    label: 'binance-e2e',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `E2E Binance tests (testnet):

1. Spot full flow:
   - Check balances
   - Place LIMIT order (BTC, 0.001, price far from market)
   - Order appears in open orders
   - Cancel order → cancelled
   - Place MARKET order → fills immediately
   - Balance updated

2. Futures full flow:
   - Check balance (1000 USDT test)
   - Open LONG: BUY 0.001 BTCUSDT @ market, 10x leverage
   - Position appears with entry price
   - Close position: SELL 0.001
   - PnL calculated correctly
   - Balance updated

3. WebSocket:
   - Order fill received in <1s
   - Balance update received
   - Reconnect after disconnect

4. Error handling:
   - Invalid API key → AUTH_FAILURE
   - Too many requests → 429, then retry works
   - Network drop → circuit breaker opens after 5 failures

5. ExchangeRouter:
   - Symbol → correct adapter
   - Order routing works
   - Fill events flow back to OrderExecutor

`,
  }),
  () => agent('Performance Testing Binance', {
    label: 'binance-perf',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Binance performance testing:

1. Order throughput:
   - Place 100 orders/sec for 1min → no rate limit errors
   - Burst 500 orders in 5s → some rate limited, retry succeeds

2. WebSocket latency:
   - Fill from execution → WS message → OrderExecutor: <500ms

3. Balance query caching:
   - Balance queries cached for 5s
   - Cache hit rate >90%

4. Memory:
   - No leaks in order tracking
   - WebSocket connection pool managed

5. Circuit breaker:
   - Simulate 6 failures → opens
   - Reject requests immediately (fast fail)
   - After 5min, half-open → test request → close if success

`,
  }),
  () => agent('Binance Integration Sign-off', {
    label: 'binance-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Binance CEX Integration.

Review:
✅ Binance Spot REST API implemented
✅ Binance Spot WebSocket (user data stream)
✅ Binance Futures REST (USDT-M, COIN-M)
✅ Binance Futures WebSocket
✅ Unified adapter interface
✅ ExchangeRouter integration
✅ Rate limiting (per weight limit)
✅ Circuit breaker for failure handling
✅ Comprehensive test coverage (testnet)
✅ Production monitoring dashboard
✅ Error handling robust

Decision: BINANCE CEX INTEGRATION PRODUCTION READY.

`,
  }),
]);

log('Binance CEX Integration workflow launched');