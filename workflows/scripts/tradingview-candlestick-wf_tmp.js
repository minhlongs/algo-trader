export const meta = {
  name: 'tradingview-candlestick-integration',
  description: 'Integrate TradingView Charting Library: candlestick charts, technical indicators, real-time updates',
  phases: [
    { title: 'TradingView Planning', detail: 'Design chart component, data feed, indicators' },
    { title: 'Chart Component', detail: 'React component with TradingView widget' },
    { title: 'Historical Data API', detail: 'Serve OHLCV data from database' },
    { title: 'Real-Time Updates', detail: 'WebSocket feed for live price updates' },
    { title: 'Technical Indicators', detail: 'Integrate TradingView indicators or custom' },
    { title: 'Integration & Testing', detail: 'Integrate with dashboard, test' },
  ],
};

phase('Planning');
const planning = await agent('TradingView Plan', {
  label: 'tradingview-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan TradingView integration. Task #230.

Requirements:
- Candlestick chart (OHLC)
- Multiple timeframes: 1m, 5m, 15m, 1h, 4h, 1d
- Technical indicators: MA, EMA, RSI, MACD, Bollinger Bands
- Real-time updates: last tick updates candle or new candle
- Drawing tools: trendlines, support/resistance
- Multiple symbols comparison

Technology:
- TradingView Charting Library (lightweight, licensed)
- Or react-apexcharts / recharts as alternative

Create plan: ./plans/tradingview-integration/plan.md
`,
});

phase('Chart Component');
const chart = await parallel([
  () => agent('Create TradingView Chart Component', {
    label: 'tradingview-chart',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `React component for TradingView chart.

Options:
1. TradingView Charting Library (paid but full-featured)
2. Lightweight Charts (TradingView open-source, good for candlesticks)
3. ApexCharts / Recharts (simpler)

Recommended: Lightweight Charts for candlesticks + custom indicators.

Component:
src/dashboard/charts/TradingViewChart.tsx

Props:
- symbol: "BTC-USD"
- timeframe: "1h"
- indicators: ["MA_20", "RSI_14"]
- height, width

`,
  }),
  () => agent('Implement Data Adapter', {
    label: 'data-adapter',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Data adapter for chart:

1. Historical data fetch:
   GET /api/v1/marketdata/ohlcv?symbol=BTC-USD& timeframe=1h&start=...&end=...
   Returns: [{ time: timestamp, open, high, low, close, volume }]

2. Real-time subscription:
   WebSocket: ws://.../marketdata/BTC-USD/1h
   Messages: { type: "candle"|"tick", data: {...} }

3. Cache recent data in Redis for fast load

Backend:
- src/services/marketdata-service.ts (query D1)
- src/workers/marketdata-stream.worker.ts (WebSocket)

`,
  }),
]);

phase('Historical Data API');
const historical = await parallel([
  () => agent('Implement OHLCV Endpoint', {
    label: 'ohlcv-api',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `OHLCV API endpoint:

GET /api/v1/marketdata/ohlcv
Params:
- symbol (required)
- timeframe: 1m, 5m, 15m, 1h, 4h, 1d (default 1h)
- start (ISO date or timestamp)
- end (ISO date or timestamp)
- limit (max 1000)

Query D1:
SELECT time_bucket('1 hour', timestamp) as bucket,
       first(price, timestamp) as open,
       max(price) as high,
       min(price) as low,
       last(price, timestamp) as close,
       sum(volume) as volume
FROM market_data
WHERE symbol = $1 AND timestamp BETWEEN $2 AND $3
GROUP BY bucket
ORDER BY bucket
LIMIT $4;

Pre-aggregate in materialized views for faster queries.

`,
  }),
  () => agent('Create Materialized Views for OHLC', {
    label: 'ohlc-views',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Materialized views for OHLC aggregation:

For each symbol + timeframe combination:

CREATE MATERIALIZED VIEW ohlcv_1m_BTCUSD AS
SELECT time_bucket('1 minute', timestamp) as bucket,
       first(price, timestamp) as open,
       max(price) as high,
       min(price) as low,
       last(price, timestamp) as close,
       sum(volume) as volume,
       count(*) as tick_count
FROM market_data
WHERE symbol = 'BTC-USD'
GROUP BY bucket;

Refresh every minute: REFRESH MATERIALIZED VIEW CONCURRENTLY

For popular symbols (BTC, ETH), keep pre-aggregated views.

`,
  }),
]);

phase('Real-Time Updates');
const realtime = await parallel([
  () => agent('Implement WebSocket Feed', {
    label: 'websocket-feed',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `WebSocket for real-time chart updates:

1. Client connects to /ws/marketdata/:symbol/:timeframe
2. Server subscribes to NATS market data for symbol
3. On each tick:
   - Update current candle (if within timeframe)
   - Or create new candle (if timeframe elapsed)
   - Broadcast to WebSocket clients

NATS subject: market.data.{symbol}

Worker: src/workers/marketdata-stream.worker.ts
   - Maintains current candle per client subscription
   - Broadcasts updates

`,
  }),
  () => agent('Optimize Real-Time Performance', {
    label: 'realtime-perf',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Optimize real-time updates:

1. Throttle updates: max 10 updates/sec per client (too fast = no visual change)
2. Batch updates: send multiple ticks as one update
3. Compression: gzip WebSocket messages
4. Redis pub/sub for scaling across multiple workers

Latency target: <100ms from tick to chart update.

`,
  }),
]);

