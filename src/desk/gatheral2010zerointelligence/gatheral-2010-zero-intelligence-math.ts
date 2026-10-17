import type {
  Gatheral2010ZeroIntelligenceInput,
  Gatheral2010ZeroIntelligenceOutput,
} from './types';

export class Gatheral2010ZeroIntelligence {
  static evaluate(
    input: Gatheral2010ZeroIntelligenceInput
  ): Gatheral2010ZeroIntelligenceOutput {
    const a = Math.max(1e-4, input.limitArrivalScaleA);
    const gamma = Math.max(0.5, input.powerLawExponentGamma);
    const mu = Math.max(1e-4, input.marketOrderRateMu);
    const theta = Math.max(1e-4, input.cancellationRateTheta);
    const q = Math.max(1, input.currentBestQueueLots);

    const lambda1 = a;
    const totalOutflow = mu + theta * q;
    const netDrift = lambda1 - totalOutflow;
    const spreadTicks = Math.pow(a / Math.max(1e-4, mu), 1 / gamma);
    const ratio = totalOutflow / Math.max(1e-4, lambda1);
    const depletionProb = ratio >= 1 ? 1.0 : Math.min(1.0, Math.pow(ratio, q));

    const regime =
      depletionProb >= 0.85
        ? 'IMMINENT_QUEUE_DEPLETION'
        : netDrift > 2.0
          ? 'RESILIENT_QUEUE_GROWTH'
          : 'EQUILIBRIUM_ZERO_INTELLIGENCE';

    return {
      topTickArrivalRateLambda1: Number(lambda1.toFixed(4)),
      impliedEquilibriumSpreadTicks: Number(spreadTicks.toFixed(4)),
      netQueueDriftLotsPerSec: Number(netDrift.toFixed(4)),
      queueDepletionProbability: Number(depletionProb.toFixed(6)),
      regime,
    };
  }
}
