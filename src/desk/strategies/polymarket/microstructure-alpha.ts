/**
 * Microstructure Alpha Strategy — V2 migration stub.
 *
 * Extracts alpha from high-frequency market microstructure
 * patterns — tick-level order flow, quote stuffing, spoofing detection.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createMicrostructureAlphaTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[microstructure-alpha] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
