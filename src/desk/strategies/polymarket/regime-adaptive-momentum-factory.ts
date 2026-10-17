/**
 * Factory functions for Regime-Adaptive Momentum Strategy.
 *
 * @module desk/strategies/polymarket/regime-adaptive-momentum-factory
 */

import type { RegimeAdaptiveMomentumDeps } from './regime-adaptive-momentum-types';
import { RegimeAdaptiveMomentumStrategy } from './regime-adaptive-momentum-v2';

export function createRegimeAdaptiveMomentumTick(
  deps: RegimeAdaptiveMomentumDeps,
): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new RegimeAdaptiveMomentumStrategy(baseDeps, config);
  return strategy.toTickFn();
}
