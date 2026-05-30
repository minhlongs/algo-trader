# Database Performance Optimization Analysis

This report analyzes the PostgreSQL database schema, connection pool configuration, and queries in the Algo-Trader RaaS platform, identifying query bottlenecks under load (5000+ VUs) and proposing optimizations.

---

## 1. Current Database Query Flow and Schema Layout

### 1.1 Table Structures
The platform operates on a PostgreSQL database with the following core tables:

1. **`trades`**: Tracks executed arbitrage trades.
   * **Primary Key**: `id` VARCHAR(64)
   * **Columns**: `opportunity_id` VARCHAR(64), `execution_id` VARCHAR(64), `symbol` VARCHAR(32), `buy_exchange` VARCHAR(32), `sell_exchange` VARCHAR(32), `buy_price` DECIMAL, `sell_price` DECIMAL, `amount` DECIMAL, `spread_percent` DECIMAL, `profit` DECIMAL, `fee` DECIMAL, `status` VARCHAR(16), `created_at` BIGINT (epoch ms), `updated_at` BIGINT (epoch ms), `subscriber_id` TEXT (added in migration 015), `attestation_id` TEXT (added in migration 015).
2. **`pnl_daily`**: Summarizes daily P&L.
   * **Primary Key**: `date` DATE
   * **Columns**: Metrics like `total_profit`, `total_loss`, `net_pnl`, `trade_count`, etc.
3. **`performance_metrics`**: Stores calculated metrics.
   * **Primary Key**: `id` SERIAL
   * **Columns**: `metric_name`, `metric_value`, `period`, `calculated_at`

### 1.2 Current Indices
As of migration `019`, the following indexes exist on `trades`:
* `trades_pkey` ON `trades(id)` (B-Tree, Implicit)
* `idx_trades_status` ON `trades(status)` (B-Tree)
* `idx_trades_created_at` ON `trades(created_at)` (B-Tree)
* `idx_trades_symbol` ON `trades(symbol)` (B-Tree)
* `idx_trades_status_created_at` ON `trades(status, created_at)` (B-Tree)
* `idx_trades_subscriber_id` ON `trades(subscriber_id)` (B-Tree, added in migration 015)
* `idx_trades_subscriber_ts` ON `trades(subscriber_id, created_at)` (B-Tree, added in migration 015)

### 1.3 Query Flow
Database access occurs in two primary flows:
1. **Trading Loop Writes (Write-Heavy)**:
   * During executions, the system calls `TradeRepository.insert()` which performs an upsert:
     ```sql
     INSERT INTO trades (...) VALUES (...) 
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, profit = EXCLUDED.profit, updated_at = EXCLUDED.updated_at
     ```
   * Updates to trade statuses use `TradeRepository.updateStatus()`:
     ```sql
     UPDATE trades SET status = $1, profit = COALESCE($2, profit), updated_at = $3 WHERE id = $4
     ```
2. **PnL & Metrics Reads (Read-Heavy / High Agregation)**:
   * **`getTotalPnl`**:
     ```sql
     SELECT SUM(profit) as total FROM trades WHERE status = $1 -- ($1 = 'FILLED')
     ```
   * **`getDailySummary`**:
     ```sql
     SELECT COUNT(*), SUM(CASE WHEN profit > 0...), SUM(CASE WHEN profit < 0...), AVG(CASE...) 
     FROM trades 
     WHERE created_at BETWEEN $1 AND $2 AND status = 'FILLED'
     ```
   * **`getPnlByDateRange`**:
     ```sql
     SELECT DATE_TRUNC('day', TO_TIMESTAMP(created_at / 1000)) as date, SUM(profit), COUNT(*)
     FROM trades
     WHERE created_at BETWEEN $1 AND $2 AND status = 'FILLED'
     GROUP BY DATE_TRUNC('day', TO_TIMESTAMP(created_at / 1000))
     ORDER BY date
     ```
   * **`getTradeStats`**:
     ```sql
     SELECT COUNT(*), COUNT(CASE WHEN profit > 0...), AVG(profit), MAX(profit), MIN(profit)
     FROM trades WHERE status = 'FILLED'
     ```

