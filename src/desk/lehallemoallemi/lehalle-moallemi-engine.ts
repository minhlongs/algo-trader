import {
  LehalleMoallemiMarketParams,
  LehalleMoallemiResult,
} from './lehalle-moallemi-types';
import { LehalleMoallemiMath } from './lehalle-moallemi-math';

export class LehalleMoallemiEngine {
  public static optimize(params: LehalleMoallemiMarketParams): LehalleMoallemiResult {
    this.validateParams(params);

    const Q = params.totalOrderSize;

    // 1. Solve optimal split
    const { optimalDarkSplit, minCost } = LehalleMoallemiMath.findOptimalAllocation(params);
    const optimalLitSplit = Math.max(0.0, Q - optimalDarkSplit);
    const optimalDarkFraction = optimalDarkSplit / Q;

    // 2. Baseline benchmarks
    const allLitBreakdown = LehalleMoallemiMath.evaluateCostForAllocation(0.0, params);
    const allDarkBreakdown = LehalleMoallemiMath.evaluateCostForAllocation(Q, params);

    const allLitCost = allLitBreakdown.totalExpectedCost;
    const allDarkCost = allDarkBreakdown.totalExpectedCost;

    // 3. Cost savings vs 100% lit routing
    const costSavings = Math.max(0.0, allLitCost - minCost);
    const costSavingsBps = allLitCost > 0 ? (costSavings / allLitCost) * 10000 : 0.0;

    // 4. Detailed cost breakdown for optimal allocation
    const breakdown = LehalleMoallemiMath.evaluateCostForAllocation(optimalDarkSplit, params);

    return {
      optimalDarkSplit,
      optimalLitSplit,
      optimalDarkFraction,
      minimumExpectedCost: minCost,
      allLitCost,
      allDarkCost,
      costSavingsBps,
      breakdown,
    };
  }

  private static validateParams(params: LehalleMoallemiMarketParams): void {
    if (params.totalOrderSize <= 0) {
      throw new Error(`Total order size must be positive, got ${params.totalOrderSize}`);
    }
    if (params.halfSpread < 0) {
      throw new Error(`Half spread cannot be negative, got ${params.halfSpread}`);
    }
    if (params.litImpactParam <= 0) {
      throw new Error(`Lit impact parameter must be positive, got ${params.litImpactParam}`);
    }
    if (params.darkBaseFillProb <= 0 || params.darkBaseFillProb > 1) {
      throw new Error(`Dark base fill probability must be in (0, 1], got ${params.darkBaseFillProb}`);
    }
    if (params.darkDecayParam < 0) {
      throw new Error(`Dark decay parameter cannot be negative, got ${params.darkDecayParam}`);
    }
  }
}
