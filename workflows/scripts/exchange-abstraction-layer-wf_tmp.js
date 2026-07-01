export const meta = {
  name: 'exchange-abstraction-layer',
  description: 'Complete exchange abstraction: refactor all adapters to unified interface, comprehensive tests, OrderExecutor integration',
  phases: [
    { title: 'Planning', detail: 'Review adapters, define interface, create migration plan' },
    { title: 'Refactor Binance Adapters', detail: 'Binance Spot + Futures to unified interface' },
    { title: 'Refactor KuCoin & Polymarket', detail: 'KuCoin Futures + Polymarket' },
    { title: 'Complete Coinbase', detail: 'Finish Coinbase Spot adapter' },
    { title: 'Adapter Tests', detail: 'Unit + integration tests for all adapters' },
    { title: 'OrderExecutor Integration', detail: 'Integrate OrderExecutor with ExchangeRouter' },
    { title: 'Sign-off', detail: 'Integration tests, docs, training' },
  ],
};

phase('Planning');
const planning = await agent('Exchange Abstraction Plan', {
  label: 'exchange-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan exchange abstraction layer completion. Tasks #170-177, #142, #213.

Unified interface: IExchangeAdapter with methods: getExchangeName, getSupportedMarkets, connect, disconnect, placeOrder, cancelOrder, getOrder, getBalance, getTicker, subscribeToTrades.

Current adapters in src/exchanges/: BinanceSpot, BinanceFutures, KuCoinFutures, Polymarket, CoinbaseSpot.

Create plan in ./plans/exchange-abstraction/plan.md with migration steps, interface spec, test strategy.

Work context: /Users/macbook/algo-trader
Reports: /Users/macbook/algo-trader/plans/reports/
`,
});

phase('Binance Adapters');
const binance = await parallel([
  () => agent('Refactor Binance Spot', {
    label: 'binance-spot-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Refactor BinanceSpotAdapter to IExchangeAdapter.

Files: src/exchanges/binance-spot.adapter.ts, tests/exchanges/binance-spot.test.ts
`,
  }),
  () => agent('Refactor Binance Futures', {
    label: 'binance-futures-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Refactor BinanceFuturesAdapter to IExchangeAdapter with futures features (leverage, positions, funding).

Files: src/exchanges/binance-futures.adapter.ts, tests/exchanges/binance-futures.test.ts
`,
  }),
  () => agent('Complete Binance Integration', {
    label: 'binance-complete-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Complete Binance integration: ExchangeRouter, credential management, rate limiting, paper trading.

Files: src/services/exchange-router.ts, src/services/credential-manager.ts, src/middleware/binance-rate-limiter.ts, tests/integration/binance-e2e.test.ts
`,
  }),
]);

phase('Other Exchanges');
const other = await parallel([
  () => agent('Refactor KuCoin Futures', {
    label: 'kucoin-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Refactor KuCoinFuturesAdapter to IExchangeAdapter.

Files: src/exchanges/kucoin-futures.adapter.ts, tests/exchanges/kucoin-futures.test.ts
`,
  }),
  () => agent('Refactor Polymarket', {
    label: 'polymarket-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Refactor PolymarketAdapter to IExchangeAdapter (CLOB API).

Files: src/exchanges/polymarket.adapter.ts, tests/exchanges/polymarket.test.ts
`,
  }),
  () => agent('Complete Coinbase Spot', {
    label: 'coinbase-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Complete CoinbaseSpotAdapter to IExchangeAdapter (Advanced Trade API).

Files: src/exchanges/coinbase-spot.adapter.ts, tests/exchanges/coinbase-spot.test.ts
`,
  }),
]);

phase('Comprehensive Tests');
const tests = await parallel([
  () => agent('Write Unit Tests for All Adapters', {
    label: 'adapter-unit-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Write unit tests for all exchange adapters. Cover: order placement, cancellation, status, balance, ticker, errors, WebSocket. Target >80% coverage.

Files: tests/exchanges/*.test.ts
`,
  }),
  () => agent('Create Integration Tests', {
    label: 'exchange-integration-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Create integration tests for exchange abstraction: ExchangeRouter routing, OrderExecutor integration, multi-exchange portfolio, failover, rate limiting.

Files: tests/integration/exchange-abstraction.test.ts
`,
  }),
]);

phase('OrderExecutor Integration');
const orderExec = await parallel([
  () => agent('Integrate OrderExecutor with ExchangeRouter', {
    label: 'orderexecutor-integration',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Integrate OrderExecutor with ExchangeRouter: order routing, best exchange selection, fallback, audit logging.

Files: src/services/order-executor.ts, src/services/exchange-router.ts, tests/integration/order-executor.test.ts
`,
  }),
  () => agent('Test OrderExecutor Integration', {
    label: 'orderexecutor-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test OrderExecutor integration: routing to best exchange, failover, order status updates, fill events.

Return: Test report.
`,
  }),
]);

phase('Documentation & Sign-off');
const docs = await parallel([
  () => agent('Create Exchange Docs', {
    label: 'exchange-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Create exchange documentation: overview, adapters, configuration, testing, API docs.

Update: CHANGELOG.md

Work context: /Users/macbook/algo-trader
`,
  }),
  () => agent('Exchange Sign-off', {
    label: 'exchange-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off for exchange abstraction layer.

Review all adapters, tests, integration. Decision: PRODUCTION or BLOCK.

Return: Sign-off report.
`,
  }),
]);

log('Exchange Abstraction workflow launched');