/**
 * Adaptive Two-Sided Liquidity Quoting Agent
 * Avellaneda-Stoikov reservation price skewing for prediction market AMMs & CLOBs
 * (Milestone 3 / Feature 9)
 */

import { logger } from '../../../shared/utils/logger';
import { MarketState, QuoterConfig, TwoSidedQuote } from '../types/liquidity-types';

export interface QuoterInventory {
  holdings: Record<string, number>;
  cashBalanceUsd?: number;
  netPortfolioDelta?: number;
}

export class TwoSidedQuoter {
  private config: Required<QuoterConfig>;

  constructor(config?: QuoterConfig) {
    this.config = {
      gamma: config?.gamma ?? 0.1,
      sigma: config?.sigma ?? 0.02,
      kappa: config?.kappa ?? 1.5,
      minSpreadBps: config?.minSpreadBps ?? 200,
      quoteSize: config?.quoteSize ?? 100,
    };
  }

  public generateQuotes(
    market: MarketState,
    inventory: QuoterInventory,
    overrideConfig?: QuoterConfig
  ): Record<string, TwoSidedQuote> {
    const gamma = overrideConfig?.gamma ?? this.config.gamma;
    const sigma = overrideConfig?.sigma ?? this.config.sigma;
    const kappa = overrideConfig?.kappa ?? this.config.kappa;
    const minSpread = (overrideConfig?.minSpreadBps ?? this.config.minSpreadBps) / 10_000;
    const quoteSize = overrideConfig?.quoteSize ?? this.config.quoteSize;

    const tau = Math.max(1, market.timeToMaturitySec) / 86_400;
    const quotes: Record<string, TwoSidedQuote> = {};

    for (const [outcomeId, spotPrice] of Object.entries(market.spotPrices)) {
      if (spotPrice <= 0 || spotPrice >= 1.0) continue;

      const q = inventory.holdings[outcomeId] ?? 0;
      // Inventory skew: long position (q > 0) lowers reservation price to encourage selling
      // Short position (q < 0) raises reservation price to encourage buying back
      const skewOffset = q * gamma * Math.pow(sigma, 2) * tau;
      const resPrice = spotPrice - skewOffset;

      const halfSpread = Math.max(
        minSpread / 2,
        (1 / kappa) * Math.log(1 + gamma / kappa)
      );

      const rawBid = resPrice - halfSpread;
      const rawAsk = resPrice + halfSpread;

      // Quantize to 0.01 tick and clamp strictly within (0.01, 0.99)
      const bidPrice = Math.max(0.01, Math.min(0.98, Math.round(rawBid * 100) / 100));
      const askPrice = Math.max(
        bidPrice + 0.01,
        Math.min(0.99, Math.round(rawAsk * 100) / 100)
      );

      const spreadBps = Math.round(((askPrice - bidPrice) / spotPrice) * 10_000);

      quotes[outcomeId] = {
        outcomeId,
        bidPrice,
        askPrice,
        bidSize: quoteSize,
        askSize: quoteSize,
        spreadBps,
        skewOffset: Number(skewOffset.toFixed(6)),
        timestamp: Date.now(),
      };
    }

    logger.debug('[TwoSidedQuoter] Generated two-sided quotes', {
      marketId: market.marketId,
      outcomeCount: Object.keys(quotes).length,
    });

    return quotes;
  }

  // Static convenience helper matching test signatures
  public static generateQuotes(
    market: MarketState,
    inventory: QuoterInventory,
    config?: QuoterConfig
  ): Record<string, TwoSidedQuote> {
    const quoter = new TwoSidedQuoter(config);
    return quoter.generateQuotes(market, inventory, config);
  }
}
