/**
 * Wave 218: Cont & de Larrard (2013) Markovian LOB Queueing Engine.
 *
 * Coordinates Markovian order book queue state tracking and price move forecasts.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import {
  ContDeLarrardConfig,
  LobQueueState,
  PriceMoveProbability,
  QueueEvolutionStep,
} from './cont-delarrard-types';
import { ContDeLarrardMath } from './cont-delarrard-math';

export class ContDeLarrardEngine {
  private readonly config: ContDeLarrardConfig;

  constructor(config: ContDeLarrardConfig) {
    this.config = config;
  }

  public evaluateQueueState(state: LobQueueState): PriceMoveProbability {
    return ContDeLarrardMath.computeMoveProbability(this.config, state);
  }

  public simulateEvolution(
    state: LobQueueState,
    horizonSec: number = 10.0,
    steps: number = 5,
  ): QueueEvolutionStep[] {
    return ContDeLarrardMath.projectQueueTrajectory(
      this.config,
      state,
      horizonSec,
      steps,
    );
  }

  public getTradingSignal(state: LobQueueState): 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'NEUTRAL' {
    const prob = this.evaluateQueueState(state);
    if (prob.probUpMove > 0.65) {
      return 'BUY_PRESSURE';
    } else if (prob.probDownMove > 0.65) {
      return 'SELL_PRESSURE';
    }
    return 'NEUTRAL';
  }
}
