/**
 * LMSR Mathematical Pricing Engine
 * Log-Sum-Exp numerically stable cost function, marginal spot prices,
 * micro-trade log1p/expm1 precision, and closed-form budget inversion.
 */

import { LmsrTradeQuote } from '../types/lmsr-types';
import { validateLmsrInputs, computeShiftedExponentials } from './lmsr-pricing-math';

export class LmsrPricing {
  /**
   * Log-Sum-Exp numerically stable cost function:
   * C(q) = b * [ m + ln( sum_{i=1}^n exp(q_i / b - m) ) ]
   */
  public static calculateCost(liabilities: number[], b: number): number {
    validateLmsrInputs(liabilities, b);
    const { maxScaled, sumExp } = computeShiftedExponentials(liabilities, b);
    return b * (maxScaled + Math.log(sumExp));
  }

  /**
   * Marginal spot prices: p_i(q) = exp(q_i / b - m) / sum_j exp(q_j / b - m)
   */
  public static calculateSpotPrices(liabilities: number[], b: number): number[] {
    validateLmsrInputs(liabilities, b);
    const { expShifted, sumExp } = computeShiftedExponentials(liabilities, b);
    const prices: number[] = new Array(liabilities.length);
    for (let i = 0; i < liabilities.length; i++) {
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
      return b * Math.log1p(pk * Math.expm1(deltaQ / b));
    }

    const newLiabilities = currentLiabilities.map((q, i) => q + deltaShares[i]);
    return this.calculateCost(newLiabilities, b) - this.calculateCost(currentLiabilities, b);
  }

  /**
   * Closed-form budget inversion: delta_q_k = b * log1p( expm1(B / b) / p_k )
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

    const pk = this.calculateSpotPrices(currentLiabilities, b)[outcomeIndex];
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

    const feeUsdc = Math.abs(costUsdc) * (feeBps / 10000);
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
