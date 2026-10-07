# Research: Real-Time WebSocket Orderbook Streaming & Cross-Venue Arbitrage Engine

## Executive Summary & Architecture Fit
- **Scope**: Ultra-low-latency WS orderbook/trade streaming + atomic cross-venue arbitrage (Binance, Polymarket, Hyperliquid) for Algo-Trader desk (`src/desk/arbitrage/`).
- **Core Objective**: In-memory orderbook maintenance, <5ms matching/signal evaluation, rate-limit governance, atomic execution legs with sub-250ms auto-unwind guardrails.
- **Architectural Fit**: Node.js/Rust worker hybrid. Edge isolates (Cloudflare DO) maintain regional session state/signal dispatch; collocated execution nodes (AWS Tokyo `ap-northeast-1` / GCP Iowa `us-central1`) run raw WS streaming loops and order dispatch to minimize exchange RTT.

## 1. Venue Specifications & WS Ingestion Architecture
| Dimension | Binance (Spot/Perps) | Polymarket (CLOB) | Hyperliquid (Perps/Spot) |
| :--- | :--- | :--- | :--- |
| **WS Endpoint** | `wss://stream.binance.com:9443/ws` | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | `wss://api.hyperliquid.xyz/ws` |
| **Feed Topics** | `<symbol>@depth@100ms`, `@bookTicker`, `@trade` | `book` (diff/snapshot), `last_trade_price` | `l2Book` (coin), `trades`, `orderUpdates` |
| **Auth / Signing** | API Key / HMAC-SHA256 or Ed25519 | EIP-712 TypedData (Polygon Wallet) | EIP-712 TypedData (Arbitrum L1 / HyperCore) |
| **Seq ID / Gap Check**| `U` / `u` / `pu` strict continuous sequence | `timestamp` + full book hash verification | `time` + level delta sequence |
| **Rate Limits (REST/WS)**| 1200-6000 weight/min; 100 orders/10s | 50 req/s REST; 100 msgs/s WS | 1200 weight/min; 100 req/10s (scaled by balance)|
| **Base Currency** | USDT, USDC, FDUSD | USDC.e / USDC (Polygon) | USDC (HyperCore L1 Native) |

## 2. Interface Definitions
```typescript
export type VenueId = 'binance' | 'polymarket' | 'hyperliquid';
export type OrderSide = 'buy' | 'sell';

export interface BookLevel { price: number; amount: number; }
export interface NormalizedOrderBook {
  venue: VenueId; symbol: string; timestamp: number; seq: number;
  bids: BookLevel[]; asks: BookLevel[]; // Sorted: bids desc, asks asc
}
export interface TradeEvent {
  venue: VenueId; symbol: string; side: OrderSide; price: number; amount: number; timestamp: number; tradeId: string;
}
export interface ArbOpportunity {
  id: string; targetPair: string; buyVenue: VenueId; sellVenue: VenueId;
  buyPrice: number; sellPrice: number; maxVolume: number; grossSpreadBps: number;
  estFeesUsd: number; netProfitBps: number; netProfitUsd: number; detectedAt: number;
}
export interface ExecutionLeg {
  venue: VenueId; symbol: string; side: OrderSide; price: number; amount: number;
  orderType: 'IOC' | 'FOK' | 'POST_ONLY'; status: 'pending' | 'filled' | 'partial' | 'failed';
  filledAmount: number; avgFillPrice: number; latencyMs: number; txHashOrId?: string;
}
export interface ExecutionPlan {
  opportunityId: string; legs: [ExecutionLeg, ExecutionLeg]; maxSlippageBps: number;
  unhedgedTimeoutMs: number; status: 'queued' | 'executing' | 'settled' | 'unwound' | 'failed';
}
```

## 3. Latency Bounds & In-Memory Matching Pipeline
- **Target Budget (<5ms Internal Tick-to-Trade)**:
  - WS Deserialization (SIMD-JSON / binary parser): <0.15ms.
  - L2 Delta Book Update (pre-allocated ring buffer / B-tree): <0.30ms.
  - Cross-Venue Arb Evaluator (top-of-book spread check + fee deduction): <0.20ms.
  - Pre-Trade Risk Gate (inventory, max order, rate limits): <0.10ms.
  - Order Signing & Async Socket Dispatch: <0.75ms.
  - *Total Internal Engine Latency*: ~1.50ms (p95 < 2.8ms; margin < 5.0ms SLA).
