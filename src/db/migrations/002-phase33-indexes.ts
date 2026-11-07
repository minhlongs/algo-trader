import type { PoolClient } from 'pg';
import { getDialect } from '../migration-sql-dialect';

export const id = '0002-phase33-indexes';
export const description = 'Phase 33 composite indexes for subscriptions, payments, orders, coupons';

export async function up(client: PoolClient): Promise<void> {
  if (getDialect(client) === 'postgres') {
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(customer_email, status)',
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_payment_logs_created ON payments(created_at)',
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_orders_user_created ON trades(created_at)',
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_coupons_redeemed ON coupons(active, created_at)',
    );
    return;
  }

  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status)',
  );
  await client.query('CREATE INDEX IF NOT EXISTS idx_payment_logs_created ON payment_logs(created_at)');
  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at)',
  );
  await client.query('CREATE INDEX IF NOT EXISTS idx_coupons_redeemed ON coupons(redeemed, redeemed_at)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_subscriptions_user_status');
  await client.query('DROP INDEX IF EXISTS idx_payment_logs_created');
  await client.query('DROP INDEX IF EXISTS idx_orders_user_created');
  await client.query('DROP INDEX IF EXISTS idx_coupons_redeemed');
}
