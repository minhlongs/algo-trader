/**
 * Wave 256: Cont & de Larrard (2013) Markovian LOB Queue Depletion Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface ContDeLarrard2013Config {
  readonly bidQueueSize: number;
  readonly askQueueSize: number;
  readonly lambdaArrivalRate: number;
  readonly muDepletionRate: number;
  readonly laplaceParamS?: number;
}

export interface ContDeLarrard2013Result {
  readonly imbalanceRatio: number;
  readonly probPriceIncrease: number;
  readonly probPriceDecrease: number;
  readonly expectedDepletionTimeBid: number;
  readonly expectedDepletionTimeAsk: number;
  readonly laplaceTransformBid: number;
  readonly laplaceTransformAsk: number;
}
