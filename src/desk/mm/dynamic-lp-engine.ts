/**
 * Dynamic Liquidity Provision & Inventory Skew Engine
 *
 * Quotes two-sided markets on binary contracts, applying Avellaneda-Stoikov
 * inventory penalty and volatility/toxic-flow spread adjustments.
 *
 * @module desk/mm/dynamic-lp-engine
 */

import { randomUUID } from 'crypto';
import type {
  DynamicLpConfig,
  MarketMakingContext,
  TwoSidedQuote,
} from './dynamic-lp-types';

export class DynamicLpEngine {
  private readonly targetSpreadPct: number;
  private readonly maxInventoryAbs: number;
  private readonly inventoryRiskAversion: number;
  private readonly orderSizeShares: number;
  private readonly minSpreadPct: number;

  constructor(config: DynamicLpConfig) {
    this.targetSpreadPct = config.targetSpreadPct;
    this.maxInventoryAbs = Math.max(1, config.maxInventoryAbs);
    this.inventoryRiskAversion = config.inventoryRiskAversion ?? 0.5;
    this.orderSizeShares = config.orderSizeShares;
    this.minSpreadPct = config.minSpreadPct ?? 0.01;
  }

  public generateQuote(context: MarketMakingContext, timestamp: number = Date.now()): TwoSidedQuote {
    const fairP = Math.max(0.01, Math.min(0.99, context.fairProbability));
    const vol = Math.max(0.5, context.volatilityIndex ?? 1.0);
    const toxicMultiplier = context.isToxicFlowDetected ? 2.0 : 1.0;

    // Base half-spread scaled by volatility and toxicity
    const halfSpread = Math.max(
      this.minSpreadPct / 2,
      (this.targetSpreadPct / 2) * vol * toxicMultiplier
    );

    // Normalized inventory in [-1, 1]
    const normalizedInv = Math.max(
      -1,
      Math.min(1, context.currentInventoryShares / this.maxInventoryAbs)
    );

    // Inventory skew offset: if long (+), skew negative (lower prices to discourage buys, encourage sells)
    // if short (-), skew positive (raise prices to encourage buys, discourage sells)
    const rawOffset = -normalizedInv * this.inventoryRiskAversion * halfSpread;
    const inventorySkewOffset = Math.abs(rawOffset) < 1e-12 ? 0 : rawOffset;

    const reservationPrice = Math.max(0.01, Math.min(0.99, fairP + inventorySkewOffset));

    const rawBid = reservationPrice - halfSpread;
    const rawAsk = reservationPrice + halfSpread;

    // Enforce binary contract boundaries [0.001, 0.999]
    const bidPrice = Math.round(Math.max(0.001, Math.min(0.998, rawBid)) * 1000) / 1000;
    const askPrice = Math.round(Math.max(bidPrice + 0.001, Math.min(0.999, rawAsk)) * 1000) / 1000;

    // Skew quote sizes: size down the side that increases inventory imbalance
    const bidSize = normalizedInv > 0
      ? Math.max(1, Math.round(this.orderSizeShares * (1 - normalizedInv * 0.5)))
      : this.orderSizeShares;

    const askSize = normalizedInv < 0
      ? Math.max(1, Math.round(this.orderSizeShares * (1 - Math.abs(normalizedInv) * 0.5)))
      : this.orderSizeShares;

    return {
      quoteId: `quote-${randomUUID()}`,
      marketId: context.marketId,
      bidPrice,
      askPrice,
      bidSize,
      askSize,
      effectiveSpread: Math.round((askPrice - bidPrice) * 1000) / 1000,
      inventorySkewOffset,
      timestamp,
    };
  }
}
