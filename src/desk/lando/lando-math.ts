import { CreditRating } from './lando-types';

export const RATING_ORDER: CreditRating[] = [
  'AAA',
  'AA',
  'A',
  'BBB',
  'BB',
  'B',
  'CCC',
  'D',
];

export class LandoMath {
  public static getRatingIndex(rating: CreditRating): number {
    const idx = RATING_ORDER.indexOf(rating);
    if (idx === -1) throw new Error(`Unknown credit rating: ${rating}`);
    return idx;
  }

  public static matrixMultiply(a: number[][], b: number[][]): number[][] {
    const n = a.length;
    const res: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const aik = a[i][k];
        if (Math.abs(aik) < 1e-15) continue;
        for (let j = 0; j < n; j++) {
          res[i][j] += aik * b[k][j];
        }
      }
    }
    return res;
  }

  public static matrixExponential(q: number[][], t: number): number[][] {
    const n = q.length;
    if (t <= 0) {
      const identity = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.0))
      );
      return identity;
    }

    // 1. Calculate matrix 1-norm of Q*t
    let maxColSum = 0.0;
    for (let j = 0; j < n; j++) {
      let colSum = 0.0;
      for (let i = 0; i < n; i++) colSum += Math.abs(q[i][j] * t);
      if (colSum > maxColSum) maxColSum = colSum;
    }

    // 2. Scaling factor 2^m such that norm <= 0.5
    let m = 0;
    if (maxColSum > 0.5) {
      m = Math.ceil(Math.log2(maxColSum / 0.5));
    }
    const scale = Math.pow(2, m);

    // Scaled matrix A = Q * t / scale
    const a: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (q[i][j] * t) / scale)
    );

    // 3. Taylor series expansion of exp(A)
    let term: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.0))
    );
    let sum: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.0))
    );

    const maxDegree = 16;
    for (let k = 1; k <= maxDegree; k++) {
      term = this.matrixMultiply(term, a);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          term[i][j] /= k;
          sum[i][j] += term[i][j];
        }
      }
    }

    // 4. Repeated squaring m times
    for (let s = 0; s < m; s++) {
      sum = this.matrixMultiply(sum, sum);
    }

    // 5. Clean negative probabilities and enforce row stochasticity
    for (let i = 0; i < n; i++) {
      let rowSum = 0.0;
      for (let j = 0; j < n; j++) {
        sum[i][j] = Math.max(0.0, sum[i][j]);
        rowSum += sum[i][j];
      }
      if (rowSum > 0) {
        for (let j = 0; j < n; j++) sum[i][j] /= rowSum;
      }
    }

    return sum;
  }

  public static calculateCreditSpreadBps(
    defaultProb: number,
    recoveryRate: number,
    tenor: number
  ): number {
    if (tenor <= 0 || defaultProb <= 1e-12) return 0.0;
    const lossGivenDefault = 1.0 - recoveryRate;
    const survivalVal = Math.max(1e-12, 1.0 - lossGivenDefault * defaultProb);
    const continuousSpread = -Math.log(survivalVal) / tenor;
    return Math.max(0.0, continuousSpread * 10000.0);
  }
}
