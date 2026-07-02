/**
 * Migration 040: Listing Quality Badges
 * Adds badge support to marketplace listings for strategy quality indicators.
 * Badges are computed/stored as a text array on each listing.
 */
import { PoolClient } from 'pg';

export const id = '040-add-listing-badges';
export const description = 'Add badges column to marketplace_listings for quality indicators';

export async function up(client: PoolClient): Promise<void> {
  // Add badges column to marketplace_listings
  await client.query(`
    ALTER TABLE marketplace_listings
    ADD COLUMN IF NOT EXISTS badges TEXT[] NOT NULL DEFAULT '{}'
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_listings_badges
    ON marketplace_listings USING GIN(badges)
  `);

  // Create a table for badge definitions (for extensibility)
  await client.query(`
    CREATE TABLE IF NOT EXISTS listing_badge_definitions (
      key VARCHAR(32) PRIMARY KEY,
      display_name VARCHAR(64) NOT NULL,
      description TEXT NOT NULL,
      icon VARCHAR(32) NOT NULL DEFAULT 'award',
      color VARCHAR(16) NOT NULL DEFAULT '#6366f1',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Seed standard badges
  await client.query(`
    INSERT INTO listing_badge_definitions (key, display_name, description, icon, color, sort_order) VALUES
      ('verified_creator', 'Verified Creator', 'Identity verified — real person or entity behind this strategy', 'shield-check', '#22c55e', 10),
      ('top_performer', 'Top Performer', 'Top 10% of strategies by Sharpe ratio over the last 90 days', 'trophy', '#f59e0b', 20),
      ('low_risk', 'Low Risk', 'Maximum drawdown below 10% over the evaluated period', 'heart', '#ef4444', 30),
      ('high_volume', 'High Volume', 'Consistently high trading volume — 1000+ trades in evaluation period', 'zap', '#8b5cf6', 40),
      ('consistent_returns', 'Consistent Returns', 'Positive P&L in 70%+ of evaluation periods (monthly)', 'trending-up', '#06b6d4', 50),
      ('new_strategy', 'New Strategy', 'Listed within the last 30 days', 'sparkles', '#ec4899', 60)
    ON CONFLICT (key) DO NOTHING
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS listing_badge_definitions');
  await client.query('ALTER TABLE marketplace_listings DROP COLUMN IF EXISTS badges');
}
