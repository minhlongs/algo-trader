/**
 * Guéant-Tapia-Manzi / Avellaneda-Stoikov Inventory Skew Quoting Engine
 * Computes reservation prices and asymmetric bid/ask quotes based on inventory risk aversion.
 *
 * @module desk/marketmaking/inventory-skew-quote-engine
 */

import { GueantInventoryParameters, QuotingDecision } from './marketmaking-types';

export class InventorySkewQuoteEngine {
  private readonly params: GueantInventoryParameters;

  public constructor(params?: Partial<GueantInventoryParameters>) {
    this.params = {
      riskAversionGamma: params?.riskAversionGamma ?? 0.1,
      orderArrivalA: params?.orderArrivalA ?? 140,
      orderIntensityK: params?.orderIntensityK ?? 1.5,
      assetVolatilitySigma: params?.assetVolatilitySigma ?? 0.02,
      terminalHorizonSec: params?.terminalHorizonSec ?? 60,
    };
  }

  /**
   * Calculates reservation price and optimal quoting spreads given current inventory.
   *
   * @param midpoint Current market midpoint price
   * @param currentInventory Current signed inventory position (+ for long, - for short)
   * @param remainingTimeSec Time remaining in quoting epoch (defaults to terminalHorizonSec)
   */
  public calculateQuotes(
    midpoint: number,
    currentInventory: number,
    remainingTimeSec?: number
  ): QuotingDecision {
    const timeHorizon = Math.max(0.1, remainingTimeSec ?? this.params.terminalHorizonSec);
    const gamma = this.params.riskAversionGamma;
    const sigma = this.params.assetVolatilitySigma;
    const k = this.params.orderIntensityK;

    // Reservation Price: R = S - q * gamma * sigma^2 * T
    const inventoryPenalty = currentInventory * gamma * Math.pow(sigma, 2) * timeHorizon;
    const reservationPrice = Number((midpoint - inventoryPenalty).toFixed(4));

    // Liquidity component: (1 / gamma) * ln(1 + gamma / k)
    const liquiditySpread = (1 / gamma) * Math.log(1 + gamma / k);

    // Asymmetric half-spreads relative to midpoint
    // Bid spread: delta_b = (midpoint - reservation) + liquiditySpread + 0.5 * gamma * sigma^2 * T
    const volatilitySpreadComponent = 0.5 * gamma * Math.pow(sigma, 2) * timeHorizon;

    const rawBidSpread = midpoint - reservationPrice + liquiditySpread + volatilitySpreadComponent;
    const rawAskSpread = reservationPrice - midpoint + liquiditySpread + volatilitySpreadComponent;

    // Guarantee minimum non-negative spread (at least 1 pip)
    const bidSpread = Number(Math.max(0.01, rawBidSpread).toFixed(4));
    const askSpread = Number(Math.max(0.01, rawAskSpread).toFixed(4));

    const optimalBid = Number((midpoint - bidSpread).toFixed(4));
    const optimalAsk = Number((midpoint + askSpread).toFixed(4));

    return {
      midpoint,
      currentInventory,
      reservationPrice,
      optimalBid,
      optimalAsk,
      bidSpread,
      askSpread,
    };
  }

  public updateVolatility(newSigma: number): void {
    if (newSigma > 0) {
      this.params.assetVolatilitySigma = newSigma;
    }
  }
}
