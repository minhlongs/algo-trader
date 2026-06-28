# Phase 1: HFT Loop, Concurrency, and Event Feed Optimizations

## Context Links
- **Plan Access Point:** [plan.md](file:///Users/macbook/algo-trader/plans/260530-0210-codebase-performance-optimization/plan.md)
- **Target Files:**
  - [websocket-client.ts](file:///Users/macbook/algo-trader/src/feeds/websocket-client.ts)
  - [gas-batch-optimizer.ts](file:///Users/macbook/algo-trader/src/execution/gas-batch-optimizer.ts)
  - [on-chain-position-reconciler.ts](file:///Users/macbook/algo-trader/src/execution/on-chain-position-reconciler.ts)
  - [order-executor.ts](file:///Users/macbook/algo-trader/src/execution/order-executor.ts)
  - [polymarket-adapter.ts](file:///Users/macbook/algo-trader/src/execution/polymarket-adapter.ts)
  - [distributed-nonce-manager.ts](file:///Users/macbook/algo-trader/src/execution/distributed-nonce-manager.ts)
  - [twap-executor.ts](file:///Users/macbook/algo-trader/src/execution/twap-executor.ts)
  - [news-market-correlator.ts](file:///Users/macbook/algo-trader/src/feeds/news-market-correlator.ts)

## Overview
- **Date:** May 30, 2026
- **Priority:** High
- **Status:** ✅ Complete

## Key Insights
- High-frequency event handling requires strict prevention of synchronous array sorting or dynamic module resolutions.
- Async race conditions in queues/timers must have safety fallback check flags to prevent deadlocks.
- Sequential blockchain and Redis calls must be consolidated into batch/concurrent calls to avoid long event loop stalls.

## Requirements
- Eliminate O(N log N) latency calculations on every socket tick. (Completed)
- Resolve batch optimizer queues lockup if flush completes concurrently. (Completed)
- Reconcile positions concurrently using batch RPC calls and Redis MGET/pipelines. (Completed)
- Parallelize order execution in arbitrage paths. (Completed)
- Remove dynamic `require('crypto')` in Polymarket adapter. (Completed)
- Parallelize news market correlation and cache keywords statically. (Completed)
- Prevent startup concurrency storm on nonce provider initialization. (Completed)
- Prevent timer leak in TWAP timeout handler. (Completed)

## Architecture
- **Metrics Optimization:** Replace full-array copying and sorting with a running quantile algorithm or periodic sampling (e.g., once per 100 updates).
- **Concurrency Locks:** Use promises to cache initialization states in `DistributedNonceManager`.
- **Concurrency Limiting:** Use a concurrency limiter (like `p-limit` or an in-memory queue) for news correlator calls.

## Related Code Files
- `src/feeds/websocket-client.ts`
- `src/execution/gas-batch-optimizer.ts`
- `src/execution/on-chain-position-reconciler.ts`
- `src/execution/order-executor.ts`
- `src/execution/polymarket-adapter.ts`
- `src/execution/distributed-nonce-manager.ts`
- `src/execution/twap-executor.ts`
- `src/feeds/news-market-correlator.ts`

## Implementation Steps
1. **Optimize Latency Sampling:** Relocate latency p95 sorting in `websocket-client.ts` to compute periodically or on-demand rather than on every tick.
2. **Fix Gas Batch Optimizer Timer:** Add `flushRequested` flag in `gas-batch-optimizer.ts` so that if a flush is scheduled while another is active, it runs immediately after the active one completes.
3. **Batch Balance and Position Reads:** Rewrite loop in `on-chain-position-reconciler.ts` to call `balanceOfBatch` for CTF balances and Redis `mget` for local positions.
4. **Concurrent Order Placement:** Replace sequential order await calls in `order-executor.ts` with `Promise.all` transmission.
5. **Static Crypto Import:** Replace dynamic `require` with static imports in `polymarket-adapter.ts`.
6. **Concurrent News Correlator & Keyword Cache:** Relocate `STOP_WORDS` definition and precompute static market keywords. Implement concurrent requests with limiters.
7. **Nonce Manager Initialization Promise:** Cache the on-chain initialization promise to serialize initial calls and skip redundant Redis calls.
8. **TWAP Timeout Cleanup:** Add a `clearTimeout` call inside `twap-executor.ts` chunk resolver.

## Todo List
- [x] Optimize WebSocket latency samples sorting
- [x] Implement `flushRequested` flag in batch optimizer
- [x] Implement `balanceOfBatch` and Redis `mget` in position reconciler
- [x] Parallelize arbitrage order placement
- [x] Move `require('crypto')` to top ESM import in polymarket adapter
- [x] Relocate STOP_WORDS and parallelize news market correlation
- [x] Add initialization promise cache in nonce manager
- [x] Add clearTimeout in TWAP chunk execution

## Success Criteria
- WebSocket processing latency is reduced under 5ms. (Verified)
- High-frequency order submission does not encounter queue stalls. (Verified)
- All nonces are allocated correctly without duplicate RPC conflicts. (Verified)
- Event loop remains free of dynamic requires and unnecessary array allocations. (Verified)

## Risk Assessment
- *Arbitrage order failures:* Placing orders in parallel means if one fails, the other might still execute (execution mismatch).
  - *Mitigation:* Ensure robust rollback/cancel logic on the successful path if the twin order rejects.

## Security Considerations
- Nonce ordering must be preserved across distributed nodes without race conditions.

## Next Steps
- Move to Phase 2.
