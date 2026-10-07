/**
 * Multi-Venue Arbitrage Router
 *
 * Discovers and routes risk-free cross-venue arbitrage pairs across prediction
 * market venues (e.g. Polymarket vs Kalshi), netting fee friction.
 *
 * @module desk/arbitrage/multi-venue-arbitrage-router
 */

import { EventEmitter } from 'events';
import type {
  ArbitrageVenueLeg,
  ArbitrageOpportunity,
  ExecutedArbitrageRoute,
} from './multi-venue-arbitrage-types';

export class MultiVenueArbitrageRouter extends EventEmitter {
  private readonly minProfitThresholdUsd: number;

  constructor(minProfitThresholdUsd: number = 5.0) {
    super();
    this.minProfitThresholdUsd = minProfitThresholdUsd;
  }

  public detectOpportunity(
    opportunityId: string,
    buyLeg: ArbitrageVenueLeg,
    sellLeg: ArbitrageVenueLeg
  ): ArbitrageOpportunity | null {
    const buyCostPerUnit = buyLeg.price * (1 + buyLeg.feeRate);
    const sellProceedsPerUnit = sellLeg.price * (1 - sellLeg.feeRate);
    const netMarginPerUnit = sellProceedsPerUnit - buyCostPerUnit;

    if (netMarginPerUnit <= 0) return null;

    const maxExecutableQuantity = Math.min(buyLeg.availableQuantity, sellLeg.availableQuantity);
    if (maxExecutableQuantity <= 0) return null;

    const expectedProfitUsd = maxExecutableQuantity * netMarginPerUnit;
    if (expectedProfitUsd < this.minProfitThresholdUsd) return null;

    const netSpreadPct = (netMarginPerUnit / buyCostPerUnit) * 100;

    return {
      opportunityId,
      legA: buyLeg,
      legB: sellLeg,
      netSpreadPct: Math.round(netSpreadPct * 100) / 100,
      maxExecutableQuantity,
      expectedProfitUsd: Math.round(expectedProfitUsd * 100) / 100,
    };
  }

  public routeArbitrage(opp: ArbitrageOpportunity, targetQuantity?: number): ExecutedArbitrageRoute {
    const execQty = Math.min(opp.maxExecutableQuantity, targetQuantity ?? opp.maxExecutableQuantity);
    const totalCostUsd = execQty * opp.legA.price * (1 + opp.legA.feeRate);
    const totalReturnUsd = execQty * opp.legB.price * (1 - opp.legB.feeRate);
    const netProfitUsd = totalReturnUsd - totalCostUsd;

    const route: ExecutedArbitrageRoute = {
      opportunityId: opp.opportunityId,
      executedQuantity: execQty,
      totalCostUsd: Math.round(totalCostUsd * 100) / 100,
      totalReturnUsd: Math.round(totalReturnUsd * 100) / 100,
      netProfitUsd: Math.round(netProfitUsd * 100) / 100,
      timestamp: Date.now(),
    };

    this.emit('arbitrageExecuted', route);
    return route;
  }
}
