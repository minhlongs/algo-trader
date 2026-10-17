/**
 * Wave 208: Barndorff-Nielsen, Kinnebrock & Shephard (2010) Semivariance Math.
 * Exact mathematical formulation of upside/downside semi-variation and jump decomposition.
 * Strictly < 180 LOC, zero :any.
 */

export class SemivarianceMath {
  private static readonly MU1 = Math.sqrt(2.0 / Math.PI); // ~0.79788456

  /**
   * Decompose high-frequency log returns into signed semivariances:
   * RS+ = sum(max(r_i, 0)^2)
   * RS- = sum(min(r_i, 0)^2)
   * RV  = sum(r_i^2) = RS+ + RS-
   */
  public static calculateSignedSemivariance(returns: number[]): {
    rv: number;
    rsPlus: number;
    rsMinus: number;
  } {
    let rv = 0.0;
    let rsPlus = 0.0;
    let rsMinus = 0.0;

    for (let i = 0; i < returns.length; i++) {
      const r = returns[i];
      const sq = r * r;
      rv += sq;
      if (r > 0) {
        rsPlus += sq;
      } else if (r < 0) {
        rsMinus += sq;
      }
    }

    return { rv, rsPlus, rsMinus };
  }

  /**
   * Barndorff-Nielsen & Shephard (2004) Bipower Variation:
   * BV = mu_1^(-2) * (n / (n - 1)) * sum(|r_i| * |r_{i-1}|)
   */
  public static calculateBipowerVariation(returns: number[]): number {
    const n = returns.length;
    if (n < 2) return 0.0;

    let sum = 0.0;
    for (let i = 1; i < n; i++) {
      sum += Math.abs(returns[i]) * Math.abs(returns[i - 1]);
    }

    const scaling = 1.0 / (this.MU1 * this.MU1);
    const finiteSampleAdj = n / (n - 1);
    return scaling * finiteSampleAdj * sum;
  }

  /**
   * Signed Jump Variation & Asymmetric Jump components:
   * Delta_J = RS+ - RS-
   * J_continuous = max(0, RV - BV)
   * Upside Jump   = max(0, RS+ - 0.5 * BV)
   * Downside Jump = max(0, RS- - 0.5 * BV)
   */
  public static calculateJumpComponents(
    rsPlus: number,
    rsMinus: number,
    bv: number
  ): {
    signedJump: number;
    upsideJump: number;
    downsideJump: number;
  } {
    const signedJump = rsPlus - rsMinus;
    const halfBv = 0.5 * bv;
    const upsideJump = Math.max(0.0, rsPlus - halfBv);
    const downsideJump = Math.max(0.0, rsMinus - halfBv);

    return { signedJump, upsideJump, downsideJump };
  }
}
