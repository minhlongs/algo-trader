export class PsMath {
  /**
   * Ordinary Least Squares linear regression via Normal Equations: y = X * beta + eps
   * Returns coefficients, standard errors, t-statistics, and R-squared.
   */
  public static ols(
    y: number[],
    X: number[][] // N x K matrix (including intercept column if needed)
  ): { beta: number[]; se: number[]; tStats: number[]; rSquared: number } {
    const N = y.length;
    const K = X[0].length;
    if (N <= K) throw new Error('Sample size must exceed number of regressors');

    // Compute X^T * X (K x K) and X^T * y (K x 1)
    const XtX: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
    const Xty: number[] = new Array(K).fill(0);

    for (let i = 0; i < N; i++) {
      const yi = y[i];
      for (let j = 0; j < K; j++) {
        Xty[j] += X[i][j] * yi;
        for (let l = 0; l < K; l++) {
          XtX[j][l] += X[i][j] * X[i][l];
        }
      }
    }

    // Invert XtX (using Gaussian elimination with partial pivoting)
    const invXtX = this.invertMatrix(XtX);

    // beta = invXtX * Xty
    const beta: number[] = new Array(K).fill(0);
    for (let i = 0; i < K; i++) {
      for (let j = 0; j < K; j++) {
        beta[i] += invXtX[i][j] * Xty[j];
      }
    }

    // Residuals and variance
    let ssRes = 0;
    let sumY = 0;
    for (let i = 0; i < N; i++) {
      sumY += y[i];
      let yPred = 0;
      for (let j = 0; j < K; j++) {
        yPred += X[i][j] * beta[j];
      }
      const res = y[i] - yPred;
      ssRes += res * res;
    }

    const meanY = sumY / N;
    let ssTot = 0;
    for (let i = 0; i < N; i++) {
      ssTot += (y[i] - meanY) * (y[i] - meanY);
    }

    const sigmaSq = ssRes / (N - K);
    const se: number[] = new Array(K).fill(0);
    const tStats: number[] = new Array(K).fill(0);

    for (let j = 0; j < K; j++) {
      const varBeta = Math.max(0, sigmaSq * invXtX[j][j]);
      se[j] = Math.sqrt(varBeta);
      tStats[j] = se[j] > 1e-12 ? beta[j] / se[j] : 0;
    }

    const rSquared = ssTot > 1e-12 ? Math.max(0, Math.min(1.0, 1.0 - ssRes / ssTot)) : 0;

    return { beta, se, tStats, rSquared };
  }

  public static invertMatrix(A: number[][]): number[][] {
    const n = A.length;
    const M: number[][] = A.map((row, i) => {
      const aug = [...row, ...new Array(n).fill(0)];
      aug[n + i] = 1;
      return aug;
    });

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
          maxRow = k;
        }
      }
      const temp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = temp;

      const pivot = M[i][i];
      if (Math.abs(pivot) < 1e-14) throw new Error('Singular matrix in regression inversion');

      for (let j = 0; j < 2 * n; j++) {
        M[i][j] /= pivot;
      }

      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        const factor = M[k][i];
        for (let j = 0; j < 2 * n; j++) {
          M[k][j] -= factor * M[i][j];
        }
      }
    }

    return M.map(row => row.slice(n));
  }
}
