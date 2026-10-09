import { CarrMadanParams, OptionPriceResult } from './carr-madan-types';
import { CarrMadanMath } from './carr-madan-math';

export class CarrMadanEngine {
  public static price(params: CarrMadanParams): OptionPriceResult {
    this.validate(params);

    const {
      spotPrice,
      strikePrice,
      timeToMaturity,
      riskFreeRate,
      dividendYield,
      volatility,
      alpha = 1.5,
      integrationUpper = 100.0,
      quadratureSteps = 1024,
    } = params;

    const callPrice = CarrMadanMath.calculateCallPrice(
      spotPrice,
      strikePrice,
      riskFreeRate,
      dividendYield,
      volatility,
      timeToMaturity,
      alpha,
      integrationUpper,
      quadratureSteps
    );

    // Put-Call parity: C - P = S * exp(-q * T) - K * exp(-r * T)
    const forwardS = spotPrice * Math.exp(-dividendYield * timeToMaturity);
    const discountedK = strikePrice * Math.exp(-riskFreeRate * timeToMaturity);
    const parityDiff = forwardS - discountedK;
    const putPrice = Math.max(0.0, callPrice - parityDiff);

    const putCallParityError = Math.abs(callPrice - putPrice - parityDiff);
    const intrinsicValue = Math.max(0.0, spotPrice - strikePrice);

    return {
      spotPrice,
      strikePrice,
      timeToMaturity,
      callPrice,
      putPrice,
      alpha,
      putCallParityError,
      intrinsicValue,
    };
  }

  private static validate(params: CarrMadanParams): void {
    if (params.spotPrice <= 0) {
      throw new Error(`Spot price must be positive, got ${params.spotPrice}`);
    }
    if (params.strikePrice <= 0) {
      throw new Error(`Strike price must be positive, got ${params.strikePrice}`);
    }
    if (params.timeToMaturity <= 0) {
      throw new Error(`Time to maturity must be positive, got ${params.timeToMaturity}`);
    }
    if (params.volatility <= 0) {
      throw new Error(`Volatility must be positive, got ${params.volatility}`);
    }
    if (params.alpha !== undefined && params.alpha <= 0) {
      throw new Error(`Alpha dampening parameter must be positive, got ${params.alpha}`);
    }
  }
}
