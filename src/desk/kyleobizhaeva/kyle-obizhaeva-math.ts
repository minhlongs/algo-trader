/**
 * Wave 217: Kyle & Obizhaeva (2016) Microstructure Invariance Math.
 *
 * Implements 3/2 power-law scaling and universal dimensional invariance.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import {
  MicrostructureInvarianceConfig,
  InvarianceScaleMetrics,
  OrderImpactEvaluation,
} from './kyle-obizhaeva-types';

export class KyleObizhaevaMath {
  /**
   * Calculates structural invariance metrics W, Q_*, N_*, and spread.
   */
  public static calculateInvarianceMetrics(
    config: MicrostructureInvarianceConfig,
  ): InvarianceScaleMetrics {
    const P = Math.max(0.01, config.spotPrice);
    const ADV = Math.max(1.0, config.averageDailyVolume);
    const sigma = Math.max(0.0001, config.dailyVolatility);
    const gamma = config.calibrationConstantGamma ?? 0.25;

    const dollarVolumeUsd = P * ADV;
    const tradingVelocityV = dollarVolumeUsd / 1_000_000;
    const dollarVolatilityW = tradingVelocityV * sigma;

    // Characteristic bet size Q_* proportional to (W / 30*10^6)^(1/3)
    // Normalized by unit price to get shares
    const invariantExponent = 1.0 / 3.0;
    const normalizedW = Math.max(1e-8, dollarVolatilityW / 30.0);
    const characteristicBetSizeUsd = gamma * 1_000_000 * Math.pow(normalizedW, invariantExponent);
    const characteristicBetSizeShares = Math.max(1.0, characteristicBetSizeUsd / P);
    const expectedBetsPerDay = Math.max(0.1, ADV / characteristicBetSizeShares);

    // Invariant bid-ask spread: proportional to sigma * (W / 30)^(-1/3)
    const invariantSpreadFraction = 0.5 * sigma * Math.pow(normalizedW, -invariantExponent);
    const spreadEstimateBps = invariantSpreadFraction * 10_000;

    return {
      dollarVolumeUsd: Math.round(dollarVolumeUsd),
      dollarVolatilityW: Number(dollarVolatilityW.toFixed(4)),
      tradingVelocityV: Number(tradingVelocityV.toFixed(4)),
      characteristicBetSizeShares: Math.round(characteristicBetSizeShares),
      characteristicBetSizeUsd: Math.round(characteristicBetSizeUsd),
      expectedBetsPerDay: Number(expectedBetsPerDay.toFixed(2)),
      spreadEstimateBps: Number(spreadEstimateBps.toFixed(2)),
    };
  }

  /**
   * Evaluates expected 3/2 dimensional price impact for order Q.
   */
  public static evaluateOrderImpact(
    orderSizeShares: number,
    config: MicrostructureInvarianceConfig,
    metrics: InvarianceScaleMetrics,
  ): OrderImpactEvaluation {
    const Q = Math.max(0, orderSizeShares);
    const P = Math.max(0.01, config.spotPrice);
    const Q_star = Math.max(1, metrics.characteristicBetSizeShares);
    const normalizedRatio = Q / Q_star;

    // Price impact scaling: delta P / P ~ sigma * sqrt(Q / Q_star)
    const impactFraction = config.dailyVolatility * Math.sqrt(normalizedRatio);
    const expectedImpactBps = Number((impactFraction * 10_000).toFixed(2));
    const totalExecutionCostUsd = Number((Q * P * (impactFraction * 0.5)).toFixed(2));

    let invarianceScaleRegime: 'MICRO_ORDER' | 'NORMAL_BET' | 'LARGE_BLOCK';
    if (normalizedRatio < 0.2) {
      invarianceScaleRegime = 'MICRO_ORDER';
    } else if (normalizedRatio <= 2.5) {
      invarianceScaleRegime = 'NORMAL_BET';
    } else {
      invarianceScaleRegime = 'LARGE_BLOCK';
    }

    return {
      orderSizeShares: Q,
      normalizedSizeRatio: Number(normalizedRatio.toFixed(3)),
      expectedImpactBps,
      totalExecutionCostUsd,
      invarianceScaleRegime,
    };
  }
}
