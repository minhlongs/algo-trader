/**
 * Inventory Skew Quoting Agent for MARL Market-Making.
 * Aggressively skews bid/ask quotes based on inventory accumulation to force mean-reversion
 * and suppress quoting on the congested inventory side.
 */

import { BaseQuotingAgent } from './base-quoting-agent';
import type { AgentObservation, QuoteProposal, QuotingMode } from '../types/marl-types';
import { quantizeToTick } from '../models/avellaneda-stoikov';

export class InventorySkewAgent extends BaseQuotingAgent {
  private readonly skewMultiplier: number;
  private readonly suppressionThresholdRatio: number;

  constructor(
    config: BaseQuotingAgent['config'],
    skewMultiplier = 2.0,
    suppressionThresholdRatio = 0.8,
  ) {
    super(config);
    this.skewMultiplier = Math.max(1.0, skewMultiplier);
    this.suppressionThresholdRatio = Math.min(1.0, Math.max(0.2, suppressionThresholdRatio));
  }

  public computeQuote(observation: AgentObservation): QuoteProposal {
    this.quotesCount++;

    const baseResult = this.getBaseASQuotes(observation);
    const tick = this.config.tickSize;
    const rawMaxInv = this.config.maxInventory;
    const maxInv = Math.max(1, Number.isFinite(rawMaxInv) ? rawMaxInv : 1);
    const invRatio = Math.max(-10, Math.min(10, this.inventory / maxInv));

    // Aggressive non-linear skew: quadratic or power-scaled inventory penalty
    const nonLinearSkew =
      Math.sign(invRatio) * Math.pow(Math.abs(invRatio), 1.5) * this.skewMultiplier;
    const skewSpreadShift = nonLinearSkew * (baseResult.totalSpread / 2);

    let bid = baseResult.bidPrice - Math.max(0, skewSpreadShift);
    let ask = baseResult.askPrice - Math.min(0, skewSpreadShift);

    // If inventory is heavily positive, aggressively lower ask to dump inventory
    if (invRatio > 0.3) {
      ask = Math.max(observation.midPrice + tick, ask - skewSpreadShift * 0.5);
    }
    // If inventory is heavily negative, aggressively raise bid to buy back inventory
    if (invRatio < -0.3) {
      bid = Math.min(observation.midPrice - tick, bid - skewSpreadShift * 0.5);
    }

    bid = quantizeToTick(bid, tick);
    ask = quantizeToTick(ask, tick);

    // Quote suppression on extreme inventory
    let mode: QuotingMode = 'BOTH';
    let bidSize = this.config.quoteSize;
    let askSize = this.config.quoteSize;

    if (invRatio >= this.suppressionThresholdRatio) {
      // Inventory full long: suppress bid, quote only ask
      mode = 'ASK_ONLY';
      bid = 0.01;
      bidSize = 0;
      askSize = Math.round(this.config.quoteSize * 1.5);
    } else if (invRatio <= -this.suppressionThresholdRatio) {
      // Inventory full short: suppress ask, quote only bid
      mode = 'BID_ONLY';
      ask = 0.99;
      askSize = 0;
      bidSize = Math.round(this.config.quoteSize * 1.5);
    }

    // Apply boundary clamps
    bid = Math.max(0.01, Math.min(0.98, bid));
    ask = Math.min(0.99, Math.max(0.02, ask));

    if (mode === 'BOTH' && ask <= bid) {
      ask = quantizeToTick(Math.min(0.99, bid + tick), tick);
      if (ask <= bid) {
        bid = quantizeToTick(Math.max(0.01, ask - tick), tick);
      }
    }

    // Confidence drops when inventory is near max
    const confidence = Number(Math.max(0.1, 1 - Math.abs(invRatio)).toFixed(4));

    return {
      agentId: this.config.agentId,
      symbol: observation.symbol,
      venue: observation.venue,
      bidPrice: Number(bid.toFixed(4)),
      bidSize,
      askPrice: Number(ask.toFixed(4)),
      askSize,
      reservationPrice: baseResult.reservationPrice,
      bidSpread: Number((observation.midPrice - bid).toFixed(4)),
      askSpread: Number((ask - observation.midPrice).toFixed(4)),
      confidence,
      skewFactor: Number(skewSpreadShift.toFixed(4)),
      metadata: {
        invRatio,
        mode,
        nonLinearSkew,
      },
      timestamp: observation.timestamp,
    };
  }
}
