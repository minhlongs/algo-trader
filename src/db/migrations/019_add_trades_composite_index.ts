import { PoolClient } from 'pg';

export const id = '019_add_trades_composite_index';
export const description = 'Add composite index on trades table (status, created_at)';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_trades_status_created_at ON trades(status, created_at)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query(`
    DROP INDEX IF EXISTS idx_trades_status_created_at
  `);
}
