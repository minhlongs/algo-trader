# Architecture Report: Unified Live Trading Pipeline & Multi-Region Deploy Suite

## 1. Executive Summary
Integrates 5 critical engines into `UnifiedLiveTradingPipelineController`: `MultiVenueMarketStreamer` (ingestion), `CrossVenueArbDetector` (signal/guardrails), `PolymarketRelayerEngine` (execution), `GeneticEvolutionEngine` (alpha parameter tuning), and `EdgeCanaryDeploymentVerifier` (canary verification & rollback gating). Provides production CI/CD verification & 3-region live smoke test suite.

## 2. Source Credibility & Evidence Matrix
- **EIP-712 & Polymarket CLOB Docs (Score: 1.0)**: Gasless relayer auth, EOA/Proxy/Safe signatures.
- **Internal Production Engines (Score: 0.95)**: `MultiVenueMarketStreamer`, `CrossVenueArbDetector`, `EdgeCanaryDeploymentVerifier`, `GeneticEvolutionEngine`.
- **Cloudflare Workers & D1 Edge Runtime Docs (Score: 0.95)**: Sub-15ms edge compute, multi-region routing, L0-L4 kill switches.

## 3. Architecture Topology & Data Flow
```
[Binance WS / Hyperliquid WS / Polymarket WS]
                 │ (UnifiedOrderBook / UnifiedTrade)
                 ▼
     [MultiVenueMarketStreamer]
                 │
                 ▼
      [CrossVenueArbDetector] ◄──── [GeneticEvolutionEngine] (Periodic Gene Updates)
                 │ (Viable Arb Signal & Net Profit > Threshold)
                 ▼
    [EdgeCanaryDeploymentVerifier] ──(SLO Breach / KS Drift)──► [L0-L4 Rollback]
                 │ (Passed Stage 0-3 Checks)
                 ▼
     [PolymarketRelayerEngine] ──(EIP-712 Gasless Post)──► [Polygon CTF Exchange]
```

## 4. Component Integration Contract
1. **MultiVenueMarketStreamer**: Ingests normalized L2 books; feeds `CrossVenueArbDetector` with unified quotes.
2. **CrossVenueArbDetector**: Computes net profit after taker fee, gas, slippage. Enforces `<=250ms` unhedged timeout unwind.
3. **GeneticEvolutionEngine**: Asynchronously evolves parameters (min spread, size multipliers, timeout thresholds) using SBX crossover + DSR fitness gate; hot-reloads chromosomes without restart.
4. **EdgeCanaryDeploymentVerifier**: Samples p99 latency (`<15ms`), slippage (`<=2.0 bps`), error rate (`<0.5%`), and KS-drift; promotes through 4 stages (0% shadow -> 1% -> 25% -> 100%).
5. **PolymarketRelayerEngine**: Nonce-synchronized EIP-712 signer and HTTP client for gasless polygon orders.

## 5. Deployment Verification & Multi-Region Smoke Testing
- **PR CI Gates**: Static typecheck (`0 :any`), Vitest coverage ratchet (100% green), secret audit, dependency lockfile audit.
- **Multi-Region Live Smoke**: Parallel probes to `us-east`, `eu-central`, `ap-southeast` checking `/health`, `/api/health/region`, D1 shard consistency, and relayer simulation probe.
- **Canary Gate**: Validates 30+ shadow samples before Stage 1 (1% live) traffic transition.

## 6. Trade-Off Evaluation Matrix
| Dimension | Option A: Monolithic Controller (Recommended) | Option B: EventBus-Decoupled Micro-Workers | Option C: Off-Chain Cron Poller |
| :--- | :--- | :--- | :--- |
| **P99 Execution Latency** | **Optimal (<15ms in-memory)** | Sub-optimal (40-80ms message queue) | Poor (>500ms polling lag) |
| **Complexity & Maintenance** | **Low (single state machine, DRY/KISS)** | High (distributed state, queues) | Medium (state desync risk) |
| **Safety & Rollback** | **Instant (L0-L4 in-process circuit breaker)** | Moderate (distributed drain needed) | Weak (delayed breaker) |
| **Architectural Fit** | **Exact match for Cloudflare Worker & D1** | Over-engineered for current scale | Violates real-time arb SLO |

## 7. Adoption Risk & Mitigation
- **EIP-712 Nonce Desync**: High volume concurrency causes nonce collision. *Mitigation*: Monotonic atomic local counter synced via `/nonce` endpoint fallback.
- **Unhedged Leg Slippage**: Polymarket fills but hedge venue drops. *Mitigation*: Hard 250ms emergency unwind trigger in `CrossVenueArbDetector`.
- **Canary False Alarm**: Low sample variance triggers KS drift. *Mitigation*: Minimum sample gate (N >= 30) before evaluation.

## 8. Concrete Recommendation (Ranked)
- **Rank 1 (Deploy Now)**: Option A — Monolithic `UnifiedLiveTradingPipelineController` injecting streamer, detector, relayer, GA optimizer, and canary verifier.
- **Rank 2**: Option B — Event-bus split only when single-tenant throughput exceeds 10,000 orders/sec.
- **Rank 3 (Reject)**: Option C — Cron-based polling fails sub-second latency invariants.

## 9. Research Limitations
- Relayer rate limits under heavy congestion (Polygon re-orgs) require live RPC fallbacks.
- Backtesting fitness in GA does not model sudden liquidity vacuum events during high-impact macro news.

## 10. Unresolved Questions
1. Should `GeneticEvolutionEngine` run inside Cloudflare Workers Cron Trigger or dedicated off-chain node worker?
2. Does the Polygon relayer quota support multi-region parallel submission without IP rate limits?
