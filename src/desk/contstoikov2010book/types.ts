/**
 * Wave 276 — Cont, Stoikov & Talreja (2010): A Stochastic Model for Order Book Dynamics
 * Types & Configuration Interfaces
 */

export interface ContStoikov2010Config {
  readonly bidQueueSize: number;
  readonly askQueueSize: number;
  readonly limitArrivalRateLambda: number;
  readonly marketSweepRateMu: number;
  readonly cancellationRateTheta: number;
}

export interface ContStoikov2010Result {
  readonly probMidPriceUpNext: number;
  readonly probMidPriceDownNext: number;
  readonly expectedBidDepletionTimeSec: number;
  readonly expectedAskDepletionTimeSec: number;
  readonly netDepletionDriftRate: number;
}
