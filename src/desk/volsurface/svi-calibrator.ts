import { SviParameters, SviFitResult, VolatilitySlicePoint } from './volsurface-types';

export class SviCalibrator {
  /**
   * Evaluates Raw SVI total variance w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2))
   */
  public evaluateTotalVariance(k: number, params: SviParameters): number {
    const km = k - params.m;
    return params.a + params.b * (params.rho * km + Math.sqrt(km * km + params.sigma * params.sigma));
  }

  /**
   * First derivative dw/dk
   */
  public evaluateFirstDerivative(k: number, params: SviParameters): number {
    const km = k - params.m;
    const root = Math.sqrt(km * km + params.sigma * params.sigma);
    return params.b * (params.rho + km / root);
  }

  /**
   * Second derivative d^2w/dk^2
   */
  public evaluateSecondDerivative(k: number, params: SviParameters): number {
    const km = k - params.m;
    const root = Math.sqrt(km * km + params.sigma * params.sigma);
    return (params.b * params.sigma * params.sigma) / Math.pow(root, 3);
  }

  /**
   * Durrleman's condition for no butterfly arbitrage:
   * g(k) = (1 - k*w'/(2w))^2 - (w'^2 / 4) * (1/w + 1/4) + w''/2 >= 0
   */
  public evaluateDurrlemanCondition(k: number, params: SviParameters): number {
    const w = Math.max(1e-8, this.evaluateTotalVariance(k, params));
    const w1 = this.evaluateFirstDerivative(k, params);
    const w2 = this.evaluateSecondDerivative(k, params);

    const term1 = Math.pow(1 - (k * w1) / (2 * w), 2);
    const term2 = (w1 * w1 / 4) * (1 / w + 0.25);
    const term3 = w2 / 2;

    return term1 - term2 + term3;
  }

  /**
   * Fit SVI parameters to a slice of log-moneyness and total variance
   */
  public calibrateSlice(points: VolatilitySlicePoint[], initialParams?: SviParameters): SviFitResult {
    if (points.length < 3) throw new Error('At least 3 strike points required for SVI calibration');

    let bestParams: SviParameters = initialParams ?? {
      a: 0.04,
      b: 0.1,
      rho: -0.3,
      m: 0.0,
      sigma: 0.1,
    };

    let bestRmse = this.computeRmse(points, bestParams);

    // Coordinate descent / grid search refinement around initial guess
    const steps = [
      { param: 'a' as const, delta: 0.005, min: 0.001, max: 0.5 },
      { param: 'b' as const, delta: 0.01, min: 0.001, max: 1.0 },
      { param: 'rho' as const, delta: 0.05, min: -0.99, max: 0.99 },
      { param: 'm' as const, delta: 0.01, min: -0.5, max: 0.5 },
      { param: 'sigma' as const, delta: 0.01, min: 0.01, max: 0.8 },
    ];

    for (let iter = 0; iter < 15; iter++) {
      let improved = false;
      for (const step of steps) {
        for (const dir of [-1, 1]) {
          const testParams = { ...bestParams };
          testParams[step.param] = Math.max(step.min, Math.min(step.max, testParams[step.param] + dir * step.delta * Math.pow(0.85, iter)));
          const rmse = this.computeRmse(points, testParams);
          if (rmse < bestRmse) {
            bestRmse = rmse;
            bestParams = testParams;
            improved = true;
          }
        }
      }
      if (!improved && iter > 5) break;
    }

    let maxError = 0;
    let minDurrleman = Infinity;
    for (const p of points) {
      const modelW = this.evaluateTotalVariance(p.logMoneyness, bestParams);
      const err = Math.abs(modelW - p.totalVariance);
      if (err > maxError) maxError = err;
      const g = this.evaluateDurrlemanCondition(p.logMoneyness, bestParams);
      if (g < minDurrleman) minDurrleman = g;
    }

    return {
      parameters: bestParams,
      rmse: Number(bestRmse.toFixed(6)),
      maxError: Number(maxError.toFixed(6)),
      noButterflyArbitrage: minDurrleman >= 0,
    };
  }

  private computeRmse(points: VolatilitySlicePoint[], params: SviParameters): number {
    let sse = 0;
    for (const p of points) {
      const w = this.evaluateTotalVariance(p.logMoneyness, params);
      const diff = w - p.totalVariance;
      sse += diff * diff;
    }
    return Math.sqrt(sse / points.length);
  }
}
