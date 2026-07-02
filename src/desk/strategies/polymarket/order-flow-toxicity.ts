/**
 * Order Flow Toxicity Strategy — V2 migration stub.
 *
 * Measures adverse selection risk in order flow using
 * VPIN (Volume-synchronized Probability of Informed Trading).
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createOrderFlowToxicityTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[order-flow-toxicity] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
