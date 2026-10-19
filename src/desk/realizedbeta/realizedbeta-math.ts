/**
 * Wave 209: Andersen, Bollerslev, Diebold & Wu (2006) Realized Beta Math.
 * Exact mathematical formulation of high-frequency realized covariance, bipower covariance, and beta.
 * Strictly < 180 LOC, zero :any.
 */

export class RealizedBetaMath {
  private static readonly MU1 = Math.sqrt(2.0 / Math.PI); // ~0.79788456

  /**
   * Realized Covariance & Variances:
   * RCov = sum(r_i,asset * r_i,market)
   * RV_market = sum(r_i,market^2)
   * RV_asset = sum(r_i,asset^2)
   */
  public static calculateRealizedMoments(
    assetReturns: number[],
    marketReturns: number[]
  ): {
    rcov: number;
    rvAsset: number;
    rvMarket: number;
    corr: number;
  } {
    const n = Math.min(assetReturns.length, marketReturns.length);
    let rcov = 0.0;
    let rvAsset = 0.0;
    let rvMarket = 0.0;

    for (let i = 0; i < n; i++) {
      const ra = assetReturns[i];
      const rm = marketReturns[i];
      rcov += ra * rm;
      rvAsset += ra * ra;
      rvMarket += rm * rm;
    }

    const denom = Math.sqrt(Math.max(1e-12, rvAsset * rvMarket));
    const corr = Math.max(-1.0, Math.min(1.0, rcov / denom));

    return { rcov, rvAsset, rvMarket, corr };
  }

  /**
   * Realized Bipower Covariance (Barndorff-Nielsen & Shephard 2004 / ABDW 2006):
   * BCOV = (pi / 2) * (1 / 4) * sum( (|r_i,a + r_i,m| * |r_{i-1,a} + r_{i-1,m}|) - (|r_i,a - r_i,m| * |r_{i-1,a} - r_{i-1,m}|) )
   */
  public static calculateBipowerCovariance(
    assetReturns: number[],
    marketReturns: number[]
  ): number {
    const n = Math.min(assetReturns.length, marketReturns.length);
    if (n < 2) return 0.0;

    let sumDiff = 0.0;
    for (let i = 1; i < n; i++) {
      const plus_curr = Math.abs(assetReturns[i] + marketReturns[i]);
      const plus_prev = Math.abs(assetReturns[i - 1] + marketReturns[i - 1]);
      const minus_curr = Math.abs(assetReturns[i] - marketReturns[i]);
      const minus_prev = Math.abs(assetReturns[i - 1] - marketReturns[i - 1]);

      sumDiff += (plus_curr * plus_prev) - (minus_curr * minus_prev);
    }

    const constant = (Math.PI / 2.0) * 0.25;
    const finiteSampleAdj = n / (n - 1);
    return constant * finiteSampleAdj * sumDiff;
  }

  /**
   * Bipower Variation for a single return series.
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
}
