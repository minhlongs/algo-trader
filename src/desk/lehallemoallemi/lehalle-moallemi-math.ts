import {
  LehalleMoallemiMarketParams,
  ExecutionCostBreakdown,
} from './lehalle-moallemi-types';

export class LehalleMoallemiMath {
  public static calculateDarkFillProb(
    qDark: number,
    totalQ: number,
    p0: number,
    alpha: number
  ): number {
    if (qDark <= 0) return 0.0;
    const fillProb = p0 * Math.exp(-alpha * (qDark / totalQ));
    return Math.max(0.0, Math.min(1.0, fillProb));
  }

  public static evaluateCostForAllocation(
    qDark: number,
    params: LehalleMoallemiMarketParams
  ): ExecutionCostBreakdown {
    const {
      totalOrderSize: Q,
      halfSpread: sHalf,
      litImpactParam: eta,
      darkBaseFillProb: p0,
      darkDecayParam: alpha,
      darkAdverseSelection: kappa,
      darkPriceImprovement: piDark,
      delayPenaltyFactor: gammaDelay,
    } = params;

    const qLit = Math.max(0.0, Q - qDark);
    const pFill = this.calculateDarkFillProb(qDark, Q, p0, alpha);

    // Lit direct execution cost: half spread + quadratic impact
    const litDirectCost = qLit > 0 ? qLit * sHalf + eta * qLit * qLit : 0.0;

    // Dark direct cost: adverse selection minus price improvement
    const darkDirectCost = qDark * pFill * (kappa - piDark);

    // Residual dark unfilled quantity routed to lit in period 2
    const unfilledDark = qDark * (1.0 - pFill);
    const residualLitCost =
      unfilledDark > 0
        ? unfilledDark * sHalf +
          eta * unfilledDark * unfilledDark +
          gammaDelay * unfilledDark * unfilledDark
        : 0.0;

    const totalExpectedCost = litDirectCost + darkDirectCost + residualLitCost;
    const expectedDarkFill = qDark * pFill;
    const expectedFillRate = (qLit + expectedDarkFill) / Q;

    return {
      litDirectCost,
      darkDirectCost,
      residualLitCost,
      totalExpectedCost,
      expectedDarkFill,
      expectedFillRate,
    };
  }

  public static findOptimalAllocation(
    params: LehalleMoallemiMarketParams,
    nGridSteps = 1000
  ): { optimalDarkSplit: number; minCost: number } {
    const Q = params.totalOrderSize;
    let minCost = Infinity;
    let optimalDark = 0.0;

    for (let i = 0; i <= nGridSteps; i++) {
      const qDark = (i / nGridSteps) * Q;
      const breakdown = this.evaluateCostForAllocation(qDark, params);
      if (breakdown.totalExpectedCost < minCost) {
        minCost = breakdown.totalExpectedCost;
        optimalDark = qDark;
      }
    }

    return { optimalDarkSplit: optimalDark, minCost };
  }
}
