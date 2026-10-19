/**
 * Wave 246: Gatheral & Schied (2013) Market Impact Decay Integral Equations Engine
 * Strictly < 50 LOC, zero :any.
 */

import { GatheralSchiedImpactConfig, ImpactIntegralState, TradeSlice } from './gatheral-schied-impact-types';
import { computeDecayImpactIntegral } from './gatheral-schied-impact-math';

export class GatheralSchiedImpactEngine {
  private readonly config: GatheralSchiedImpactConfig;

  constructor(config: GatheralSchiedImpactConfig) {
    if (config.instantaneousImpactGamma < 0) {
      throw new Error('instantaneousImpactGamma must be non-negative');
    }
    this.config = config;
  }

  public calculateImpact(history: TradeSlice[], currentTime: number): ImpactIntegralState {
    return computeDecayImpactIntegral(history, currentTime, this.config);
  }
}
