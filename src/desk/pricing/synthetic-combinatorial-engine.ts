/**
 * Synthetic & Combinatorial Pricing Engine
 *
 * Verifies probability simplex normalization and Fréchet inequalities
 * to identify risk-free synthetic Dutch-book mispricings across prediction markets.
 *
 * @module desk/pricing/synthetic-combinatorial-engine
 */

import type {
  OutcomeProbability,
  SimplexValidationResult,
  FrechetBoundsResult,
} from './synthetic-combinatorial-types';

export class SyntheticCombinatorialEngine {
  private readonly simplexTolerance: number;

  constructor(simplexTolerance: number = 0.01) {
    this.simplexTolerance = simplexTolerance;
  }

  public validateSimplex(marketId: string, outcomes: readonly OutcomeProbability[]): SimplexValidationResult {
    const sumProbabilities = outcomes.reduce((sum, o) => sum + o.price, 0);
    const discrepancy = sumProbabilities - 1.0;
    const isConsistent = Math.abs(discrepancy) <= this.simplexTolerance;

    return {
      marketId,
      sumProbabilities: Math.round(sumProbabilities * 10000) / 10000,
      isConsistent,
      arbitrageDiscrepancy: Math.round(discrepancy * 10000) / 10000,
    };
  }

  public validateFrechetBounds(pA: number, pB: number, observedJointP: number): FrechetBoundsResult {
    const lowerBound = Math.max(0, pA + pB - 1);
    const upperBound = Math.min(pA, pB);

    let isWithinBounds = true;
    let violationDiscrepancy = 0;

    if (observedJointP < lowerBound - this.simplexTolerance) {
      isWithinBounds = false;
      violationDiscrepancy = lowerBound - observedJointP;
    } else if (observedJointP > upperBound + this.simplexTolerance) {
      isWithinBounds = false;
      violationDiscrepancy = observedJointP - upperBound;
    }

    return {
      lowerBound: Math.round(lowerBound * 10000) / 10000,
      upperBound: Math.round(upperBound * 10000) / 10000,
      observedJointPrice: observedJointP,
      isWithinBounds,
      violationDiscrepancy: Math.round(violationDiscrepancy * 10000) / 10000,
    };
  }
}
