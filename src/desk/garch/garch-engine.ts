/**
 * GARCH & GJR-GARCH Volatility Engine.
 * High-level forecasting, multi-step term structure, and calibration.
 * Strictly < 180 LOC, zero :any types.
 */

import {
  GarchFitResult,
  GarchForecastResult,
  GarchForecastStep,
  GarchModelType,
  GjrGarchParams,
} from './garch-types';
import {
  calculateAicBic,
  calculateLogLikelihood,
  calculatePersistence,
  calculateUnconditionalVariance,
  calculateVariancesAndResiduals,
} from './garch-math';
import { calibrateGarch } from './garch-calibrator';

export class GarchVolatilityEngine {
  public fitStandard(returns: readonly number[]): GarchFitResult {
    return calibrateGarch(returns, 'STANDARD_GARCH');
  }

  public fitGjr(returns: readonly number[]): GarchFitResult {
    return calibrateGarch(returns, 'GJR_GARCH');
  }

  public evaluateWithParams(
    returns: readonly number[],
    params: GjrGarchParams,
    modelType: GarchModelType = 'STANDARD_GARCH'
  ): GarchFitResult {
    const n = returns.length;
    const { variances, residuals } = calculateVariancesAndResiduals(returns, params);
    const ll = calculateLogLikelihood(returns, params);
    const persistence = calculatePersistence(params);
    const unconditionalVariance = calculateUnconditionalVariance(params);
    const annualizedLongRunVol = Math.sqrt(Math.max(0, unconditionalVariance) * 252);
    const numParams = modelType === 'GJR_GARCH' ? 4 : 3;
    const { aic, bic } = calculateAicBic(ll, numParams, n);

    return {
      modelType,
      params,
      logLikelihood: ll,
      aic,
      bic,
      persistence,
      unconditionalVariance,
      annualizedLongRunVol,
      isStationary: persistence < 1.0,
      conditionalVariances: variances,
      residuals,
    };
  }

  public forecast(fit: GarchFitResult, horizon: number): GarchForecastResult {
    if (horizon <= 0) {
      throw new Error(`Forecast horizon must be positive: ${horizon}`);
    }

    const currentVariance =
      fit.conditionalVariances.length > 0
        ? fit.conditionalVariances[fit.conditionalVariances.length - 1]
        : fit.unconditionalVariance;

    const longRun = fit.unconditionalVariance;
    const persistence = fit.persistence;
    const steps: GarchForecastStep[] = [];

    let prevForecastVar = currentVariance;

    for (let h = 1; h <= horizon; h++) {
      // Mean-reversion formula: sigma_{t+h}^2 = sigma_L^2 + P^h * (sigma_t^2 - sigma_L^2)
      let stepVar: number;
      if (Number.isFinite(longRun)) {
        stepVar = longRun + Math.pow(persistence, h) * (currentVariance - longRun);
      } else {
        stepVar = prevForecastVar;
      }

      stepVar = Math.max(1e-8, stepVar);
      const vol = Math.sqrt(stepVar);
      const annualizedVol = vol * Math.sqrt(252);

      steps.push({
        step: h,
        variance: stepVar,
        volatility: vol,
        annualizedVol,
      });

      prevForecastVar = stepVar;
    }

    return {
      modelType: fit.modelType,
      horizon,
      currentVariance,
      longRunVariance: longRun,
      steps,
    };
  }
}
