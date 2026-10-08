import { SamuelsonVolParams } from './commodities-types';

export class SamuelsonVolatilityCurve {
  /**
   * The Samuelson Effect dictates that commodity futures volatility increases
   * as the contract approaches maturity (T -> 0):
   * sigma(T) = sigma_0 * exp(-alpha * T)
   * where T is time to maturity in years, alpha > 0 is the mean-reversion rate.
   */
  public evaluateVolatility(timeToMaturityYears: number, params: SamuelsonVolParams): number {
    if (timeToMaturityYears < 0) throw new Error('Time to maturity cannot be negative');
    if (params.baseVolPct <= 0 || params.decayAlpha < 0) {
      throw new Error('Base volatility must be positive and decay alpha non-negative');
    }

    // Volatility escalates as timeToMaturity approaches 0
    const vol = params.baseVolPct * Math.exp(-params.decayAlpha * timeToMaturityYears);
    return Number(vol.toFixed(4));
  }

  /**
   * Generates volatility term structure across a sequence of expiries
   */
  public generateTermCurve(
    expiries: number[],
    params: SamuelsonVolParams
  ): { expiryYears: number; impliedVolPct: number }[] {
    return expiries.map((T) => ({
      expiryYears: T,
      impliedVolPct: this.evaluateVolatility(T, params),
    }));
  }
}
