/**
 * First-Passage Time & Absorption Probabilities for Markovian LOB.
 * Implements Cont & de Larrard (2013) queue depletion analytics and diffusion limits.
 * Strictly < 150 LOC, zero `:any` types.
 */

import { ContDeLarrardParameters, FirstPassageResult, LobQueueState } from './contdelarrard-types';

export class ContDeLarrardFirstPassage {
  /**
   * Computes analytical first-passage probability of price increase:
   * p_up(q_b, q_a) = P(tau_a < tau_b | q_b, q_a)
   * where tau_a is the hitting time of 0 for ask queue, tau_b for bid queue.
   */
  public static calculateAbsorption(
    state: LobQueueState,
    params: ContDeLarrardParameters
  ): FirstPassageResult {
    const { bidDepth: qb, askDepth: qa } = state;
    const { lambdaBid, lambdaAsk, muBid, muAsk } = params;

    if (qb <= 0) {
      return this.boundaryResult(qb, qa, 0.0, 1.0, 0.0, params);
    }
    if (qa <= 0) {
      return this.boundaryResult(qb, qa, 1.0, 0.0, 0.0, params);
    }

    const deltaB = muBid - lambdaBid;
    const deltaA = muAsk - lambdaAsk;
    const sigmaSqB = lambdaBid + muBid;
    const sigmaSqA = lambdaAsk + muAsk;

    // Queue imbalance: (qb - qa) / (qb + qa) in [-1, 1]
    const imbalance = (qb - qa) / (qb + qa);

    // Cont & de Larrard (2013) diffusion limit approximation:
    // With independent Brownian motions hitting 0:
    // When drifts are negligible (high-frequency limit), p_up is given by harmonic measure:
    // p_up(qb, qa) = (2 / pi) * arctan(qb * sigma_a / (qa * sigma_b))
    const scaleB = Math.sqrt(Math.max(1e-4, sigmaSqB));
    const scaleA = Math.sqrt(Math.max(1e-4, sigmaSqA));

    // Base conformal mapping probability
    const ratio = (qb * scaleA) / Math.max(1e-4, qa * scaleB);
    let pUpBase = (2.0 / Math.PI) * Math.atan(ratio);

    // Drift correction: if ask queue depletes faster (deltaA > deltaB), p_up increases
    if (Math.abs(deltaA) > 1e-4 || Math.abs(deltaB) > 1e-4) {
      const driftTilt = 0.5 * (deltaA / Math.max(1.0, scaleA) - deltaB / Math.max(1.0, scaleB));
      // Logit tilt
      const logOdds = Math.log(Math.max(1e-5, pUpBase / Math.max(1e-5, 1.0 - pUpBase))) + driftTilt;
      pUpBase = 1.0 / (1.0 + Math.exp(-logOdds));
    }

    const pUp = Math.max(0.001, Math.min(0.999, pUpBase));
    const pDown = 1.0 - pUp;

    // Expected duration until first exit: E[tau] = min(E[tau_b], E[tau_a])
    // For single queue: E[tau] = q / delta (if delta > 0) or q^2 / sigma^2
    const tauB = deltaB > 0.1 ? qb / deltaB : (qb * qb) / Math.max(0.1, sigmaSqB);
    const tauA = deltaA > 0.1 ? qa / deltaA : (qa * qa) / Math.max(0.1, sigmaSqA);
    const expectedDuration = Math.min(tauB, tauA);

    return {
      bidDepth: qb,
      askDepth: qa,
      priceIncreaseProb: Math.round(pUp * 10000) / 10000,
      priceDecreaseProb: Math.round(pDown * 10000) / 10000,
      expectedDurationSec: Math.round(expectedDuration * 1000) / 1000,
      bidDrift: Math.round(deltaB * 100) / 100,
      askDrift: Math.round(deltaA * 100) / 100,
      queueImbalance: Math.round(imbalance * 10000) / 10000,
    };
  }

  private static boundaryResult(
    qb: number,
    qa: number,
    pUp: number,
    pDown: number,
    dur: number,
    params: ContDeLarrardParameters
  ): FirstPassageResult {
    return {
      bidDepth: qb,
      askDepth: qa,
      priceIncreaseProb: pUp,
      priceDecreaseProb: pDown,
      expectedDurationSec: dur,
      bidDrift: params.muBid - params.lambdaBid,
      askDrift: params.muAsk - params.lambdaAsk,
      queueImbalance: qb + qa > 0 ? (qb - qa) / (qb + qa) : 0,
    };
  }
}
