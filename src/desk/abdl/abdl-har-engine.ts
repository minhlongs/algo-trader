/**
 * Corsi (2009) HAR-RV Multi-Horizon Volatility Engine with OLS Calibration and Forecasting.
 * Strictly < 150 LOC, zero :any types.
 */

import { HarForecastResult, HarObservationRow, HarRegressionCoefficients } from './abdl-types';

export class AbdlHarEngine {
  /**
   * Fits HAR-RV OLS model: y = beta0 + betaDaily * x_d + betaWeekly * x_w + betaMonthly * x_m + eps
   */
  public fit(dataset: HarObservationRow[]): HarRegressionCoefficients {
    const N = dataset.length;
    if (N < 10) {
      throw new Error(`At least 10 observation rows required for robust OLS (got ${N})`);
    }

    // Design matrix X with 4 columns [1, rvDaily, rvWeekly, rvMonthly]
    const P = 4;
    const xtx: number[][] = Array.from({ length: P }, () => new Array(P).fill(0.0));
    const xty: number[] = new Array(P).fill(0.0);

    let ySum = 0.0;
    for (let i = 0; i < N; i++) {
      const row = dataset[i]!;
      const x = [1.0, row.rvDaily, row.rvWeekly, row.rvMonthly];
      const y = row.targetRv;
      ySum += y;

      for (let r = 0; r < P; r++) {
        xty[r] += x[r]! * y;
        for (let c = 0; c < P; c++) {
          xtx[r]![c] += x[r]! * x[c]!;
        }
      }
    }

    const beta = this.solveLinearSystem(xtx, xty);
    const yMean = ySum / N;

    let ssTot = 0.0;
    let ssRes = 0.0;
    for (let i = 0; i < N; i++) {
      const row = dataset[i]!;
      const y = row.targetRv;
      const yPred = beta[0]! + beta[1]! * row.rvDaily + beta[2]! * row.rvWeekly + beta[3]! * row.rvMonthly;
      const res = y - yPred;
      ssRes += res * res;
      ssTot += (y - yMean) * (y - yMean);
    }

    const rSquared = ssTot > 0 ? Math.max(0.0, 1.0 - ssRes / ssTot) : 0.0;
    const residualVar = ssRes / Math.max(1, N - P);

    return {
      beta0: Number(beta[0]!.toFixed(6)),
      betaDaily: Number(beta[1]!.toFixed(4)),
      betaWeekly: Number(beta[2]!.toFixed(4)),
      betaMonthly: Number(beta[3]!.toFixed(4)),
      rSquared: Number(rSquared.toFixed(4)),
      residualVariance: Number(residualVar.toFixed(8)),
    };
  }

  /**
   * Generates out-of-sample 1-day forecast using latest observation and estimated coefficients.
   */
  public forecast(
    latestRow: HarObservationRow,
    coefficients: HarRegressionCoefficients,
    datasetForMetrics: HarObservationRow[] = [],
  ): HarForecastResult {
    const rawPred =
      coefficients.beta0 +
      coefficients.betaDaily * latestRow.rvDaily +
      coefficients.betaWeekly * latestRow.rvWeekly +
      coefficients.betaMonthly * latestRow.rvMonthly;

    // Volatility variance cannot be negative
    const predictedRv = Math.max(1e-8, rawPred);
    const predictedVol = Math.sqrt(predictedRv);

    let rmse = 0.0, mae = 0.0;
    if (datasetForMetrics.length > 0) {
      let sumSq = 0.0, sumAbs = 0.0;
      for (const row of datasetForMetrics) {
        const yPred = coefficients.beta0 + coefficients.betaDaily * row.rvDaily +
          coefficients.betaWeekly * row.rvWeekly + coefficients.betaMonthly * row.rvMonthly;
        const err = row.targetRv - yPred;
        sumSq += err * err;
        sumAbs += Math.abs(err);
      }
      rmse = Math.sqrt(sumSq / datasetForMetrics.length);
      mae = sumAbs / datasetForMetrics.length;
    }

    return {
      predictedRv: Number(predictedRv.toFixed(6)),
      predictedVolatility: Number(predictedVol.toFixed(6)),
      horizonDays: 1,
      coefficients,
      mincerZarnowitzR2: coefficients.rSquared,
      rmse: Number(rmse.toFixed(6)),
      mae: Number(mae.toFixed(6)),
    };
  }

  /**
   * Solves A * x = b via Gaussian elimination with partial pivoting.
   */
  private solveLinearSystem(A: number[][], b: number[]): number[] {
    const n = b.length;
    const M: number[][] = A.map((row, i) => [...row, b[i]!]);

    for (let k = 0; k < n; k++) {
      let maxRow = k;
      for (let i = k + 1; i < n; i++) {
        if (Math.abs(M[i]![k]!) > Math.abs(M[maxRow]![k]!)) maxRow = i;
      }
      if (maxRow !== k) {
        const tmp = M[k]!;
        M[k] = M[maxRow]!;
        M[maxRow] = tmp;
      }

      const pivot = M[k]![k]!;
      if (Math.abs(pivot) < 1e-12) continue;

      for (let i = k + 1; i < n; i++) {
        const factor = M[i]![k]! / pivot;
        for (let j = k; j <= n; j++) {
          M[i]![j] -= factor * M[k]![j]!;
        }
      }
    }

    const x = new Array(n).fill(0.0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = M[i]![n]!;
      for (let j = i + 1; j < n; j++) {
        sum -= M[i]![j]! * x[j]!;
      }
      x[i] = Math.abs(M[i]![i]!) > 1e-12 ? sum / M[i]![i]! : 0.0;
    }
    return x;
  }
}
