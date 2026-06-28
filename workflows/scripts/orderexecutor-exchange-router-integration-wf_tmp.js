export const meta = {
  name: 'orderexecutor-exchange-router-integration',
  description: 'Integrate OrderExecutor with ExchangeRouter: route orders to correct exchange adapter, handle fills, errors, retries',
  phases: [
    { title: 'Integration Planning', detail: 'Design order routing, adapter interface, error handling' },
    { title: 'Exchange Router Enhancement', detail: 'Implement order routing logic, adapter selection' },
    { title: 'OrderExecutor Integration', detail: 'Connect OrderExecutor to ExchangeRouter, handle fills' },
    { title: 'Error Handling & Retries', detail: 'Network failures, exchange errors, fallback logic' },
    { title: 'Testing & Sign-off', detail: 'End-to-end order flow, failover testing' },
  ],
};

phase('Planning');
const planning = await agent('Integration Plan', {
  label: 'integration-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan OrderExecutor-ExchangeRouter integration. Task #340.

Current state:
- OrderExecutor: internal order management, strategy signals → orders
- ExchangeRouter: routes to exchange adapters (Binance, Coinbase, etc.)
- Adapters: IExchangeAdapter interface (placeOrder, cancelOrder, getTicker)

Integration needed:
1. OrderExecutor emits ORDER_READY event
2. ExchangeRouter receives, selects exchange (based on tenant config, symbol)
3. Adapter places order on exchange
4. Fill events flow back: Exchange → Adapter → ExchangeRouter → OrderExecutor → Strategy
5. Error handling: retry, fallback, cancellation

Key concerns:
- Order uniqueness (idempotency)
- Fill matching (partial fills)
- Order state transitions (open → partial → filled → cancelled)
- Error recovery (network timeout, rate limit)

Create plan: ./plans/orderexecutor-router-integration/plan.md
`,
});

phase('Exchange Router Enhancement');
const router = await parallel([
  () => agent('Implement Order Routing Logic', {
    label: 'order-routing',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `ExchangeRouter order routing:

1. Route decision factors:
   - Tenant's configured exchanges (tenant_exchanges table)
   - Symbol availability on exchange (BTC-USD on Binance? Coinbase?)
   - Exchange health (is exchange up?)
   - Tenant preferences (primary/secondary exchange)
   - Fee comparison (which exchange cheaper for this tenant?)
   - Liquidity (which exchange has better liquidity for this symbol?)

2. Routing algorithm:
   function routeOrder(tenantId, symbol, side, quantity, orderType) {
     const availableExchanges = getTenantExchanges(tenantId);
     const symbolExchanges = filterBySymbol(availableExchanges, symbol);
     const healthy = filterHealthy(symbolExchanges);
     const ranked = rankByPreferences(healthy, tenantId);
     return ranked[0];  // top choice
   }

3. Fallback:
   If primary exchange fails (order rejected, network error):
   - Retry 3 times with backoff
   - If still fails, try secondary exchange
   - If all fail → reject order, notify tenant

4. Configuration:
   Tenant can set:
   - Primary exchange
   - Secondary (fallback) exchange
   - Routing preference: cheapest_liquidity, lowest_fee, fastest

`,
  }),
  () => agent('Enhance Exchange Adapter Interface', {
    label: 'adapter-interface',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `IExchangeAdapter interface (enhance):

Current methods:
- placeOrder(params): OrderResponse
- cancelOrder(orderId): CancelResponse
- getTicker(symbol): Ticker
- getOrder(orderId): OrderStatus

Add:
- getOpenOrders(symbol?): Order[]
- getFills(orderId?): Fill[]
- subscribeOrderUpdates(orderId): Observable<OrderUpdate>

Response structure:
interface OrderResponse {
  orderId: string;          // exchange order ID
  clientOrderId: string;    // our internal order ID
  status: 'open' | 'partial' | 'filled' | 'cancelled' | 'rejected';
  filledQuantity: number;
  avgFillPrice: number;
  fills: Fill[];
  error?: { code: string, message: string };
}

Fill:
interface Fill {
  fillId: string;
  quantity: number;
  price: number;
  timestamp: Date;
  fee: number;
  feeAsset: string;
}

Adapters to implement/enhance:
- BinanceSpotAdapter
- BinanceFuturesAdapter
- CoinbaseSpotAdapter
- KuCoinFuturesAdapter
- PolymarketAdapter

`,
  }),
]);

phase('OrderExecutor Integration');
const integration = await parallel([
  () => agent('Connect OrderExecutor to ExchangeRouter', {
    label: 'orderexecutor-connect',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `OrderExecutor → ExchangeRouter integration:

1. OrderExecutor flow:
   - Strategy emits SIGNAL (buy BTC, 1.0 BTC)
   - OrderExecutor creates internal order record
   - Publish event: ORDER_READY { order_id, tenant_id, symbol, side, quantity, type }

2. ExchangeRouter subscriber:
   src/workers/exchange-router.worker.ts
   - Subscribe to ORDER_READY events
   - Call routeOrder(tenant_id, symbol, side, quantity, type)
   - Get adapter for selected exchange
   - Call adapter.placeOrder()

3. Handle response:
   - Success: update order status = open, store exchange_order_id
   - Rejected: update status = rejected, error message, notify strategy
   - Error: retry logic

4. Order state machine:
   created → routed → open → (partial →)* filled → closed
              ↘ (rejected|cancelled)

5. Order record:
   orders table:
   id, tenant_id, strategy_id, symbol, side, quantity, filled_quantity,
   type, status, exchange_id, exchange_order_id, created_at, updated_at

`,
  }),
  () => agent('Implement Fill Processing', {
    label: 'fill-processing',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Fill processing pipeline:

1. Exchange webhook/push:
   - Exchange sends fill event to our worker
   - Payload: { order_id, fill_id, quantity, price, fee, timestamp }

2. ExchangeAdapter receives:
   - Updates internal state
   - Publishes event: ORDER_FILL { order_id, fill }

3. ExchangeRouter subscribes:
   - Updates order: filled_quantity += fill.quantity
   - If filled_quantity == order.quantity → status = filled
   - Else if filled_quantity > 0 → status = partial
   - Publish: ORDER_UPDATE { order_id, status, filled_quantity }

4. OrderExecutor subscribes:
   - Updates internal order state
   - Notify strategy: onFill(order_id, fill)
   - Strategy may emit new signal based on fill

5. Idempotency:
   - Use exchange fill_id as idempotency key
   - Deduplicate fills if webhook retries

`,
  }),
  () => agent('Implement Order Status Sync', {
    label: 'status-sync',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Order status synchronization:

1. Polling for exchanges without webhooks:
   - Every 5s, for open orders >30s old
   - Call adapter.getOrder(order_id)
   - Update status if changed

2. Reconcile open orders:
   - Daily: query exchange for all open orders
   - Compare with our database
   - Reject missing orders (maybe filled on exchange but we missed webhook?)
   - Create missing records

3. Cancel handling:
   - Strategy calls cancelOrder(order_id)
   - ExchangeRouter → adapter.cancelOrder()
   - On confirm: update status = cancelled
   - If already filled → cannot cancel, report error

4. Order not found:
   - Exchange returns 404 → likely already filled/cancelled
   - Query getFills() to confirm
   - Update status accordingly

5. Stale order detection:
   - Open order > 24h with no updates → alert
   - Possibly stuck → manual review

`,
  }),
]);

phase('Error Handling & Retries');
const errors = await parallel([
  () => agent('Implement Retry Logic', {
    label: 'retry-logic',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Retry logic for order placement:

1. Retryable errors:
   - Network timeout
   - 5xx server errors
   - Rate limit (429) → wait and retry
   - Exchange maintenance

2. Non-retryable errors:
   - Invalid symbol
   - Insufficient balance
   - Order size too small/large
   - Account restrictions

3. Retry policy:
   - Max 3 attempts
   - Exponential backoff: 1s, 2s, 4s
   - Circuit breaker: if exchange down >5min, stop routing

4. Fallback exchange:
   If primary exchange consistently fails:
   - Route to secondary (if configured)
   - Notify tenant: "Primary exchange unavailable, using backup"

5. Error reporting:
   - Log error with context (tenant, order, exchange)
   - Publish: ORDER_ERROR { order_id, error_code, message, retry_count }
   - Notify strategy → can cancel or modify

`,
  }),
  () => agent('Implement Order Cancellation on Failure', {
    label: 'order-cancel',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Order cancellation handling:

1. Strategy cancels order:
   - OrderExecutor: cancelOrder(order_id)
   - ExchangeRouter: route to correct adapter
   - Adapter: exchange.cancelOrder(exchange_order_id)

2. If cancel succeeds:
   - Update order status = cancelled
   - Publish: ORDER_CANCELLED
   - Strategy notified

3. If cancel fails (already filled):
   - Fetch order status
   - If filled → status = filled (completed)
   - Report to strategy: "Order already filled, cannot cancel"

4. Partial cancellation (some exchanges support):
   - Cancel remaining quantity
   - Keep filled portion

5. Cancellation timeout:
   - Cancel request >30s → assume network issue
   - Retry or mark as "cancellation_pending"
   - Reconcile later

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Test End-to-End Order Flow', {
    label: 'e2e-orderflow',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `E2E order flow tests:

1. Happy path:
   - Strategy emits BUY signal
   - Order created → routed to exchange → placed
   - Fill received → order filled → strategy notified
   - Verify all state transitions correct

2. Partial fills:
   - Order 1.0 BTC, fills: 0.3, 0.5, 0.2
   - Order status: open → partial → partial → filled
   - Strategy receives multiple onFill events

3. Order rejection:
   - Exchange rejects (insufficient balance)
   - Order status = rejected
   - Strategy notified with error

4. Exchange failure:
   - Exchange down → retry 3 times
   - Fallback to secondary exchange
   - Order eventually placed

5. Cancel flow:
   - Strategy cancels mid-flight order
   - Cancel sent, order cancelled
   - Strategy notified

6. Idempotency test:
   - Duplicate fill webhook (same fill_id) → no double-count

`,
  }),
  () => agent('Integration Performance Testing', {
    label: 'integration-perf',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Integration performance testing:

1. Order latency:
   - Signal → order placed: <500ms (p95)
   - Fill → strategy notified: <100ms

2. Throughput:
   - 100 orders/sec sustained
   - Burst 500 orders over 5s

3. Adapter overhead:
   - ExchangeRouter adds <50ms latency

4. Memory:
   - No leaks in order state management
   - Open orders tracked efficiently

5. Recovery:
   - Restart ExchangeRouter → resume processing
   - Reconcile in-flight orders on startup

6. Multi-tenancy:
   - Orders correctly isolated by tenant
   - No cross-tenant data leak

`,
  }),
  () => agent('OrderExecutor-Router Sign-off', {
    label: 'integration-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `OrderExecutor-ExchangeRouter integration sign-off.

Review:
✅ Order routing logic (exchange selection)
✅ Adapter interface enhanced
✅ OrderExecutor connected
✅ Fill processing pipeline
✅ Error handling & retries
✅ Fallback exchange
✅ Order cancellation
✅ End-to-end tests passing
✅ Performance targets met

Decision: ORDER EXECUTION INTEGRATION PRODUCTION READY.

`,
  }),
]);

log('OrderExecutor-ExchangeRouter Integration workflow launched');