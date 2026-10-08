/**
 * Structured State Space (SSM) Neural Predictor
 * Models long-range sequential price dynamics using linear time-invariant state transitions.
 *
 * @module desk/ai/state-space-predictor
 */

import { StateSpaceModelConfig, StateSpacePrediction } from './ai-types';

export class StateSpacePredictor {
  private state: number[];
  private readonly config: StateSpaceModelConfig;

  public constructor(config?: Partial<StateSpaceModelConfig>) {
    this.config = {
      stateDimension: config?.stateDimension ?? 4,
      transitionDecay: config?.transitionDecay ?? 0.85,
      observationWeight: config?.observationWeight ?? 0.35,
      processNoiseVar: config?.processNoiseVar ?? 0.05,
    };
    this.state = new Array(this.config.stateDimension).fill(0);
  }

  public updateAndPredict(observedReturn: number, stepAhead = 1): StateSpacePrediction {
    const nextState = new Array(this.config.stateDimension).fill(0);
    for (let i = 0; i < this.config.stateDimension; i++) {
      const prior = this.state[i] ?? 0;
      const decay = Math.pow(this.config.transitionDecay, i + 1);
      nextState[i] = prior * decay + observedReturn * (this.config.observationWeight / (i + 1));
    }
    this.state = nextState;

    const weightedReturn = this.state.reduce((acc, v, idx) => acc + v / (idx + 1), 0);
    const horizonFactor = Math.pow(this.config.transitionDecay, stepAhead);
    const predictedReturn = Number((weightedReturn * horizonFactor).toFixed(5));

    const uncertainty = Math.sqrt(this.config.processNoiseVar * stepAhead);
    const confidenceLower = Number((predictedReturn - 1.96 * uncertainty).toFixed(5));
    const confidenceUpper = Number((predictedReturn + 1.96 * uncertainty).toFixed(5));

    return {
      stepAhead,
      predictedReturn,
      confidenceLower,
      confidenceUpper,
      stateVector: [...this.state],
    };
  }

  public reset(): void {
    this.state.fill(0);
  }
}
