/**
 * ISDA SIMM v2.6 Initial & Variation Margin Engine
 * Sensitivity-based Initial Margin calculation aggregating Delta, Vega, and Curvature risk with concentration scaling.
 *
 * @module desk/margin/isda-simm-engine
 */

import { SensitivityBucket, IsdaSimmMarginResult } from './margin-types';

export class IsdaSimmEngine {
  /**
   * Computes ISDA SIMM v2.6 Initial Margin across delta, vega, and curvature sensitivities.
   */
  public computeInitialMargin(
    buckets: SensitivityBucket[],
    interBucketCorrelation = 0.50,
    concentrationThresholdUsd = 10_000_000
  ): IsdaSimmMarginResult {
    if (buckets.length === 0) {
      throw new Error('At least one sensitivity bucket is required');
    }

    let netWeightedDeltaTotal = 0;
    let netWeightedVegaTotal = 0;
    let netWeightedCurvatureTotal = 0;

    const weightedDeltas: number[] = [];
    const weightedVegas: number[] = [];
    const weightedCurvatures: number[] = [];

    for (const b of buckets) {
      if (b.riskWeight < 0) {
        throw new Error('Risk weight cannot be negative');
      }
      const wDelta = b.netDeltaSensitivity * b.riskWeight;
      const wVega = b.vegaSensitivity * b.riskWeight;
      const wCurv = b.curvatureSensitivity * b.riskWeight;

      weightedDeltas.push(wDelta);
      weightedVegas.push(wVega);
      weightedCurvatures.push(wCurv);

      netWeightedDeltaTotal += Math.abs(wDelta);
      netWeightedVegaTotal += Math.abs(wVega);
      netWeightedCurvatureTotal += Math.abs(wCurv);
    }

    // Concentration scaling factor
    const concentrationScaleFactor = Math.max(
      1.0,
      Math.sqrt(Math.max(1.0, netWeightedDeltaTotal / concentrationThresholdUsd))
    );

    // Delta risk margin via correlation aggregation
    const deltaMarginUsd = this.aggregateSensitivities(weightedDeltas, interBucketCorrelation) * concentrationScaleFactor;
    const vegaMarginUsd = this.aggregateSensitivities(weightedVegas, interBucketCorrelation);
    const curvatureMarginUsd = this.aggregateSensitivities(weightedCurvatures, interBucketCorrelation);

    const totalInitialMarginUsd = Number(
      Math.sqrt(deltaMarginUsd * deltaMarginUsd + vegaMarginUsd * vegaMarginUsd + curvatureMarginUsd * curvatureMarginUsd).toFixed(2)
    );

    return {
      deltaMarginUsd: Number(deltaMarginUsd.toFixed(2)),
      vegaMarginUsd: Number(vegaMarginUsd.toFixed(2)),
      curvatureMarginUsd: Number(curvatureMarginUsd.toFixed(2)),
      totalInitialMarginUsd,
      concentrationScaleFactor: Number(concentrationScaleFactor.toFixed(4)),
    };
  }

  /**
   * Variation Margin calculation: simple daily mark-to-market difference.
   */
  public computeVariationMargin(priorNavUsd: number, currentNavUsd: number): number {
    return Number((priorNavUsd - currentNavUsd).toFixed(2));
  }

  private aggregateSensitivities(sensitivities: number[], correlation: number): number {
    let variance = 0;
    for (let i = 0; i < sensitivities.length; i++) {
      for (let j = 0; j < sensitivities.length; j++) {
        const si = sensitivities[i] ?? 0;
        const sj = sensitivities[j] ?? 0;
        const rho = i === j ? 1.0 : correlation;
        variance += si * sj * rho;
      }
    }
    return Math.sqrt(Math.max(0, variance));
  }
}
