import { Gatheral2006SviInput, Gatheral2006SviOutput } from './types';

/**
 * Wave 330: Gatheral (2006) SVI Volatility Surface Parameterization & No-Arbitrage Filter.
 * Evaluates raw SVI total variance w(k) = a + b*(rho*(k-m) + sqrt((k-m)^2 + sigma^2))
 * and Durrleman's g(k) >= 0 butterfly no-arbitrage condition.
 */
export class Gatheral2006SviSurface {
  public evaluate(input: Gatheral2006SviInput): Gatheral2006SviOutput {
    const k = input.logMoneyness;
    const b = Math.max(0, input.b);
    const rho = Math.max(-0.999, Math.min(0.999, input.rho));
    const sigma = Math.max(1e-6, input.sigma);
    const T = Math.max(1e-4, input.timeToExpiryYears);

    const dk = k - input.m;
    const root = Math.sqrt(dk * dk + sigma * sigma);
    const w = Math.max(1e-6, input.a + b * (rho * dk + root));
    const impliedVolatility = Number(Math.sqrt(w / T).toFixed(6));

    const wPrime = b * (rho + dk / root);
    const wDoublePrime = (b * sigma * sigma) / (root * root * root);

    const term1 = 1 - (k * wPrime) / (2 * w);
    const g =
      term1 * term1 -
      (wPrime * wPrime) / 4 * (1 / w + 0.25) +
      0.5 * wDoublePrime;

    const rightWingSlope = Number((b * (1 + rho)).toFixed(6));
    const leftWingSlope = Number((b * (1 - rho)).toFixed(6));
    const rogerLeeWingBoundSatisfied = rightWingSlope <= 2 && leftWingSlope <= 2;

    return {
      totalImpliedVariance: Number(w.toFixed(6)),
      impliedVolatility,
      rightWingSlope,
      leftWingSlope,
      durrlemanGValue: Number(g.toFixed(6)),
      butterflyArbitrageFree: g >= 0 && rogerLeeWingBoundSatisfied,
      rogerLeeWingBoundSatisfied,
    };
  }
}
