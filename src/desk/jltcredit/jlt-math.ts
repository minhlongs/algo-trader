export class JltMath {
  public static multiply(A: number[][], B: number[][]): number[][] {
    const rowsA = A.length;
    const colsA = A[0].length;
    const colsB = B[0].length;
    const result: number[][] = Array.from({ length: rowsA }, () => new Array(colsB).fill(0));

    for (let i = 0; i < rowsA; i++) {
      for (let k = 0; k < colsA; k++) {
        const aik = A[i][k];
        if (Math.abs(aik) < 1e-15) continue;
        for (let j = 0; j < colsB; j++) {
          result[i][j] += aik * B[k][j];
        }
      }
    }
    return result;
  }

  public static matrixPower(M: number[][], power: number): number[][] {
    if (power < 1) throw new Error('Matrix power must be at least 1');
    const n = M.length;
    let result: number[][] = Array.from({ length: n }, (_, i) => {
      const row = new Array(n).fill(0);
      row[i] = 1;
      return row;
    });

    let base = M.map(row => [...row]);
    let exp = Math.floor(power);

    while (exp > 0) {
      if (exp % 2 === 1) {
        result = this.multiply(result, base);
      }
      base = this.multiply(base, base);
      exp = Math.floor(exp / 2);
    }
    return result;
  }

  public static isRowStochastic(matrix: number[][], tolerance = 1e-4): boolean {
    for (let i = 0; i < matrix.length; i++) {
      let sum = 0;
      for (let j = 0; j < matrix[i].length; j++) {
        if (matrix[i][j] < -tolerance) return false;
        sum += matrix[i][j];
      }
      if (Math.abs(sum - 1.0) > tolerance) return false;
    }
    return true;
  }

  /**
   * Jarrow-Lando-Turnbull risk premium scaling from physical P to risk-neutral Q
   */
  public static scaleToRiskNeutral(
    P: number[][],
    riskPremia: number[], // risk premium multiplier for default per rating tier (e.g., 1.2 to 2.5)
    defaultIndex: number
  ): number[][] {
    const n = P.length;
    const Q: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      if (i === defaultIndex) {
        Q[i][defaultIndex] = 1.0;
        continue;
      }

      const pDef = P[i][defaultIndex];
      const pi = riskPremia[i] ?? 1.0;
      const qDef = Math.min(1.0, Math.max(0.0, pDef * pi));
      Q[i][defaultIndex] = qDef;

      const nonDefSumP = 1.0 - pDef;
      const nonDefSumQ = 1.0 - qDef;

      for (let j = 0; j < n; j++) {
        if (j === defaultIndex) continue;
        if (nonDefSumP > 1e-12) {
          Q[i][j] = P[i][j] * (nonDefSumQ / nonDefSumP);
        } else {
          Q[i][j] = (1.0 - qDef) / (n - 1);
        }
      }
    }

    return Q;
  }
}
