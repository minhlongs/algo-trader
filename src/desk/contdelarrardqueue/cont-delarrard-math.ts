/**
 * Wave 218: Cont & de Larrard (2013) Markovian LOB Queueing Math.
 *
 * Implements first-passage absorption and probability of price movement.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import {
  ContDeLarrardConfig,
  LobQueueState,
  PriceMoveProbability,
} from './cont-delarrard-types';

export class ContDeLarrardMath {
  /**
   * Computes probability of next price move up vs down based on queue depletion.
   * In Cont & de Larrard (2013), for symmetric arrival rates, the probability
   * that ask depletes before bid is approximated by the relative queue depths.
   */
  public static computeMoveProbability(
    config: ContDeLarrardConfig,
    state: LobQueueState,
  ): PriceMoveProbability {
    const qb = Math.max(0.1, state.bidQueueDepth);
    const qa = Math.max(0.1, state.askQueueDepth);
    const totalDepth = qb + qa;

    const orderBookImbalance = Number(((qb - qa) / totalDepth).toFixed(4));

    // When bid is deeper than ask (qb > qa), ask depletes faster -> price moves UP
    // P(up) = qb / (qb + qa) for random walk on discrete 2D grid
    const probUpMove = Number((qb / totalDepth).toFixed(4));
    const probDownMove = Number((1.0 - probUpMove).toFixed(4));

    // Net depletion rate per side: mu + theta - lambda
    const netDepletionRate = Math.max(0.1, config.marketOrderArrivalRate + config.cancellationRate - config.limitOrderArrivalRate);
    const minQueue = Math.min(qb, qa);
    const expectedDepletionTimeSec = Number((minQueue / netDepletionRate).toFixed(2));

    const halfTick = config.tickSize * 0.5;
    const predictedNextMid = Number(
      (state.midPrice + (probUpMove - probDownMove) * halfTick).toFixed(4),
    );

    return {
      probUpMove,
      probDownMove,
      expectedDepletionTimeSec,
      orderBookImbalance,
      predictedNextMid,
    };
  }

  /**
   * Deterministic drift progression of queue depletion over time.
   */
  public static projectQueueTrajectory(
    config: ContDeLarrardConfig,
    state: LobQueueState,
    horizonSec: number,
    steps: number = 5,
  ): { bidDepth: number; askDepth: number; step: number; timeSec: number; imbalance: number }[] {
    const trajectory = [];
    const dt = horizonSec / steps;
    const netDepletion = (config.marketOrderArrivalRate + config.cancellationRate - config.limitOrderArrivalRate) * dt;

    let curB = state.bidQueueDepth;
    let curA = state.askQueueDepth;

    for (let i = 0; i <= steps; i++) {
      const t = Number((i * dt).toFixed(2));
      const imb = (curB + curA > 0) ? (curB - curA) / (curB + curA) : 0;
      trajectory.push({
        step: i,
        timeSec: t,
        bidDepth: Number(Math.max(0, curB).toFixed(1)),
        askDepth: Number(Math.max(0, curA).toFixed(1)),
        imbalance: Number(imb.toFixed(4)),
      });
      curB -= netDepletion * 0.5;
      curA -= netDepletion * 0.5;
    }

    return trajectory;
  }
}
