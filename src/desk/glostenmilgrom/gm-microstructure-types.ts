export type TradeDirection = 1 | -1; // 1 for Buy, -1 for Sell

export interface GlostenMilgromParams {
  lowValue: number; // V_L
  highValue: number; // V_H
  priorProbabilityHigh?: number; // p0, defaults to 0.5
  informedFraction: number; // alpha in [0, 1]
  noiseBuyProbability?: number; // gamma, defaults to 0.5
  tradeSequence?: TradeDirection[];
}

export interface QuoteState {
  ask: number;
  bid: number;
  spread: number;
  midPrice: number;
  posteriorProbabilityHigh: number;
  posteriorIfBuy: number;
  posteriorIfSell: number;
}

export interface GlostenMilgromResult {
  currentQuotes: QuoteState;
  finalBeliefProbability: number;
  spreadHistory: number[];
  midPriceHistory: number[];
  beliefHistory: number[];
  informationShare: number;
}
