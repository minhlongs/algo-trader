/**
 * Wave 266: Cartea, Jaimungal & Tan (2016) Latency & Delays in Market Making Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface Cartea2016LatencyConfig {
  readonly latencyDelaySec: number; // Delta (e.g. 0.005 to 0.050 seconds)
  readonly intensityLambda0: number; // Fill rate baseline lambda_0
  readonly sensitivityKappa: number; // Fill decay kappa
  readonly adverseJumpIntensityEta: number; // Jump arrival rate eta
  readonly adverseJumpMeanSizeJ: number; // Mean jump loss J
  readonly riskAversionGamma: number; // Inventory risk penalty gamma
  readonly assetVolatilitySigma: number; // sigma
}

export interface LatencySpreadQuote {
  readonly inventory: number;
  readonly optimalHalfSpreadBid: number; // delta^b
  readonly optimalHalfSpreadAsk: number; // delta^a
  readonly adverseSelectionPenalty: number; // lambda_delayed * J
  readonly totalSpread: number;
  readonly latencyWiderRatio: number;
}
