/**
 * Avellaneda-Stoikov (2008) optimal market-making model.
 * Computes reservation price, optimal half-spreads, quote placement,
 * and Polymarket tick quantization with boundary clamps [0.01, 0.99].
 */

import type { AvellanedaStoikovConfig } from '../types/marl-config-types';
import type { AvellanedaStoikovParams, QuoteCalculationResult } from '../types/marl-types';

export interface ReservationPriceInput {
  midPrice: number;
  inventory: number;
  gamma: number;
  sigma: number;
  timeToHorizon: number; // tau = (T - t), non-negative
}

export interface OptimalQuotesInput extends ReservationPriceInput {
  kappa: number;
  tickSize?: number;
  minSpread?: number;
  maxSpread?: number;
  minPrice?: number;
  maxPrice?: number;
}

export interface OptimalQuotesResult extends QuoteCalculationResult {
  rawBidPrice: number;
  rawAskPrice: number;
  clamped: boolean;
}

export function calculateReservationPrice(input: ReservationPriceInput): number {
  const { midPrice, inventory, gamma, sigma, timeToHorizon } = input;
  const tau = Math.max(0, timeToHorizon);
  return midPrice - inventory * gamma * Math.pow(sigma, 2) * tau;
}

export function calculateOptimalSpreadBase(gamma: number, kappa: number): number {
  if (kappa <= 0 || gamma <= 0) return 0.02;
  return (1 / kappa) * Math.log(1 + gamma / kappa);
}

export function quantizeToTick(price: number, tickSize: number): number {
  if (tickSize <= 0) return price;
  const factor = 1 / tickSize;
  return Math.round(price * factor) / factor;
}

export function calculateOptimalQuotes(input: OptimalQuotesInput): OptimalQuotesResult {
  const {
    midPrice, inventory, gamma, sigma, timeToHorizon, kappa,
    tickSize = 0.01, minSpread = 0.02, maxSpread = 0.20,
    minPrice = 0.01, maxPrice = 0.99,
  } = input;

  const tau = Math.max(0, timeToHorizon);
  const reservationPrice = calculateReservationPrice({ midPrice, inventory, gamma, sigma, timeToHorizon: tau });
  const halfSpreadBase = calculateOptimalSpreadBase(gamma, kappa);

  const invSkew = inventory * gamma * Math.pow(sigma, 2) * tau;
  const rawDeltaA = -invSkew + halfSpreadBase;
  const rawDeltaB = invSkew + halfSpreadBase;

  const rawAsk = midPrice + rawDeltaA;
  const rawBid = midPrice - rawDeltaB;

  let bid = quantizeToTick(rawBid, tickSize);
  let ask = quantizeToTick(rawAsk, tickSize);
  let clamped = false;

  let spread = ask - bid;
  if (spread < minSpread) {
    clamped = true;
    const diff = minSpread - spread;
    bid = quantizeToTick(bid - diff / 2, tickSize);
    ask = quantizeToTick(ask + diff / 2, tickSize);
  } else if (spread > maxSpread) {
    clamped = true;
    const excess = spread - maxSpread;
    bid = quantizeToTick(bid + excess / 2, tickSize);
    ask = quantizeToTick(ask - excess / 2, tickSize);
  }

  if (bid < minPrice) { bid = minPrice; clamped = true; }
  if (ask > maxPrice) { ask = maxPrice; clamped = true; }
  if (bid > maxPrice - tickSize) { bid = quantizeToTick(maxPrice - tickSize, tickSize); clamped = true; }
  if (ask < minPrice + tickSize) { ask = quantizeToTick(minPrice + tickSize, tickSize); clamped = true; }

  if (ask <= bid) {
    clamped = true;
    if (bid + tickSize <= maxPrice) ask = quantizeToTick(bid + tickSize, tickSize);
    else bid = quantizeToTick(ask - tickSize, tickSize);
  }

  bid = Number(bid.toFixed(4));
  ask = Number(ask.toFixed(4));

  return {
    reservationPrice: Number(reservationPrice.toFixed(4)),
    bidPrice: bid,
    askPrice: ask,
    bidSpread: Number((midPrice - bid).toFixed(4)),
    askSpread: Number((ask - midPrice).toFixed(4)),
    totalSpread: Number((ask - bid).toFixed(4)),
    rawBidPrice: Number(rawBid.toFixed(4)),
    rawAskPrice: Number(rawAsk.toFixed(4)),
    clamped,
  };
}

export class AvellanedaStoikovModel {
  constructor(private readonly config: AvellanedaStoikovParams | AvellanedaStoikovConfig) {}

  public getReservationPrice(midPrice: number, inventory: number, timeToHorizon: number): number {
    return calculateReservationPrice({
      midPrice, inventory, gamma: this.config.gamma, sigma: this.config.sigma, timeToHorizon,
    });
  }

  public getQuotes(midPrice: number, inventory: number, timeToHorizon: number): OptimalQuotesResult {
    return calculateOptimalQuotes({
      midPrice, inventory, gamma: this.config.gamma, kappa: this.config.kappa, sigma: this.config.sigma,
      timeToHorizon, tickSize: this.config.tickSize, minSpread: this.config.minSpread, maxSpread: this.config.maxSpread,
    });
  }
}

export type { AvellanedaStoikovParams, QuoteCalculationResult };

