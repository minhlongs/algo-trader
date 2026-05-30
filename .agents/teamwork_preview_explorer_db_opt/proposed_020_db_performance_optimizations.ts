import { PoolClient } from 'pg';

export const id = '020_db_performance_optimizations';
export const description = 'Optimize database performance with partial covering indexes, drop redundant indexes, and support fast multi-tenant scans';

export async function up(client: PoolClient): Promise<void> {
  // 1. Drop the redundant status index (covered by idx_trades_status_created_at prefix status)
  await client.query(`
    DROP INDEX IF EXISTS idx_trades_status
  `);

  // 2. Create the partial covering index for P&L aggregates
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_trades_filled_created_at_profit 
    ON trades (created_at) 
    INCLUDE (profit) 
    WHERE status = 'FILLED'
  `);

  // 3. Create the multi-tenant tenant-scoped partial covering index
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_trades_tenant_filled_pnl 
    ON trades (subscriber_id, created_at) 
    INCLUDE (profit) 
    WHERE status = 'FILLED'
  `);

  // 4. Create an expression index for epoch BIGINT to date conversions
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_trades_created_at_date_trunc
    ON trades ((DATE_TRUNC('day', TO_TIMESTAMP(created_at / 1000))))
    WHERE status = 'FILLED'
  `);
}

export async function down(client: PoolClient): Promise<void> {
  // 1. Recreate the redundant status index
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status)
  `);

  // 2. Drop the performance optimization indexes
  await client.query(`
    DROP INDEX IF EXISTS idx_trades_filled_created_at_profit
  `);
  await client.query(`
    DROP INDEX IF EXISTS idx_trades_tenant_filled_pnl
  `);
  await client.query(`
    DROP INDEX IF EXISTS idx_trades_created_at_date_trunc
  `);
}
