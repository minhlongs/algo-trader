import { BondSpecification, FuturesSpecification, CtdRankingResult, BasisMetrics } from './fixedincome-types';
import { BondFuturesBasisEngine } from './bond-futures-basis-engine';

export class CheapestToDeliverCalculator {
  private basisEngine = new BondFuturesBasisEngine();

  /**
   * Evaluates delivery basket of eligible bonds and determines Cheapest-to-Deliver (CTD).
   * CTD is characterized by maximizing Implied Repo Rate (or minimizing net basis).
   */
  public selectCheapestToDeliver(
    deliverableBasket: BondSpecification[],
    futures: FuturesSpecification
  ): CtdRankingResult {
    if (deliverableBasket.length === 0) {
      throw new Error('Deliverable basket must contain at least one bond');
    }

    const metricsList: BasisMetrics[] = deliverableBasket.map((bond) =>
      this.basisEngine.calculateBasis(bond, futures)
    );

    // Rank by IRR descending (highest IRR = most attractive for short position to deliver)
    const sortedByIrr = [...metricsList].sort((a, b) => b.impliedRepoRatePct - a.impliedRepoRatePct);

    // Rank by Net Basis ascending (lowest net basis = cheapest delivery cost)
    const sortedByNetBasis = [...metricsList].sort((a, b) => a.netBasis - b.netBasis);

    return {
      cheapestBondId: sortedByNetBasis[0]!.bondId,
      maxIrrBondId: sortedByIrr[0]!.bondId,
      rankings: sortedByIrr,
    };
  }
}
