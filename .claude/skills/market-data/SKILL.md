---
name: market-data
description: "Market data pipeline for algo-trader. Covers CCXT exchange integration, WebSocket price feeds, Polymarket/Limitless/Predictit/Smarkets feeds, data normalization, price feed health monitoring. Triggers: market data, price feed, WebSocket, CCXT, Binance, OKX, Bybit, Polymarket feed, Kalshi, Limitless, Predictit, Smarkets, data pipeline, feed health, price normalization, candle data"
---

# Market Data Skill

## Purpose

Guide market data pipeline operations: feed ingestion, normalization, health monitoring, and multi-source aggregation for algo-trader's CEX (Binance, OKX, Bybit) and prediction market (Polymarket, Kalshi, Limitless, Predictit, Smarkets) feeds.

## Codebase Layout

```
src/feeds/
  index.ts                    # Barrel export
  websocket-client.ts         # Base WebSocket client (reconnect, heartbeat)
  feed-aggregator.ts          # Unified multi-exchange feed (Binance+OKX+Bybit)
  binance-ws.ts               # Binance WebSocket (orderbook, trades, ticker)
  bybit-ws.ts                 # Bybit WebSocket
  okx-ws.ts                   # OKX WebSocket
  polymarket-websocket-feed.ts    # Polymarket real-time price feed
  polymarket-websocket-message-parser.ts  # Polymarket message parsing
  polymarket-ws-feed.ts       # Polymarket WS feed (CLOB)
  kalshi-price-feed.ts        # Kalshi prediction market feed
  limitless-price-feed.ts     # Limitless exchange feed
  predictit-price-feed.ts     # Predictit feed
  smarkets-price-feed.ts      # Smarkets feed
  whale-activity-feed.ts      # Whale activity tracking
  news-impact-analyzer.ts     # News impact on prices
  news-market-correlator.ts   # News-market correlation
src/redis/
  orderbook-manager.ts        # Redis-backed orderbook storage
  ticker-cache.ts             # Ticker caching layer
  trade-stream.ts             # Trade stream processing
src/strategies/dna/
  binance-candle-provider.ts  # Candle data provider for DNA engine
```

## Feed Architecture

### Base WebSocket Client (websocket-client.ts)

All exchange feeds extend `BaseWebSocketClient`:
- Auto-reconnect with exponential backoff
- Heartbeat monitoring (30s default)
- Message parsing abstraction

### CEX Feeds (CCXT-style)

**Binance** (`binance-ws.ts`):
- Endpoint: `wss://stream.binance.com:9443/ws`
- Streams: `<symbol>@depth`, `<symbol>@trade`, `<symbol>@ticker`
- Types: `BinanceOrderBook`, `BinanceTrade`, `BinanceTicker`

**OKX** (`okx-ws.ts`):
- Endpoint: `wss://ws.okx.com:8443/ws/v5/public`
- Same unified types via `FeedAggregator`

**Bybit** (`bybit-ws.ts`):
- Endpoint: `wss://stream.bybit.com/v5/public`

### Feed Aggregator (feed-aggregator.ts)

Unified interface consolidating all CEX streams:
```typescript
type FeedMessage =
  | { type: 'orderbook'; data: UnifiedOrderBook }
  | { type: 'trade'; data: UnifiedTrade }
  | { type: 'ticker'; data: UnifiedTicker };

type FeedHandler = (msg: FeedMessage) => void;
```

- `registerHandler(fn)` — subscribe to all feed messages
- `connect()` / `disconnect()` — lifecycle
- Latency tracking per exchange:symbol

### Prediction Market Feeds

| Feed | File | Source |
|------|------|--------|
| Polymarket CLOB | `polymarket-websocket-feed.ts` | Polymarket WebSocket API |
| Polymarket WS | `polymarket-ws-feed.ts` | Alternative WS endpoint |
| Kalshi | `kalshi-price-feed.ts` | Kalshi API |
| Limitless | `limitless-price-feed.ts` | Limitless exchange |
| Predictit | `predictit-price-feed.ts` | Predictit API |
| Smarkets | `smarkets-price-feed.ts` | Smarkets API |

**Polymarket message parser** (`polymarket-websocket-message-parser.ts`): Parses CLOB v2 messages into normalized price/quantity format.

## Data Normalization

All feeds normalize to:
- **Price**: number (USD)
- **Timestamp**: epoch ms
- **Side**: `'buy' | 'sell'`
- **Symbol**: string (normalized format)

## Redis Caching Layer

```
src/redis/
  orderbook-manager.ts  # Orderbook snapshots in Redis
  ticker-cache.ts       # Latest ticker per symbol
  trade-stream.ts       # Recent trades stream
```

## Health Monitoring

### Feed Health Checks
1. **Connection status**: WebSocket connected/disconnected/reconnecting
2. **Message rate**: messages/sec per feed
3. **Latency**: round-trip time per exchange
4. **Staleness**: last message age per symbol
5. **Gap detection**: missing candles/trades

### Circuit Breaker Integration
Feeds integrate with `src/resilience/circuit-breaker.ts`:
- Auto-disable feed on repeated failures
- Half-open probe after cooldown

## DNA Candle Provider

`src/strategies/dna/binance-candle-provider.ts`:
- Implements `CandleProvider` interface for DNA orchestrator
- Fetches OHLCV candles for multi-TF analysis
- Optional orderbook snapshot for microstructure indicators

## Adding a New Feed

1. Create `src/feeds/<exchange>-ws.ts` extending `BaseWebSocketClient`
2. Implement message parsing → `UnifiedTicker`/`UnifiedTrade`/`UnifiedOrderBook`
3. Register in `src/feeds/feed-aggregator.ts`
4. Add barrel export in `src/feeds/index.ts`
5. Add health check in `src/api/routes/health.ts`

## References

- `references/feed-health-monitoring.md` — Health check patterns and thresholds
- `references/polymarket-clob.md` — Polymarket CLOB v2 API details
- `references/data-normalization.md` — Normalization rules and edge cases