---

## 2. Bottlenecks Under Load (5000+ VUs)

When simulating 5000+ concurrent Virtual Users accessing the API and WebSocket gateways, several severe database-layer bottlenecks emerge:

### 2.1 Connection Pool Exhaustion (Starvation)
* **Root Cause**: `src/db/postgres-client.ts` initializes the pg connection pool with `maxConnections: 10` by default. It lacks configuration for timeouts.
* **Impact**: Under 5000+ VUs, requests to read PnL or list trades will quickly saturate the 10 connections. The remaining 4,990+ incoming requests will block waiting for a connection. Because no `connectionTimeoutMillis` is set, requests accumulate indefinitely in memory, leading to:
  1. **High API Response Latency (p95 > 10s)** due to queue delay.
  2. **Out of Memory (OOM)** server crashes under heavy workload.
  3. **Gateway timeouts (504)** at the reverse proxy level.

### 2.2 Redundant / Duplicate Indices (Write Amplification)
* **Root Cause**: `idx_trades_status` on `trades(status)` and `idx_trades_status_created_at` on `trades(status, created_at)` are active simultaneously.
* **Impact**: In B-tree indexes, a multi-column index on `(status, created_at)` can fully satisfy any query filtering on `status` alone. `idx_trades_status` is completely redundant. Having it active causes duplicate index write overhead for every `INSERT` and `UPDATE` on the `trades` table, degrading write performance during concurrent trade executions.

### 2.3 Heavy CPU-Bound Aggregate Queries on the Raw `trades` Table
* **Root Cause**: The dashboard endpoints (`GET /pnl` which invokes `getPerformanceMetrics()`) trigger multiple full table scans and aggregates:
  * `getTotalPnl()` scans all `trades` where `status = 'FILLED'`.
  * `getTradeStats()` scans all `trades` where `status = 'FILLED'`.
  * `getPnlByDateRange()` scans and aggregates `trades` by date ranges.
* **Impact**: Under 5000+ VUs, calculating SUM, AVG, MIN, and MAX on-the-fly over millions of rows on every API request will spike PostgreSQL CPU to 100% and freeze the database.

### 2.4 Heap Fetch Overhead (Lack of Covering/Partial Indexes)
* **Root Cause**: The current `idx_trades_status_created_at` B-Tree index helps filter rows, but does not include the payload columns (like `profit`).
* **Impact**: PostgreSQL must execute a Heap Fetch to read the `profit` value from the table storage blocks on disk or in the shared buffer for every matching trade. This causes high random I/O and shared buffer churn under heavy concurrency.

### 2.5 In-Memory Pagination Bug
* **Root Cause**: In `src/api/routes/trades.ts`, pagination parameters (`limit`, `offset`) are validated, but the query `tradeRepo.getRecent(limit)` only retrieves the first `limit` records, and the slice is done in-memory:
  ```typescript
  const trades = await tradeRepo.getRecent(limit);
  res.json({ data: trades.slice(offset, offset + limit) });
  ```
* **Impact**: Calling `/trades?limit=100&offset=150` returns 0 results because the DB only returned 100 records. For larger ranges, it fetches unnecessary records from the database.

---

## 3. Recommended Optimizations

To handle 5000+ VUs with a p95 latency `< 100ms`, we recommend the following multi-layer optimizations:

### 3.1 Connection Pool Optimization
Modify `postgres-client.ts` to scale connection limits and fail fast:
1. **Increase Pool Size**: Set `maxConnections: 30` (or larger, depending on PostgreSQL server limits).
2. **Add Connection Timeout**: Set `connectionTimeoutMillis: 5000` (5s) to fail fast under extreme load.
3. **Configure Idle Keepalive**: Set `idleTimeoutMillis: 30000` and enable TCP `keepalive` to prevent socket timeouts.
4. **Deploy PgBouncer**: In production, place **PgBouncer** in transaction pooling mode in front of PostgreSQL to scale concurrent clients up to thousands without process exhaustion.

