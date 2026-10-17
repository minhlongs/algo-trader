/**
 * Joel Hasbrouck (1991) VAR / VECM Linear Algebra & Estimation Math.
 * Strictly < 180 LOC, zero :any types.
 */

export class HasbrouckVecmMath {
  /**
   * Solves linear system (X^T * X + lambda * I) * beta = X^T * Y using Gaussian elimination.
   */
  public static solveOlsWithRidge(
    X: readonly (readonly number[])[],
    y: readonly number[],
    ridgeLambda = 1e-7
  ): readonly number[] {
    const N = X.length;
    if (N === 0) throw new Error('X matrix must not be empty');
    const p = X[0].length;
    if (y.length !== N) throw new Error('y length must match X rows');

    // Compute Normal equations: XtX (p x p) and Xty (p x 1)
    const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
    const Xty: number[] = Array(p).fill(0);

    for (let i = 0; i < N; i++) {
      const row = X[i];
      const yi = y[i];
      for (let j = 0; j < p; j++) {
        Xty[j] += row[j] * yi;
        for (let k = 0; k < p; k++) {
          XtX[j][k] += row[j] * row[k];
        }
      }
    }

    // Add ridge penalty to diagonal
    for (let j = 0; j < p; j++) {
      XtX[j][j] += ridgeLambda;
    }

    // Gaussian elimination with partial pivoting
    const A: number[][] = XtX.map((row) => [...row]);
    const b: number[] = [...Xty];

    for (let col = 0; col < p; col++) {
      // Find pivot
      let maxRow = col;
      let maxVal = Math.abs(A[col][col]);
      for (let r = col + 1; r < p; r++) {
        const absVal = Math.abs(A[r][col]);
        if (absVal > maxVal) {
          maxVal = absVal;
          maxRow = r;
        }
      }

      if (maxVal < 1e-12) {
        throw new Error(`Singular matrix at column ${col}`);
      }

      // Swap rows
      if (maxRow !== col) {
        const tmpA = A[col];
        A[col] = A[maxRow];
        A[maxRow] = tmpA;
        const tmpB = b[col];
        b[col] = b[maxRow];
        b[maxRow] = tmpB;
      }

      // Eliminate below
      const pivot = A[col][col];
      for (let r = col + 1; r < p; r++) {
        const factor = A[r][col] / pivot;
        b[r] -= factor * b[col];
        for (let c = col; c < p; c++) {
          A[r][c] -= factor * A[col][c];
        }
      }
    }

    // Back substitution
    const beta: number[] = Array(p).fill(0);
    for (let r = p - 1; r >= 0; r--) {
      let sum = b[r];
      for (let c = r + 1; c < p; c++) {
        sum -= A[r][c] * beta[c];
      }
      beta[r] = sum / A[r][r];
    }

    return beta;
  }

  /**
   * Computes sample mean, variance and covariance of two residual series.
   */
  public static computeResidualCovariance(
    e1: readonly number[],
    e2: readonly number[]
  ): { sigma1Sq: number; sigma2Sq: number; cov12: number } {
    const N = e1.length;
    if (N === 0 || e2.length !== N) {
      throw new Error('Residual arrays must be non-empty and equal length');
    }

    let mean1 = 0;
    let mean2 = 0;
    for (let i = 0; i < N; i++) {
      mean1 += e1[i];
      mean2 += e2[i];
    }
    mean1 /= N;
    mean2 /= N;

    let var1 = 0;
    let var2 = 0;
    let cov = 0;
    for (let i = 0; i < N; i++) {
      const d1 = e1[i] - mean1;
      const d2 = e2[i] - mean2;
      var1 += d1 * d1;
      var2 += d2 * d2;
      cov += d1 * d2;
    }
    const df = N > 1 ? N - 1 : 1;
    return {
      sigma1Sq: var1 / df,
      sigma2Sq: var2 / df,
      cov12: cov / df,
    };
  }

  /**
   * Lower triangular Cholesky factorization of a 2x2 symmetric positive definite matrix:
   * [ sigma1Sq  cov12   ]   [ L11   0   ] [ L11  L21 ]
   * [ cov12    sigma2Sq ] = [ L21  L22 ] [  0   L22 ]
   *
   * Hasbrouck (1991) orthogonalization ordering: trade shock is first (or quote is first).
   * In standard Hasbrouck (1991), trades drive quote adjustments contemporaneously:
   * v_2 = e_trade, v_1 = e_midpoint.
   */
  public static cholesky2x2(
    s11: number,
    s22: number,
    s12: number
  ): { l11: number; l21: number; l22: number } {
    if (s11 <= 0) throw new Error('s11 must be positive');
    const l11 = Math.sqrt(s11);
    const l21 = s12 / l11;
    const l22Sq = s22 - l21 * l21;
    const l22 = l22Sq > 0 ? Math.sqrt(l22Sq) : 0;
    return { l11, l21, l22 };
  }
}
