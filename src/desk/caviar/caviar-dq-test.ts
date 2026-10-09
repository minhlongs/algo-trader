/**
 * Dynamic Quantile (DQ) Test and Kupiec Backtest for CAViaR Models.
 * Seminal paper: Engle & Manganelli (2004) JBES Section 3.
 * Strictly < 150 LOC, zero `:any` types.
 */

import { DynamicQuantileTestResult } from './caviar-types';

export class CaviarDqTester {
  /**
   * Conducts Dynamic Quantile regression hit test and Kupiec POF test.
   */
  public static test(
    returns: readonly number[],
    quantileSeries: readonly number[],
    targetQuantile: number,
    lags: number = 2
  ): DynamicQuantileTestResult {
    const n = returns.length;
    if (n <= lags + 2) {
      throw new Error(`Sample size ${n} too small for DQ test with ${lags} lags`);
    }

    // Hit process: Hit_t = I(y_t < f_t) - theta
    const hits: number[] = new Array(n);
    let rawHitsCount = 0;
    for (let t = 0; t < n; t++) {
      const isHit = returns[t] < quantileSeries[t] ? 1 : 0;
      rawHitsCount += isHit;
      hits[t] = isHit - targetQuantile;
    }

    const empiricalHitRate = rawHitsCount / n;

    // Kupiec (1995) Likelihood Ratio Unconditional Coverage test
    let kupiecLr = 0;
    if (rawHitsCount > 0 && rawHitsCount < n) {
      const p = targetQuantile;
      const pHat = empiricalHitRate;
      const num =
        Math.pow(p, rawHitsCount) * Math.pow(1.0 - p, n - rawHitsCount);
      const denom =
        Math.pow(pHat, rawHitsCount) * Math.pow(1.0 - pHat, n - rawHitsCount);
      kupiecLr = -2.0 * Math.log(Math.max(1e-12, num / denom));
    }
    // Critical value for chi-square with df=1 at 5% significance is 3.841
    const passesUnconditionalCoverage = kupiecLr < 3.841;

    // Regress Hit_t on [constant, Hit_{t-1}, ... Hit_{t-lags}, f_t]
    const effectiveT = n - lags;
    const k = lags + 2; // constant + lags + quantile

    // Build design matrix X and dependent vector Y
    const X: number[][] = [];
    const Y: number[] = [];

    for (let t = lags; t < n; t++) {
      const row: number[] = [1.0]; // Constant
      for (let l = 1; l <= lags; l++) {
        row.push(hits[t - l]);
      }
      row.push(quantileSeries[t]);
      X.push(row);
      Y.push(hits[t]);
    }

    // Compute X'X (k x k) and X'Y (k x 1)
    const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
    const XtY: number[] = new Array(k).fill(0);

    for (let i = 0; i < effectiveT; i++) {
      for (let r = 0; r < k; r++) {
        XtY[r] += X[i][r] * Y[i];
        for (let c = 0; c < k; c++) {
          XtX[r][c] += X[i][r] * X[i][c];
        }
      }
    }

    // Regularized inverse of XtX using ridge diagonal
    for (let r = 0; r < k; r++) {
      XtX[r][r] += 1e-5;
    }

    // Solve for delta = (X'X)^-1 X'Y via Gauss-Jordan elimination
    const delta = this.solveLinearSystem(XtX, XtY);

    // DQ Statistic = (delta' X' Y) / (theta * (1 - theta))
    let explainedSumSq = 0;
    for (let r = 0; r < k; r++) {
      explainedSumSq += delta[r] * XtY[r];
    }

    const varFactor = targetQuantile * (1.0 - targetQuantile);
    const dqStat = Math.max(0, explainedSumSq / varFactor);

    return {
      empiricalHitRate: Math.round(empiricalHitRate * 10000) / 10000,
      targetQuantile,
      sampleSize: n,
      hitCount: rawHitsCount,
      dqStatistic: Math.round(dqStat * 100) / 100,
      degreesOfFreedom: k,
      kupiecLrStatistic: Math.round(kupiecLr * 100) / 100,
      passesUnconditionalCoverage,
    };
  }

  private static solveLinearSystem(A: number[][], b: number[]): number[] {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
      }
      [M[i], M[maxRow]] = [M[maxRow], M[i]];

      const pivot = M[i][i] !== 0 ? M[i][i] : 1e-6;
      for (let k = i; k <= n; k++) M[i][k] /= pivot;

      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = M[k][i];
          for (let j = i; j <= n; j++) M[k][j] -= factor * M[i][j];
        }
      }
    }
    return M.map((row) => row[n]);
  }
}
