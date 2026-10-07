/**
 * Delta & Inventory Hedger
 *
 * Tracks directional delta exposure across binary outcome venues (Polymarket, Kalshi, etc.)
 * and computes variance-minimizing offsetting hedge orders when risk thresholds are breached.
 *
 * @module desk/risk/delta-inventory-hedger
 */

import { EventEmitter } from 'events';
import type {
  VenuePositionDelta,
  DeltaRiskConfig,
  RecommendedHedgeOrder,
  PortfolioDeltaAssessment,
} from './delta-inventory-hedger-types';

export class DeltaInventoryHedger extends EventEmitter {
  private readonly config: Required<DeltaRiskConfig>;

  constructor(config: DeltaRiskConfig) {
    super();
    this.config = {
      maxNetDeltaUsd: config.maxNetDeltaUsd,
      targetNetDeltaUsd: config.targetNetDeltaUsd ?? 0,
      minHedgeNotionalUsd: config.minHedgeNotionalUsd ?? 10,
    };
  }

  public assessPortfolio(
    positions: readonly VenuePositionDelta[],
    hedgeVenueTarget?: { venue: string; marketId: string; currentProbability: number }
  ): PortfolioDeltaAssessment {
    let totalNetDeltaUsd = 0;

    for (const pos of positions) {
      // For binary contracts: YES delta is +p, NO delta is -(1 - p) or relative exposure
      const deltaSign = pos.outcome === 'YES' ? 1 : -1;
      const contractDelta = pos.outcome === 'YES' ? pos.currentProbability : 1 - pos.currentProbability;
      const positionDeltaUsd = pos.quantity * contractDelta * deltaSign;
      totalNetDeltaUsd += positionDeltaUsd;
    }

    const deltaDiscrepancy = totalNetDeltaUsd - this.config.targetNetDeltaUsd;
    const isBreached = Math.abs(totalNetDeltaUsd) > this.config.maxNetDeltaUsd;
    const recommendedHedges: RecommendedHedgeOrder[] = [];

    if (isBreached && hedgeVenueTarget && Math.abs(deltaDiscrepancy) >= this.config.minHedgeNotionalUsd) {
      const targetProb = Math.max(0.01, Math.min(0.99, hedgeVenueTarget.currentProbability));

      if (deltaDiscrepancy > 0) {
        // Long delta: Need to SELL YES or BUY NO
        const hedgeQty = Math.round(deltaDiscrepancy / targetProb);
        if (hedgeQty > 0) {
          recommendedHedges.push({
            targetVenue: hedgeVenueTarget.venue,
            marketId: hedgeVenueTarget.marketId,
            outcome: 'YES',
            action: 'SELL',
            quantity: hedgeQty,
            estimatedPrice: targetProb,
            estimatedNotionalUsd: hedgeQty * targetProb,
          });
        }
      } else {
        // Short delta: Need to BUY YES or SELL NO
        const requiredNotional = Math.abs(deltaDiscrepancy);
        const hedgeQty = Math.round(requiredNotional / targetProb);
        if (hedgeQty > 0) {
          recommendedHedges.push({
            targetVenue: hedgeVenueTarget.venue,
            marketId: hedgeVenueTarget.marketId,
            outcome: 'YES',
            action: 'BUY',
            quantity: hedgeQty,
            estimatedPrice: targetProb,
            estimatedNotionalUsd: hedgeQty * targetProb,
          });
        }
      }
    }

    const assessment: PortfolioDeltaAssessment = {
      totalNetDeltaUsd: Math.round(totalNetDeltaUsd * 100) / 100,
      isBreached,
      recommendedHedges,
      timestamp: Date.now(),
    };

    if (isBreached) {
      this.emit('deltaBreach', assessment);
    }

    return assessment;
  }
}
