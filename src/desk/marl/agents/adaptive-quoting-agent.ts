/**
 * Adaptive Quoting Agent for MARL Market-Making.
 * Dynamically adjusts spreads, skew, and quoting depth based on orderbook imbalance
 * and microstructural volatility.
 */

import { BaseQuotingAgent } from './base-quoting-agent';
import type { AgentObservation, QuoteProposal } from '../types/marl-types';
import { quantizeToTick } from '../models/avellaneda-stoikov';

export class AdaptiveQuotingAgent extends BaseQuotingAgent {
  /**
   * Sensitivity to orderbook imbalance in spread adjustment (0.0 to 1.0)
   */
  private readonly imbalanceSensitivity: number;

  constructor(
    config: BaseQuotingAgent['config'],
    imbalanceSensitivity = 0.5,
  ) {
    super(config);
    this.imbalanceSensitivity = Math.min(1.0, Math.max(0.0, imbalanceSensitivity));
  }

  public computeQuote(observation: AgentObservation): QuoteProposal {
    this.quotesCount++;

    const baseResult = this.getBaseASQuotes(observation);
    const rawImbalance = observation.orderBookImbalance;
    const imbalance = Number.isFinite(rawImbalance)
      ? Math.max(-1.0, Math.min(1.0, rawImbalance))
      : 0;
    const tick = this.config.tickSize;

    // Imbalance skew:
    // When imbalance > 0 (bid heavy, buying pressure):
    // Price expected to drift up. MM quotes ask higher and bid higher to capture upward movement.
    // When imbalance < 0 (ask heavy, selling pressure):
    // Price expected to drift down. MM quotes bid lower and ask lower.
    const skewAmount = imbalance * this.imbalanceSensitivity * (baseResult.totalSpread / 2);

    let adjustedBid = baseResult.bidPrice + skewAmount;
    let adjustedAsk = baseResult.askPrice + skewAmount;

    // Discretize to tick
    adjustedBid = quantizeToTick(adjustedBid, tick);
    adjustedAsk = quantizeToTick(adjustedAsk, tick);

    // Apply boundary clamps
    adjustedBid = Math.max(0.01, Math.min(0.98, adjustedBid));
    adjustedAsk = Math.min(0.99, Math.max(0.02, adjustedAsk));

    // Ensure non-crossing spread
    if (adjustedAsk <= adjustedBid) {
      adjustedAsk = quantizeToTick(Math.min(0.99, adjustedBid + tick), tick);
      if (adjustedAsk <= adjustedBid) {
        adjustedBid = quantizeToTick(Math.max(0.01, adjustedAsk - tick), tick);
      }
    }

    // Dynamic quote sizing based on depth imbalance
    // If inventory is high positive, reduce bid size and increase ask size
    const rawMaxInv = this.config.maxInventory;
    const maxInv = Math.max(1, Number.isFinite(rawMaxInv) ? rawMaxInv : 1);
    const invRatio = Math.min(1.0, Math.max(-1.0, this.inventory / maxInv));
    const baseSize = this.config.quoteSize;
    const bidSize = Math.max(1, Math.round(baseSize * (1 - Math.max(0, invRatio))));
    const askSize = Math.max(1, Math.round(baseSize * (1 + Math.min(0, invRatio))));

    // Confidence is higher when orderbook is balanced and spread is reasonable
    const maxSpread = Math.max(0.01, Number.isFinite(this.config.maxSpread) ? this.config.maxSpread : 0.05);
    const spreadScore = Math.max(0.1, 1 - (adjustedAsk - adjustedBid) / maxSpread);
    const balanceScore = 1 - Math.abs(imbalance) * 0.5;
    const confidence = Number((spreadScore * balanceScore).toFixed(4));

    return {
      agentId: this.config.agentId,
      symbol: observation.symbol,
      venue: observation.venue,
      bidPrice: Number(adjustedBid.toFixed(4)),
      bidSize,
      askPrice: Number(adjustedAsk.toFixed(4)),
      askSize,
      reservationPrice: baseResult.reservationPrice,
      bidSpread: Number((observation.midPrice - adjustedBid).toFixed(4)),
      askSpread: Number((adjustedAsk - observation.midPrice).toFixed(4)),
      confidence,
      skewFactor: Number(skewAmount.toFixed(4)),
      metadata: {
        imbalance,
        invRatio,
        rawSpread: baseResult.totalSpread,
      },
      timestamp: observation.timestamp,
    };
  }
}
