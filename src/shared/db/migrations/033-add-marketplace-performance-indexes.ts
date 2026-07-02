/**
 * Migration 033: Add Marketplace Performance Indexes
 *
 * Targets hot query paths identified in marketplace repository layer.
 * Strategy → subscriber listing, popular-strategies browse, review feeds.
 */
import { PoolClient } from 'pg';

export const id = '033-add-marketplace-performance-indexes';
export const description =
  'Add composite indexes for marketplace subscription queries, popular listings browse, and review feeds';

export async function up(client: PoolClient): Promise<void> {
  // 1. marketplace_subscriptions: "subscribers of strategy X" (strategy_id + status)
  //    Covers: SELECT ... WHERE strategy_id = $1 AND status = 'active' ORDER BY created_at DESC
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_subscriptions_strategy_status
    ON marketplace_subscriptions(strategy_id, status)
  `);

  // 2. marketplace_listings: "most popular active listings" browse page
  //    Covers: SELECT ... WHERE is_active = true ORDER BY subscriber_count DESC
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_listings_active_popular
    ON marketplace_listings(subscriber_count DESC)
    WHERE is_active = true
  `);

  // 3. marketplace_reviews: "latest reviews for strategy" feed
  //    Covers: SELECT ... WHERE strategy_id = $1 ORDER BY created_at DESC
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_strategy_created
    ON marketplace_reviews(strategy_id, created_at DESC)
  `);

  // 4. marketplace_disputes: tenant dashboard "my disputes" filtered by status
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_disputes_tenant_status
    ON marketplace_disputes(tenant_id, status)
  `);

  // 5. marketplace_revenue_shares: creator payout dashboard filtered by status
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_revenue_shares_tenant_status
    ON marketplace_revenue_shares(tenant_id, status)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_marketplace_subscriptions_strategy_status');
  await client.query('DROP INDEX IF EXISTS idx_marketplace_listings_active_popular');
  await client.query('DROP INDEX IF EXISTS idx_marketplace_reviews_strategy_created');
  await client.query('DROP INDEX IF EXISTS idx_marketplace_disputes_tenant_status');
  await client.query('DROP INDEX IF EXISTS idx_marketplace_revenue_shares_tenant_status');
}
