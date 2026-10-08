export interface BachelierModelParameters {
  readonly forwardPrice: number;        // F (can be positive, zero, or negative)
  readonly strikePrice: number;         // K (can be positive, zero, or negative)
  readonly timeToExpiryYears: number;   // tau > 0
  readonly normalVolatility: number;    // sigma_N > 0 (expressed in price units / sqrt(year))
  readonly riskFreeRatePct: number;     // r in percent (e.g. 3.0 for 3%)
}

export interface BachelierOptionResult {
  readonly callPrice: number;
  readonly putPrice: number;
  readonly dScore: number;              // (F - K) / (sigma_N * sqrt(tau))
  readonly callDelta: number;
  readonly putDelta: number;
  readonly gamma: number;
  readonly vega: number;
  readonly intrinsicValueCall: number;
}
