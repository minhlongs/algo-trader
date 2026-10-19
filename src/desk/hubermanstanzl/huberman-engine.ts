/**
 * Wave 238: Huberman & Stanzl (2004) Price Manipulation Engine
 * Evaluates round-trip trade strategies to detect quasi-arbitrage or price manipulation.
 * Strictly < 100 LOC, zero :any.
 */

import { QuasiArbitrageConfig, RoundTripStrategy, QuasiArbitrageAssessment } from './huberman-types';
import { evaluateQuasiArbitrage } from './huberman-math';

export class HubermanStanzlEngine {
  private readonly config: QuasiArbitrageConfig;

  constructor(config: QuasiArbitrageConfig) {
    if (config.temporaryImpactEta < 0) {
      throw new Error('Temporary impact parameter eta must be non-negative');
    }
    this.config = config;
  }

  public assessRoundTrip(strategy: RoundTripStrategy): QuasiArbitrageAssessment {
    if (strategy.timeStepDeltaT <= 0) {
      throw new Error('timeStepDeltaT must be strictly positive');
    }
    const sumVolumes = strategy.roundTripVolumes.reduce((acc, v) => acc + v, 0);
    if (Math.abs(sumVolumes) > 1e-7) {
      throw new Error(`Strategy is not a closed round trip: net position is ${sumVolumes}`);
    }

    return evaluateQuasiArbitrage(strategy, this.config);
  }

  public static isManipulationFreePermanentImpact(lambda: number): boolean {
    // Under 1D linear permanent impact, Lambda >= 0 ensures quasi-arbitrage freedom
    return lambda >= 0;
  }
}
