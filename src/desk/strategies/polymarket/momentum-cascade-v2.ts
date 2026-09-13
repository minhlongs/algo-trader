/**
 * Momentum Cascade V2 — extends BasePolymarketStrategy.
 *
 * Facade re-exporting config types, math helpers, strategy implementation, and factory.
 */

export * from './momentum-cascade-types';
export * from './momentum-cascade-math';
export * from './momentum-cascade-strategy';

export { createMomentumCascadeTick } from "./momentum-cascade-strategy";
