import { ObligorProfile, TrancheDefinition } from './schonbucher-types';

export class SchonbucherMath {
  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2.0 * Math.PI);
  }

  // Conditional default probability for obligor given systemic factor X = x
  public static conditionalDefaultProb(
    baseHazardRate: number,
    beta: number,
    t: number,
    x: number
  ): number {
    // Log-normal affine intensity: lambda(x) = lambda0 * exp(beta * x - 0.5 * beta^2)
    const factorAdjustment = Math.exp(beta * x - 0.5 * beta * beta);
    const conditionalIntensity = baseHazardRate * factorAdjustment;
    return 1.0 - Math.exp(-conditionalIntensity * t);
  }

  // Portfolio loss fraction conditional on systemic factor X = x
  public static conditionalPortfolioLoss(
    obligors: ObligorProfile[],
    t: number,
    x: number,
    totalNotional: number
  ): number {
    if (totalNotional <= 0) return 0.0;
    let totalLoss = 0.0;
    for (const ob of obligors) {
      const defProb = this.conditionalDefaultProb(
        ob.baseHazardRate,
        ob.factorLoading,
        t,
        x
      );
      const lgd = 1.0 - ob.recoveryRate;
      totalLoss += ob.notional * lgd * defProb;
    }
    return totalLoss / totalNotional;
  }

  // Integrate tranche expected loss fraction over Gaussian systemic factor X ~ N(0, 1)
  public static evaluateTranche(
    tranche: TrancheDefinition,
    obligors: ObligorProfile[],
    t: number,
    r: number,
    totalNotional: number,
    quadPoints: number = 64
  ): {
    expectedLossFraction: number;
    expectedLossAmount: number;
    protectionValue: number;
    trancheSpreadBps: number;
  } {
    const k1 = tranche.attachment;
    const k2 = tranche.detachment;
    const width = Math.max(1e-6, k2 - k1);

    // Integrate over [-5, 5]
    const xMin = -5.0;
    const xMax = 5.0;
    const n = quadPoints % 2 === 0 ? quadPoints : quadPoints + 1;
    const dx = (xMax - xMin) / n;

    let lossIntegral = 0.0;
    for (let j = 0; j <= n; j++) {
      const x = xMin + j * dx;
      const portLossFraction = this.conditionalPortfolioLoss(
        obligors,
        t,
        x,
        totalNotional
      );

      // Tranche payoff: min(k2 - k1, max(0, portLoss - k1))
      const trancheLoss = Math.min(width, Math.max(0.0, portLossFraction - k1));
      const integrand = trancheLoss * this.normalPdf(x);

      let weight = 2.0;
      if (j === 0 || j === n) weight = 1.0;
      else if (j % 2 === 1) weight = 4.0;

      lossIntegral += weight * integrand;
    }

    const expectedAbsoluteTrancheLoss = (lossIntegral * dx) / 3.0;
    const expectedLossFraction = expectedAbsoluteTrancheLoss / width;
    const trancheNotional = width * totalNotional;
    const expectedLossAmount = expectedAbsoluteTrancheLoss * totalNotional;

    const discount = Math.exp(-r * t);
    const protectionValue = expectedLossAmount * discount;

    // Annuity premium leg with average surviving notional
    const avgSurvivingFraction = Math.max(1e-4, 1.0 - 0.5 * expectedLossFraction);
    const premiumAnnuity = trancheNotional * avgSurvivingFraction * t * discount;

    const trancheSpreadBps =
      premiumAnnuity > 0 ? (protectionValue / premiumAnnuity) * 10000.0 : 0.0;

    return {
      expectedLossFraction,
      expectedLossAmount,
      protectionValue,
      trancheSpreadBps,
    };
  }
}
