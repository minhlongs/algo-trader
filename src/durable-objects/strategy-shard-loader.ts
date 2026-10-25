/**
 * Strategy Shard Loading
 *
 * Loads a shard's assigned strategies into its live map. Extracted from shard
 * initialization so a failed strategy load is isolated to one id and never
 * aborts the rest of the shard's startup.
 */

import { logger } from '../utils/logger';
import type { IStrategy } from '../desk/strategies/types';
import { StrategyLoader } from '../desk/strategies/loader';

/**
 * Load every assigned strategy into `strategies`.
 *
 * Individual failures are logged and skipped: a bad strategy id must not stop
 * the other strategies on the same shard from starting.
 */
export async function loadAssignedStrategies(
  shardId: number,
  assignments: string[],
  strategies: Map<string, IStrategy>,
): Promise<void> {
  const loader = new StrategyLoader();

  for (const strategyId of assignments) {
    try {
      const strategy = await loader.loadStrategy(strategyId);
      if (strategy) {
        strategies.set(strategyId, (strategy as unknown as IStrategy));
        logger.info('[StrategyShard] Loaded strategy', { shardId, strategyId });
      }
    } catch (error) {
      logger.error('[StrategyShard] Failed to load strategy', { shardId, strategyId, error });
    }
  }
}
