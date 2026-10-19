import { BlackScholesHelper } from './black-scholes-helper';
import {
  CorridorSpec,
  CorridorVarianceResult,
  GammaSwapResult,
  VanillaOptionQuote,
  VarianceSwapReplicationResult,
  VarianceSwapSpec,
} from './variance-swap-types';
import {
  computeStrikeStepDk,
  computeLogContractDrift,
  integrateVarianceOptionStrip,
  integrateGammaOptionStrip,
} from './variance-swap-math';

export {
  computeStrikeStepDk,
  computeLogContractDrift,
  integrateVarianceOptionStrip,
  integrateGammaOptionStrip,
};

export class VarianceSwapReplicator {
  /** Forward to BlackScholesHelper */
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

  /** Replicates fair variance strike K_var using Demeterfi et al. (1999) discrete strip of options */
  public static replicateVarianceSwap(
    spec: VarianceSwapSpec,
    quotes: VanillaOptionQuote[],
    cutOffStrike?: number
  ): VarianceSwapReplicationResult {
    const { underlyingSpot: S0, riskFreeRate: r, dividendYield: q, expiryYears: T } = spec;
    const S_star = cutOffStrike ?? S0;

    const sortedQuotes = [...quotes].sort((a, b) => a.strike - b.strike);
    if (sortedQuotes.length < 2) {
      throw new Error('Variance swap replication requires at least 2 strike quotes');
    }

    const { putIntegral, callIntegral } = integrateVarianceOptionStrip(
      sortedQuotes,
      S_star,
      (q_i) => q_i.marketPrice ?? this.blackScholes(S0, q_i.strike, r, q, q_i.impliedVol, T, q_i.isCall)
    );

    const driftAdjustment = computeLogContractDrift(S0, S_star, r, q, T);
    const optionStripTotal = (2.0 / T) * Math.exp(r * T) * (putIntegral + callIntegral);

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

  /** Replicates Corridor Variance Swap with barrier bounds [B_L, B_U] */
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

  /** Evaluates Gamma Swap where payoff weights variance by S_t / S_0 */
  public static evaluateGammaSwap(
    spec: VarianceSwapSpec,
    quotes: VanillaOptionQuote[]
  ): GammaSwapResult {
    const varSwap = this.replicateVarianceSwap(spec, quotes);
    const { underlyingSpot: S0, riskFreeRate: r, dividendYield: q, expiryYears: T } = spec;

    const sorted = [...quotes].sort((a, b) => a.strike - b.strike);
    const gammaOptionIntegral = integrateGammaOptionStrip(
      sorted,
      S0,
      (q_i) => q_i.marketPrice ?? this.blackScholes(S0, q_i.strike, r, q, q_i.impliedVol, T, q_i.isCall)
    );

    const fairGammaStrike = (2.0 / T) * Math.exp(r * T) * gammaOptionIntegral;
    return {
      fairGammaStrike,
      varianceSwapStrike: varSwap.fairStrikeVariance,
      convexityAdjustment: fairGammaStrike - varSwap.fairStrikeVariance,
    };
  }
}
