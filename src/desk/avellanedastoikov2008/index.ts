// SPDX-License-Identifier: MIT
/**
 * Wave 336 — Avellaneda & Stoikov (2008) High-Frequency Market Making in a Limit Order Book
 * Computes inventory-adjusted reservation price r(s,q,t), optimal quote spread δa + δb,
 * and exponential fill intensities λ(δ) = A * exp(-k * δ).
 */

export interface AvellanedaStoikovInput {
  readonly midPrice: number;
  readonly inventoryUnits: number;
  readonly riskAversionGamma: number;
  readonly volatilitySigma: number;
  readonly timeRemainingHorizon: number;
  readonly orderBookDensityKappa: number;
  readonly baseArrivalRateA?: number;
}

export interface AvellanedaStoikovQuoteOutput {
  readonly reservationPrice: number;
  readonly inventorySkew: number;
  readonly optimalSpread: number;
  readonly optimalBidPrice: number;
  readonly optimalAskPrice: number;
  readonly bidHalfSpread: number;
  readonly askHalfSpread: number;
  readonly bidFillIntensityHz: number;
  readonly askFillIntensityHz: number;
}

export class AvellanedaStoikov2008Engine {
  public computeOptimalQuotes(input: AvellanedaStoikovInput): AvellanedaStoikovQuoteOutput {
    const gamma = Math.max(1e-6, input.riskAversionGamma);
    const sigma = Math.max(1e-6, input.volatilitySigma);
    const tau = Math.max(0, input.timeRemainingHorizon);
    const kappa = Math.max(1e-6, input.orderBookDensityKappa);
    const baseA = Math.max(0.01, input.baseArrivalRateA ?? 1.5);

    const varianceRemaining = sigma * sigma * tau;
    const inventorySkew = input.inventoryUnits * gamma * varianceRemaining;
    const reservationPrice = input.midPrice - inventorySkew;

    const liquidityComponent = (2 / gamma) * Math.log(1 + gamma / kappa);
    const optimalSpread = gamma * varianceRemaining + liquidityComponent;

    const optimalBidPrice = reservationPrice - optimalSpread / 2;
    const optimalAskPrice = reservationPrice + optimalSpread / 2;

    const bidHalfSpread = Math.max(0, input.midPrice - optimalBidPrice);
    const askHalfSpread = Math.max(0, optimalAskPrice - input.midPrice);

    const bidFillIntensityHz = baseA * Math.exp(-kappa * bidHalfSpread);
    const askFillIntensityHz = baseA * Math.exp(-kappa * askHalfSpread);

    return {
      reservationPrice: Number(reservationPrice.toFixed(6)),
      inventorySkew: Number(inventorySkew.toFixed(6)),
      optimalSpread: Number(optimalSpread.toFixed(6)),
      optimalBidPrice: Number(optimalBidPrice.toFixed(6)),
      optimalAskPrice: Number(optimalAskPrice.toFixed(6)),
      bidHalfSpread: Number(bidHalfSpread.toFixed(6)),
      askHalfSpread: Number(askHalfSpread.toFixed(6)),
      bidFillIntensityHz: Number(bidFillIntensityHz.toFixed(6)),
      askFillIntensityHz: Number(askFillIntensityHz.toFixed(6)),
    };
  }
}
