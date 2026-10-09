import { LookbackOptionParams, LookbackPriceResult, LookbackGreeks } from './goldman-sosin-types';
import { GoldmanSosinMath } from './goldman-sosin-math';

export class GoldmanSosinEngine {
  public static calculate(params: LookbackOptionParams): LookbackPriceResult {
    const { spot, riskFreeRate: r, volatility: sigma, timeToExpiry: tau } = params;
    const q = params.dividendYield ?? 0.0;
    const m = params.runningMin ?? spot;
    const M = params.runningMax ?? spot;

    if (spot <= 0.0 || sigma <= 0.0 || tau <= 0.0) {
      throw new Error('Spot, volatility, and timeToExpiry must be strictly positive');
    }
    if (m > spot) {
      throw new Error('Running minimum cannot exceed spot price');
    }
    if (M < spot) {
      throw new Error('Running maximum cannot be less than spot price');
    }

    const floatingCall = GoldmanSosinMath.priceFloatingCall(spot, m, tau, r, q, sigma);
    const floatingPut = GoldmanSosinMath.priceFloatingPut(spot, M, tau, r, q, sigma);

    // Finite difference Greeks
    const epsS = spot * 0.001;
    const cUp = GoldmanSosinMath.priceFloatingCall(spot + epsS, m, tau, r, q, sigma);
    const cDown = GoldmanSosinMath.priceFloatingCall(spot - epsS, m, tau, r, q, sigma);
    const delta = (cUp - cDown) / (2.0 * epsS);
    const gamma = (cUp - 2.0 * floatingCall + cDown) / (epsS * epsS);

    const epsSig = 0.001;
    const cSigUp = GoldmanSosinMath.priceFloatingCall(spot, m, tau, r, q, sigma + epsSig);
    const vega = (cSigUp - floatingCall) / epsSig;

    const dt = Math.min(tau * 0.01, 1.0 / 365.0);
    const cTheta = GoldmanSosinMath.priceFloatingCall(spot, m, tau - dt, r, q, sigma);
    const theta = -(floatingCall - cTheta) / dt;

    const epsR = 0.0001;
    const cRUp = GoldmanSosinMath.priceFloatingCall(spot, m, tau, r + epsR, q, sigma);
    const rho = (cRUp - floatingCall) / epsR;

    const epsM = Math.max(1e-6, m * 0.001);
    const cMUp = GoldmanSosinMath.priceFloatingCall(spot, Math.min(spot, m + epsM), tau, r, q, sigma);
    const extremaSensitivity = (cMUp - floatingCall) / epsM;

    const greeks: LookbackGreeks = { delta, gamma, vega, theta, rho, extremaSensitivity };

    return {
      floatingCall,
      floatingPut,
      costOfCarry: r - q,
      greeks,
    };
  }
}
