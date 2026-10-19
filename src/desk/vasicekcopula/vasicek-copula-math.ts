import { LiCopulaMath } from '../copula/li-copula-math';
import { VasicekLossDistributionPoint } from './vasicek-copula-types';

export class VasicekCopulaMath {
  public static defaultThreshold(p: number): number {
    return LiCopulaMath.inverseNormalCdf(p);
  }

  public static cumulativeLossDistribution(x: number, p: number, rho: number): number {
    if (x <= 0) return 0.0;
    if (x >= 1) return 1.0;

    const invX = LiCopulaMath.inverseNormalCdf(x);
    const invP = LiCopulaMath.inverseNormalCdf(p);
    const num = Math.sqrt(1.0 - rho) * invX - invP;
    const denom = Math.sqrt(rho);
    return LiCopulaMath.normalCdf(num / denom);
  }

  public static lossDensity(x: number, p: number, rho: number): number {
    if (x <= 1e-4 || x >= 1 - 1e-4) return 0.0;

    const invX = LiCopulaMath.inverseNormalCdf(x);
    const invP = LiCopulaMath.inverseNormalCdf(p);
    const term = (Math.sqrt(1.0 - rho) * invX - invP) / Math.sqrt(rho);

    const factor = Math.sqrt((1.0 - rho) / rho);
    const exponent = 0.5 * (invX * invX - term * term);
    return Math.max(0, factor * Math.exp(exponent));
  }

  public static lossQuantile(alpha: number, p: number, rho: number): number {
    const invP = LiCopulaMath.inverseNormalCdf(p);
    const invAlpha = LiCopulaMath.inverseNormalCdf(alpha);
    const z = (invP + Math.sqrt(rho) * invAlpha) / Math.sqrt(1.0 - rho);
    return LiCopulaMath.normalCdf(z);
  }

  public static computeExpectedShortfall(
    alpha: number,
    p: number,
    rho: number,
    lgd: number,
    steps = 40
  ): number {
    const du = (1.0 - alpha) / steps;
    let sum = 0.0;

    for (let i = 0; i < steps; i++) {
      const u = alpha + (i + 0.5) * du;
      const q = this.lossQuantile(u, p, rho);
      sum += lgd * q * du;
    }

    return sum / (1.0 - alpha);
  }

  public static generateDistributionSample(
    p: number,
    rho: number,
    points = 20
  ): VasicekLossDistributionPoint[] {
    const sample: VasicekLossDistributionPoint[] = [];
    const maxLoss = Math.min(0.99, Math.max(0.1, this.lossQuantile(0.999, p, rho) * 1.5));
    const step = maxLoss / points;

    for (let i = 1; i <= points; i++) {
      const x = i * step;
      sample.push({
        lossFractionPct: Number((x * 100.0).toFixed(4)),
        cumulativeProbability: Number(this.cumulativeLossDistribution(x, p, rho).toFixed(6)),
        lossDensity: Number(this.lossDensity(x, p, rho).toFixed(6)),
      });
    }

    return sample;
  }
}
