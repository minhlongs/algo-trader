import { CirFactor } from './cir-types.js';

export class CirMath {
  public static calculateBondCoefficients(
    factor: CirFactor,
    effectiveWeight: number,
    tau: number
  ): { A: number; B: number } {
    if (tau <= 0) return { A: 1, B: 0 };
    if (effectiveWeight <= 0) return { A: 1, B: 0 };

    const { speedKappa: k, meanTheta: theta, sigma } = factor;
    const gamma = Math.sqrt(k * k + 2 * sigma * sigma * effectiveWeight);
    const expGammaTau = Math.exp(gamma * tau);
    const expTerm = expGammaTau - 1;

    const denom = (gamma + k) * expTerm + 2 * gamma;
    if (denom <= 0) return { A: 1, B: 0 };

    const B = (2 * expTerm) / denom;

    const numA = 2 * gamma * Math.exp(((k + gamma) * tau) / 2);
    const power = (2 * k * theta) / (sigma * sigma);
    const A = Math.pow(numA / denom, power);

    return { A, B };
  }

  public static priceZeroCoupon(
    factors: CirFactor[],
    baseComponent: number,
    weights: number[],
    tau: number
  ): number {
    if (tau <= 0) return 1.0;

    let logPrice = -baseComponent * tau;

    for (let i = 0; i < factors.length; i++) {
      const f = factors[i];
      const w = weights[i];
      const { A, B } = this.calculateBondCoefficients(f, w, tau);
      logPrice += Math.log(Math.max(1e-15, A)) - B * f.currentX;
    }

    return Math.max(0, Math.exp(logPrice));
  }

  public static calculateYield(price: number, tau: number): number {
    if (tau <= 0 || price <= 0) return 0;
    return -Math.log(price) / tau;
  }
}
