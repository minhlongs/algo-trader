/**
 * Cross-Market Inventory Delta Rebalancer
 * Continuous hedging of directional exposure against external CEX/DEX reference price feeds
 * (Milestone 3 / Feature 10)
 */

import { logger } from '../../../shared/utils/logger';
import { RebalanceOrder } from '../types/liquidity-types';
import { QuoterInventory } from './two-sided-quoter';

export interface RebalanceConfig {
  maxTolerance?: number; // max allowable unhedged shares (default 500)
  referenceVenue?: string; // target execution venue
  slippageToleranceBps?: number; // limit price cushion (default 50 bps)
}

export class InventoryDeltaRebalancer {
  private config: Required<RebalanceConfig>;

  constructor(config?: RebalanceConfig) {
    this.config = {
      maxTolerance: config?.maxTolerance ?? 500,
      referenceVenue: config?.referenceVenue ?? 'BINANCE_OR_CEX_REFERENCE',
      slippageToleranceBps: config?.slippageToleranceBps ?? 50,
    };
  }

  public evaluateRebalance(
    inventory: QuoterInventory,
    refPrices: Record<string, number>,
    maxToleranceOverride?: number
  ): RebalanceOrder[] {
    const tolerance = maxToleranceOverride ?? this.config.maxTolerance;
    const slippageFrac = this.config.slippageToleranceBps / 10_000;
    const orders: RebalanceOrder[] = [];

    for (const [outcomeId, qty] of Object.entries(inventory.holdings)) {
      const absQty = Math.abs(qty);
      if (absQty > tolerance) {
        const excess = absQty - tolerance;
        const side: 'BUY' | 'SELL' = qty > 0 ? 'SELL' : 'BUY';
        const refPrice = refPrices[outcomeId] ?? 0.5;

        // Apply slippage cushion to ensure swift fill on hedging venue
        const limitPrice = Number(
          (side === 'SELL' ? refPrice * (1 - slippageFrac) : refPrice * (1 + slippageFrac)).toFixed(4)
        );

        const urgency: 'HIGH' | 'MEDIUM' = excess > tolerance * 2 ? 'HIGH' : 'MEDIUM';

        orders.push({
          rebalanceId: `reb-${outcomeId}-${Date.now()}-${orders.length}`,
          venue: this.config.referenceVenue,
          outcomeId,
          side,
          targetQuantity: Number(excess.toFixed(4)),
          limitPrice,
          urgency,
          reason: `Inventory ${qty} exceeds delta tolerance ${tolerance}`,
        });
      }
    }

    if (orders.length > 0) {
      logger.info('[InventoryDeltaRebalancer] Rebalance orders generated', {
        ordersCount: orders.length,
        outcomes: orders.map((o) => o.outcomeId),
      });
    }

    return orders;
  }

  // Static convenience helper matching test signatures
  public static evaluateRebalance(
    inventory: QuoterInventory,
    refPrices: Record<string, number>,
    maxTolerance: number = 500
  ): RebalanceOrder[] {
    const rebalancer = new InventoryDeltaRebalancer({ maxTolerance });
    return rebalancer.evaluateRebalance(inventory, refPrices, maxTolerance);
  }
}
