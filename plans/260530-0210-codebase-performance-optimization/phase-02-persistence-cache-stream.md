# Phase 2: Database, Redis Cache, and Streaming Layer Remediation

## Context Links
- **Plan Access Point:** [plan.md](file:///Users/macbook/algo-trader/plans/260530-0210-codebase-performance-optimization/plan.md)
- **Target Files:**
  - [postgres-client.ts](file:///Users/macbook/algo-trader/src/db/postgres-client.ts)
  - [migration-runner.ts](file:///Users/macbook/algo-trader/src/db/migration-runner.ts)
  - [pnl-service.ts](file:///Users/macbook/algo-trader/src/db/pnl-service.ts)
  - [index.ts (redis)](file:///Users/macbook/algo-trader/src/redis/index.ts)
  - [orderbook-manager.ts](file:///Users/macbook/algo-trader/src/redis/orderbook-manager.ts)
  - [trade-stream.ts](file:///Users/macbook/algo-trader/src/redis/trade-stream.ts)
  - [file-store.ts](file:///Users/macbook/algo-trader/src/utils/file-store.ts)

## Overview
- **Date:** May 30, 2026
- **Priority:** High
- **Status:** ✅ Complete

## Key Insights
- Standard node pg pool configuration expects `max`, not `maxConnections`.
- Storing high-frequency data in Redis Streams requires precise parsing since XRANGE/XREAD return formats shift when keys are omitted.
- Sharing a cluster connection between subscribing states and standard key commands causes silent request rejections.

## Requirements
- Fix Pg pool config key from `maxConnections` to `max`. (Completed)
- Verify and register all skipped migrations in the migration runner. (Completed)
- Fix SQL syntax differences between SQLite and Postgres in migration files. (Completed)
- Add composite index on `trades` table. (Completed)
- Eliminate division by zero in Drawdown calculations. (Completed)
- Enforce dedicated Pub/Sub connection instances for cluster modes. (Completed)
- Avoid closing standard connection when closing the PubSubManager. (Completed)
- Prevent atomic orderbook reads from returning empty sets by avoiding DEL/ZADD pipelines (use single write operations or transactions). (Completed)
- Strip redundant `WITHSCORES` fetching and resolve N+1 Redis queries. (Completed)
- Fix Trade Stream parsing shifted alignment bug. (Completed)
- Re-architect `file-store.ts` to use async Node `fs/promises` methods and stream JSONL files instead of reading them all in-memory. (Completed)

## Related Code Files
- `src/db/postgres-client.ts`
- `src/db/migration-runner.ts`
- `src/db/pnl-service.ts`
- `src/redis/index.ts`
- `src/redis/orderbook-manager.ts`
- `src/redis/trade-stream.ts`
- `src/utils/file-store.ts`

## Implementation Steps
1. **Fix Postgres Pool & Migrations:** Update connection pool keys. List and register all 6 skipped migration files in the runner. Add SQLite/Postgres runtime dialect routing or query rewrites.
2. **Composite DB Index:** Write a migration adding index on `(status, created_at)`.
3. **Prevent Drawdown Division by Zero:** Add guard check `if (peak === 0) return 0` in drawdown computation.
4. **Dedicated Pub/Sub Connection & Lifecycle:** In `redis/index.ts`, instantiate dedicated client instances for sub/pub commands to prevent subscription state lockups. Ensure close does not kill standard connection.
5. **Atomic Orderbook Writes:** Avoid DEL + ZADD. Use a transaction or rewrite orderbook snapshots using Redis Hashes or ZADD without DEL where possible. Stop fetching scores if they are discarded.
6. **Eliminate Loop Queries:** Rewrite loop in `getTickers` and `getBestBidAcrossExchanges` to use pipelining or batch commands.
7. **Fix Trade Stream Parse Bug:** Adjust array slicing in `trade-stream.ts` to properly align the key-value structures from Redis XRANGE queries.
8. **Re-architect File Store:** Replace `writeFileSync`, `appendFileSync`, etc. with `fs.promises` equivalent async calls. Implement a readline stream for parsing JSONL log files.

## Todo List
- [x] Fix pg pool max configuration
- [x] List and register skipped migrations in runner
- [x] Fix dialect compatibility (SQLite vs Postgres queries)
- [x] Create composite index on trades
- [x] Fix drawdown peak zero checks
- [x] Enforce dedicated Redis Pub/Sub cluster connections
- [x] Optimize orderbook atomic snapshot and strip WITHSCORES
- [x] Remove loop queries in ticker fetching
- [x] Fix Trade Stream shifted key-value alignment parsing
- [x] Replace synchronous disk functions with async promises
- [x] Stream JSONL reading instead of reading entire files in-memory

## Success Criteria
- Startup migrations run correctly without throwing SQL syntax exceptions. (Verified)
- Redis Pub/Sub commands execute without throwing connection state errors. (Verified)
- Trade Stream data parses with real prices and amounts, avoiding zeroed fallback metrics. (Verified)
- Hard file operations do not block the thread during high-frequency execution. (Verified)

## Risk Assessment
- *Migration failures on live db:* Running all migrations might conflict if tables exist.
  - *Mitigation:* Ensure `IF NOT EXISTS` check is defined for all tables and indices.