phase('Technical Indicators');
const indicators = await parallel([
  () => agent('Implement Moving Averages', {
    label: 'ma-indicators',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Moving average indicators:

1. SMA: simple moving average
2. EMA: exponential moving average
3. VWMA: volume-weighted moving average

Calculation (on backend or frontend):
- SMA: average of last N closes
- EMA: recursive: EMA[i] = close[i] * alpha + EMA[i-1] * (1-alpha), alpha=2/(N+1)

API: calculate on-demand or pre-compute.

Endpoint: GET /api/v1/indicators/ma?symbol=BTC-USD& timeframe=1h&periods=[20,50,200]

`,
  }),
  () => agent('Implement RSI & MACD', {
    label: 'rsi-macd',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `RSI and MACD indicators:

RSI (Relative Strength Index):
- Period: typically 14
- Formula: RSI = 100 - 100/(1 + RS), RS = avg(up)/avg(down)
- Overbought >70, oversold <30

MACD:
- Fast EMA (12), Slow EMA (26), Signal (9)
- MACD line = Fast - Slow
- Signal line = EMA of MACD
- Histogram = MACD - Signal

Implementation: src/services/indicators.service.ts

`,
  }),
  () => agent('Implement Bollinger Bands', {
    label: 'bollinger',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Bollinger Bands:

Middle = SMA(20)
Upper = Middle + 2 * STD(20)
Lower = Middle - 2 * STD(20)

Width = (Upper - Lower) / Middle

Squeeze: width narrowing → potential breakout

`,
  }),
]);

phase('Integration & Testing');
const integration = await parallel([
  () => agent('Integrate Chart with Dashboard', {
    label: 'chart-dashboard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Integrate chart into dashboard:

Page: /dashboard/charts?symbol=BTC-USD

Components:
1. Chart toolbar: symbol selector, timeframe buttons (1m, 5m, 1h, 1d)
2. Indicator selector: add/remove indicators
3. TradingView Chart component
4. Cursor: hover shows OHLC values

State management:
- Symbol change → reload data
- Timeframe change → fetch appropriate data
- Indicator toggle → recalculate/display

`,
  }),
  () => agent('Test Chart Performance', {
    label: 'chart-perf-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Chart performance testing:

1. Load 1 year of 1h candles (8760 points) → render in <1s
2. Real-time updates: 10 updates/sec, chart smooth (no jank)
3. Memory: chart doesn't leak after hours of use
4. Multiple charts on page (3 symbols) → acceptable performance
5. Mobile: touch interactions smooth

Use Lighthouse, Chrome DevTools performance.

`,
  }),
  () => agent('TradingView Sign-off', {
    label: 'tradingview-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off TradingView integration.

Review:
✅ Chart component working
✅ Historical data API fast
✅ Real-time updates smooth
✅ Technical indicators accurate
✅ Dashboard integrated
✅ Performance acceptable
✅ Mobile responsive

Decision: PRODUCTION READY.

`,
  }),
]);

log('TradingView Candlestick Integration workflow launched');