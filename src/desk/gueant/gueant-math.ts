export class GueantMath {
  public static multiplyMatrices(a: number[][], b: number[][]): number[][] {
    const n = a.length;
    const m = b[0].length;
    const kDim = b.length;
    const res: number[][] = Array.from({ length: n }, () => new Array(m).fill(0));

    for (let i = 0; i < n; i++) {
      for (let k = 0; k < kDim; k++) {
        const aik = a[i][k];
        for (let j = 0; j < m; j++) {
          res[i][j] += aik * b[k][j];
        }
      }
    }
    return res;
  }

  public static multiplyMatrixVector(a: number[][], v: number[]): number[] {
    const n = a.length;
    const m = v.length;
    const res = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      let sum = 0.0;
      for (let j = 0; j < m; j++) {
        sum += a[i][j] * v[j];
      }
      res[i] = sum;
    }
    return res;
  }

  public static matrixInfinityNorm(mat: number[][]): number {
    let maxRowSum = 0.0;
    for (let i = 0; i < mat.length; i++) {
      let rowSum = 0.0;
      for (let j = 0; j < mat[i].length; j++) {
        rowSum += Math.abs(mat[i][j]);
      }
      if (rowSum > maxRowSum) maxRowSum = rowSum;
    }
    return maxRowSum;
  }

  /**
   * High-precision Scaling and Squaring Matrix Exponential: exp(A)
   */
  public static matrixExponential(a: number[][]): number[][] {
    const n = a.length;
    const norm = this.matrixInfinityNorm(a);

    // Scaling factor m such that ||A / 2^m|| <= 0.5
    let m = 0;
    if (norm > 0.5) {
      m = Math.ceil(Math.log2(norm / 0.5));
    }
    const scale = Math.pow(2, m);

    // Scaled matrix Y = A / 2^m
    const y: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => a[i][j] / scale)
    );

    // Taylor series: E = I + Y + Y^2/2! + ... + Y^p/p!
    let e: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.0))
    );
    let term: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.0))
    );

    const maxDegree = 16;
    for (let d = 1; d <= maxDegree; d++) {
      term = this.multiplyMatrices(term, y);
      const invFact = 1.0 / d;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          term[i][j] *= invFact;
          e[i][j] += term[i][j];
        }
      }
    }

    // Squaring: E = E^(2^m)
    for (let step = 0; step < m; step++) {
      e = this.multiplyMatrices(e, e);
    }

    return e;
  }
}
