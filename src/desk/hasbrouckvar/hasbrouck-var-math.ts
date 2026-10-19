/**
 * Mathematical kernels for Hasbrouck (1991) VAR & VMA Inversion.
 * Strictly < 140 LOC, zero external dependencies, zero :any.
 */

export class HasbrouckVarMath {
  /**
   * Solves linear system A * x = b using Gaussian elimination with partial pivoting.
   */
  public static solveLinearSystem(A: number[][], b: number[]): number[] {
    const n = A.length;
    const M: number[][] = A.map((row, i) => [...row, b[i]]);

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
          maxRow = k;
        }
      }
      const tmp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = tmp;

      const pivot = M[i][i];
      if (Math.abs(pivot) < 1e-12) {
        continue; // Singular or degenerate column
      }

      for (let j = i; j <= n; j++) {
        M[i][j] /= pivot;
      }

      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = M[k][i];
          for (let j = i; j <= n; j++) {
            M[k][j] -= factor * M[i][j];
          }
        }
      }
    }

    return M.map(row => row[n]);
  }

  /**
   * Ordinary Least Squares regression: beta = (X^T * X)^(-1) * X^T * y
   */
  public static estimateOls(X: number[][], y: number[]): number[] {
    const n = X.length;
    const k = X[0]?.length ?? 0;
    if (n === 0 || k === 0) return [];

    // Compute X^T * X and X^T * y
    const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    const Xty: number[] = Array(k).fill(0);

    for (let row = 0; row < n; row++) {
      const xr = X[row];
      const yr = y[row];
      for (let i = 0; i < k; i++) {
        Xty[i] += xr[i] * yr;
        for (let j = 0; j < k; j++) {
          XtX[i][j] += xr[i] * xr[j];
        }
      }
    }

    // Regularize slightly on diagonal for numerical stability
    for (let i = 0; i < k; i++) {
      XtX[i][i] += 1e-9;
    }

    return this.solveLinearSystem(XtX, Xty);
  }

  /**
   * Simulates impulse response function (IRF) to a unit trade innovation shock (v_0 = 1).
   */
  public static computeImpulseResponse(
    ar_r: number[], // r on past r
    ar_x: number[], // r on past x
    c0: number,     // contemporaneous r on x_0
    br_r: number[], // x on past r
    br_x: number[], // x on past x
    p: number,
    horizon: number
  ): { irfQuote: number[]; irfTrade: number[] } {
    const irfQuote: number[] = new Array(horizon + 1).fill(0);
    const irfTrade: number[] = new Array(horizon + 1).fill(0);

    // Initial shock at t = 0
    irfTrade[0] = 1.0;
    irfQuote[0] = c0 * irfTrade[0];

    for (let t = 1; t <= horizon; t++) {
      let x_t = 0;
      let r_t = 0;

      for (let lag = 1; lag <= p; lag++) {
        if (t - lag >= 0) {
          x_t += br_r[lag - 1] * irfQuote[t - lag] + br_x[lag - 1] * irfTrade[t - lag];
          r_t += ar_r[lag - 1] * irfQuote[t - lag] + ar_x[lag - 1] * irfTrade[t - lag];
        }
      }

      irfTrade[t] = x_t;
      r_t += c0 * x_t; // Contemporaneous feedback from trade at time t
      irfQuote[t] = r_t;
    }

    return { irfQuote, irfTrade };
  }

  /**
   * Computes sample variance of an array of numbers.
   */
  public static variance(values: readonly number[]): number {
    if (values.length <= 1) return 0;
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    const ss = values.reduce((acc, v) => acc + (v - mean) ** 2, 0);
    return ss / (values.length - 1);
  }
}
