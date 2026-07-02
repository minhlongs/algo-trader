/**
 * Session Volatility Sniper Strategy — V2 migration stub.
 *
 * Snipes high-volatility entries during specific trading sessions
 * (e.g., NY open, London open) when market microstructure changes.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createSessionVolSniperTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[session-vol-sniper] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
