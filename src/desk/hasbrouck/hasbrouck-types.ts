export interface TradeQuoteObservation {
  readonly midquoteReturnBps: number; // r_t: quote change or return in bps
  readonly signedTrade: number;       // x_t: +1 for buy, -1 for sell, 0 for no trade
}

export interface VarCoefficients {
  readonly a1: number; // r_{t-1} coefficient on r_t
  readonly b1: number; // x_{t-1} coefficient on r_t
  readonly c1: number; // r_{t-1} coefficient on x_t
  readonly d1: number; // x_{t-1} coefficient on x_t
  readonly rSquaredReturn: number;
  readonly rSquaredTrade: number;
}

export interface HasbrouckImpactResult {
  readonly permanentPriceImpactBps: number; // Total cumulative quote response to trade shock
  readonly transitorySpreadBps: number;    // Immediate bounce back / transitory spread
  readonly tradeInformationSharePct: number; // Hasbrouck R_w^2: fraction of random-walk variance explained by trades
  readonly longRunInnovationVariance: number; // sigma_w^2
  readonly residualCovariance: {
    readonly sigmaQuote: number;
    readonly sigmaTrade: number;
    readonly correlation: number;
  };
  readonly sampleCount: number;
}
