/**
 * LVR Hedge Synchronizer
 * Bridges trade execution fills with LpLvrYieldSentinel for delta-neutral perpetual hedging.
 *
 * @module desk/harmonizer/lvr-hedge-synchronizer
 */

import { LpLvrYieldSentinel } from '../amm/lp-lvr-yield-sentinel';
import type {
  AmmPoolState,
  LpPositionSnapshot,
  LpLvrMetrics,
} from '../amm/lp-lvr-yield-types';

export class LvrHedgeSynchronizer {
  private readonly sentinel: LpLvrYieldSentinel;

  public constructor() {
    this.sentinel = new LpLvrYieldSentinel();
  }

  public synchronizeHedge(
    pool: AmmPoolState,
    position: LpPositionSnapshot
  ): LpLvrMetrics {
    return this.sentinel.evaluatePoolYield(pool, position);
  }
}
