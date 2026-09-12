/**
 * Orderbook Depth Ratio V2 — extends BasePolymarketStrategy.
 * Barrel facade preserving 100% backward compatibility.
 */

import { OrderbookDepthRatioStrategy } from './orderbook-depth-ratio-strategy';
import type { OrderbookDepthDeps } from './orderbook-depth-ratio-types';

export {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
  type OrderbookDepthConfig,
  type OrderbookDepthDeps,
} from './orderbook-depth-ratio-types';

export {
  calcDepthRatio,
  calcDepthZScore,
  detectMomentum,
} from './orderbook-depth-ratio-math';

export { OrderbookDepthRatioStrategy } from './orderbook-depth-ratio-strategy';

export function createOrderbookDepthRatioTick(deps: OrderbookDepthDeps): () => Promise<void> {
  const { kellySizer, config, ...baseDeps } = deps;
  const strategy = new OrderbookDepthRatioStrategy(baseDeps, config, kellySizer);
  return strategy.toTickFn();
}
