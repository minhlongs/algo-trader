export class CrankMath {
  /**
   * Solve tridiagonal system A * x = d using Thomas algorithm with optional projection (Brennan-Schwartz)
   * A has sub-diagonal a (size N-1), main diagonal b (size N), super-diagonal c (size N-1)
   */
  public static solveTridiagonal(
    a: number[],
    b: number[],
    c: number[],
    d: number[],
    intrinsic?: number[]
  ): number[] {
    const n = d.length;
    const cPrime = Array(n).fill(0);
    const dPrime = Array(n).fill(0);
    const x = Array(n).fill(0);

    cPrime[0] = c[0] / b[0];
    dPrime[0] = d[0] / b[0];

    for (let i = 1; i < n; i++) {
      const denom = b[i] - a[i - 1] * cPrime[i - 1];
      cPrime[i] = i < n - 1 ? c[i] / denom : 0;
      dPrime[i] = (d[i] - a[i - 1] * dPrime[i - 1]) / denom;
    }

    x[n - 1] = dPrime[n - 1];
    if (intrinsic) {
      x[n - 1] = Math.max(x[n - 1], intrinsic[n - 1]);
    }

    for (let i = n - 2; i >= 0; i--) {
      x[i] = dPrime[i] - cPrime[i] * x[i + 1];
      if (intrinsic) {
        x[i] = Math.max(x[i], intrinsic[i]);
      }
    }

    return x;
  }
}
