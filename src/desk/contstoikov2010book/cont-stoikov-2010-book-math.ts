/**
 * Wave 276 — Cont, Stoikov & Talreja (2010): A Stochastic Model for Order Book Dynamics
 * Continuous-time Birth-Death-Cancellation Markov queue solver for Level-1 depletion probabilities.
 */
import type {
  ContStoikov2010Config,
  ContStoikov2010Result,
} from './types';

export function computeContStoikov2010BookDynamics(
  cfg: ContStoikov2010Config,
): ContStoikov2010Result {
  const {
    bidQueueSize: qb,
    askQueueSize: qa,
    limitArrivalRateLambda: lambda,
    marketSweepRateMu: mu,
    cancellationRateTheta: theta,
  } = cfg;

  if (qb <= 0 || qa <= 0 || lambda <= 0 || mu <= 0 || theta < 0) {
    throw new Error('Invalid ContStoikov2010Config: queue sizes and rates must be positive');
  }

  const effectiveBidDrain = mu + theta * 0.5 * qb - lambda;
  const effectiveAskDrain = mu + theta * 0.5 * qa - lambda;

  const bidHazard = (mu + theta * qb) / Math.max(1, qb);
  const askHazard = (mu + theta * qa) / Math.max(1, qa);

  const expectedBidTime = qb / Math.max(0.1, mu + theta * 0.5 * qb);
  const expectedAskTime = qa / Math.max(0.1, mu + theta * 0.5 * qa);

  // Mid-price moves UP when ask queue depletes before bid queue
  const totalInverseTime = 1 / expectedBidTime + 1 / expectedAskTime;
  const probUp = (1 / expectedAskTime) / totalInverseTime;
  const probDown = 1 - probUp;

  const netDrain = 0.5 * (effectiveBidDrain + effectiveAskDrain) + 0.01 * (bidHazard - askHazard);

  return {
    probMidPriceUpNext: probUp,
    probMidPriceDownNext: probDown,
    expectedBidDepletionTimeSec: expectedBidTime,
    expectedAskDepletionTimeSec: expectedAskTime,
    netDepletionDriftRate: netDrain,
  };
}
