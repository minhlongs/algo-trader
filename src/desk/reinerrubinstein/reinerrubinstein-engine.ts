/**
 * Reiner-Rubinstein (1991) Barrier Option Engine
 * Closed-form analytical single-barrier options with in-out parity and Greeks
 */

import {
  ReinerRubinsteinParams,
  ReinerRubinsteinResult,
  ReinerRubinsteinGreeks,
} from './reinerrubinstein-types.js';
import { ReinerRubinsteinMath } from './reinerrubinstein-math.js';
import { computeFormulaTerms } from './reinerrubinstein-formulas.js';

export class ReinerRubinsteinEngine {
  public static validate(params: ReinerRubinsteinParams): void {
    if (params.spotPrice <= 0) throw new Error('spotPrice must be positive');
    if (params.strikePrice <= 0) throw new Error('strikePrice must be positive');
    if (params.barrierPrice <= 0) throw new Error('barrierPrice must be positive');
    if (params.timeToExpiry <= 0) throw new Error('timeToExpiry must be positive');
    if (params.volatility <= 0) throw new Error('volatility must be positive');
  }

  public static price(params: ReinerRubinsteinParams, computeGreeks: boolean = true): ReinerRubinsteinResult {
    this.validate(params);
    const {
      spotPrice: S, strikePrice: K, barrierPrice: H, timeToExpiry: T,
      riskFreeRate: r, dividendYield = 0, volatility: sigma,
      rebate = 0, barrierType,
    } = params;

    const b = r - dividendYield;
    const mu = (b - 0.5 * sigma * sigma) / (sigma * sigma);
    const lambda = Math.sqrt(mu * mu + (2 * r) / (sigma * sigma));
    const isCall = barrierType.endsWith('call');

    const terms = computeFormulaTerms(S, K, H, T, r, b, sigma, rebate, mu, lambda);
    const { A, B, C, D, E, F } = terms;

    let price = 0;
    const vanilla = ReinerRubinsteinMath.vanillaPrice(S, K, T, r, b, sigma, isCall);

    switch (barrierType) {
      case 'down-and-out-call':
        if (S <= H) price = rebate;
        else if (K >= H) price = A(1) - C(1, 1) + E(1);
        else price = B(1) - D(1, 1) + E(1);
        break;
      case 'down-and-in-call':
        if (S <= H) price = vanilla;
        else if (K >= H) price = C(1, 1) + F(1);
        else price = A(1) - B(1) + D(1, 1) + F(1);
        break;
      case 'up-and-out-call':
        if (S >= H) price = rebate;
        else if (K >= H) price = E(-1);
        else price = A(1) - B(1) + C(1, -1) - D(1, -1) + E(-1);
        break;
      case 'up-and-in-call':
        if (S >= H) price = vanilla;
        else if (K >= H) price = A(1) + F(-1);
        else price = B(1) - C(1, -1) + D(1, -1) + F(-1);
        break;
      case 'down-and-out-put':
        if (S <= H) price = rebate;
        else if (K >= H) price = A(-1) - B(-1) + C(-1, 1) - D(-1, 1) + E(1);
        else price = E(1);
        break;
      case 'down-and-in-put':
        if (S <= H) price = vanilla;
        else if (K >= H) price = B(-1) - C(-1, 1) + D(-1, 1) + F(1);
        else price = A(-1) + F(1);
        break;
      case 'up-and-out-put':
        if (S >= H) price = rebate;
        else if (K >= H) price = B(-1) - D(-1, -1) + E(-1);
        else price = A(-1) - C(-1, -1) + E(-1);
        break;
      case 'up-and-in-put':
        if (S >= H) price = vanilla;
        else if (K >= H) price = A(-1) - B(-1) + D(-1, -1) + F(-1);
        else price = C(-1, -1) + F(-1);
        break;
    }

    const greeks = computeGreeks ? this.calculateGreeks(params, price) : {
      delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0,
    };

    return {
      optionPrice: Math.max(0, price),
      vanillaPrice: vanilla,
      inOutParityPrice: vanilla,
      barrierHit: barrierType.startsWith('down') ? S <= H : S >= H,
      rebateValue: rebate,
      mu,
      lambda,
      greeks,
    };
  }

  private static calculateGreeks(params: ReinerRubinsteinParams, basePrice: number): ReinerRubinsteinGreeks {
    const dS = params.spotPrice * 0.001;
    const pUp = this.price({ ...params, spotPrice: params.spotPrice + dS }, false).optionPrice;
    const pDown = this.price({ ...params, spotPrice: params.spotPrice - dS }, false).optionPrice;

    const delta = (pUp - pDown) / (2 * dS);
    const gamma = (pUp - 2 * basePrice + pDown) / (dS * dS);

    const dVol = 0.001;
    const pVolUp = this.price({ ...params, volatility: params.volatility + dVol }, false).optionPrice;
    const vega = (pVolUp - basePrice) / dVol;

    const dT = 1 / 365;
    const pTDown = params.timeToExpiry > dT
      ? this.price({ ...params, timeToExpiry: params.timeToExpiry - dT }, false).optionPrice
      : basePrice;
    const theta = (pTDown - basePrice) / dT;

    const dR = 0.0001;
    const pRUp = this.price({ ...params, riskFreeRate: params.riskFreeRate + dR }, false).optionPrice;
    const rho = (pRUp - basePrice) / dR;

    return { delta, gamma, vega, theta, rho };
  }
}
