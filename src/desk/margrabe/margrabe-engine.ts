import { MargrabeParams, MargrabeResult } from './margrabe-types';
import { MargrabeMath } from './margrabe-math';

export class MargrabeEngine {
  public static validate(params: MargrabeParams): void {
    if (params.spot1 <= 0 || !Number.isFinite(params.spot1)) {
      throw new Error(`Invalid spot1: ${params.spot1}. Must be > 0.`);
    }
    if (params.spot2 <= 0 || !Number.isFinite(params.spot2)) {
      throw new Error(`Invalid spot2: ${params.spot2}. Must be > 0.`);
    }
    if (params.volatility1 <= 0 || !Number.isFinite(params.volatility1)) {
      throw new Error(`Invalid volatility1: ${params.volatility1}. Must be > 0.`);
    }
    if (params.volatility2 <= 0 || !Number.isFinite(params.volatility2)) {
      throw new Error(`Invalid volatility2: ${params.volatility2}. Must be > 0.`);
    }
    if (params.correlation < -1.0 || params.correlation > 1.0 || !Number.isFinite(params.correlation)) {
      throw new Error(`Invalid correlation: ${params.correlation}. Must be in [-1, 1].`);
    }
    if (params.timeToMaturity <= 0 || !Number.isFinite(params.timeToMaturity)) {
      throw new Error(`Invalid timeToMaturity: ${params.timeToMaturity}. Must be > 0.`);
    }
    if (params.dividendYield1 !== undefined && params.dividendYield1 < 0) {
      throw new Error(`Invalid dividendYield1: ${params.dividendYield1}. Must be >= 0.`);
    }
    if (params.dividendYield2 !== undefined && params.dividendYield2 < 0) {
      throw new Error(`Invalid dividendYield2: ${params.dividendYield2}. Must be >= 0.`);
    }
  }

  public static price(params: MargrabeParams): MargrabeResult {
    this.validate(params);

    const q1 = params.dividendYield1 ?? 0.0;
    const q2 = params.dividendYield2 ?? 0.0;

    const base = MargrabeMath.calculatePriceAndGreeks(
      params.spot1,
      params.spot2,
      params.volatility1,
      params.volatility2,
      params.correlation,
      params.timeToMaturity,
      q1,
      q2
    );

    // Verify Exchange Parity: C(S1, S2) - C(S2, S1) = S1*e^(-q1*T) - S2*e^(-q2*T)
    const reversed = MargrabeMath.calculatePriceAndGreeks(
      params.spot2,
      params.spot1,
      params.volatility2,
      params.volatility1,
      params.correlation,
      params.timeToMaturity,
      q2,
      q1
    );

    const df1 = Math.exp(-q1 * params.timeToMaturity);
    const df2 = Math.exp(-q2 * params.timeToMaturity);
    const expectedDiff = params.spot1 * df1 - params.spot2 * df2;
    const actualDiff = base.optionPrice - reversed.optionPrice;
    const exchangeParityError = Math.abs(actualDiff - expectedDiff);

    return {
      optionPrice: base.optionPrice,
      compositeVol: base.compositeVol,
      d1: base.d1,
      d2: base.d2,
      greeks: base.greeks,
      exchangeParityError,
    };
  }
}
