import { BlackScholesHelper } from './black-scholes-helper';
import {
  CorridorSpec,
  CorridorVarianceResult,
  GammaSwapResult,
  VanillaOptionQuote,
  VarianceSwapReplicationResult,
  VarianceSwapSpec,
} from './variance-swap-types';

export class VarianceSwapReplicator {
  /**
   * Forward to BlackScholesHelper
   */
  public static blackScholes(
    spot: number,
    strike: number,
    rate: number,
    dividend: number,
    vol: number,
    expiry: number,
    isCall: boolean
  ): number {
    return BlackScholesHelper.price(spot, strike, rate, dividend, vol, expiry, isCall);
  }

  /**
   * Replicates fair variance strike K_var using Demeterfi et al. (1999) discrete strip of options
   */
  public static replicateVarianceSwap(
    spec: VarianceSwapSpec,
    quotes: VanillaOptionQuote[],
    cutOffStrike?: number
  ): VarianceSwapReplicationResult {
    const { underlyingSpot: S0, riskFreeRate: r, dividendYield: q, expiryYears: T } = spec;
    const F0 = S0 * Math.exp((r - q) * T);
    const S_star = cutOffStrike ?? S0;

    // Sort quotes by strike ascending
    const sortedQuotes = [...quotes].sort((a, b) => a.strike - b.strike);
    if (sortedQuotes.length < 2) {
      throw new Error('Variance swap replication requires at least 2 strike quotes');
    }

    let putIntegral = 0;
    let callIntegral = 0;

    for (let i = 0; i < sortedQuotes.length; i++) {
      const q_i = sortedQuotes[i]!;
      const K = q_i.strike;

      // Delta K for trapezoidal integration
      let dK: number;
      if (i === 0) {
        dK = sortedQuotes[1]!.strike - K;
      } else if (i === sortedQuotes.length - 1) {
        dK = K - sortedQuotes[i - 1]!.strike;
      } else {
        dK = 0.5 * (sortedQuotes[i + 1]!.strike - sortedQuotes[i - 1]!.strike);
      }

      // Weight for discrete option strip is 1 / K^2
      const weight = (1.0 / (K * K)) * dK;
      const price =
        q_i.marketPrice ??
        this.blackScholes(S0, K, r, q, q_i.impliedVol, T, q_i.isCall);

      if (K < S_star) {
        // Out-of-the-money puts
        putIntegral += weight * price;
      } else if (K > S_star) {
        // Out-of-the-money calls
        callIntegral += weight * price;
      } else {
        // At-the-money strike split
        putIntegral += 0.5 * weight * price;
        callIntegral += 0.5 * weight * price;
      }
    }

    // Demeterfi et al. (1999) eq (17)
    const forwardTerm = (F0 / S_star) - 1.0;
    const logRatio = Math.log(S_star / S0);
    const driftAdjustment = (2.0 / T) * ((r - q) * T - forwardTerm - logRatio);
    const optionStripTotal =
      (2.0 / T) * Math.exp(r * T) * (putIntegral + callIntegral);

    const fairStrikeVariance = Math.max(1e-6, driftAdjustment + optionStripTotal);
    const fairVol = Math.sqrt(fairStrikeVariance);

    return {
      fairStrikeVariance,
      fairVolatilityStrike: fairVol,
      logContractValue: driftAdjustment,
      putStripIntegral: putIntegral,
      callStripIntegral: callIntegral,
      totalReplicationPrice: fairStrikeVariance,
    };
  }

  /**
   * Replicates Corridor Variance Swap with barrier bounds [B_L, B_U]
   */
  public static replicateCorridorVariance(
    spec: VarianceSwapSpec,
    quotes: VanillaOptionQuote[],
    corridor: CorridorSpec
  ): CorridorVarianceResult {
    const unconstrained = this.replicateVarianceSwap(spec, quotes);
    const filteredQuotes = quotes.filter(
      (q) => q.strike >= corridor.lowerBarrier && q.strike <= corridor.upperBarrier
    );

    if (filteredQuotes.length < 2) {
      throw new Error('Not enough options within the corridor barriers');
    }

    const corridorResult = this.replicateVarianceSwap(spec, filteredQuotes);
    const corridorRatio =
      corridorResult.fairStrikeVariance / Math.max(1e-12, unconstrained.fairStrikeVariance);

    return {
      corridorVarianceFairStrike: corridorResult.fairStrikeVariance,
      unconstrainedFairStrike: unconstrained.fairStrikeVariance,
      corridorRatio,
    };
  }

  /**
   * Evaluates Gamma Swap where payoff weights variance by S_t / S_0
   */
  public static evaluateGammaSwap(
    spec: VarianceSwapSpec,
    quotes: VanillaOptionQuote[]
  ): GammaSwapResult {
    const varSwap = this.replicateVarianceSwap(spec, quotes);
    const S0 = spec.underlyingSpot;
    const r = spec.riskFreeRate;
    const q = spec.dividendYield;
    const T = spec.expiryYears;

    let gammaOptionIntegral = 0;
    const sorted = [...quotes].sort((a, b) => a.strike - b.strike);

    for (let i = 0; i < sorted.length; i++) {
      const q_i = sorted[i]!;
      const K = q_i.strike;
      let dK: number;
      if (i === 0) dK = sorted[1]!.strike - K;
      else if (i === sorted.length - 1) dK = K - sorted[i - 1]!.strike;
      else dK = 0.5 * (sorted[i + 1]!.strike - sorted[i - 1]!.strike);

      // Weight for Gamma Swap is 2 / (S0 * K)
      const weight = (2.0 / (S0 * K)) * dK;
      const price =
        q_i.marketPrice ??
        this.blackScholes(S0, K, r, q, q_i.impliedVol, T, q_i.isCall);
      gammaOptionIntegral += weight * price;
    }

    const fairGammaStrike = (2.0 / T) * Math.exp(r * T) * gammaOptionIntegral;
    const convexityAdj = fairGammaStrike - varSwap.fairStrikeVariance;

    return {
      fairGammaStrike,
      varianceSwapStrike: varSwap.fairStrikeVariance,
      convexityAdjustment: convexityAdj,
    };
  }
}
