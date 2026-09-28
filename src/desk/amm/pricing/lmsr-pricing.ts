/**
 * LMSR Mathematical Pricing Engine
 * Log-Sum-Exp numerically stable cost function, marginal spot prices,
 * micro-trade log1p/expm1 precision, and closed-form budget inversion.
 */

import { LmsrTradeQuote } from '../types/lmsr-types';

export class LmsrPricing {
  /**
   * Log-Sum-Exp numerically stable cost function:
   * C(q) = b * [ m + ln( sum_{i=1}^n exp(q_i / b - m) ) ]
   * where m = max_j(q_j / b)
   */
  public static calculateCost(liabilities: number[], b: number): number {
    if (b <= 0) {
      throw new Error(`LMSR liquidity parameter b must be positive, got ${b}`);
    }
    if (!liabilities || liabilities.length === 0) {
      throw new Error('Liabilities vector cannot be empty');
    }

    const n = liabilities.length;
    let maxScaled = liabilities[0] / b;
    for (let i = 1; i < n; i++) {
      const scaled = liabilities[i] / b;
      if (scaled > maxScaled) {
        maxScaled = scaled;
      }
    }

    let sumExp = 0;
    for (let i = 0; i < n; i++) {
      sumExp += Math.exp(liabilities[i] / b - maxScaled);
    }

    return b * (maxScaled + Math.log(sumExp));
  }

  /**
   * Marginal spot prices:
   * p_i(q) = exp(q_i / b - m) / sum_j exp(q_j / b - m)
   * Guaranteed to sum strictly to 1.0000000000000000.
   */
  public static calculateSpotPrices(liabilities: number[], b: number): number[] {
    if (b <= 0) {
      throw new Error(`LMSR liquidity parameter b must be positive, got ${b}`);
    }
    if (!liabilities || liabilities.length === 0) {
      throw new Error('Liabilities vector cannot be empty');
    }

    const n = liabilities.length;
    let maxScaled = liabilities[0] / b;
    for (let i = 1; i < n; i++) {
      const scaled = liabilities[i] / b;
      if (scaled > maxScaled) {
        maxScaled = scaled;
      }
    }

    const expShifted = new Float64Array(n);
    let sumExp = 0;
    for (let i = 0; i < n; i++) {
      const val = Math.exp(liabilities[i] / b - maxScaled);
      expShifted[i] = val;
      sumExp += val;
    }

    const prices: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      prices[i] = expShifted[i] / sumExp;
    }

    return prices;
  }

  /**
   * Trade cost computation: Delta C = C(q + deltaQ) - C(q)
   * For single-outcome trades, uses exact micro-trade precision:
   * Delta C = b * log1p( p_k * expm1(deltaQ / b) )
   */
  public static calculateTradeCost(
    currentLiabilities: number[],
    deltaShares: number[],
    b: number
  ): number {
    if (b <= 0) {
      throw new Error(`LMSR parameter b must be positive, got ${b}`);
    }
    if (currentLiabilities.length !== deltaShares.length) {
      throw new Error('Liabilities and deltaShares length mismatch');
    }

    // Check if this is a single-outcome trade
    let nonZeroCount = 0;
    let singleIndex = -1;
    for (let i = 0; i < deltaShares.length; i++) {
      if (deltaShares[i] !== 0) {
        nonZeroCount++;
        singleIndex = i;
      }
    }

    if (nonZeroCount === 0) return 0;

    if (nonZeroCount === 1) {
      const pk = this.calculateSpotPrices(currentLiabilities, b)[singleIndex];
      const deltaQ = deltaShares[singleIndex];
      // Algebraically exact: Delta C = b * log1p(pk * expm1(deltaQ / b))
      return b * Math.log1p(pk * Math.expm1(deltaQ / b));
    }

    // Multi-outcome trade: evaluate stabilized cost difference
    const newLiabilities = currentLiabilities.map((q, i) => q + deltaShares[i]);
    const costAfter = this.calculateCost(newLiabilities, b);
    const costBefore = this.calculateCost(currentLiabilities, b);
    return costAfter - costBefore;
  }

  /**
   * Closed-form budget inversion:
   * Given budget B USDC, how many shares delta_q_k of outcome k are acquired:
   * delta_q_k = b * log1p( expm1(B / b) / p_k )
   */
  public static calculateSharesForBudget(
    currentLiabilities: number[],
    outcomeIndex: number,
    budgetUsdc: number,
    b: number
  ): number {
    if (budgetUsdc <= 0) return 0;
    if (b <= 0) throw new Error('b must be positive');
    if (outcomeIndex < 0 || outcomeIndex >= currentLiabilities.length) {
      throw new Error(`Invalid outcome index ${outcomeIndex}`);
    }

    const spotPrices = this.calculateSpotPrices(currentLiabilities, b);
    const pk = spotPrices[outcomeIndex];
    if (pk <= 0) throw new Error('Outcome spot price must be positive');

    return b * Math.log1p(Math.expm1(budgetUsdc / b) / pk);
  }

  /**
   * Worst-Case Loss bound for market maker: b * ln(n)
   */
  public static calculateWorstCaseLoss(numOutcomes: number, b: number): number {
    if (numOutcomes <= 0 || b <= 0) throw new Error('Invalid arguments');
    return b * Math.log(numOutcomes);
  }

  /**
   * Comprehensive trade quote with pre/post spot prices and fee calculation
   */
  public static quoteTrade(
    liabilities: number[],
    outcomeIndex: number,
    deltaShares: number,
    b: number,
    feeBps: number = 0
  ): LmsrTradeQuote {
    if (outcomeIndex < 0 || outcomeIndex >= liabilities.length) {
      throw new Error(`Invalid outcomeIndex: ${outcomeIndex}`);
    }

    const deltaVector = new Array(liabilities.length).fill(0);
    deltaVector[outcomeIndex] = deltaShares;

    const spotBefore = this.calculateSpotPrices(liabilities, b);
    const costUsdc = this.calculateTradeCost(liabilities, deltaVector, b);
    const updatedLiabilities = liabilities.map((q, i) => q + deltaVector[i]);
    const spotAfter = this.calculateSpotPrices(updatedLiabilities, b);

    const feeRate = feeBps / 10000;
    const feeUsdc = Math.abs(costUsdc) * feeRate;
    const averagePrice = deltaShares !== 0 ? Math.abs(costUsdc / deltaShares) : spotBefore[outcomeIndex];

    return {
      outcomeIndex,
      deltaShares,
      costUsdc,
      averagePrice,
      spotPriceBefore: spotBefore[outcomeIndex],
      spotPriceAfter: spotAfter[outcomeIndex],
      feeUsdc,
    };
  }
}
