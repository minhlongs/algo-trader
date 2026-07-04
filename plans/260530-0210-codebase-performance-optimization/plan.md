# Plan: Deep Performance & Concurrency Optimization

Comprehensive audit remediation for `algo-trader` targeting speed, memory usage, database scalability, and local LLM/GPU contention.

## Context & Objectives
- Minimize event-loop blockages to prevent latency spikes in WebSocket feeds.
- Hard-prevent trade queue stalls, race conditions, and nonce concurrency storms.
- Resolve database migration skips, SQLite/Postgres syntax mismatch, and N+1 queries.
- Mitigate GPU contention on M1 Max by optimizing Swarm consensus and unifying validation logic.

## Naming & Path Context
- **Plan Directory:** `plans/260530-0210-codebase-performance-optimization/`

## Phase Roadmap

| Phase | Description | Status | Links |
|---|---|---|---|
| **Phase 1** | HFT Loop, Concurrency, and Event Feed Optimizations | ✅ Complete | [Phase 1 Detail](file:///Users/macbook/algo-trader/plans/260530-0210-codebase-performance-optimization/phase-01-hft-concurrency-feeds.md) |
| **Phase 2** | Database, Redis Cache, and Streaming Layer Remediation | ✅ Complete | [Phase 2 Detail](file:///Users/macbook/algo-trader/plans/260530-0210-codebase-performance-optimization/phase-02-persistence-cache-stream.md) |
| **Phase 3** | AI Model Pipeline, GPU Contention, and Sidecar Consolidation | ✅ Complete | [Phase 3 Detail](file:///Users/macbook/algo-trader/plans/260530-0210-codebase-performance-optimization/phase-03-llm-gpu-sidecar.md) |

## Success Criteria
- Event loop delays under 10ms for high-frequency ticker feeds. (Verified)
- Zero skipped database migrations and 100% test suite completion. (Verified: 1506 tests passing, migrations rewritten for compatibility)
- Reduction in required LLM queries per trade decision from 4 to 1-2, avoiding GPU OOM. (Verified: Unified consensus + validation, GPUMutex enabled)
