/**
 * TWAP Accumulator Strategy — Barrel facade for backward compatibility.
 */

import type { StrategyDeps } from './base-polymarket-strategy';
import { TwapAccumulatorStrategy } from './twap-accumulator-strategy';

export * from './twap-accumulator-types';
export * from './twap-accumulator-math';
export * from './twap-accumulator-strategy';

// ── Legacy factory ─────────────────────────────────────────────────────────────

export function createTwapAccumulatorTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new TwapAccumulatorStrategy(deps);
  return strategy.toTickFn();
}
