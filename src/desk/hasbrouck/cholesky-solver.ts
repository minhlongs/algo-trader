export interface Matrix2x2 {
  readonly m00: number;
  readonly m01: number;
  readonly m10: number;
  readonly m11: number;
}

export class CholeskySolver {
  /**
   * Computes lower triangular Cholesky factor L such that L * L^T = Sigma.
   * Sigma must be symmetric positive-definite.
   */
  public static cholesky2x2(sigma00: number, sigma01: number, sigma11: number): Matrix2x2 {
    const s00 = Math.max(1e-12, sigma00);
    const l00 = Math.sqrt(s00);
    const l10 = sigma01 / l00;
    const rem = sigma11 - l10 * l10;
    const l11 = Math.sqrt(Math.max(1e-12, rem));

    return {
      m00: l00,
      m01: 0.0,
      m10: l10,
      m11: l11,
    };
  }

  /**
   * Computes the inverse of a 2x2 matrix.
   */
  public static invert2x2(m: Matrix2x2): Matrix2x2 {
    const det = m.m00 * m.m11 - m.m01 * m.m10;
    if (Math.abs(det) < 1e-14) {
      throw new Error('Matrix is singular and cannot be inverted');
    }
    const invDet = 1.0 / det;
    return {
      m00: m.m11 * invDet,
      m01: -m.m01 * invDet,
      m10: -m.m10 * invDet,
      m11: m.m00 * invDet,
    };
  }

  /**
   * Multiplies two 2x2 matrices: A * B.
   */
  public static multiply2x2(a: Matrix2x2, b: Matrix2x2): Matrix2x2 {
    return {
      m00: a.m00 * b.m00 + a.m01 * b.m10,
      m01: a.m00 * b.m01 + a.m01 * b.m11,
      m10: a.m10 * b.m00 + a.m11 * b.m10,
      m11: a.m10 * b.m01 + a.m11 * b.m11,
    };
  }
}
