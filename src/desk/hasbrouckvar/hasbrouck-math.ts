export class HasbrouckMath {
  public static solveOls(X: number[][], y: number[], ridge = 1e-6): number[] {
    const n = X.length;
    const k = X[0].length;

    // XtX = X^T * X + ridge * I
    const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
    const Xty: number[] = Array(k).fill(0);

    for (let i = 0; i < n; i++) {
      const xi = X[i];
      const yi = y[i];
      for (let j = 0; j < k; j++) {
        Xty[j] += xi[j] * yi;
        for (let l = 0; l < k; l++) {
          XtX[j][l] += xi[j] * xi[l];
        }
      }
    }

    for (let j = 0; j < k; j++) {
      XtX[j][j] += ridge;
    }

    // Solve XtX * beta = Xty using Gaussian elimination with partial pivoting
    return this.solveLinearSystem(XtX, Xty);
  }

  public static solveLinearSystem(A: number[][], b: number[]): number[] {
    const n = A.length;
    const M = A.map((row, i) => [...row, b[i]]);

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
      if (Math.abs(pivot) < 1e-12) continue;

      for (let k = i + 1; k < n; k++) {
        const factor = M[k][i] / pivot;
        for (let j = i; j <= n; j++) {
          M[k][j] -= factor * M[i][j];
        }
      }
    }

    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = M[i][n];
      for (let j = i + 1; j < n; j++) {
        sum -= M[i][j] * x[j];
      }
      x[i] = Math.abs(M[i][i]) > 1e-12 ? sum / M[i][i] : 0;
    }
    return x;
  }

  public static computeImpulseResponse(
    alpha: number[],
    beta0: number,
    beta: number[],
    gamma: number[],
    phi: number[],
    shockX: number,
    shockR: number,
    horizon = 25
  ): number[] {
    const p = alpha.length;
    const rHist: number[] = Array(horizon + 1).fill(0);
    const xHist: number[] = Array(horizon + 1).fill(0);

    // Initial shock at step 0
    xHist[0] = shockX;
    rHist[0] = shockR + beta0 * shockX;

    for (let t = 1; t <= horizon; t++) {
      let x_t = 0;
      let r_t = 0;

      for (let lag = 1; lag <= p; lag++) {
        const prevIdx = t - lag;
        if (prevIdx >= 0) {
          x_t += gamma[lag - 1] * rHist[prevIdx] + phi[lag - 1] * xHist[prevIdx];
          r_t += alpha[lag - 1] * rHist[prevIdx] + beta[lag - 1] * xHist[prevIdx];
        }
      }

      xHist[t] = x_t;
      rHist[t] = r_t + beta0 * x_t;
    }

    return rHist;
  }
}
