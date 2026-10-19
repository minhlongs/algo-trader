export interface Gatheral2010ZeroIntelligenceInput {
  readonly limitArrivalScaleA: number;
  readonly powerLawExponentGamma: number;
  readonly marketOrderRateMu: number;
  readonly cancellationRateTheta: number;
  readonly currentBestQueueLots: number;
}

export interface Gatheral2010ZeroIntelligenceOutput {
  readonly topTickArrivalRateLambda1: number;
  readonly impliedEquilibriumSpreadTicks: number;
  readonly netQueueDriftLotsPerSec: number;
  readonly queueDepletionProbability: number;
  readonly regime: 'RESILIENT_QUEUE_GROWTH' | 'EQUILIBRIUM_ZERO_INTELLIGENCE' | 'IMMINENT_QUEUE_DEPLETION';
}
