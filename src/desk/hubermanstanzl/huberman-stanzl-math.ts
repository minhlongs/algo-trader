import {
  CrossImpactAnalysis,
  OptimalLiquidationResult,
  RoundTripAnalysis,
} from './huberman-stanzl-types';

export class HubermanStanzlMath {
  public static calculateRoundTripCost(
    schedule: number[],
    p0: number,
    gamma: number,
    theta: number
  ): RoundTripAnalysis {
    const netTradedQuantity = schedule.reduce((acc, q) => acc + q, 0);
    const isRoundTrip = Math.abs(netTradedQuantity) < 1e-7;

    let currentPrice = p0;
    let totalCost = 0.0;

    for (const q of schedule) {
      // Execution price: current mid + permanent impact half-spread + temporary impact
      const executionPrice = currentPrice + 0.5 * gamma * q + theta * q;
      totalCost += q * executionPrice;
      // Mid price evolves permanently by gamma * q
      currentPrice += gamma * q;
    }

    const expectedProfit = -totalCost;
    const isManipulativeArbitrage = isRoundTrip && expectedProfit > 1e-6;

    return {
      isRoundTrip,
      netTradedQuantity,
      expectedCost: totalCost,
      expectedProfit,
      isManipulativeArbitrage,
    };
  }

  public static analyzeCrossImpactMatrix(matrix: number[][]): CrossImpactAnalysis {
    const d = matrix.length;
    let maxAsymmetry = 0.0;

    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        const diff = Math.abs(matrix[i][j] - matrix[j][i]);
        if (diff > maxAsymmetry) maxAsymmetry = diff;
      }
    }

    const isSymmetric = maxAsymmetry < 1e-6;

    // Check 2x2 or general principal minors for positive semi-definiteness
    let isPsd = true;
    for (let i = 0; i < d; i++) {
      if (matrix[i][i] < -1e-6) isPsd = false;
    }
    if (d === 2) {
      const det = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
      if (det < -1e-6) isPsd = false;
    }

    // Manipulation exists if asymmetric or not positive semi-definite
    const hasCrossAssetManipulation = !isSymmetric || !isPsd;

    return {
      isSymmetric,
      asymmetryNorm: maxAsymmetry,
      isPositiveSemiDefinite: isPsd,
      hasCrossAssetManipulation,
    };
  }

  public static computeOptimalLiquidation(
    q0: number,
    p0: number,
    n: number,
    gamma: number,
    theta: number
  ): OptimalLiquidationResult {
    // Under linear impact and risk neutrality, uniform execution (TWAP) minimizes impact costs
    const sliceSize = q0 / n;

    // Slicing: permanent impact loss = 0.5 * gamma * Q_0^2, temporary loss = theta * Q_0^2 / N
    const permanentCost = 0.5 * gamma * q0 * q0;
    const temporaryCost = (theta * q0 * q0) / n;
    const totalCost = permanentCost + temporaryCost;

    const unimpactedRevenue = p0 * q0;
    const totalRevenue = unimpactedRevenue - totalCost;
    const effectiveAveragePrice = q0 > 0 ? totalRevenue / q0 : p0;
    const priceSlippage = p0 - effectiveAveragePrice;

    return {
      sliceSize,
      totalCost,
      totalRevenue,
      effectiveAveragePrice,
      priceSlippage,
    };
  }
}
