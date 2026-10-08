export class LsmcMath {
  /**
   * Generates Laguerre polynomial basis evaluated at X
   * L_0(x) = 1
   * L_1(x) = 1 - x
   * L_2(x) = (x^2 - 4x + 2)/2
   * L_3(x) = (-x^3 + 9x^2 - 18x + 6)/6
   */
  public static laguerrePolynomials(x: number, terms: number): number[] {
    const basis: number[] = [];
    if (terms > 0) basis.push(1.0);
    if (terms > 1) basis.push(1.0 - x);
    if (terms > 2) basis.push((x * x - 4.0 * x + 2.0) / 2.0);
    if (terms > 3) basis.push((-Math.pow(x, 3) + 9.0 * x * x - 18.0 * x + 6.0) / 6.0);
    return basis;
  }

  /**
   * Solves linear system A * x = B using Gaussian elimination with partial pivoting.
   * Modifies matrices in place.
   */
  public static solveLinearSystem(A: number[][], B: number[]): number[] {
    const n = B.length;

    // Create augmented matrix
    const mat: number[][] = [];
    for (let i = 0; i < n; i++) {
      mat.push([...A[i]!, B[i]!]);
    }

    // Forward elimination
    for (let p = 0; p < n; p++) {
      // Find pivot
      let max = p;
      for (let i = p + 1; i < n; i++) {
        if (Math.abs(mat[i]![p]!) > Math.abs(mat[max]![p]!)) {
          max = i;
        }
      }

      // Swap rows
      if (max !== p) {
        const temp = mat[p]!;
        mat[p] = mat[max]!;
        mat[max] = temp;
      }

      if (Math.abs(mat[p]![p]!) < 1e-12) {
        throw new Error('Matrix is singular or nearly singular');
      }

      // Eliminate column
      for (let i = p + 1; i < n; i++) {
        const factor = mat[i]![p]! / mat[p]![p]!;
        for (let j = p; j <= n; j++) {
          mat[i]![j] -= factor * mat[p]![j]!;
        }
      }
    }

    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = 0;
      for (let j = i + 1; j < n; j++) {
        sum += mat[i]![j]! * x[j]!;
      }
      x[i] = (mat[i]![n]! - sum) / mat[i]![i]!;
    }

    return x;
  }

  /**
   * Ordinary Least Squares: Beta = (X^T * X)^-1 * X^T * Y
   */
  public static ols(X: number[][], Y: number[]): number[] {
    if (X.length === 0 || X.length !== Y.length) return [];

    const obsCount = X.length;
    const featsCount = X[0]!.length;

    // X^T * X
    const XtX: number[][] = Array.from({ length: featsCount }, () => new Array(featsCount).fill(0));
    // X^T * Y
    const XtY: number[] = new Array(featsCount).fill(0);

    for (let i = 0; i < obsCount; i++) {
      const rowX = X[i]!;
      const yVal = Y[i]!;

      for (let j = 0; j < featsCount; j++) {
        XtY[j] += rowX[j]! * yVal;
        for (let k = 0; k < featsCount; k++) {
          XtX[j]![k] += rowX[j]! * rowX[k]!;
        }
      }
    }

    return this.solveLinearSystem(XtX, XtY);
  }
}
