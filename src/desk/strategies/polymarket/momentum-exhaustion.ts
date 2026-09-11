/**
 * Momentum Exhaustion Strategy — V2 implementation.
 *
 * Detects when price momentum is exhausting by tracking price velocity
 * deceleration coincident with increasing volume. When momentum fades
 * while volume rises, a reversal is likely. Trades against the exhausted trend.
 *
 * Entry: exhaustion detected -> short the current trend
 *   - Up-trend exhaustion (price velocity > 0 but decreasing, volume increasing) -> BUY NO
 *   - Down-trend exhaustion (price velocity < 0 but increasing, volume increasing) -> BUY YES
 * Exit: opposite exhaustion signal or stop-loss at 2x ATR
 */

import type { StrategyDeps } from './base-polymarket-strategy';
import { MomentumExhaustionStrategy } from './momentum-exhaustion-strategy';

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { MomentumExhaustionConfig } from './momentum-exhaustion-helpers';
export {
  DEFAULT_CONFIG,
  calcVelocity,
  calcVolumeRate,
  calcATR,
  detectExhaustion,
} from './momentum-exhaustion-helpers';
export { MomentumExhaustionStrategy } from './momentum-exhaustion-strategy';

// ---------------------------------------------------------------------------
// Legacy factory
// ---------------------------------------------------------------------------

export function createMomentumExhaustionTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new MomentumExhaustionStrategy(deps);
  return strategy.toTickFn();
}
