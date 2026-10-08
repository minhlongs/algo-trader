import { LelandParams, LelandResult, ReplicatingPosition } from './leland-types';

export class LelandEngine {
  /**
   * Internal standalone Black-Scholes formula for precise evaluation
   */
  private static blackScholes(
    S: number,
    K: number,
    r: number,
    q: number,
    vol: number,
    T: number,
    isCall: boolean
  ): number {
    if (T <= 0 || vol <= 0) {
      if (isCall) return Math.max(0, S * Math.exp(-q * T) - K * Math.exp(-r * T));
      return Math.max(0, K * Math.exp(-r * T) - S * Math.exp(-q * T));
    }

    const d1 = (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / (vol * Math.sqrt(T));
    const d2 = d1 - vol * Math.sqrt(T);

    const normalCdf = (x: number): number => {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      const t = 1.0 / (1.0 + (p * Math.abs(x)) / Math.SQRT2);
      const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-x * x) / 2.0);
      return 0.5 * (1.0 + sign * y);
    };

    if (isCall) {
      return S * Math.exp(-q * T) * normalCdf(d1) - K * Math.exp(-r * T) * normalCdf(d2);
    }
    return K * Math.exp(-r * T) * normalCdf(-d2) - S * Math.exp(-q * T) * normalCdf(-d1);
  }

  /**
   * Calculates option replication cost including proportional transaction costs
   * using Leland's (1985) adjusted volatility formula.
   */
  public static calculateReplicationPrice(params: LelandParams): LelandResult {
    const {
      spotPrice,
      strikePrice,
      riskFreeRate,
      dividendYield,
      trueVolatility,
      timeToMaturity,
      transactionCost,
      rebalanceInterval,
      position,
      isCall,
    } = params;

    const k = transactionCost;
    const sigma = trueVolatility;
    const dt = rebalanceInterval;

    // Leland number (Le)
    const M_SQRT2_PI = Math.sqrt(2.0 / Math.PI);
    const lelandNumber = M_SQRT2_PI * (k / (sigma * Math.sqrt(dt)));

    // Volatility modifier sign
    const sign = position === ReplicatingPosition.SHORT_OPTION ? 1.0 : -1.0;

    // Adjusted variance: sigma^2 * (1 + sign * Le)
    let modifiedVariance = sigma * sigma * (1.0 + sign * lelandNumber);

    // Prevent negative variance in heavily modified long replications
    modifiedVariance = Math.max(1e-12, modifiedVariance);

    const modifiedVolatility = Math.sqrt(modifiedVariance);

    const frictionlessPrice = this.blackScholes(
      spotPrice,
      strikePrice,
      riskFreeRate,
      dividendYield,
      sigma,
      timeToMaturity,
      isCall
    );

    const optionPrice = this.blackScholes(
      spotPrice,
      strikePrice,
      riskFreeRate,
      dividendYield,
      modifiedVolatility,
      timeToMaturity,
      isCall
    );

    return {
      modifiedVolatility,
      modifiedVariance,
      optionPrice,
      frictionlessPrice,
      replicationPremium: optionPrice - frictionlessPrice,
    };
  }
}
