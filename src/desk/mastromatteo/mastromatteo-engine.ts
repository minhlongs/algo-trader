/**
 * Mastromatteo, Toth & Bouchaud (2014) Engine.
 */

import { MastromatteoConfig, OrderFlowState, MastromatteoImpactAssessment } from './mastromatteo-types';
import { computeMicroscopicImpact, computeOrderImbalance } from './mastromatteo-math';

export class MastromatteoEngine {
  constructor(private readonly config: MastromatteoConfig) {}

  public evaluateImpact(netOrderVolumeQ: number, state: OrderFlowState): MastromatteoImpactAssessment {
    return computeMicroscopicImpact(this.config, netOrderVolumeQ, state);
  }

  public getOrderImbalance(state: OrderFlowState): number {
    return computeOrderImbalance(state);
  }

  public getConfig(): MastromatteoConfig {
    return { ...this.config };
  }
}
