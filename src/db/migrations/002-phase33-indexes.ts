export const id = '0002-phase33-indexes';
export const description = 'Phase 33 composite indexes for subscriptions, payments, orders, coupons';

export async function up(client: import('pg').PoolClient): Promise<void> {
  await client.query('CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_payment_logs_created ON payment_logs(created_at)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_coupons_redeemed ON coupons(redeemed, redeemed_at)');
}

export async function down(client: import('pg').PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_subscriptions_user_status');
  await client.query('DROP INDEX IF EXISTS idx_payment_logs_created');
  await client.query('DROP INDEX IF EXISTS idx_orders_user_created');
  await client.query('DROP INDEX IF EXISTS idx_coupons_redeemed');
}
