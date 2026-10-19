/**
 * Daniel B. Nelson (1991) EGARCH Volatility Engine.
 * Strictly < 180 LOC, zero :any types.
 */

import { calibrateEgarch } from './egarch-calibrator';
import {
  computeUnconditionalEgarchVariance,
  forecastEgarchPath,
} from './egarch-math';
import {
  EgarchFitResult,
  EgarchForecastResult,
  EgarchParams,
} from './egarch-types';

export class EgarchVolatilityEngine {
  public fit(
    returns: readonly number[],
    initParams?: Partial<EgarchParams>
  ): EgarchFitResult {
    return calibrateEgarch(returns, initParams);
  }

  public forecast(
    fitResult: EgarchFitResult,
    horizon: number
  ): EgarchForecastResult {
    if (horizon <= 0) {
      throw new Error('Forecast horizon must be positive integer');
    }
    const lastPoint = fitResult.series[fitResult.series.length - 1];
    const lastLogVar = lastPoint?.condLogVar ?? Math.log(fitResult.unconditionalVariance);

    const forecasts = forecastEgarchPath(lastLogVar, fitResult.params, horizon);
    const longRunVariance = computeUnconditionalEgarchVariance(fitResult.params);

    return {
      horizon,
      longRunVariance,
      forecasts,
    };
  }

  public evaluateAsymmetry(fitResult: EgarchFitResult): {
    leverageDetected: boolean;
    leverageSignificance: 'STRONG_LEVERAGE' | 'MODERATE_LEVERAGE' | 'NEGLIGIBLE';
    impactRatio: number; // Ratio of negative shock impact vs positive shock impact: (|alpha - gamma|) / (|alpha + gamma|)
  } {
    const { alpha, gamma } = fitResult.params;
    const leverageDetected = gamma < -1e-4;

    // For negative z = -1: g(-1) = alpha(1 - sqrt(2/pi)) - gamma
    // For positive z = +1: g(+1) = alpha(1 - sqrt(2/pi)) + gamma
    // When gamma < 0, g(-1) > g(+1), meaning negative returns elevate variance more
    const posImpact = Math.max(1e-6, alpha * 0.2021 + gamma);
    const negImpact = Math.max(1e-6, alpha * 0.2021 - gamma);
    const impactRatio = negImpact / posImpact;

    let leverageSignificance: 'STRONG_LEVERAGE' | 'MODERATE_LEVERAGE' | 'NEGLIGIBLE' = 'NEGLIGIBLE';
    if (gamma < -0.05) {
      leverageSignificance = 'STRONG_LEVERAGE';
    } else if (gamma < -0.01) {
      leverageSignificance = 'MODERATE_LEVERAGE';
    }

    return {
      leverageDetected,
      leverageSignificance,
      impactRatio,
    };
  }
}
