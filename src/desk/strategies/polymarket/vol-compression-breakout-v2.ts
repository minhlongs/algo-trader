/**
 * Vol Compression Breakout V2 — extends BasePolymarketStrategy.
 *
 * Detects when realized volatility compresses to unusually low levels
 * (pre-breakout), then trades the initial breakout direction.
 * State machine: compressed → waiting → breakout detected → trade.
 *
 * Custom exit: failed breakout (price reverses back into compression range).
 */

import {
  VolCompressionBreakoutStrategy,
} from './vol-compression-breakout-strategy';
import {
  type VolCompressionDeps,
} from './vol-compression-types';

export * from './vol-compression-types';
export * from './vol-compression-math';
export * from './vol-compression-breakout-strategy';

export function createVolCompressionBreakoutTick(deps: VolCompressionDeps): () => Promise<void> {
  const { kellySizer, config, ...baseDeps } = deps;
  const strategy = new VolCompressionBreakoutStrategy(baseDeps, config, kellySizer);
  return strategy.toTickFn();
}
