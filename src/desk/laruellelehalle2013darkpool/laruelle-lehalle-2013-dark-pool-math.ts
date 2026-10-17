import { LaruelleLehalle2013Input, LaruelleLehalle2013Output } from './types';

/**
 * Wave 328: Laruelle, Lehalle & Pagès (2013) Optimal Split of Orders Across Liquidity Pools.
 * Balances censored dark pool execution against guaranteed lit exchange market impact.
 */
export class LaruelleLehalle2013DarkPoolSplit {
  public evaluate(input: LaruelleLehalle2013Input): LaruelleLehalle2013Output {
    const Q = Math.max(1e-6, input.parentOrderQuantity);
    const meanD = Math.max(1e-6, input.darkPoolMeanLiquidity);
    const lambda = 1 / meanD;
    const allLitCostBps = input.litHalfSpreadBps + input.litLinearImpactBpsPerUnit * Q;

    let bestR = 0;
    let minCostBps = allLitCostBps;

    for (let step = 0; step <= 100; step++) {
      const r = step / 100;
      const darkQ = r * Q;
      const litDirectQ = (1 - r) * Q;
      const probFullDarkFill = darkQ <= 1e-9 ? 1 : Math.exp(-lambda * darkQ);
      const expectedDarkFilled =
        darkQ <= 1e-9 ? 0 : (1 - Math.exp(-lambda * darkQ)) / lambda;
      const expectedUnfilledDark = Math.max(0, darkQ - expectedDarkFilled);
      const totalEffectiveLitQ = litDirectQ + expectedUnfilledDark;

      const darkBenefitBps = (expectedDarkFilled / Q) * input.darkPoolRebateBps;
      const litCostComponentBps =
        (totalEffectiveLitQ / Q) *
        (input.litHalfSpreadBps + input.litLinearImpactBpsPerUnit * totalEffectiveLitQ);
      const spillPenaltyBps =
        (1 - probFullDarkFill) * (expectedUnfilledDark / Q) * input.adverseSelectionPenaltyBps;

      const candidateCostBps = litCostComponentBps + spillPenaltyBps - darkBenefitBps;
      if (candidateCostBps < minCostBps) {
        minCostBps = candidateCostBps;
        bestR = r;
      }
    }

    const darkAllocatedUnits = Number((bestR * Q).toFixed(4));
    const litAllocatedUnits = Number(((1 - bestR) * Q).toFixed(4));
    const expectedDarkFillProbability = Number(
      (darkAllocatedUnits <= 1e-9 ? 1 : Math.exp(-lambda * darkAllocatedUnits)).toFixed(6),
    );
    const expectedTotalCostBps = Number(Math.max(0, minCostBps).toFixed(4));
    const costSavingsVsAllLitBps = Number(
      Math.max(0, allLitCostBps - expectedTotalCostBps).toFixed(4),
    );

    const executionVenueMode =
      bestR >= 0.65
        ? 'DARK_DOMINANT_STEALTH'
        : bestR >= 0.25
          ? 'BALANCED_DARK_LIT'
          : 'LIT_URGENT_SWEEP';

    return {
      optimalDarkRatio: Number(bestR.toFixed(4)),
      darkAllocatedUnits,
      litAllocatedUnits,
      expectedDarkFillProbability,
      expectedTotalCostBps,
      costSavingsVsAllLitBps,
      executionVenueMode,
    };
  }
}
