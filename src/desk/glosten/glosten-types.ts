export type TradeAction = 'BUY' | 'SELL';

export interface GlostenMilgromParameters {
  readonly highAssetValueVHigh: number;     // V_H
  readonly lowAssetValueVLow: number;       // V_L
  readonly priorProbabilityHigh: number;    // p0 = P(V = V_H) in (0, 1)
  readonly fractionInformedTradersAlpha: number; // alpha in [0, 1)
}

export interface GlostenQuoteSpread {
  readonly askPriceUsd: number;             // E[V | Buy]
  readonly bidPriceUsd: number;             // E[V | Sell]
  readonly midPriceUsd: number;             // E[V]
  readonly bidAskSpreadUsd: number;         // Ask - Bid
  readonly adverseSelectionSpreadPct: number;
}

export interface SequentialBayesianStep {
  readonly tradeIndex: number;
  readonly tradeAction: TradeAction;
  readonly priorProbabilityHigh: number;
  readonly posteriorProbabilityHigh: number;
  readonly askPriceUsd: number;
  readonly bidPriceUsd: number;
  readonly executedPriceUsd: number;
  readonly expectedAssetValueUsd: number;
}
