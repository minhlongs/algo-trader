/**
 * Badge Repository
 * Database query functions for listing quality badges.
 * Separated from badge-service.ts to keep each file under 200 lines.
 */
import { getDbClient } from '../../../shared/db/postgres-client';
import { logger } from '../../../shared/utils/logger';
import type { BadgeKey, BadgeDefinition } from './badge-service';
import {
  daysSince,
  computeSharpePercentileFromRows,
  mapListingForBadgingRow,
  mapStrategyDataRows,
  mapBadgeDefinitionRow,
  type StrategyDataForBadging,
} from './badge-repository-helpers';

export {
  daysSince,
  computeSharpePercentileFromRows,
  mapListingForBadgingRow,
  mapStrategyDataRows,
  mapBadgeDefinitionRow,
  type StrategyDataForBadging,
};

/**
 * Get the percentile rank of a strategy's Sharpe ratio among all approved strategies.
 * Returns 0.0 (worst) to 1.0 (best).
 */
export async function getSharpePercentile(
  strategyId: string,
  sharpe: number,
): Promise<number> {
  try {
    const db = getDbClient();
    const higherResult = await db.query(
      `SELECT COUNT(*) as cnt FROM marketplace_performance mp
       INNER JOIN marketplace_strategies ms ON mp.strategy_id = ms.id
       WHERE mp.sharpe_ratio > $1 AND ms.status = 'approved' AND mp.strategy_id != $2
       AND mp.date = (
         SELECT MAX(date) FROM marketplace_performance WHERE strategy_id = mp.strategy_id
       )`,
      [sharpe, strategyId],
    );
    const totalResult = await db.query(
      `SELECT COUNT(*) as cnt FROM marketplace_strategies WHERE status = 'approved'`,
    );

    return computeSharpePercentileFromRows(
      higherResult.rows[0] as Record<string, unknown> | undefined,
      totalResult.rows[0] as Record<string, unknown> | undefined,
    );
  } catch (error) {
    logger.warn('[BadgeRepo] Failed to compute sharpe percentile', { error, strategyId });
    return 0;
  }
}

/**
 * Persist computed badges to a marketplace listing.
 */
export async function persistListingBadges(
  listingId: string,
  badges: BadgeKey[],
): Promise<void> {
  const db = getDbClient();
  await db.query(
    `UPDATE marketplace_listings SET badges = $1, updated_at = NOW() WHERE id = $2`,
    [badges, listingId],
  );
  logger.debug('[BadgeRepo] Badges persisted', { listingId, badges });
}

/**
 * Fetch all active listings that need badge computation.
 */
export async function fetchAllListingsForBadging(): Promise<
  Array<{ listingId: string; strategyId: string }>
> {
  const db = getDbClient();
  const result = await db.query(
    `SELECT l.id as listing_id, l.strategy_id
     FROM marketplace_listings l
     INNER JOIN marketplace_strategies s ON l.strategy_id = s.id
     WHERE s.status IN ('approved', 'draft', 'pending_vetting')`,
  );
  return result.rows.map((r: Record<string, unknown>) => mapListingForBadgingRow(r));
}

/**
 * Fetch strategy and performance data needed for badge computation.
 */
export async function fetchStrategyData(strategyId: string): Promise<StrategyDataForBadging> {
  const db = getDbClient();

  const [strategyResult, perfResult] = await Promise.all([
    db.query(
      `SELECT id, created_at, status, vetted_at FROM marketplace_strategies WHERE id = $1`,
      [strategyId],
    ),
    db.query(
      `SELECT sharpe_ratio, max_drawdown, total_pnl_usd, total_trades
       FROM marketplace_performance WHERE strategy_id = $1 ORDER BY date DESC LIMIT 90`,
      [strategyId],
    ),
  ]);

  return mapStrategyDataRows(
    strategyResult.rows[0] as Record<string, unknown> | undefined,
    perfResult.rows as Array<Record<string, unknown>>,
  );
}

/**
 * Get badge definitions from the database.
 */
export async function fetchBadgeDefinitions(): Promise<BadgeDefinition[]> {
  const db = getDbClient();
  const result = await db.query(
    `SELECT key, display_name, description, icon, color, sort_order
     FROM listing_badge_definitions ORDER BY sort_order ASC`,
  );

  return result.rows.map((r: Record<string, unknown>) => mapBadgeDefinitionRow(r));
}

/**
 * Get stored badge keys for a specific listing.
 */
export async function fetchListingBadgeKeys(listingId: string): Promise<BadgeKey[]> {
  const db = getDbClient();
  const result = await db.query(
    `SELECT badges FROM marketplace_listings WHERE id = $1`,
    [listingId],
  );
  if (result.rows.length === 0) return [];
  const keys = (result.rows[0] as Record<string, unknown>).badges as string[] | null;
  return (keys ?? []) as BadgeKey[];
}

