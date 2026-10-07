/**
 * Avellaneda-Stoikov Quote Modulator
 * Dynamically adjusts risk aversion gamma and spread widths based on toxicity signals.
 *
 * @module desk/harmonizer/as-quote-modulator
 */

import { InventorySkewQuoter } from '../strategies/inventory-skew-quoter';
import type { OptimalQuoteTwoWay } from '../strategies/inventory-skew-types';
import type { AggregatedDeskSignals } from './desk-signal-aggregator';

export interface ModulatorInput {
  readonly marketId: string;
  readonly midPrice: number;
  readonly netInventory: number;
  readonly timeToExpirySec: number;
  readonly signals: AggregatedDeskSignals;
  readonly baseGamma: number;
  readonly maxAbsInventory: number;
  readonly baseOrderSize: number;
}

export class AsQuoteModulator {
  public computeModulatedQuotes(input: ModulatorInput): OptimalQuoteTwoWay {
    // Elevate risk aversion gamma when toxic flow is detected
    const gammaMultiplier = input.signals.isAdverseSelectionImminent ? 2.5 : 1.0;
    const effectiveGamma = input.baseGamma * gammaMultiplier;

    // Shift mid-price slightly by predicted lead-lag drift (in Bps)
    const driftFraction = input.signals.adjustedDriftBps / 10_000;
    const adjustedMid = Math.max(0.01, Math.min(0.99, input.midPrice * (1 + driftFraction)));

    const quoter = new InventorySkewQuoter({
      riskAversionGamma: effectiveGamma,
      maxAbsInventory: input.maxAbsInventory,
      baseOrderSize: input.baseOrderSize,
    });

    const quotes = quoter.generateTwoWayQuotes({
      marketId: input.marketId,
      midPrice: adjustedMid,
      netInventory: input.netInventory,
      timeToExpirySec: input.timeToExpirySec,
    });

    // Widen half-spread if toxicity requires a defensive posture
    const mult = input.signals.spreadMultiplier;
    if (mult > 1.0) {
      const halfSpread = (quotes.askPrice - quotes.bidPrice) / 2;
      const widerHalf = halfSpread * mult;
      const defensiveBid = Math.max(0.001, quotes.reservationPrice - widerHalf);
      const defensiveAsk = Math.min(0.999, quotes.reservationPrice + widerHalf);

      return {
        ...quotes,
        bidPrice: Math.round(defensiveBid * 1000) / 1000,
        askPrice: Math.round(defensiveAsk * 1000) / 1000,
        bidSize: input.signals.isAdverseSelectionImminent ? Math.round(quotes.bidSize * 0.5) : quotes.bidSize,
        askSize: input.signals.isAdverseSelectionImminent ? Math.round(quotes.askSize * 0.5) : quotes.askSize,
      };
    }

    return quotes;
  }
}
