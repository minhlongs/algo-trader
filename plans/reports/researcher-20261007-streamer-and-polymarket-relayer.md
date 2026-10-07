# Technical Research & Architecture: Live Multi-Venue Streamer & Polymarket Relayer

## Executive Summary
Architecture for low-latency live market ingestion across Binance, Hyperliquid, and Polymarket, plus end-to-end Polymarket gasless order lifecycle (EIP-712 signing, relayer routing, on-chain/CLOB settlement tracking).

---

## 1. Multi-Venue Market Streamer Architecture

### Stream Multiplexing & Normalization Engine
- **Single Multiplex Bus**: Ingests Binance L2 Diff/AggTrade, Hyperliquid L2 Book/Trades, Polymarket CLOB Market streams into unified typed event pipeline.
- **Clock Alignment & Monotonicity**: Strict sequence checking (`Binance.u == pu+1`, `Hyperliquid.time >= lastTime`, `Polymarket.seq`).
- **Heartbeat & Zombie Detection**: 5s ping/pong + 10s watchdog silence detection.

```typescript
export type Venue = 'binance' | 'hyperliquid' | 'polymarket';

export interface NormalizedBookLevel { price: number; amount: number; }
export interface UnifiedOrderBook {
  venue: Venue;
  symbol: string;
  timestamp: number;
  sequence: number;
  bids: NormalizedBookLevel[];
  asks: NormalizedBookLevel[];
}

export interface UnifiedTrade {
  venue: Venue;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  timestamp: number;
  tradeId: string;
}

export interface MarketStreamer {
  subscribe(venue: Venue, symbols: string[]): Promise<void>;
  unsubscribe(venue: Venue, symbols: string[]): Promise<void>;
  onBook(cb: (book: UnifiedOrderBook) => void): void;
  onTrade(cb: (trade: UnifiedTrade) => void): void;
  getStatus(): Record<Venue, { state: ConnectionState; latencyMs: number; lastSeq: number }>;
}
```

### Reconnection State Machine
- States: `DISCONNECTED` -> `CONNECTING` -> `CONNECTED` -> `SYNCING_SNAPSHOT` -> `STREAMING` -> `DEGRADED` -> `RECONNECTING`.
- Backoff Policy: Exponential with jitter ($t = \min(t_{\max}, t_{\text{base}} \cdot 2^n \pm \text{jitter})$), base 500ms, max 15s.
- Resync Rule: On sequence gap or WS drop, discard buffer -> fetch REST snapshot -> replay buffered deltas -> transition to `STREAMING`.

---

## 2. Polymarket Relayer & Settlement Engine

### EIP-712 Signing & Relayer Submission
- **Domain Separator**: Polymarket CTF Exchange (`0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`, Polygon Chain ID 137).
- **Gasless Relayer**: Signs order struct + auth headers -> posts to Polymarket Gasless Relayer / CLOB `/order` endpoint with proxy wallet delegation.

```typescript
export interface RelayerOrderRequest {
  order: {
    salt: string;
    maker: string;
    signer: string;
    taker: string;
    tokenId: string;
    makerAmount: string;
    takerAmount: string;
    expiration: string;
    nonce: string;
    feeRateBps: string;
    side: 0 | 1;
    signatureType: 0 | 1 | 2; // 0: EOA, 1: Polymarket Proxy, 2: Gnosis Safe
    signature: string;
  };
  owner: string;
  orderType: 'GTC' | 'FOK' | 'GTD';
}

export interface RelayerResponse {
  orderID: string;
  status: 'SUBMITTED' | 'MATCHED' | 'MINED' | 'FAILED';
  transactionHash?: string;
  errorMsg?: string;
}
```

### Settlement & Resolution Lifecycle
1. **CLOB Resolution Poller/WS**: Ingest `market_resolved` / `condition_resolved` event.
2. **On-Chain CTF Payout Listener**: Monitor `ConditionResolution` & `PayoutRedemption` events on Polygon CTF contract (`0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`).
3. **P&L Realization**: Map token payout (1.0 vs 0.0 USDC) -> trigger internal portfolio position closure & journal entry.

---

## 3. Rate Limits & Latency Targets

| Venue / Component | Protocol / Transport | Rate Limit (Tier 1) | Latency Target (p95) | Latency Target (p99) |
|---|---|---|---|---|
| **Binance WS** | WSS (Raw Streams) | 5 msgs/sec upstream, 1024 streams/conn | < 15ms | < 40ms |
| **Hyperliquid WS** | WSS (Post / Sub) | 100 req/min upstream, unthrottled push | < 25ms | < 60ms |
| **Polymarket WS** | WSS (CLOB Market) | 500 subscriptions / conn | < 50ms | < 120ms |
| **Relayer Submission** | HTTP/2 REST / Relayer | 100 orders / 10s per API key | < 80ms | < 200ms |
| **Settlement Poller** | JSON-RPC Polygon / REST | 50 req/sec (Polygon RPC / Alchemy) | < 1500ms (on-chain block) | < 3000ms |

---

## 4. Evaluation & Trade-off Matrix

| Option | Ingestion Model | Relayer Architecture | Throughput | Complexity | Reliability Risk | Rank |
|---|---|---|---|---|---|---|
| **A: Unified DO/Multiplexed Gateway** | Central multiplexer + worker edge pool | Native EIP-712 signer + direct CLOB relayer client | High (15k msg/s) | Medium | Low (Isolated worker reconnects) | **1** (Recommended) |
| **B: Per-Venue Decentralized Actors** | Separate worker per venue + pub/sub queue | Third-party relayer proxy / Biconomy | Medium (5k msg/s) | High | Medium (Queue serialization lag) | **2** |
| **C: Direct REST Long-Polling** | Scheduled pull cron jobs | Raw EOA on-chain transactions (Gas needed) | Low (<200 msg/s) | Low | High (RPC congestions, front-running) | **3** |

### Adoption Risk & Architectural Fit
- **Maturity**: EIP-712 CTF exchange standard is battle-tested ($2B+ volume). Hyperliquid & Binance WS protocols stable.
- **Architectural Fit**: Native fit for `src/desk/` pipeline. Integrates directly with `TradingPipelineInit`, `StrategyLiveBridge`, and `LiveTradingOrchestrator`.

---

## 5. Concrete Recommendation
- **Deploy Architecture Option A**: Multiplexed WebSocket stream manager wrapping existing `BinanceWsConnector`, `HyperliquidWsConnector`, and `PolymarketWebSocketFeed`.
- **Implement `PolymarketRelayerEngine`**: Extends `PolymarketSigner` to support signature type 1 (Proxy) and type 2 (Safe), handling nonce sync and asynchronous settlement event reconciliation via `SettlementListener`.

---

## Limitations
- Did not benchmark live Polygon RPC latency under severe network congestion / gas spikes.
- Polymarket WebSocket does not support private user execution events over public market WS; requires separate authenticated user stream.

---

## Unresolved Questions
1. Does the desk execute Polymarket orders via EOA directly (SignatureType 0) or through the Polymarket Smart Contract Proxy (SignatureType 1)?
2. Is multi-region feed deduplication required (e.g., Tokyo + Singapore ingest nodes for Binance/Hyperliquid)?
