/**
 * Liquidation Cascade Strategy — V2 implementation (Barrel Facade).
 *
 * Detects price cascades caused by large order book events (simulating
 * liquidations). Monitors rapid price moves with high volume absorption
 * and enters on overshoot, betting on mean reversion after the cascade.
 */

export type { LiquidationCascadeConfig } from './liquidation-cascade-types';
export { DEFAULT_CONFIG } from './liquidation-cascade-types';

export {
  calcPriceChangePct,
  calcVolumeAbsorption,
} from './liquidation-cascade-math';

export {
  LiquidationCascadeStrategy,
  createLiquidationCascadeTick,
} from './liquidation-cascade-strategy';