- **Network RTT Minimization**:
  - Binance: Tokyo `ap-northeast-1` (~1.5ms RTT).
  - Hyperliquid: Validator edge gateway (~15-35ms).
  - Polymarket: AWS us-east-1 / Polygon Relayer (~25-50ms).

## 4. Rate-Limit Governance & Execution Guardrails
- **Hierarchical Token Bucket**: Separate buckets for `PublicData`, `PrivateOrders`, and `EmergencyCancel`. Cancel/unwind reserved 25% quota headroom at all times.
- **Risk Guardrails**:
  1. **Fee-Aware Hurdle**: $NetSpread = GrossSpread - (Fee_{buy} + Fee_{sell} + Gas_{poly} + SlippageBuffer) > MinNetProfitBps$ (default: $\ge 15$ bps).
  2. **Unhedged Leg Auto-Unwind**: If Leg 1 fills and Leg 2 fails/timeouts after `250ms`, trigger emergency IOC market taker order on Leg 1 venue to square position.
  3. **Inventory Skew & Delta Cap**: Hard limit of $50k net directional delta across synthetic positions. Dynamic capital rebalancer triggers when venue cash skew > 70/30.
  4. **Circuit Breakers**: 3 consecutive failed arb fills within 60s $\rightarrow$ 5-minute cooldown for venue pair. Max daily loss trigger ($2,500) trips hard kill-switch.

## 5. Trade-off Matrix & Technology Ranking
| Dimension | Option A: Native Rust Micro-Engine (Tokio + Tungstenite) | Option B: Node.js / Bun Engine (FastWS + Workers) | Option C: Python AsyncIO (Websockets + CCXT) |
| :--- | :--- | :--- | :--- |
| **Tick-to-Trade Latency** | **<0.5ms (Optimal)** | 1.5 - 3.5ms (Acceptable) | 8.0 - 25.0ms (Unacceptable for HFT Arb) |
| **Memory / GC Jitter** | **Zero GC (Predictable p99)** | Minor V8 GC pauses (1-5ms) | High GIL / GC pauses (10-40ms) |
| **Integration with Algo-Trader** | Requires FFI / IPC bridge | **Native TS fit (`src/desk/arbitrage`)** | Complex multi-runtime overhead |
| **Dev Velocity & Maintenance** | Medium-Low (Manual memory/crypto) | **High (Direct code reuse, DRY)** | Medium |

### Ranked Recommendations:
1. **Rank 1 (Primary Architecture)**: **Option B (Node.js/Bun Fast-Path Worker)** for rapid integration with existing `arbitrage-engine.ts`, typed models, and DO state sync. Use pre-allocated arrays and object pools to eliminate V8 GC pauses during tick bursts.
2. **Rank 2 (Scale/HFT Upgrade)**: **Option A (Rust Tokio Daemon)** as standalone execution sidecar communicating via shared memory / Unix Domain Sockets if p99 latency needs sub-millisecond guarantees.
3. **Rank 3 (Rejected)**: Option C (Python AsyncIO) rejected due to GIL contention and slow serialization violating <5ms matching bounds.

## 6. Adoption Risk & Limitations
- **Adoption Risk**: Low-Medium. Polymarket CLOB WS API updates frequency; EIP-712 nonce desynchronization risk during high-concurrency burst trading on Polygon/Hyperliquid.
- **Limitations**: Research excludes latency jitter from Polygon L2 on-chain settlement finality; cross-chain asset rebalancing between Hyperliquid L1, Polygon, and Binance requires separate bridge manager.

## Unresolved Questions
1. What is the target capital allocation and maximum inventory per exchange venue for live deployment?
2. Should Polymarket orders utilize direct proxy contract batching or gasless relayer endpoints for execution?
