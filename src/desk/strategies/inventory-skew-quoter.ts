/**
 * Dynamic Inventory Skew Quoting Engine
 *
 * Implements Avellaneda-Stoikov market making customized for prediction market
 * binary payoff [0, 1] instruments with Bernoulli variance scaling.
 *
 * @module desk/strategies/inventory-skew-quoter
 */

import type {
  InventorySkewConfig,
  MarketStateQuoteParams,
  OptimalQuoteTwoWay,
} from './inventory-skew-types';

export class InventorySkewQuoter {
  private readonly config: InventorySkewConfig;

  public constructor(config?: Partial<InventorySkewConfig>) {
    this.config = {
      riskAversionGamma: config?.riskAversionGamma ?? 0.1,
      orderFlowLiquidityKappa: config?.orderFlowLiquidityKappa ?? 1.5,
      maxAbsInventory: config?.maxAbsInventory ?? 5_000,
      defaultHalfSpreadBps: config?.defaultHalfSpreadBps ?? 50,
      baseOrderSize: config?.baseOrderSize ?? 100,
    };
  }

  public calculateReservationPrice(params: MarketStateQuoteParams): number {
    const s = Math.max(0.01, Math.min(0.99, params.midPrice));
    const bernoulliVariance = params.currentVolatility !== undefined
      ? params.currentVolatility * params.currentVolatility
      : s * (1 - s);

    // Normalize remaining time in years (assuming 1 year = 31,536,000 sec)
    const timeFractionYears = Math.max(0.0001, params.timeToExpirySec / 31_536_000);

    // Inventory penalty: q * gamma * sigma^2 * T
    const inventoryPenalty =
      params.netInventory *
      this.config.riskAversionGamma *
      bernoulliVariance *
      timeFractionYears;

    const reservationPrice = s - inventoryPenalty;
    return Math.max(0.001, Math.min(0.999, reservationPrice));
  }

  public calculateOptimalHalfSpread(): number {
    const gamma = this.config.riskAversionGamma;
    const kappa = this.config.orderFlowLiquidityKappa;

    if (gamma <= 0 || kappa <= 0) {
      return this.config.defaultHalfSpreadBps / 10_000;
    }

    // Avellaneda-Stoikov spread: (2 / gamma) * ln(1 + gamma / kappa)
    const theoreticalSpread = (2 / gamma) * Math.log(1 + gamma / kappa);
    const halfSpread = theoreticalSpread / 2;

    const minHalfSpread = this.config.defaultHalfSpreadBps / 10_000;
    return Math.max(minHalfSpread, Math.min(0.15, halfSpread));
  }

  public generateTwoWayQuotes(params: MarketStateQuoteParams): OptimalQuoteTwoWay {
    const reservationPrice = this.calculateReservationPrice(params);
    const halfSpread = this.calculateOptimalHalfSpread();

    let bidPrice = Math.max(0.001, reservationPrice - halfSpread);
    let askPrice = Math.min(0.999, reservationPrice + halfSpread);

    // Ensure valid non-crossed market
    if (bidPrice >= askPrice) {
      bidPrice = Math.max(0.001, reservationPrice - 0.005);
      askPrice = Math.min(0.999, reservationPrice + 0.005);
    }

    // Inventory boundary dampening
    const absInv = Math.abs(params.netInventory);
    const maxInv = this.config.maxAbsInventory;

    let bidSize = this.config.baseOrderSize;
    let askSize = this.config.baseOrderSize;

    if (params.netInventory > 0) {
      // Long inventory: scale down bids, scale up asks to offload
      const ratio = Math.min(1.0, absInv / maxInv);
      bidSize = Math.max(0, Math.round(this.config.baseOrderSize * (1 - ratio)));
      askSize = Math.round(this.config.baseOrderSize * (1 + ratio * 0.5));
    } else if (params.netInventory < 0) {
      // Short inventory: scale up bids, scale down asks
      const ratio = Math.min(1.0, absInv / maxInv);
      bidSize = Math.round(this.config.baseOrderSize * (1 + ratio * 0.5));
      askSize = Math.max(0, Math.round(this.config.baseOrderSize * (1 - ratio)));
    }

    const isQuotingActive = absInv < maxInv;

    return {
      marketId: params.marketId,
      reservationPrice: Math.round(reservationPrice * 10_000) / 10_000,
      bidPrice: Math.round(bidPrice * 10_000) / 10_000,
      askPrice: Math.round(askPrice * 10_000) / 10_000,
      bidSize,
      askSize,
      halfSpreadBps: Math.round(halfSpread * 10_000),
      inventorySkewOffset: Math.round((reservationPrice - params.midPrice) * 10_000) / 10_000,
      isQuotingActive,
    };
  }
}
