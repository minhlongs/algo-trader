/**
 * Carr-Wu (2004) Finite Moment Log-Stable (FMLS) Pricing Engine
 *
 * @module desk/carrwu/carr-wu-engine
 */

import type {
  CarrWuOptionInput,
  CarrWuOptionResult,
  CarrWuGreeks,
  CarrWuSmilePoint,
  CarrWuParams,
} from './carr-wu-types';
import { CarrWuMath } from './carr-wu-math';

export class CarrWuEngine {
  public calculate(input: CarrWuOptionInput): CarrWuOptionResult {
    this.validateInput(input);
    const { spot, strike, timeToMaturity: T, optionType, params } = input;
    const { price, pi1, pi2, omega } = CarrWuMath.priceOption(spot, strike, T, optionType, params);

    const intrinsic = optionType === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    const timeValue = Math.max(0, price - intrinsic);
    const greeks = this.calculateGreeks(input, price);

    return {
      price,
      intrinsicValue: intrinsic,
      timeValue,
      convexityAdjustment: omega,
      probabilities: { pi1, pi2 },
      greeks,
    };
  }

  public generateSmile(
    spot: number,
    strikes: number[],
    T: number,
    params: CarrWuParams,
  ): CarrWuSmilePoint[] {
    return strikes.map((strike) => {
      const { price } = CarrWuMath.priceOption(spot, strike, T, 'call', params);
      const iv = CarrWuMath.impliedVolatility(
        price,
        spot,
        strike,
        T,
        params.rate,
        params.dividendYield,
        'call',
      );
      return {
        strike,
        moneyness: strike / spot,
        price,
        impliedVol: iv,
      };
    });
  }

  private calculateGreeks(input: CarrWuOptionInput, basePrice: number): CarrWuGreeks {
    const { spot, strike, timeToMaturity: T, optionType, params } = input;
    const epsS = spot * 0.005;
    const epsSigma = 0.005;
    const epsT = 1 / 365;
    const epsAlpha = 0.01;

    // Delta & Gamma
    const pUpS = CarrWuMath.priceOption(spot + epsS, strike, T, optionType, params).price;
    const pDnS = CarrWuMath.priceOption(spot - epsS, strike, T, optionType, params).price;
    const delta = (pUpS - pDnS) / (2 * epsS);
    const gamma = (pUpS - 2 * basePrice + pDnS) / (epsS * epsS);

    // Vega
    const pUpVol = CarrWuMath.priceOption(spot, strike, T, optionType, { ...params, sigma: params.sigma + epsSigma }).price;
    const pDnVol = CarrWuMath.priceOption(spot, strike, T, optionType, { ...params, sigma: Math.max(0.001, params.sigma - epsSigma) }).price;
    const vega = (pUpVol - pDnVol) / (2 * epsSigma);

    // Theta
    const pNextT = CarrWuMath.priceOption(spot, strike, Math.max(0.0001, T - epsT), optionType, params).price;
    const theta = (pNextT - basePrice) / epsT;

    // Skew Sensitivity (w.r.t alpha)
    const alphaUp = Math.min(2.0, params.alpha + epsAlpha);
    const alphaDn = Math.max(1.05, params.alpha - epsAlpha);
    const pUpAlpha = CarrWuMath.priceOption(spot, strike, T, optionType, { ...params, alpha: alphaUp }).price;
    const pDnAlpha = CarrWuMath.priceOption(spot, strike, T, optionType, { ...params, alpha: alphaDn }).price;
    const skewSensitivity = (pUpAlpha - pDnAlpha) / (alphaUp - alphaDn);

    return { delta, gamma, vega, theta, skewSensitivity };
  }

  private validateInput(input: CarrWuOptionInput): void {
    if (input.spot <= 0) throw new Error(`Spot price must be positive, got ${input.spot}`);
    if (input.strike <= 0) throw new Error(`Strike price must be positive, got ${input.strike}`);
    if (input.timeToMaturity <= 0) throw new Error(`Maturity must be positive, got ${input.timeToMaturity}`);
    if (input.params.alpha <= 1 || input.params.alpha > 2) {
      throw new Error(`Alpha must be in (1, 2], got ${input.params.alpha}`);
    }
    if (input.params.sigma <= 0) throw new Error(`Sigma must be positive, got ${input.params.sigma}`);
  }
}
