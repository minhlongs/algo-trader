/**
 * Expiry Theta Decay Strategy — V2 migration stub.
 *
 * Captures theta decay premium as binary event markets
 * approach their resolution date.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createExpiryThetaDecayTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[expiry-theta-decay] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
