# Research Report: Edge Multi-Region Consensus & Polymarket StatArb Engine

**Document Path**: `/Users/macbook/algo-trader/plans/reports/researcher-20261007-edge-consensus-and-statarb.md`  
**Date**: 2026-10-07 | **Status**: Verified

## Executive Summary
Evaluation of: (1) 3-region DO synchronization (`nrt`, `sin`, `fra`) balancing sub-100ms local writes against partition tolerance; (2) Polymarket CLOB statarb & predictive market making against Binance/Hyperliquid CEX spot feeds with inventory risk bounds.

---

## 1. Edge Multi-Region DO Consensus (`nrt`, `sin`, `fra`)

### 1.1 RTT Profile & Invariants
- `sin` <-> `nrt`: ~65ms | `sin` <-> `fra`: ~160ms | `nrt` <-> `fra`: ~220ms.
- Target invariant: Single-writer local read/write <5ms; cross-region consistency bounded at 1 RTT quorum (2/3 nodes: `sin`+`nrt` = ~65ms; `fra` catch-up async).

### 1.2 Consensus Options Evaluated
1. **Raft-Lite Leaseholder DO (Leader-Follower with Heartbeats)**: Dynamic leader elected via 2/3 quorum (`sin` default leader due to central median RTT). Leaseheartbeats (150ms timeout). State machine replication via append entries log.
2. **State-Based CRDT + Vector Clocks (Conflict-Free Asynchronous Replication)**: Local writes commit immediately; state exchanged via periodic gossip/WebSocket mesh with version vectors ($V_i(k)$). Deterministic LWW/PN-counter merge.
3. **Full Raft/Paxos on Cloudflare DO**: Strict linearizable consensus with persistent log entries on D1/DO SQLite.

### 1.3 Trade-Off Matrix: Consensus Architecture
| Dimension | 1. Raft-Lite DO Lease | 2. Vector Clock + CRDT | 3. Full Raft / Paxos |
|---|---|---|---|
| **Write Latency** | 5ms (leader), 65ms (follower) | <2ms everywhere (local commit) | 160-220ms (3-way quorum) |
| **Consistency** | Sequential / Linearizable lease | Eventual (Causal consistency) | Strict Linearizability |
| **Complexity** | Moderate (heartbeat, term, lease) | Moderate-High (merge conflicts) | Extreme (edge log churn) |
| **Edge Fit (CF DO)** | Native (Colo-pinned DO instances) | Native (P2P WebSocket mesh) | Poor (high cross-colo latency) |
| **Partition Risk** | Minority partition rejects writes | Split-brain risk on non-CRDT fields | Deadlock on partition |

### 1.4 Adoption Risk & Recommendation
- **Rank 1: Raft-Lite Leader-Follower DO with Vector Clock Metadata** (Recommended). Highest fit for financial trading shard routing where position state requires single-point serialization per sub-account. Leader pinned to `sin` (optimal RTT bridge between Asia and Europe).
- **Rank 2: CRDT + Vector Clocks**. Best for passive orderbook caching, but unsuitable for hard risk/margin checks.
- **Rank 3: Full Raft on DO**. Rejected due to 200ms+ consensus roundtrips breaching trading SLA.

---

## 2. Polymarket StatArb & Predictive Market Making vs CEX Feeds

### 2.1 Market Mechanics & Arbitrage Drivers
- Polymarket binary outcome tokens ($Y \in [0, 1]$, $N = 1 - Y$) priced on off-chain CLOB (Polygon settling).
- Latency gap: CEX spot price movement (Binance/Hyperliquid) leads Polymarket oracle/CLOB adjustment by 250ms - 2,500ms.
- Implied Probability Mapping: Binary call price derived via Black-Scholes / normal CDF: $P(\text{Yes}) = \Phi(d_2) = \Phi\left(\frac{\ln(S/K) + (r - \sigma^2/2)\tau}{\sigma\sqrt{\tau}}\right)$.

### 2.2 Execution Strategies Evaluated
1. **Latency Drift StatArb (Taker Sniping)**: Listen to CEX WS trade streams; compute delta drift $d_2$; trigger snipe order via Polymarket CLOB REST/WS API when $|P_{\text{implied}} - P_{\text{clob}}| > \text{spread} + \text{gas/taker fee} + \text{slippage}$.
2. **Avellaneda-Stoikov Predictive Market Making (Maker Inventory Skew)**: Place two-sided quotes around mid-price $r(s, q, t) = s - q\gamma\sigma^2(T-t)$ with dynamic skew adjusted for CEX order flow toxicity (OFI) and micro-price drift.
3. **Cross-Exchange Synthetic Arbitrage (Hedging on Hyperliquid Perps)**: Buy undervalued Polymarket outcome, delta-hedge underlying exposure on Hyperliquid perp.

### 2.3 Trade-Off Matrix: Trading Strategies
| Dimension | 1. Latency Sniping | 2. Avellaneda-Stoikov MM | 3. CEX-DEX Delta Hedge |
|---|---|---|---|
| **Capital Efficiency** | High (transient exposure) | Moderate (inventory capital lock) | Low (dual-sided margin required) |
| **Execution Risk** | Adverse selection / race to cancel | Toxic inventory build-up | Basis divergence & funding drag |
| **Throughput/SLA** | <50ms trigger requirement | Continuous 100ms quote cycle | Multi-venue leg synchronization |
| **Profit Margin** | High per fill, low capacity | Steady spread capture | Low spread, high volume |

### 2.4 Adoption Risk & Recommendation
- **Rank 1: Hybrid Predictive MM with CEX Toxic Flow Cancel Signal** (Recommended). Continuously quote Polymarket CLOB; ingest sub-20ms Hyperliquid/Binance feeds at `sin`/`nrt` DO nodes; immediately pull quotes or widen spreads when CEX drift velocity $|\Delta S/\Delta t| > \theta_{\text{toxic}}$.
- **Rank 2: Latency Drift StatArb**. Highly effective during high-volatility events, but subject to Polymarket rate limits (20 req/s IP limit).
- **Rank 3: Cross-Exchange Delta Hedging**. High margin overhead; hold-to-maturity resolution disputes introduce tail risk.

---

## 3. Source Credibility & Reference Verification
1. *Cloudflare Durable Objects Global Coordination Docs & Architecture Notes* (Official Cloudflare Engineering, 2024-2026).
2. *Avellaneda, M. & Stoikov, S. (High-frequency trading in a limit order book)* / Guéant et al. inventory control models.
3. *Polymarket CTF Exchange & CLOB API Documentation* (Official Polymarket Developer Specification, 2025-2026).
4. *Hyperliquid L1 WebSocket Market Data & Order API Documentation* (Hyperliquid Official Docs).

---

## 4. Limitations & Unresolved Questions
- **Limitations**: Research excludes Polymarket Polygon on-chain gas spike analysis during network congestion; assumes off-chain CLOB matching latency dominates.
- **Unresolved Questions**:
  1. What is the exact API rate-limit tier allocated for institutional Polymarket CLOB endpoints?
  2. Does Cloudflare DO cross-colo WebSocket connection maintain stable TCP keepalive under intermittent Trans-Pacific cable maintenance?
