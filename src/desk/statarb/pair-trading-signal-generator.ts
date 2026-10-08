/**
 * Statistical Arbitrage Dynamic Signal Generator
 * Generates mean-reverting entry, exit, and stop-loss signals based on rolling Z-score thresholds.
 *
 * @module desk/statarb/pair-trading-signal-generator
 */

import {
  StatArbSignal,
  OuParameters,
} from './statarb-types';

export class PairTradingSignalGenerator {
  constructor(
    private readonly entryZThreshold = 2.0,
    private readonly exitZThreshold = 0.5,
    private readonly stopLossZThreshold = 3.5
  ) {}

  /**
   * Generates execution signal for current residual spread observation.
   */
  public generateSignal(
    timestampIndex: number,
    currentSpread: number,
    hedgeRatio: number,
    ouParams: OuParameters
  ): StatArbSignal {
    const stdDev = Math.sqrt(ouParams.equilibriumVariance);
    if (stdDev <= 0) {
      return {
        timestampIndex,
        spreadValue: currentSpread,
        zScore: 0,
        action: 'HOLD',
        targetWeightA: 0,
        targetWeightB: 0,
      };
    }

    const zScore = (currentSpread - ouParams.mu) / stdDev;

    let action: StatArbSignal['action'] = 'HOLD';
    let targetWeightA = 0;
    let targetWeightB = 0;

    if (Math.abs(zScore) >= this.stopLossZThreshold) {
      action = 'STOP_LOSS';
    } else if (zScore >= this.entryZThreshold) {
      // Spread is too high -> Short A, Long B
      action = 'SHORT_SPREAD';
      targetWeightA = -1.0;
      targetWeightB = hedgeRatio;
    } else if (zScore <= -this.entryZThreshold) {
      // Spread is too low -> Long A, Short B
      action = 'LONG_SPREAD';
      targetWeightA = 1.0;
      targetWeightB = -hedgeRatio;
    } else if (Math.abs(zScore) <= this.exitZThreshold) {
      action = 'CLOSE';
    }

    return {
      timestampIndex,
      spreadValue: Number(currentSpread.toFixed(6)),
      zScore: Number(zScore.toFixed(4)),
      action,
      targetWeightA: Number(targetWeightA.toFixed(4)),
      targetWeightB: Number(targetWeightB.toFixed(4)),
    };
  }
}