### 3.2 SQL Schema & Index Optimizations
1. **Drop Redundant Indexes**: Drop `idx_trades_status`.
2. **Implement Partial Covering Index**:
   Create a partial B-tree index on `created_at` that covers the `profit` column, filtered to only include `'FILLED'` trades:
   ```sql
   CREATE INDEX idx_trades_filled_created_at_profit 
   ON trades (created_at) 
   INCLUDE (profit) 
   WHERE status = 'FILLED';
   ```
   * **Why**: This index is tiny since it only contains successful trades. Queries like `getDailySummary`, `getPnlByDateRange`, and `getTotalPnl` will run via an **Index-Only Scan**, avoiding heap table reads entirely.
3. **Tenant-Scoped Covered Index**:
   If multi-tenant isolation queries are implemented, add a composite partial index:
   ```sql
   CREATE INDEX idx_trades_tenant_filled_pnl 
   ON trades (subscriber_id, created_at) 
   INCLUDE (profit) 
   WHERE status = 'FILLED';
   ```

### 3.3 Query Structure & Caching Optimization
1. **Avoid Live Full-Table Aggregations**:
   Instead of scanning the entire `trades` table, `PnLService.getPerformanceMetrics()` should:
   * Query the pre-aggregated `pnl_daily` table for all history prior to today.
   * Query the `trades` table only for today's trades (`created_at >= start_of_today`).
   * Merge the two datasets in Node.js.
2. **Add API Caching (TTL)**:
   Add a 10-second cache (e.g. in-memory or Redis) to the `/pnl` and `/pnl/daily` endpoints. This ensures that 5000+ VUs hitting the dashboard will trigger a database query at most once every 10 seconds.
3. **Database-Level Pagination**:
   Modify `TradeRepository.getRecent` to accept both `limit` and `offset`, passing them directly to the SQL query:
   ```typescript
   async getRecent(limit = 100, offset = 0): Promise<TradeRecord[]> {
     const sql = 'SELECT * FROM trades ORDER BY created_at DESC LIMIT $1 OFFSET $2';
     const result = await query(sql, [limit, offset]);
     return result.rows;
   }
   ```

---

## 4. SQL Statements for Database Migrations

Here are the SQL commands to apply the recommended index optimizations. These should be placed in a new migration, e.g., `020_db_performance_optimizations.ts`.

### 4.1 SQL Migration Script (Up)
```sql
-- 1. Drop the redundant status index
DROP INDEX IF EXISTS idx_trades_status;

-- 2. Create the partial covering index for P&L aggregates
CREATE INDEX IF NOT EXISTS idx_trades_filled_created_at_profit 
ON trades (created_at) 
INCLUDE (profit) 
WHERE status = 'FILLED';

-- 3. Create the multi-tenant tenant-scoped partial covering index
CREATE INDEX IF NOT EXISTS idx_trades_tenant_filled_pnl 
ON trades (subscriber_id, created_at) 
INCLUDE (profit) 
WHERE status = 'FILLED';

-- 4. Create an expression index for epoch BIGINT to date conversions
CREATE INDEX IF NOT EXISTS idx_trades_created_at_date_trunc
ON trades ((DATE_TRUNC('day', TO_TIMESTAMP(created_at / 1000))))
WHERE status = 'FILLED';
```

### 4.2 SQL Migration Script (Down / Rollback)
```sql
-- 1. Recreate the redundant status index
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);

-- 2. Drop the performance optimization indexes
DROP INDEX IF EXISTS idx_trades_filled_created_at_profit;
DROP INDEX IF EXISTS idx_trades_tenant_filled_pnl;
DROP INDEX IF EXISTS idx_trades_created_at_date_trunc;
```
