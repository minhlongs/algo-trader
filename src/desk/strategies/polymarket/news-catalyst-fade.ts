/**
 * News Catalyst Fade Strategy — V2 migration stub.
 *
 * Fades the initial price reaction to news events,
 * entering counter-trend when sentiment extremes are reached.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createNewsCatalystFadeTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[news-catalyst-fade] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
