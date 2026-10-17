import { ContDeLarrard2013Config, ContDeLarrard2013Result } from './types';

/**
 * Wave 256: Cont & de Larrard (2013) Markovian LOB Queue Depletion Math.
 * Strictly < 80 LOC, zero :any.
 */
export function computeContDeLarrardDynamics(
  config: ContDeLarrard2013Config
): ContDeLarrard2013Result {
  const qb = Math.max(1, config.bidQueueSize);
  const qa = Math.max(1, config.askQueueSize);
  const lambda = Math.max(0, config.lambdaArrivalRate);
  const mu = Math.max(1e-6, config.muDepletionRate);
  const s = Math.max(0, config.laplaceParamS ?? 0.1);

  const totalDepth = qb + qa;
  const imbalanceRatio = (qb - qa) / totalDepth;

  const drift = mu - lambda;
  const variance = Math.max(1e-6, mu + lambda);

  // Probability of price increase: ask queue depletes before bid queue
  let probUp: number;
  if (Math.abs(drift) < 1e-5) {
    probUp = qb / totalDepth;
  } else {
    const scale = (2 * drift) / variance;
    const num = 1 - Math.exp(-scale * qb);
    const den = 1 - Math.exp(-scale * totalDepth);
    probUp = den !== 0 ? Math.min(1, Math.max(0, num / den)) : qb / totalDepth;
  }
  const probDown = 1 - probUp;

  // Expected first passage time of queue depletion
  const effectiveDrift = Math.max(1e-4, drift);
  const expectedDepletionTimeBid = qb / effectiveDrift;
  const expectedDepletionTimeAsk = qa / effectiveDrift;

  // Laplace transform of first passage time: E[e^{-s * tau}]
  const root = Math.sqrt(drift * drift + 2 * variance * s);
  const laplaceFactor = (root - drift) / variance;
  const laplaceTransformBid = Math.exp(-laplaceFactor * qb);
  const laplaceTransformAsk = Math.exp(-laplaceFactor * qa);

  return {
    imbalanceRatio,
    probPriceIncrease: probUp,
    probPriceDecrease: probDown,
    expectedDepletionTimeBid,
    expectedDepletionTimeAsk,
    laplaceTransformBid,
    laplaceTransformAsk,
  };
}
