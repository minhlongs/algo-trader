/**
 * Engle (2002) Dynamic Conditional Correlation (DCC-GARCH) Engine.
 * Strictly < 180 LOC, zero :any types.
 */

import { calibrateDcc } from './dcc-calibrator';
import { evaluateDccSeries } from './dcc-math';
import { DccFitResult, DccParams, DccStepPoint } from './dcc-types';

export class DccGarchEngine {
  public fit(
    standardizedResiduals: readonly (readonly number[])[],
    volatilities: readonly (readonly number[])[],
    initParams?: Partial<DccParams>
  ): DccFitResult {
    return calibrateDcc(standardizedResiduals, volatilities, initParams);
  }

  public computeDynamicHedgeRatios(
    fitResult: DccFitResult
  ): readonly { t: number; hedgeRatio: number; correlation: number }[] {
    return fitResult.series.map((pt) => ({
      t: pt.t,
      hedgeRatio: pt.dynamicHedgeRatio12,
      correlation: pt.correlationMatrix[0][1],
    }));
  }

  public forecastNextCorrelation(
    fitResult: DccFitResult,
    lastResiduals: readonly number[]
  ): {
    predictedCorrelationMatrix: readonly (readonly number[])[];
    predictedHedgeRatio12: number;
    volatility1: number;
    volatility2: number;
  } {
    const k = lastResiduals.length;
    const { params, unconditionalCorrelation, series } = fitResult;
    const lastPoint = series[series.length - 1];
    const prevR = lastPoint?.correlationMatrix ?? unconditionalCorrelation;

    // One-step forward forecast of Q:
    // Q_{t+1} = (1 - alpha - beta)*Q_bar + alpha * (z_t z_t^T) + beta * Q_t
    const omegaWeight = 1.0 - params.alpha - params.beta;
    const nextQ: number[][] = Array.from({ length: k }, () => Array(k).fill(0));

    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const outerZ = lastResiduals[i] * lastResiduals[j];
        nextQ[i][j] =
          omegaWeight * unconditionalCorrelation[i][j] +
          params.alpha * outerZ +
          params.beta * prevR[i][j];
      }
    }

    const predictedR: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        if (i === j) {
          predictedR[i][j] = 1.0;
        } else {
          const denom = Math.sqrt(Math.max(1e-8, nextQ[i][i] * nextQ[j][j]));
          predictedR[i][j] = Math.max(-0.999, Math.min(0.999, nextQ[i][j] / denom));
        }
      }
    }

    const lastCov = lastPoint?.covarianceMatrix ?? [[1, 0], [0, 1]];
    const vol1 = Math.sqrt(Math.max(1e-8, lastCov[0][0]));
    const vol2 = Math.sqrt(Math.max(1e-8, lastCov[1][1]));
    const predictedH12 = vol1 * vol2 * predictedR[0][1];
    const predictedH22 = vol2 * vol2;
    const predictedHedgeRatio12 = predictedH12 / Math.max(1e-8, predictedH22);

    return {
      predictedCorrelationMatrix: predictedR,
      predictedHedgeRatio12,
      volatility1: vol1,
      volatility2: vol2,
    };
  }
}
